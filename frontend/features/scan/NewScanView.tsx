'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  Copy,
  Download,
  History,
  ImagePlus,
  Package,
  RefreshCw,
  RotateCcw,
  ScanLine,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { CameraScanner, CaptureSideResult, STATUS_LABELS } from '@/components/CameraScanner';
import { useScanPipeline } from '@/lib/hooks/useScanPipeline';
import { ScannerState } from '@/types/scanner';

const quickOperations = [
  { title: 'Inspection Logs', description: 'View past legal inspections & files.', icon: History, href: '/history' },
  { title: 'Saved Templates', description: 'Reuse custom metadata overlays.', icon: Copy, href: '/settings' },
  { title: 'Bulk Scanner', description: 'Batch scan multiple logistics items.', icon: Package, href: '/scan/new' },
  { title: 'Export Daily Reports', description: 'Generate CSV/PDF summaries.', icon: Download, href: '/reports' },
];

const PROCESSING_STEPS = [
  { key: 'quality', label: 'Image Quality' },
  { key: 'ocr', label: 'OCR Extraction' },
  { key: 'product', label: 'Product Information' },
  { key: 'rules', label: 'Rule Validation' },
  { key: 'report', label: 'Report Generation' },
];

const CAPTURE_FORM = {
  product_name: 'Scanned Packaged Commodity',
  brand_name: '',
  manufacturer_name: '',
  product_category: 'packaged commodity',
  is_imported: false,
};

interface UploadValidation {
  valid: boolean;
  message: string | null;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024;

// A single validated image source used by both the camera and the upload path.
// The camera produces jpeg blobs; uploads come from a <input type=file>.
interface ProductSideImage {
  source: 'camera' | 'upload';
  file: File;
  objectUrl: string;
  side: 'front' | 'back';
}

function validateUpload(file: File | undefined): UploadValidation {
  if (!file) return { valid: false, message: null };
  const typeOk = ALLOWED_IMAGE_TYPES.includes(file.type);
  const extOk = ALLOWED_IMAGE_EXT.test(file.name);
  if (!typeOk && !extOk) {
    return {
      valid: false,
      message: 'Please choose a JPG, JPEG, PNG or WEBP image.',
    };
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      message: 'Image is too large. Please choose a smaller image (max 15MB).',
    };
  }
  if (file.size === 0) {
    return {
      valid: false,
      message: 'This file appears to be empty. Please select another image.',
    };
  }
  return { valid: true, message: null };
}

function getProcessingStepIndex(step: string): number {
  if (step === 'creating' || step === 'uploading') return 0;
  if (step === 'ocr') return 1;
  if (step === 'extracting') return 2;
  if (step === 'compliance') return 3;
  if (step === 'completed') return 4;
  return 0;
}

function isAfterFrontCapture(state: ScannerState): boolean {
  return [
    'front_captured',
    'turn_package',
    'searching_back',
    'back_detected',
    'capturing_back',
    'processing',
    'completed',
  ].includes(state);
}

function isAfterBackCapture(state: ScannerState): boolean {
  return ['processing', 'completed'].includes(state);
}

// Which image source is currently being filled for the active side.
type ActiveSource = 'none' | 'camera' | 'upload';

export function NewScanView() {
  const router = useRouter();
  const { state, runFullPipeline, resetPipeline } = useScanPipeline();
  const [cameraState, setCameraState] = useState<ScannerState>('initializing');
  const [frontCaptured, setFrontCaptured] = useState(false);
  const [backCaptured, setBackCaptured] = useState(false);
  const [activeSource, setActiveSource] = useState<ActiveSource>('camera');
  const [frontImage, setFrontImage] = useState<ProductSideImage | null>(null);
  const [backImage, setBackImage] = useState<ProductSideImage | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [scannerInstance, setScannerInstance] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  const pipelineActive = state.step !== 'idle';
  const activeProcessingStep = getProcessingStepIndex(state.step);

  const processImages = useCallback(
    async (frontFile: File, backFile?: File) => {
      const result = await runFullPipeline(frontFile, CAPTURE_FORM, backFile);
      if (!result.success) {
        setScanError(result.error || 'Scan failed. Please try again.');
        setShowReview(false);
        resetPipeline();
        // Restore the scanner so the operator can re-scan or upload again
        // instead of being stuck on a frozen "processing" view.
        setScannerInstance((instance) => instance + 1);
      } else {
        setScanError(null);
      }
    },
    [runFullPipeline, resetPipeline]
  );

  const handleCaptureComplete = useCallback(
    (capture: { front: CaptureSideResult | null; back: CaptureSideResult | null }) => {
      if (!capture.front) return;
      // Create our own preview URLs from the files: CameraScanner revokes the
      // URLs it produced when it unmounts (which releases the camera), so we
      // must not borrow those for the review screen.
      setFrontImage({
        source: 'camera',
        file: capture.front.file,
        objectUrl: URL.createObjectURL(capture.front.file),
        side: 'front',
      });
      if (capture.back) {
        setBackImage({
          source: 'camera',
          file: capture.back.file,
          objectUrl: URL.createObjectURL(capture.back.file),
          side: 'back',
        });
      }
      // Both camera sides are ready → go straight to the review screen so the
      // operator can confirm before the (expensive) scan runs.
      setShowReview(true);
    },
    []
  );

  const handleSideCaptured = useCallback((result: CaptureSideResult) => {
    if (result.side === 'front') setFrontCaptured(true);
    else setBackCaptured(true);
  }, []);

  const handleCameraStateChange = useCallback((next: ScannerState) => {
    setCameraState(next);
  }, []);

  // Opening the upload flow pauses the live camera preview (and releases the
  // MediaStream) so we're not holding the sensor while the user picks files.
  const openUploadFlow = useCallback(() => {
    setActiveSource('upload');
    setShowUpload(true);
    setShowReview(false);
    setValidationError(null);
  }, []);

  const cancelUpload = useCallback(() => {
    setShowUpload(false);
    if (frontImage || backImage) {
      setShowReview(true);
    } else {
      setActiveSource('camera');
    }
  }, [frontImage, backImage]);

  const acceptFileAsSide = (file: File | undefined, side: 'front' | 'back'): void => {
    const validation = validateUpload(file);
    if (!validation.valid) {
      setValidationError(
        validation.message === 'This file appears to be empty. Please select another image.'
          ? 'This image could not be read. Please select another image.'
          : validation.message || 'This image could not be read. Please select another image.',
      );
      return;
    }
    setValidationError(null);
    const selected = file as File;
    // Probe with a throwaway URL first; if the file isn't a decodable image we
    // never commit it. The retained preview gets its own fresh object URL so a
    // revoke on the probe can never blank an accepted image.
    const probeUrl = URL.createObjectURL(selected);
    const probe = new Image();
    probe.onload = () => {
      URL.revokeObjectURL(probeUrl);
      const previewUrl = URL.createObjectURL(selected);
      if (side === 'front') {
        if (frontImage) URL.revokeObjectURL(frontImage.objectUrl);
        setFrontImage({ source: 'upload', file: selected, objectUrl: previewUrl, side });
        setFrontCaptured(true);
      } else {
        if (backImage) URL.revokeObjectURL(backImage.objectUrl);
        setBackImage({ source: 'upload', file: selected, objectUrl: previewUrl, side });
        setBackCaptured(true);
      }
    };
    probe.onerror = () => {
      URL.revokeObjectURL(probeUrl);
      setValidationError('This image could not be read. Please select another image.');
    };
    probe.src = probeUrl;
  };

  const handleFrontUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) acceptFileAsSide(file, 'front');
    event.target.value = '';
  };

  const handleBackUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) acceptFileAsSide(file, 'back');
    event.target.value = '';
  };

  // Both sides must be present before the review screen can be submitted.
  const hasBothImages = Boolean(frontImage && backImage);

  // The camera session always starts at the front, so retaking either side
  // restarts the full front-then-back capture. Both stored images are dropped
  // so the progress bar and camera prompt stay in sync with reality.
  const restartCaptureSession = useCallback(() => {
    if (frontImage) URL.revokeObjectURL(frontImage.objectUrl);
    if (backImage) URL.revokeObjectURL(backImage.objectUrl);
    setFrontImage(null);
    setBackImage(null);
    setFrontCaptured(false);
    setBackCaptured(false);
    setShowReview(false);
    setShowUpload(false);
    setActiveSource('camera');
    setScannerInstance((instance) => instance + 1);
  }, [frontImage, backImage]);

  const retakeFront = restartCaptureSession;

  const retakeBack = restartCaptureSession;

  const replaceFront = useCallback(() => {
    setShowReview(false);
    setActiveSource('upload');
    setShowUpload(true);
  }, []);

  const replaceBack = useCallback(() => {
    setShowReview(false);
    setActiveSource('upload');
    setShowUpload(true);
  }, []);

  const removeFront = useCallback(() => {
    if (frontImage) URL.revokeObjectURL(frontImage.objectUrl);
    setFrontImage(null);
    setFrontCaptured(false);
  }, [frontImage]);

  const removeBack = useCallback(() => {
    if (backImage) URL.revokeObjectURL(backImage.objectUrl);
    setBackImage(null);
    setBackCaptured(false);
  }, [backImage]);

  const startScanFromReview = useCallback(() => {
    if (!frontImage) return;
    if (pipelineActive) return;
    setShowReview(false);
    void processImages(frontImage.file, backImage?.file);
  }, [frontImage, backImage, pipelineActive, processImages]);

  // Upload → Review: keep both selected images, switch from the upload panel
  // to the review screen so nothing is scanned without an explicit confirm.
  const continueFromUpload = useCallback(() => {
    setShowUpload(false);
    setShowReview(true);
  }, []);

  const frontDone = frontCaptured || isAfterFrontCapture(cameraState) || Boolean(frontImage);
  const backDone = backCaptured || isAfterBackCapture(cameraState) || Boolean(backImage);

  // Deterministic: camera shown only when the active source is camera AND the
  // review screen is not visible AND no scan is running.
  const showCamera =
    activeSource === 'camera' && !showReview && !pipelineActive && state.step === 'idle';

  const processingLabel = useMemo(() => {
    switch (state.step) {
      case 'creating':
        return 'Creating inspection record...';
      case 'uploading':
        return 'Uploading images...';
      case 'ocr':
        return 'Reading product label...';
      case 'extracting':
        return 'Extracting product information...';
      case 'compliance':
        return 'Checking legal compliance...';
      case 'completed':
        return 'Generating report...';
      default:
        return 'Processing...';
    }
  }, [state.step]);

  return (
    <AppShell pageTitle="New Compliance Scan">
      <div className="mx-auto max-w-[1320px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-[#1e293b]">New Compliance Scan</h1>
            <p className="mt-0.5 text-xs text-[#64748b]">
              Scan the front and back of a packaged food product for compliance inspection.
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-md border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#00bfa5] shadow-sm">
            <span className="relative flex size-1.5">
              <span className="scanner-dot-ping absolute inline-flex size-full rounded-full bg-[#00bfa5]" />
              <span className="relative inline-flex size-1.5 rounded-full bg-[#00bfa5]" />
            </span>
            Operational
          </span>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_384px]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-[0_4px_6px_rgba(0,0,0,0.02)] sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#00bfa5]">
                    <span className="relative flex size-1.5">
                      <span className="scanner-dot-ping absolute inline-flex size-full rounded-full bg-[#00bfa5]" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-[#00bfa5]" />
                    </span>
                    Auto scanning
                  </span>
                </div>
                <span
                  role="status"
                  className="rounded-md bg-[#f3f5f8] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#1e293b]"
                >
                  {STATUS_LABELS[cameraState]}
                </span>
              </div>

              <CaptureStepsBar
                frontDone={frontDone}
                backDone={backDone}
                analysisActive={pipelineActive}
                reportActive={state.step === 'completed'}
              />

              {showCamera && (
                <CameraScanner
                  key={scannerInstance}
                  onCaptureComplete={handleCaptureComplete}
                  onSideCaptured={handleSideCaptured}
                  onCameraStateChange={handleCameraStateChange}
                  onUploadRequest={openUploadFlow}
                />
              )}

              {showUpload && !pipelineActive && (
                <UploadPanel
                  frontImage={frontImage}
                  backImage={backImage}
                  disabled={pipelineActive}
                  error={validationError}
                  onFrontChoose={() => frontInputRef.current?.click()}
                  onBackChoose={() => backInputRef.current?.click()}
                  onContinue={continueFromUpload}
                  onCancel={cancelUpload}
                />
              )}

              {showReview && !pipelineActive && (
                <ReviewPanel
                  front={frontImage}
                  back={backImage}
                  canScan={hasBothImages}
                  error={validationError}
                  onReplaceFront={replaceFront}
                  onReplaceBack={replaceBack}
                  onRetakeFront={retakeFront}
                  onRetakeBack={retakeBack}
                  onRemoveFront={removeFront}
                  onRemoveBack={removeBack}
                  onScan={startScanFromReview}
                />
              )}

              {pipelineActive && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-xs font-semibold text-[#1e293b]">
                  <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-[#00bfa5]/30 border-t-[#00bfa5]" />
                  {processingLabel}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-3">
                {!showUpload && !showReview && (
                  <button
                    type="button"
                    onClick={openUploadFlow}
                    disabled={pipelineActive}
                    className="mx-auto flex items-center gap-1.5 rounded-md py-1 text-xs font-semibold text-[#64748b] transition-colors hover:text-[#00bfa5] disabled:opacity-50"
                  >
                    <CloudUpload size={14} aria-hidden="true" />
                    Having camera issues? Upload package images instead
                  </button>
                )}
                <input
                  ref={frontInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleFrontUpload}
                />
                <input
                  ref={backInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleBackUpload}
                />
              </div>
            </section>

            {pipelineActive && (
              <ProcessingPanel
                activeStep={activeProcessingStep}
                frontCaptured={frontCaptured || frontDone}
                backCaptured={backCaptured || backDone}
              />
            )}

            {scanError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-800">Scan could not be completed</p>
                <p className="mt-1 text-sm text-red-700">{scanError}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {frontImage && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setScanError(null);
                        setShowReview(true);
                      }}
                      aria-label="Retry scan with the same images"
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      Retry Scan
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setScanError(null);
                      setShowUpload(false);
                      setShowReview(false);
                      setActiveSource('camera');
                      setScannerInstance((instance) => instance + 1);
                    }}
                    aria-label="Start a new scan"
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    Start New Scan
                  </Button>
                </div>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-6">
            <section>
              <h2 className="mb-3 text-xs font-bold uppercase text-[#64748b]">Compliance Metrics (24h)</h2>
              <div className="flex flex-col gap-2.5">
                <MetricCard label="Total Scans" />
                <MetricCard label="Compliance Rate" />
                <MetricCard label="Pending Reviews" />
              </div>
            </section>
            <section className="rounded-xl border border-[#e2e8f0] bg-white p-5">
              <h2 className="text-[13px] font-bold text-[#1e293b]">Quick Operations</h2>
              <div className="mt-3 flex flex-col gap-2">
                {quickOperations.map(({ title, description, icon: Icon, href }) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => router.push(href)}
                    className="flex items-center gap-3 rounded-lg border border-[#e2e8f0] p-3 text-left transition-colors hover:border-[#00bfa5]"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#e0f7f4] text-[#00bfa5]">
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-[#1e293b]">{title}</span>
                      <span className="block truncate text-[11px] text-[#64748b]">{description}</span>
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-[#94a3b8]" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
            <section className="rounded-xl border border-[#e2e8f0] bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-[#1e293b]">Recent Scanner Logs</h2>
                <span className="text-[11px] font-semibold text-[#00bfa5]">Realtime</span>
              </div>
              <p className="mt-4 text-xs text-[#64748b]">
                Live inspection records will appear here after a scan is completed.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function CaptureStepsBar({
  frontDone,
  backDone,
  analysisActive,
  reportActive,
}: {
  frontDone: boolean;
  backDone: boolean;
  analysisActive: boolean;
  reportActive: boolean;
}) {
  const steps = [
    { label: 'Front', done: frontDone, active: !frontDone },
    { label: 'Back', done: backDone, active: frontDone && !backDone },
    { label: 'Analysis', done: reportActive, active: analysisActive },
    { label: 'Report', done: reportActive, active: reportActive },
  ];
  return (
    <div className="mt-4 flex items-center gap-2" aria-label="Scan progress: front, back, analysis, report">
      {steps.map((step, index) => (
        <React.Fragment key={step.label}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold transition-colors ${
                step.done
                  ? 'border-[#00bfa5] bg-[#00bfa5] text-white'
                  : step.active
                    ? 'border-[#00bfa5] bg-[#e0f7f4] text-[#00bfa5]'
                    : 'border-[#e2e8f0] bg-[#f3f5f8] text-[#94a3b8]'
              }`}
            >
              {step.done ? <Check size={12} aria-hidden="true" /> : String(index + 1).padStart(2, '0')}
            </span>
            <span
              className={`truncate text-xs ${
                step.done
                  ? 'font-bold text-[#00bfa5]'
                  : step.active
                    ? 'font-bold text-[#1e293b]'
                    : 'text-[#64748b]'
              }`}
            >
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <ArrowRight size={12} className="shrink-0 text-[#94a3b8]" aria-hidden="true" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function ProcessingPanel({
  activeStep,
  frontCaptured,
  backCaptured,
}: {
  activeStep: number;
  frontCaptured: boolean;
  backCaptured: boolean;
}) {
  return (
    <section className="scanner-fade-in-up rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[0_4px_6px_rgba(0,0,0,0.02)]">
      <h2 className="text-[13px] font-bold text-[#1e293b]">Package captured successfully</h2>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-[#00bfa5]">
          <CheckCircle2 size={14} aria-hidden="true" />
          {frontCaptured ? 'Front image captured' : 'Front image pending'}
        </span>
        <span className="flex items-center gap-1.5 font-semibold text-[#00bfa5]">
          <CheckCircle2 size={14} aria-hidden="true" />
          {backCaptured ? 'Back image captured' : 'Back image pending'}
        </span>
      </div>
      <p className="mt-2 text-xs text-[#64748b]">Preparing compliance analysis...</p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {PROCESSING_STEPS.map((step, index) => {
          const status =
            index < activeStep
              ? 'complete'
              : index === activeStep
                ? 'active'
                : 'pending';
          return (
            <div
              key={step.key}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${
                status === 'complete'
                  ? 'border-[#00bfa5]/40 bg-[#e0f7f4]/50'
                  : status === 'active'
                    ? 'border-[#00bfa5] bg-white'
                    : 'border-[#e2e8f0] bg-[#f8fafc]'
              }`}
              aria-current={status === 'active' ? 'step' : undefined}
            >
              {status === 'complete' ? (
                <CheckCircle2 size={16} className="shrink-0 text-[#00bfa5]" aria-hidden="true" />
              ) : status === 'active' ? (
                <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-[#00bfa5]/30 border-t-[#00bfa5]" />
              ) : (
                <span className="size-2 shrink-0 rounded-full bg-[#cbd5e1]" aria-hidden="true" />
              )}
              <span
                className={`truncate text-[11px] font-semibold ${
                  status === 'complete'
                    ? 'text-[#00bfa5]'
                    : status === 'active'
                      ? 'text-[#1e293b]'
                      : 'text-[#64748b]'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UploadPanel({
  frontImage,
  backImage,
  disabled,
  error,
  onFrontChoose,
  onBackChoose,
  onContinue,
  onCancel,
}: {
  frontImage: ProductSideImage | null;
  backImage: ProductSideImage | null;
  disabled: boolean;
  error: string | null;
  onFrontChoose: () => void;
  onBackChoose: () => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const canContinue = Boolean(frontImage && backImage);
  return (
    <div className="scanner-fade-in-up rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-[#1e293b]">Upload Food Package Images</h3>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="text-[11px] font-semibold text-[#64748b] transition-colors hover:text-[#00bfa5] disabled:opacity-50"
          aria-label="Back to the camera scanner"
        >
          Back to scanner
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UploadSlot
          label="Front"
          image={frontImage}
          onChoose={onFrontChoose}
          disabled={disabled}
        />
        <UploadSlot
          label="Back"
          image={backImage}
          onChoose={onBackChoose}
          disabled={disabled}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-[11px] text-[#64748b]">
          JPG, JPEG, PNG, WEBP · max 15MB per image.
          {!canContinue && ' Please add both front and back images.'}
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={onContinue}
          disabled={!canContinue || disabled}
          aria-label="Continue to review the selected images"
        >
          <CloudUpload size={14} aria-hidden="true" />
          {disabled ? 'Analyzing...' : 'Review & Scan'}
        </Button>
      </div>
    </div>
  );
}

function UploadSlot({
  label,
  image,
  onChoose,
  disabled,
}: {
  label: string;
  image: ProductSideImage | null;
  onChoose: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={disabled}
      aria-label={image ? `Replace the ${label} image` : `Choose the ${label} image`}
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors disabled:opacity-50 ${
        image ? 'border-[#00bfa5]/60 bg-[#e0f7f4]/40' : 'border-[#cbd5e1] bg-white hover:border-[#00bfa5]'
      }`}
    >
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.objectUrl}
            alt={`${label} image selected for scanning`}
            className="h-20 w-full rounded-md border border-[#e2e8f0] object-contain"
          />
          <span className="mt-2 flex items-center gap-1 text-[11px] font-bold text-[#00bfa5]">
            <CheckCircle2 size={12} aria-hidden="true" />
            {label} selected
          </span>
          <span className="mt-0.5 text-[10px] text-[#64748b]">Tap to replace</span>
        </>
      ) : (
        <>
          <span className="flex size-10 items-center justify-center rounded-full bg-[#f1f5f9] text-[#94a3b8]">
            <ImagePlus size={18} aria-hidden="true" />
          </span>
          <span className="mt-2 text-xs font-bold text-[#1e293b]">{label} side</span>
          <span className="mt-0.5 text-[10px] text-[#94a3b8]">Choose image</span>
        </>
      )}
    </button>
  );
}

function ReviewPanel({
  front,
  back,
  canScan,
  error,
  onReplaceFront,
  onReplaceBack,
  onRetakeFront,
  onRetakeBack,
  onRemoveFront,
  onRemoveBack,
  onScan,
}: {
  front: ProductSideImage | null;
  back: ProductSideImage | null;
  canScan: boolean;
  error: string | null;
  onReplaceFront: () => void;
  onReplaceBack: () => void;
  onRetakeFront: () => void;
  onRetakeBack: () => void;
  onRemoveFront: () => void;
  onRemoveBack: () => void;
  onScan: () => void;
}) {
  return (
    <section className="scanner-fade-in-up rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[0_4px_6px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-[#1e293b]">Review Product Images</h3>
        <span className="text-[11px] font-semibold text-[#00bfa5]">Ready to scan</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ReviewSlot
          sideLabel="FRONT"
          image={front}
          onReplace={onReplaceFront}
          onRetake={onRetakeFront}
          onRemove={onRemoveFront}
        />
        <ReviewSlot
          sideLabel="BACK"
          image={back}
          onReplace={onReplaceBack}
          onRetake={onRetakeBack}
          onRemove={onRemoveBack}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </p>
      )}

      {!canScan && (
        <p className="mt-3 rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-xs font-medium text-[#64748b]">
          Please add both front and back images before scanning.
        </p>
      )}

      <div className="mt-4 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-[11px] text-[#64748b] sm:max-w-[240px]">
          Confirm the labels look correct before running the compliance scan.
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={onScan}
          disabled={!canScan}
          className="w-full sm:w-auto"
          aria-label="Scan the product with the front and back images"
        >
          <ScanLine size={16} aria-hidden="true" />
          Scan Product
        </Button>
      </div>
    </section>
  );
}

function ReviewSlot({
  sideLabel,
  image,
  onReplace,
  onRetake,
  onRemove,
}: {
  sideLabel: string;
  image: ProductSideImage | null;
  onReplace: () => void;
  onRetake: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#1e293b]">{sideLabel} Product Image</span>
        {image && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[10px] font-semibold text-red-600 transition-colors hover:text-red-700"
            aria-label={`Remove ${sideLabel.toLowerCase()} image`}
          >
            Remove
          </button>
        )}
      </div>
      <div className="mt-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-[#e2e8f0] bg-white">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.objectUrl}
            alt={`${sideLabel.toLowerCase()} label for review`}
            className="size-full object-contain"
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-[11px] text-[#94a3b8]">
            <ImagePlus size={18} aria-hidden="true" />
            Not captured yet
          </span>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <Button variant="outline" size="sm" onClick={onReplace} className="flex-1" aria-label={`Replace ${sideLabel.toLowerCase()} image`}>
          <RefreshCw size={12} aria-hidden="true" />
          Replace
        </Button>
        <Button variant="ghost" size="sm" onClick={onRetake} className="flex-1" aria-label={`Retake ${sideLabel.toLowerCase()} image with the camera`}>
          <RotateCcw size={12} aria-hidden="true" />
          Retake
        </Button>
      </div>
    </div>
  );
}

function MetricCard({ label, value = '--', trend, positive = false }: { label: string; value?: string; trend?: string; positive?: boolean }) {
  return (
    <div className="rounded-lg border border-[#e2e8f0] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase text-[#64748b]">{label}</p>
      <div className="mt-2 flex items-end justify-between">
        <p className="font-mono text-2xl font-bold text-[#1e293b]">{value}</p>
        {trend && (
          <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${positive ? 'text-emerald-500' : 'text-red-500'}`}>
            {positive ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
