'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  CircleAlert,
  Flashlight,
  FlashlightOff,
  ImagePlus,
  Redo2,
  Rotate3D,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CameraFailureInfo, ScannerPhase, ScannerState } from '@/types/scanner';
import { assessCaptureQuality } from '@/lib/scanner/packageDetector';

export interface CaptureSideResult {
  side: ScannerPhase;
  file: File;
  objectUrl: string;
  clientQuality: {
    sharpness: number;
    lighting: number;
    centering: number;
  };
}

export interface CameraScannerProps {
  onCaptureComplete: (capture: { front: CaptureSideResult | null; back: CaptureSideResult | null }) => void;
  onSideCaptured?: (result: CaptureSideResult) => void;
  onCameraStateChange?: (state: ScannerState) => void;
  onUploadRequest?: () => void;
}

const TURN_DELAY_MS = 1400;
const MIN_CAPTURE_WIDTH = 320;
const CAMERA_START_TIMEOUT_MS = 12000;
const CAMERA_VIDEO_PLAY_TIMEOUT_MS = 6000;

export const STATUS_LABELS: Record<ScannerState, string> = {
  initializing: 'Initializing camera',
  permission_required: 'Waiting for camera permission',
  camera_ready: 'Camera Ready',
  searching_for_package: 'Point at front side',
  package_detected: 'Package detected',
  stabilizing: 'Hold steady',
  capturing_front: 'Capturing front',
  front_captured: 'Front captured',
  turn_package: 'Turn package around',
  searching_back: 'Point at back side',
  back_detected: 'Package detected',
  capturing_back: 'Capturing back',
  processing: 'Processing',
  completed: 'Completed',
  camera_error: 'Camera error',
  permission_denied: 'Camera access blocked',
};

const MAX_CAMERA_RETRIES = 3;
const CAMERA_RETRY_DELAY_MS = 1500;

function toCameraFailure(error: unknown): CameraFailureInfo {
  const name = (error as DOMException)?.name ?? '';
  const messages: Record<CameraFailureInfo['reason'], string> = {
    none: '',
    not_allowed:
      'Camera permission was denied. Allow camera access in your browser settings and try again.',
    not_found: 'No camera was detected on this device. Upload package images instead.',
    not_readable:
      'The camera could not be started. Check camera permissions and make sure another application is not using it.',
    overconstrained: 'The camera could not match the requested configuration.',
    security: 'Camera access was blocked by your browser security settings.',
    unsupported: 'Camera scanning is not supported in this browser. Upload package images instead.',
    insecure_context: 'Camera requires a secure (HTTPS) connection. Upload package images instead.',
    unknown: 'The camera could not be started. Check your browser permissions and try again.',
  };
  const reason: CameraFailureInfo['reason'] =
    name === 'NotAllowedError'
      ? 'not_allowed'
      : name === 'NotFoundError'
        ? 'not_found'
        : name === 'NotReadableError'
          ? 'not_readable'
          : name === 'OverconstrainedError'
            ? 'overconstrained'
            : name === 'SecurityError'
              ? 'security'
              : 'unknown';
  return { reason, message: messages[reason] };
}

function settledWithin(promise: Promise<void>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(false), ms);
    promise
      .then(() => {
        window.clearTimeout(timer);
        resolve(true);
      })
      .catch((error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

const isScanningOverlay = (state: ScannerState) =>
  state === 'capturing_front' || state === 'capturing_back' || state === 'processing';

export function CameraScanner({
  onCaptureComplete,
  onSideCaptured,
  onCameraStateChange,
  onUploadRequest,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRetryTimerRef = useRef<number | null>(null);
  const captureLockedRef = useRef(false);
  const transitionTimerRef = useRef<number | null>(null);
  const frontSideRef = useRef<CaptureSideResult | null>(null);
  const scanSideRef = useRef<ScannerPhase>('front');
  const cameraAttemptRef = useRef(0);
  const cameraStartTimerRef = useRef<number | null>(null);
  const torchOnRef = useRef(false);

  const [phase, setPhaseState] = useState<ScannerState>('initializing');
  const [cameraError, setCameraErrorInfo] = useState<CameraFailureInfo | null>(null);
  const [frontSide, setFrontSide] = useState<CaptureSideResult | null>(null);
  const [backSide, setBackSide] = useState<CaptureSideResult | null>(null);
  const [scanSide, setScanSideState] = useState<ScannerPhase>('front');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const phaseRef = useRef<ScannerState>('initializing');

  const setPhase = useCallback(
    (next: ScannerState) => {
      phaseRef.current = next;
      setPhaseState(next);
      onCameraStateChange?.(next);
    },
    [onCameraStateChange]
  );

  const setScanSide = useCallback((next: ScannerPhase) => {
    scanSideRef.current = next;
    setScanSideState(next);
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    torchOnRef.current = false;
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  // Applies a torch state to the active video track. iOS Safari expects the
  // top-level `torch` constraint while Chrome/Android historically want it
  // wrapped in `advanced`, so we try both forms before giving up.
  const applyTorch = useCallback(async (track: MediaStreamTrack, value: boolean) => {
    const torchConstraint = { torch: value } as MediaTrackConstraintSet;
    try {
      await track.applyConstraints({ torch: value } as MediaTrackConstraints);
      return;
    } catch {
      // Fall through to the advanced form.
    }
    await track.applyConstraints({ advanced: [torchConstraint] });
  }, []);

  // Re-opens the camera with the `torch` constraint included in `getUserMedia`.
  // This is the only reliable fallback on devices (common on Android) that
  // refuse to change the torch after the stream is already live.
  const openStreamWithTorch = useCallback(async (torch: boolean) => {
    const videoConstraints = {
      facingMode: 'environment',
      torch: torch || undefined,
    } as MediaTrackConstraints;
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
    } catch (error) {
      if (torch || (error as DOMException)?.name === 'OverconstrainedError') throw error;
      return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
  }, []);

  // Detects whether the active video track can drive the torch/flashlight.
  // Some browsers expose torch through `getCapabilities()`, others only via
  // `applyConstraints`, so a no-flash probe with `torch: false` is used as a
  // fallback. The result only optimises the UI — the button stays clickable so
  // the feature is discoverable on every device.
  const detectTorchSupport = useCallback(
    async (stream: MediaStream) => {
      const track = stream.getVideoTracks()?.[0];
      if (!track || typeof track.applyConstraints !== 'function') {
        setTorchSupported(false);
        return;
      }
      try {
        const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
        if (capabilities.torch === true) {
          setTorchSupported(true);
          return;
        }
      } catch {
        // Fall through to the probe.
      }
      try {
        await applyTorch(track, false);
        setTorchSupported(true);
      } catch {
        setTorchSupported(false);
      }
    },
    [applyTorch]
  );

  const toggleTorch = useCallback(async () => {
    const current = streamRef.current;
    const track = current?.getVideoTracks()?.[0];
    if (!track || typeof track.applyConstraints !== 'function') return;
    const next = !torchOnRef.current;

    // First try changing the torch live on the running track (fast path).
    try {
      await applyTorch(track, next);
      torchOnRef.current = next;
      setTorchOn(next);
      return;
    } catch {
      // Many devices reject mid-stream torch toggles → restart the camera with
      // the torch constraint baked into getUserMedia.
    }

    try {
      const stream = await openStreamWithTorch(next);
      current.getTracks().forEach((streamTrack) => streamTrack.stop());
      streamRef.current = stream;
      torchOnRef.current = next;
      setTorchOn(next);
      setTorchSupported(true);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);
      }
    } catch {
      // The device exposed no way to control the torch.
      torchOnRef.current = false;
      setTorchOn(false);
      setTorchSupported(false);
    }
  }, [applyTorch, openStreamWithTorch]);

  const startCamera = useCallback(
    async (firstAttempt: boolean, attempt = 0) => {
      const attemptId = ++cameraAttemptRef.current;
      setCameraErrorInfo(null);
      setPhase(firstAttempt ? 'permission_required' : 'initializing');

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        const info = toCameraFailure({ name: 'unsupported' } as DOMException);
        setCameraErrorInfo(info);
        setPhase('camera_error');
        return;
      }
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setCameraErrorInfo(toCameraFailure({ name: 'SecurityError', message: '' } as DOMException));
        setPhase('camera_error');
        return;
      }

      stopStream();

      // Never stall forever on a pending permission prompt or a silent camera
      // failure: surface an actionable error with a retry after a timeout.
      if (cameraStartTimerRef.current !== null) window.clearTimeout(cameraStartTimerRef.current);
      cameraStartTimerRef.current = window.setTimeout(() => {
        if (cameraAttemptRef.current !== attemptId) return;
        setCameraErrorInfo({
          reason: 'not_readable',
          message:
            'The camera did not start in time. Make sure no other application is using it and that camera is enabled on this device.',
        });
        setPhase('camera_error');
      }, CAMERA_START_TIMEOUT_MS);

      // Best-effort: keep the preview muted/playsInline even if React never
      // re-applies the DOM attributes in time on some browsers.
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.autoplay = true;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (error) {
          if ((error as DOMException)?.name !== 'OverconstrainedError') throw error;
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        // A newer start attempt (or unmount) superseded this one.
        if (cameraAttemptRef.current !== attemptId) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (stream.getVideoTracks().length === 0) {
          stream.getTracks().forEach((track) => track.stop());
          const info = toCameraFailure({ name: 'NotFoundError' } as DOMException);
          setCameraErrorInfo(info);
          setPhase('camera_error');
          return;
        }

        streamRef.current = stream;
        void detectTorchSupport(stream);
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          const played = await settledWithin(video.play(), CAMERA_VIDEO_PLAY_TIMEOUT_MS);
          if (!played) {
            if (cameraAttemptRef.current !== attemptId) return;
            if (cameraStartTimerRef.current !== null) {
              window.clearTimeout(cameraStartTimerRef.current);
              cameraStartTimerRef.current = null;
            }
            const info = toCameraFailure({ name: 'NotReadableError' } as DOMException);
            setCameraErrorInfo({
              ...info,
              message: 'The camera preview could not be played. Reload the page and try again.',
            });
            setPhase('camera_error');
            return;
          }
        }

        if (cameraAttemptRef.current !== attemptId) {
          stopStream();
          return;
        }
        if (cameraStartTimerRef.current !== null) {
          window.clearTimeout(cameraStartTimerRef.current);
          cameraStartTimerRef.current = null;
        }
        setScanSide('front');
        setPhase('camera_ready');
      } catch (error) {
        if (cameraAttemptRef.current !== attemptId) return;
        const info = toCameraFailure(error);
        if (info.reason === 'not_readable' && attempt < MAX_CAMERA_RETRIES) {
          if (cameraRetryTimerRef.current !== null) window.clearTimeout(cameraRetryTimerRef.current);
          cameraRetryTimerRef.current = window.setTimeout(() => {
            void startCamera(false, attempt + 1);
          }, CAMERA_RETRY_DELAY_MS);
          return;
        }
        if (cameraStartTimerRef.current !== null) {
          window.clearTimeout(cameraStartTimerRef.current);
          cameraStartTimerRef.current = null;
        }
        setCameraErrorInfo(info);
        setPhase(info.reason === 'not_allowed' ? 'permission_denied' : 'camera_error');
      }
    },
    [setPhase, setScanSide, stopStream, detectTorchSupport]
  );

  useEffect(() => {
    void startCamera(true);
    return () => {
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
      if (cameraRetryTimerRef.current !== null) window.clearTimeout(cameraRetryTimerRef.current);
      if (cameraStartTimerRef.current !== null) {
        window.clearTimeout(cameraStartTimerRef.current);
        cameraStartTimerRef.current = null;
      }
      stopStream();
    };
  }, [startCamera, stopStream]);

  // Surface mid-session camera failures (cable pull, device disconnect, etc.)
  // with an actionable error + retry instead of a frozen black preview.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onVideoError = () => {
      if (cameraAttemptRef.current === 0) return;
      const current = phaseRef.current;
      const idleOrResolved =
        current === 'camera_error' ||
        current === 'permission_denied' ||
        current === 'completed' ||
        current === 'permission_required' ||
        current === 'initializing';
      if (idleOrResolved) return;
      setCameraErrorInfo({
        reason: 'not_readable',
        message: 'The camera stream was interrupted. Try the camera again or upload package images instead.',
      });
      setPhase('camera_error');
    };
    video.addEventListener('error', onVideoError);
    return () => video.removeEventListener('error', onVideoError);
  }, [setPhase]);

  useEffect(() => {
    if (backSide) {
      const front = frontSideRef.current;
      // Both sides captured → release the camera so it never keeps running in
      // the background while the review screen is shown. Mark the phase before
      // detaching the stream so any transient video event is ignored.
      setPhase('completed');
      stopStream();
      onCaptureComplete({ front, back: backSide });
    }
  }, [backSide, frontSide, onCaptureComplete, setPhase, stopStream]);

  const captureSide = useCallback(
    (side: ScannerPhase) => {
      if (captureLockedRef.current) return;
      const video = videoRef.current;
      const canvas = captureCanvasRef.current;
      const analysisCanvas = analysisCanvasRef.current;
      if (
        !video ||
        !canvas ||
        !analysisCanvas ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !video.videoWidth ||
        !video.videoHeight
      ) {
        return;
      }

      captureLockedRef.current = true;
      if (video.videoWidth < MIN_CAPTURE_WIDTH) {
        captureLockedRef.current = false;
        setPhase(side === 'front' ? 'camera_ready' : 'turn_package');
        return;
      }
      let clientQuality: CaptureSideResult['clientQuality'];
      try {
        clientQuality = assessCaptureQuality(video, analysisCanvas);
      } catch {
        clientQuality = { sharpness: 0, lighting: 0, centering: 0 };
      }
      setPhase(side === 'front' ? 'capturing_front' : 'capturing_back');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        captureLockedRef.current = false;
        setPhase(side === 'front' ? 'camera_ready' : 'turn_package');
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            captureLockedRef.current = false;
            setPhase(side === 'front' ? 'camera_ready' : 'turn_package');
            return;
          }
          const file = new File([blob], `food-package-${side}-${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });
          const result: CaptureSideResult = {
            side,
            file,
            objectUrl: URL.createObjectURL(blob),
            clientQuality,
          };

          if (side === 'front') {
            frontSideRef.current = result;
            setFrontSide(result);
            onSideCaptured?.(result);
            setPhase('front_captured');
            transitionTimerRef.current = window.setTimeout(() => {
              setScanSide('back');
              setPhase('turn_package');
            }, TURN_DELAY_MS);
          } else {
            setBackSide(result);
            onSideCaptured?.(result);
            setPhase('processing');
          }
          captureLockedRef.current = false;
        },
        'image/jpeg',
        0.92
      );
    },
    [onSideCaptured, setPhase, setScanSide]
  );

  useEffect(() => {
    return () => {
      if (frontSide) URL.revokeObjectURL(frontSide.objectUrl);
      if (backSide) URL.revokeObjectURL(backSide.objectUrl);
    };
  }, [frontSide, backSide]);

  const retryCamera = useCallback(() => {
    void startCamera(false);
  }, [startCamera]);

  const captureDisabled =
    captureLockedRef.current ||
    phase === 'processing' ||
    phase === 'capturing_front' ||
    phase === 'capturing_back' ||
    phase === 'completed';
  const captureLabel =
    phase === 'processing'
      ? 'Analyzing...'
      : phase === 'completed'
        ? 'Both sides captured'
        : scanSide === 'back'
          ? 'Capture Back Side'
          : 'Capture Front Side';

  const torchButtonLabel = torchOn ? 'Turn flashlight off' : 'Turn flashlight on';

  const frameOverlayActive =
    phase === 'camera_ready' ||
    phase === 'searching_for_package' ||
    phase === 'searching_back' ||
    phase === 'front_captured' ||
    phase === 'turn_package';

  return (
    <div className="mt-6">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#0a0d14] sm:aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Live camera feed for food package scanning"
          className="size-full object-cover"
        />
        <canvas ref={captureCanvasRef} className="hidden" />
        <canvas ref={analysisCanvasRef} className="hidden" />

        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3">
          <span className="rounded bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#cbd5e1] backdrop-blur-sm">
            Step {scanSide === 'front' ? '1' : '2'} of 2 — Scan {scanSide === 'front' ? 'Front' : 'Back'} Side
          </span>
          <div className="flex items-center gap-2">
            {phase === 'turn_package' && (
              <span className="flex items-center gap-1.5 rounded bg-[#00bfa5]/15 px-2.5 py-1 text-[11px] font-semibold text-[#00bfa5] backdrop-blur-sm">
                <span className="relative flex size-1.5">
                  <span className="scanner-dot-ping absolute inline-flex size-full rounded-full bg-[#00bfa5]" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-[#00bfa5]" />
                </span>
                Ready to capture
              </span>
            )}
          </div>
        </div>

        {frameOverlayActive && (
          <div className="pointer-events-none absolute inset-0 z-[5]">
            <div className="absolute inset-[6%] rounded-2xl border-2 border-[#00bfa5]/60 transition-all duration-300" />
            <div className="absolute inset-[6%] rounded-2xl">
              {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => (
                <span
                  key={corner}
                  className={`absolute size-6 border-[#00bfa5] ${
                    corner === 'top-left' ? 'left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-2xl' : ''
                  }${
                    corner === 'top-right' ? 'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-2xl' : ''
                  }${
                    corner === 'bottom-left' ? 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl' : ''
                  }${
                    corner === 'bottom-right' ? 'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl' : ''
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {(phase === 'camera_ready' || phase === 'searching_for_package' || phase === 'searching_back' || phase === 'turn_package') && (
          <div className="pointer-events-none absolute inset-x-[6%] bottom-4 z-[6] flex flex-col items-center">
            <div className="scanner-fade-in-up flex flex-col items-center rounded-lg bg-black/40 px-4 py-2 text-center backdrop-blur-[2px]">
              <p className="text-sm font-semibold text-white">
                {phase === 'turn_package'
                  ? 'Turn the package around'
                  : scanSide === 'back'
                    ? 'Point at the back side'
                    : 'Point at the front side'}
              </p>
              <p className="mt-0.5 text-[11px] text-[#cbd5e1]">
                {phase === 'turn_package'
                  ? 'When ready, tap the capture button below.'
                  : 'When ready, tap the capture button below.'}
              </p>
            </div>
          </div>
        )}

        {phase === 'front_captured' && (
          <div className="scanner-fade-in-up absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/45 backdrop-blur-sm">
            <span className="scanner-check-pop flex size-14 items-center justify-center rounded-full bg-[#00bfa5] text-white">
              <Check size={28} aria-hidden="true" />
            </span>
            <p className="mt-3 text-base font-bold text-white">Front side captured</p>
          </div>
        )}

        {phase === 'permission_required' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0d14] px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full border-2 border-[#00bfa5] bg-[#00bfa5]/15 text-[#00bfa5]">
              <Camera size={20} aria-hidden="true" />
            </span>
            <p className="mt-3 text-[15px] font-bold text-white">Camera Access Required</p>
            <p className="mt-1.5 max-w-[300px] text-xs leading-relaxed text-[#94a3b8]">
              PackIntel needs camera access to scan the food package and inspect its label.
            </p>
            <p className="mt-1.5 text-xs text-[#cbd5e1]">Allow camera access in your browser to continue.</p>
            <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-[#00bfa5]">
              <span className="size-3 animate-spin rounded-full border-2 border-[#00bfa5]/30 border-t-[#00bfa5]" />
              Waiting for camera permission...
            </p>
          </div>
        )}

        {phase === 'permission_denied' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0d14] px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-400/15 text-amber-400">
              <ShieldAlert size={20} aria-hidden="true" />
            </span>
            <p className="mt-3 text-[15px] font-bold text-white">Camera Access Blocked</p>
            <p className="mt-1.5 max-w-[320px] text-xs leading-relaxed text-[#94a3b8]">
              Camera access was denied. Open your browser or site permissions, allow Camera
              access, then tap Retry Camera.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Button variant="outline" size="sm" onClick={retryCamera} aria-label="Retry camera">
                <Redo2 size={14} aria-hidden="true" />
                Retry Camera
              </Button>
              {onUploadRequest && (
                <Button variant="secondary" size="sm" onClick={onUploadRequest} aria-label="Upload image from device instead of using the camera">
                  <ImagePlus size={14} aria-hidden="true" />
                  Upload From Device
                </Button>
              )}
            </div>
          </div>
        )}

        {phase === 'camera_error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0d14] px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-400/15 text-amber-400">
              <CameraOff size={20} aria-hidden="true" />
            </span>
            <p className="mt-3 text-[15px] font-bold text-white">Unable to access camera</p>
            <p className="mt-1.5 max-w-[320px] text-xs leading-relaxed text-[#94a3b8]">
              {cameraError?.message}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Button variant="outline" size="sm" onClick={retryCamera} aria-label="Try camera again">
                <Redo2 size={14} aria-hidden="true" />
                Try Again
              </Button>
              {onUploadRequest && (
                <Button variant="secondary" size="sm" onClick={onUploadRequest} aria-label="Upload image from device instead">
                  <ImagePlus size={14} aria-hidden="true" />
                  Upload From Device
                </Button>
              )}
            </div>
          </div>
        )}

        {phase === 'initializing' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0d14]">
            <span className="size-8 animate-spin rounded-full border-2 border-white/15 border-t-[#00bfa5]" />
            <p className="mt-4 text-sm font-semibold text-[#cbd5e1]">Initializing camera...</p>
          </div>
        )}

        {isScanningOverlay(phase) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 px-6 text-center backdrop-blur-sm">
            <span className="size-9 animate-spin rounded-full border-2 border-white/20 border-t-[#00bfa5]" />
            <p className="mt-4 text-sm font-semibold text-white">
              {phase === 'processing' ? 'Processing package...' : 'Capturing...'}
            </p>
          </div>
        )}

        {phase !== 'permission_required' &&
          phase !== 'permission_denied' &&
          phase !== 'camera_error' &&
          phase !== 'initializing' &&
          phase !== 'processing' &&
          phase !== 'completed' && (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            aria-label={torchButtonLabel}
            aria-pressed={torchOn}
            title={torchButtonLabel}
            className={`absolute bottom-3 left-4 z-[7] flex size-10 items-center justify-center rounded-full border backdrop-blur-sm transition-colors ${
              torchOn
                ? 'border-[#00bfa5] bg-[#00bfa5] text-white'
                : 'border-white/25 bg-black/45 text-white hover:bg-black/60'
            }`}
          >
            {torchOn ? (
              <FlashlightOff size={18} aria-hidden="true" />
            ) : (
              <Flashlight size={18} aria-hidden="true" />
            )}
          </button>
        )}

        <div className="pointer-events-none absolute bottom-3 right-4 z-[7] flex items-center justify-end">
          <span
            className={`flex items-center gap-1.5 rounded bg-black/55 px-2 py-1 text-[10px] font-semibold tracking-wide backdrop-blur-sm ${
              phase === 'permission_denied' || phase === 'camera_error' ? 'text-amber-400' : 'text-[#cbd5e1]'
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                phase === 'permission_denied' || phase === 'camera_error' ? 'bg-amber-400' : 'bg-[#00bfa5]'
              }`}
            />
            {STATUS_LABELS[phase]}
          </span>
        </div>

        {cameraError && (phase === 'camera_error' || phase === 'permission_denied') && (
          <div className="absolute inset-x-4 bottom-12 z-[8] flex items-center gap-2 rounded bg-red-950/90 px-3 py-2 text-[11px] text-red-100">
            <CircleAlert size={12} className="shrink-0" aria-hidden="true" />
            {cameraError.message}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
          <Button
            variant="primary"
            size="lg"
            onClick={() => captureSide(scanSideRef.current)}
            disabled={captureDisabled}
            className="w-full sm:w-auto"
            aria-label={captureLabel}
          >
            <Camera size={17} aria-hidden="true" />
            {captureLabel}
          </Button>
          {onUploadRequest && (
            <Button
              variant="secondary"
              size="lg"
              onClick={onUploadRequest}
              disabled={phase === 'processing'}
              className="w-full sm:w-auto"
              aria-label="Upload image from device instead of using the camera"
            >
              <ImagePlus size={17} aria-hidden="true" />
              Upload From Device
            </Button>
          )}
        </div>
        {phase === 'turn_package' && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#00bfa5]">
            <Rotate3D size={14} aria-hidden="true" />
            Rotate the package, then capture the back side
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <SideCaptureSlot label="Front Side" capture={frontSide} />
        <SideCaptureSlot label="Back Side" capture={backSide} />
      </div>
    </div>
  );
}

function SideCaptureSlot({
  label,
  capture,
}: {
  label: string;
  capture: CaptureSideResult | null;
}) {
  const qualityLabel = capture
    ? capture.clientQuality.sharpness >= 60
      ? 'Good'
      : capture.clientQuality.sharpness >= 40
        ? 'Fair'
        : 'Poor'
    : null;
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
        capture
          ? 'border-[#00bfa5]/50 bg-[#e0f7f4]/40'
          : 'border-dashed border-[#cbd5e1] bg-[#f8fafc]'
      }`}
      aria-label={capture ? `${label} captured` : `${label} not captured yet`}
    >
      {capture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={capture.objectUrl}
          alt={`${label} captured image`}
          className="size-12 shrink-0 rounded-md border border-[#e2e8f0] object-cover"
        />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-[#f1f5f9] text-[#94a3b8]">
          <Camera size={18} aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-xs font-bold text-[#1e293b]">
          {label}
          {capture && <CheckCircle2 size={12} className="text-[#00bfa5]" aria-hidden="true" />}
        </p>
        {capture ? (
          <p className={`mt-0.5 text-[10px] ${qualityLabel === 'Poor' ? 'font-semibold text-amber-500' : 'text-[#64748b]'}`}>
            Image quality: {qualityLabel} ({capture.clientQuality.sharpness}/100)
          </p>
        ) : (
          <p className="mt-0.5 text-[10px] text-[#94a3b8]">Not captured yet</p>
        )}
      </div>
    </div>
  );
}
