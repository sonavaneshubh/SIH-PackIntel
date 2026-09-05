'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Camera, ChevronRight, CloudUpload, Copy, Cpu, Download, History, Package, TrendingDown, TrendingUp, Video } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
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
      <div className="mx-auto max-w-[1320px]">
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_384px]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-[0_4px_6px_rgba(0,0,0,0.02)] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h1 className="text-base font-bold text-[#1e293b]">AI Product Scanner</h1><p className="mt-1 text-xs text-[#64748b]">Align label elements within boundaries. Calibration active.</p></div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#00bfa5]"><Cpu size={14} aria-hidden="true" />PackIntel v2 AI Eng</div>
              </div>

              {showCamera ? <CameraScanner onScanComplete={handleCameraScanComplete} onClose={() => setShowCamera(false)} isProcessing={isProcessing} /> : uploadedImageUrl ? (
                <div className="mt-6 overflow-hidden rounded-lg bg-[#0a0d14]"><img src={uploadedImageUrl} alt="Uploaded product label" className="h-[240px] w-full object-contain sm:h-[320px]" /></div>
              ) : (
                <div className="mt-6 flex h-[240px] flex-col items-center justify-center rounded-lg bg-[#0a0d14] px-6 text-center sm:h-[320px]"><div className="mb-4 flex size-12 items-center justify-center rounded-full border-2 border-[#00bfa5] bg-[#00bfa5]/20 text-[#00bfa5]"><Camera size={20} aria-hidden="true" /></div><p className="text-sm font-semibold text-white">Point camera at product label</p><p className="mt-1 font-mono text-[11px] text-[#94a3b8]">ISO Auto | Target AutoFocus</p></div>
              )}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-3"><Button variant="primary" onClick={() => setShowCamera(true)} disabled={isProcessing}><Video size={16} aria-hidden="true" />{isProcessing ? 'Analyzing...' : 'Start Camera Scan'}</Button><Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}><CloudUpload size={16} aria-hidden="true" />Upload Image Instead</Button><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleFileChange} /></div><p className="text-[11px] text-[#64748b]">Supported labels: JPG, PNG, WEBP max 15MB.</p></div>
            </section>

            <section className="rounded-xl border border-[#e2e8f0] bg-white p-5"><p className="text-xs font-bold uppercase text-[#64748b]">Active Analysis Pipeline</p><div className="mt-4 flex flex-wrap items-center gap-2 sm:flex-nowrap">{pipelineSteps.map((step, index) => { const status = index < activePipelineStep ? 'complete' : index === activePipelineStep ? 'active' : 'pending'; return <React.Fragment key={step}><div className="flex min-w-0 flex-1 items-center gap-2"><span className={`flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold ${status === 'complete' ? 'border-[#00bfa5] bg-[#e0f7f4] text-[#00bfa5]' : status === 'active' ? 'border-[#00bfa5] bg-[#00bfa5] text-white' : 'border-[#e2e8f0] bg-[#f3f5f8] text-[#64748b]'}`}>{status === 'complete' ? '✓' : index + 1}</span><span className={`truncate text-xs ${status === 'active' ? 'font-bold text-[#1e293b]' : status === 'complete' ? 'font-semibold text-[#00bfa5]' : 'text-[#64748b]'}`}>{step}</span></div>{index < pipelineSteps.length - 1 && <ArrowRight size={12} className="hidden shrink-0 text-[#94a3b8] sm:block" aria-hidden="true" />}</React.Fragment>; })}</div></section>
            {state.error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
          </div>

          <aside className="flex flex-col gap-6"><section><h2 className="mb-3 text-xs font-bold uppercase text-[#64748b]">Compliance Metrics (24h)</h2><div className="flex flex-col gap-2.5"><MetricCard label="Total Scans" /><MetricCard label="Compliance Rate" /><MetricCard label="Pending Reviews" /></div></section>
            <section className="rounded-xl border border-[#e2e8f0] bg-white p-5"><h2 className="text-[13px] font-bold text-[#1e293b]">Quick Operations</h2><div className="mt-3 flex flex-col gap-2">{quickOperations.map(({ title, description, icon: Icon, href }) => <button key={title} type="button" onClick={() => router.push(href)} className="flex items-center gap-3 rounded-lg border border-[#e2e8f0] p-3 text-left transition-colors hover:border-[#00bfa5]"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#e0f7f4] text-[#00bfa5]"><Icon size={16} aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-[#1e293b]">{title}</span><span className="block truncate text-[11px] text-[#64748b]">{description}</span></span><ChevronRight size={14} className="shrink-0 text-[#94a3b8]" aria-hidden="true" /></button>)}</div></section>
            <section className="rounded-xl border border-[#e2e8f0] bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-[13px] font-bold text-[#1e293b]">Recent Scanner Logs</h2><span className="text-[11px] font-semibold text-[#00bfa5]">Realtime</span></div><p className="mt-4 text-xs text-[#64748b]">Live inspection records will appear here after a scan is completed.</p></section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value = '--', trend, positive = false }: { label: string; value?: string; trend?: string; positive?: boolean }) {
  return <div className="rounded-lg border border-[#e2e8f0] bg-white p-4"><p className="text-[11px] font-semibold uppercase text-[#64748b]">{label}</p><div className="mt-2 flex items-end justify-between"><p className="font-mono text-2xl font-bold text-[#1e293b]">{value}</p>{trend && <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${positive ? 'text-emerald-500' : 'text-red-500'}`}>{positive ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}{trend}</span>}</div></div>;
}

function getPipelineStep(step: ScanPipelineState['step']): number {
  if (step === 'creating') return 1;
  if (step === 'uploading' || step === 'ocr' || step === 'extracting') return 2;
  if (step === 'compliance') return 3;
  if (step === 'completed') return 4;
  if (step === 'error') return 0;
  return 0;
}
