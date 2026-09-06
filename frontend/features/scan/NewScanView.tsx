'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Camera,
  ChevronRight,
  CloudUpload,
  Copy,
  Cpu,
  Download,
  History,
  Package,
  Video,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Stepper } from '@/components/ui/Stepper';
import { ScanPipelineState, useScanPipeline } from '@/lib/hooks/useScanPipeline';
import { CameraScanner } from '@/components/CameraScanner';

const pipelineSteps = ['Capture', 'AI Analysis', 'OCR Extract', 'Compliance', 'Report'];

const quickOperations = [
  { title: 'Inspection Logs', description: 'View past legal inspections & files.', icon: History, href: '/history' },
  { title: 'Saved Templates', description: 'Reuse custom metadata overlays.', icon: Copy, href: '/settings' },
  { title: 'Bulk Scanner', description: 'Batch scan multiple logistics items.', icon: Package, href: '/scan/new' },
  { title: 'Export Daily Reports', description: 'Generate CSV/PDF summaries.', icon: Download, href: '/reports' },
];

export function NewScanView() {
  const router = useRouter();
  const { state, runFullPipeline } = useScanPipeline();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const activePipelineStep = getPipelineStep(state.step);

  const processFile = useCallback(async (file: File) => {
    setUploadedImageUrl(URL.createObjectURL(file));
    setIsProcessing(true);
    const finalProductForm = {
      product_name: 'Scanned Packaged Commodity',
      brand_name: '',
      manufacturer_name: '',
      product_category: 'packaged commodity',
      is_imported: false,
    };

    try {
      const result = await runFullPipeline(file, finalProductForm);
      if (!result.success) setShowCamera(false);
    } finally {
      setIsProcessing(false);
    }
  }, [runFullPipeline]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = '';
  };

  const handleCameraScanComplete = useCallback((file: File) => {
    void processFile(file);
  }, [processFile]);

  return (
    <AppShell pageTitle="New Compliance Scan">
      <PageHeader
        eyebrow="Compliance Inspection"
        title="New Compliance Scan"
        subtitle="Run a fresh legal metrology inspection — capture or upload a package label and let the PackIntel AI engine extract and verify statutory declarations."
        status={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-label-bold text-primary">
            <Cpu size={13} aria-hidden="true" /> PackIntel v2 AI Engine
          </span>
        }
      />

      <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Scanner Card */}
          <Card className="flex flex-col gap-4">
            <CardHeader
              title="AI Product Scanner"
              subtitle="Align label elements within the capture frame. Calibration active."
              actions={
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-label-bold text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> Calibration active
                </span>
              }
            />

            {showCamera ? (
              <CameraScanner
                onScanComplete={handleCameraScanComplete}
                onClose={() => setShowCamera(false)}
                isProcessing={isProcessing}
              />
            ) : uploadedImageUrl ? (
              <div className="overflow-hidden rounded-xl border border-outline-variant bg-[#0a0d14]">
                <img
                  src={uploadedImageUrl}
                  alt="Uploaded product label"
                  className="h-[220px] w-full object-contain sm:h-[300px]"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="flex h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low px-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 sm:h-[300px]"
              >
                <span className="mb-4 flex size-14 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-primary">
                  <Camera size={22} aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-on-surface">Point camera at product label</p>
                <p className="mt-1 font-mono text-[11px] text-on-surface-variant">
                  ISO Auto · Target AutoFocus · 60 FPS
                </p>
                <p className="mt-3 text-xs text-on-surface-variant">or choose an image file below</p>
              </button>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2.5">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => setShowCamera(true)}
                  disabled={isProcessing}
                >
                  <Video size={17} aria-hidden="true" />
                  {isProcessing ? 'Analyzing...' : 'Start Camera Scan'}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                >
                  <CloudUpload size={17} aria-hidden="true" /> Upload Image Instead
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Supported labels: JPG, PNG, WEBP · max 15MB
              </p>
            </div>
          </Card>

          {/* Pipeline Card */}
          <Card className="flex flex-col gap-4">
            <CardHeader
              title="Active Analysis Pipeline"
              subtitle="Automated stages performed after a successful capture."
            />
            <Stepper
              steps={pipelineSteps.map((label) => ({ id: label, label }))}
              currentIndex={activePipelineStep}
              className="px-1 pb-1"
            />
          </Card>

          {/* Pipeline error banner */}
          {state.error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {state.error}
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          {/* Compliance metrics */}
          <section aria-label="Compliance metrics">
            <h2 className="mb-3 text-label-bold font-label-bold uppercase tracking-wider text-on-surface-variant">
              Compliance Metrics (24h)
            </h2>
            <div className="flex flex-col gap-3">
              <StatCard label="Total Scans" value="—" icon="analytics" tone="primary" detail="Awaiting live data" />
              <StatCard label="Compliance Rate" value="—" icon="verified_user" tone="success" detail="Awaiting live data" />
              <StatCard label="Pending Reviews" value="—" icon="rule" tone="warning" detail="Awaiting live data" />
            </div>
          </section>

          {/* Quick operations */}
          <Card className="flex flex-col gap-3">
            <CardHeader title="Quick Operations" />
            <div className="flex flex-col gap-2">
              {quickOperations.map(({ title, description, icon: Icon, href }) => (
                <button
                  key={title}
                  type="button"
                  onClick={() => router.push(href)}
                  className="group flex cursor-pointer items-center gap-3 rounded-lg border border-outline-variant p-3 text-left transition-colors hover:border-primary/40 hover:bg-surface-container-low"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-on-surface">{title}</span>
                    <span className="block truncate text-[11px] text-on-surface-variant">{description}</span>
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-outline" aria-hidden="true" />
                </button>
              ))}
            </div>
          </Card>

          {/* Recent logs */}
          <Card className="flex flex-col gap-3">
            <CardHeader
              title="Recent Scanner Logs"
              actions={
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Realtime
                </span>
              }
            />
            <p className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-4 text-center text-xs text-on-surface-variant">
              Live inspection records will appear here after a scan is completed.
            </p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

function getPipelineStep(step: ScanPipelineState['step']): number {
  if (step === 'creating') return 1;
  if (step === 'uploading' || step === 'ocr' || step === 'extracting') return 2;
  if (step === 'compliance') return 3;
  if (step === 'completed') return 4;
  return 0;
}