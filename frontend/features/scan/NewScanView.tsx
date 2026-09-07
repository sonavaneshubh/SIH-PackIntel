'use client';

import React, { useCallback, useRef, useState } from 'react';
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

interface UploadImage {
  file: File;
  url: string;
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

export function NewScanView() {
  const router = useRouter();
  const { state, runFullPipeline } = useScanPipeline();
  const [cameraState, setCameraState] = useState<ScannerState>('initializing');
  const [frontCaptured, setFrontCaptured] = useState(false);
  const [backCaptured, setBackCaptured] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [frontUpload, setFrontUpload] = useState<UploadImage | null>(null);
  const [backUpload, setBackUpload] = useState<UploadImage | null>(null);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  const pipelineActive = state.step !== 'idle';
  const activeProcessingStep = getProcessingStepIndex(state.step);

  const processImages = useCallback(
    async (frontFile: File, backFile?: File) => {
      const result = await runFullPipeline(frontFile, CAPTURE_FORM, backFile);
      if (!result.success) {
        setCameraState('camera_error');
      }
    },
    [runFullPipeline]
  );

  const handleCaptureComplete = useCallback(
    (capture: { front: CaptureSideResult | null; back: CaptureSideResult | null }) => {
      if (!capture.front) return;
      void processImages(capture.front.file, capture.back?.file);
    },
    [processImages]
  );

  const handleSideCaptured = useCallback((result: CaptureSideResult) => {
    if (result.side === 'front') setFrontCaptured(true);
    else setBackCaptured(true);
  }, []);

  const handleCameraStateChange = useCallback((next: ScannerState) => {
    setCameraState(next);
  }, []);

  const acceptFile = (file: File | undefined): UploadImage | null => {
    if (!file) return null;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return null;
    if (file.size > 15 * 1024 * 1024) return null;
    return { file, url: URL.createObjectURL(file) };
  };

  const handleFrontUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const image = acceptFile(event.target.files?.[0]);
    if (image) {
      if (frontUpload) URL.revokeObjectURL(frontUpload.url);
      setFrontUpload(image);
    }
    event.target.value = '';
  };

  const handleBackUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const image = acceptFile(event.target.files?.[0]);
    if (image) {
      if (backUpload) URL.revokeObjectURL(backUpload.url);
      setBackUpload(image);
    }
    event.target.value = '';
  };

  const startUploadAnalysis = () => {
    if (!frontUpload) return;
    void processImages(frontUpload.file, backUpload?.file);
  };

  const frontDone = frontCaptured || isAfterFrontCapture(cameraState);
  const backDone = backCaptured || isAfterBackCapture(cameraState);

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

              <CameraScanner
                onCaptureComplete={handleCaptureComplete}
                onSideCaptured={handleSideCaptured}
                onCameraStateChange={handleCameraStateChange}
              />

              <div className="mt-4 flex flex-col gap-3">
                {showUpload ? (
                  <UploadPanel
                    frontUpload={frontUpload}
                    backUpload={backUpload}
                    disabled={pipelineActive}
                    onFrontChoose={() => frontInputRef.current?.click()}
                    onBackChoose={() => backInputRef.current?.click()}
                    onContinue={startUploadAnalysis}
                    onCancel={() => setShowUpload(false)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowUpload(true)}
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

            {state.error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {state.error}
              </p>
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
  frontUpload,
  backUpload,
  disabled,
  onFrontChoose,
  onBackChoose,
  onContinue,
  onCancel,
}: {
  frontUpload: UploadImage | null;
  backUpload: UploadImage | null;
  disabled: boolean;
  onFrontChoose: () => void;
  onBackChoose: () => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="scanner-fade-in-up rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-[#1e293b]">Upload Food Package Images</h3>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="text-[11px] font-semibold text-[#64748b] transition-colors hover:text-[#00bfa5] disabled:opacity-50"
        >
          Back to live scanner
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UploadSlot
          label="Front Side"
          image={frontUpload}
          onChoose={onFrontChoose}
          disabled={disabled}
        />
        <UploadSlot
          label="Back Side"
          image={backUpload}
          onChoose={onBackChoose}
          disabled={disabled}
        />
      </div>
      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-[11px] text-[#64748b]">JPG, PNG, WEBP · max 15MB per image.</p>
        <Button variant="primary" size="sm" onClick={onContinue} disabled={!frontUpload || disabled}>
          <CloudUpload size={14} aria-hidden="true" />
          {disabled ? 'Analyzing...' : 'Continue Analysis'}
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
  image: UploadImage | null;
  onChoose: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={disabled}
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors disabled:opacity-50 ${
        image ? 'border-[#00bfa5]/60 bg-[#e0f7f4]/40' : 'border-[#cbd5e1] bg-white hover:border-[#00bfa5]'
      }`}
    >
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={`${label} selected image`}
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
          <span className="mt-2 text-xs font-bold text-[#1e293b]">{label}</span>
          <span className="mt-0.5 text-[10px] text-[#94a3b8]">Choose image</span>
        </>
      )}
    </button>
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
