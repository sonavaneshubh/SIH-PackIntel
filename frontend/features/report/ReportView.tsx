'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase/client';
import { getSignedImageUrl, normalizeExtractedLabel } from '@/lib/supabase/inspectionService';
import {
  Inspection,
  ExtractedLabel,
  InspectionImage,
} from '@/types/database';
import { CONFLICT_SENSITIVE_FIELDS, parseProductInformation } from '@/types/product';
import {
  buildPopulatedFields,
  formatDate,
  formatExtractionSource,
  getConfidence,
  getStatus,
  parsePipelineMeta,
  ComplianceResultWithRule,
} from './reportUtils';
import { ProductFieldValue, QualityItem, ResultPill, SectionHeading, SummaryItem } from './reportComponents';
import { buildReportTitle, reportBrandName, reportCompanyName, reportProductId } from '@/lib/reporting';
import { cn } from '@/lib/utils';

type LoadState = 'loading' | 'not_found' | 'error' | 'ready';

export function ReportView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inspectionId = searchParams.get('inspection');
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [results, setResults] = useState<ComplianceResultWithRule[]>([]);
  const [label, setLabel] = useState<ExtractedLabel | null>(null);
  const [image, setImage] = useState<InspectionImage | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<InspectionImage | null>(null);
  const [backImageUrl, setBackImageUrl] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reportMessage, setReportMessage] = useState('');

  const loadReport = async () => {
    setLoadState('loading');
    setError(null);
    if (!inspectionId) {
      setLoadState('not_found');
      return;
    }
    try {
      const { data, error: queryError } = await supabase
        .from('inspections')
        .select('*, extracted_labels (*), compliance_results (*), inspection_images (*)')
        .eq('id', inspectionId)
        .maybeSingle();
      if (queryError) throw queryError;
      if (!data) {
        setLoadState('not_found');
        return;
      }
      const rawLabel = Array.isArray(data.extracted_labels)
        ? data.extracted_labels[0]
        : data.extracted_labels;
      setInspection(data);
      setLabel(normalizeExtractedLabel(rawLabel));
      setResults(data.compliance_results || []);
      const images: InspectionImage[] = data.inspection_images || [];
      const frontImage = images.find((img) => img.image_type === 'label_front') || images[0] || null;
      const backImage = images.find((img) => img.image_type === 'label_back') || null;
      setImage(frontImage);
      setBackImage(backImage);
      setImageUrl(null);
      setBackImageUrl(null);
      if (frontImage?.storage_path) {
        const signed = await getSignedImageUrl(frontImage.storage_path);
        setImageUrl(signed.url || frontImage.public_url || null);
      }
      if (backImage?.storage_path) {
        const signedBack = await getSignedImageUrl(backImage.storage_path);
        setBackImageUrl(signedBack.url || backImage.public_url || null);
      }
      setLoadState('ready');
    } catch {
      setError('We could not load this inspection.');
      setLoadState('error');
    }
  };

  useEffect(() => {
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  const enrichedResults = useMemo(
    () =>
      results.map((result) => ({
        ...result,
        ruleDescription: result.requirement || result.explanation || undefined,
        status: (result.result === 'pass' ? 'PASS' : result.result === 'fail' ? 'FAIL' : result.result === 'not_applicable' ? 'NOT_APPLICABLE' : 'UNCERTAIN'),
      })),
    [results]
  );

  const counts = useMemo(
    () => ({
      verified: results.filter((r) => (r.result || '').toLowerCase() === 'pass').length,
      review: results.filter((r) => (r.result || '').toLowerCase() === 'warning' || (r.result || '').toLowerCase() === 'uncertain').length,
      failed: results.filter((r) => (r.result || '').toLowerCase() === 'fail').length,
      notApplicable: results.filter((r) => (r.result || '').toLowerCase() === 'not_applicable').length,
    }),
    [results]
  );

  const score = inspection?.compliance_score ?? 0;
  const status = getStatus(inspection, counts, results.length);
  const confidence = getConfidence(label, image, score);
  const issues = enrichedResults.filter(
    (result) => result.status === 'FAIL' || result.status === 'UNCERTAIN'
  );
  const productInformation = parseProductInformation(label?.product_information);
  const reportTitle = useMemo(
    () => (inspection ? buildReportTitle(inspection, label, productInformation) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inspection, label, productInformation]
  );
  const productBrand = reportBrandName(inspection, label, productInformation);
  const productCompany = reportCompanyName(inspection, label, productInformation);
  const pipelineMeta = parsePipelineMeta(label?.other_declarations);
  const frontOcr = image?.ocr_text || '';
  const rawOcr = backImage?.ocr_text
    ? `${frontOcr}\n\n────────────────────\nBACK SIDE OCR\n────────────────────\n${backImage.ocr_text}`.trim()
    : frontOcr || label?.raw_ocr_text || '';
  const populatedFields = useMemo(
    () => buildPopulatedFields(inspection, label, productInformation),
    [inspection, label, productInformation]
  );

  const otherInfo = productInformation?.other_detected_information || {};

  const handlePdf = () => {
    setReportMessage('Preparing PDF of the current report...');
    window.setTimeout(() => {
      window.print();
      setReportMessage('Choose “Save as PDF” as the printer in the dialog to download this report as a PDF.');
    }, 50);
  };

  if (loadState === 'loading')
    return (
      <AppShell pageTitle="Inspection Report">
        <LoadingState />
      </AppShell>
    );

  if (loadState === 'not_found')
    return (
      <AppShell pageTitle="Inspection Report">
        <NotFoundState onBack={() => router.push('/history')} />
      </AppShell>
    );

  if (loadState === 'error' || !inspection)
    return (
      <AppShell pageTitle="Inspection Report">
        <ErrorState
          message={error || 'Inspection not found.'}
          onRetry={() => void loadReport()}
          onBack={() => router.push('/history')}
        />
      </AppShell>
    );

  return (
    <AppShell pageTitle={reportTitle || 'Legal Metrology Inspection Report'}>
      <main className="report-page mx-auto w-full max-w-6xl pb-12">
        {/* Top action bar — Back then Download PDF Report, side-by-side */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link href="/history">
            <Button variant="outline" icon="arrow_back">
              Back
            </Button>
          </Link>
          <Button variant="secondary" icon="download" onClick={handlePdf}>
            Download PDF Report
          </Button>
        </div>

        {/* Report header — left: product info, right: scanned images */}
        <section className="report-header mb-6 rounded-2xl border border-outline-variant bg-surface p-5 lg:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            {/* Left: label, title, brand/manufacturer, metadata */}
            <div className="min-w-0 flex-1">
              <p className="mb-1.5 text-label-bold font-label-bold uppercase tracking-[0.18em] text-primary">
                PackIntel · SIH034
              </p>
              <h1 className="text-2xl font-bold leading-snug text-on-surface md:text-3xl">
                {reportTitle}
              </h1>
              {(productBrand || productCompany) && (
                <p className="mt-1.5 text-sm font-medium text-on-surface-variant">
                  {[productBrand, productCompany].filter(Boolean).join(' | ')}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-on-surface-variant">
                <span>
                  Product ID: <strong className="text-on-surface">{reportProductId(inspection)}</strong>
                </span>
                <span>
                  Inspection ID: <strong className="text-on-surface">{inspection.inspection_number || inspection.id}</strong>
                </span>
                <span>
                  Inspected On: <strong className="text-on-surface">{formatDate(inspection.inspected_at || inspection.created_at)}</strong>
                </span>
                <span className="text-primary font-medium">Source of Truth: Rules Database</span>
              </div>
            </div>

            {/* Right: front & back scanned images (equal sizing, never stretched) */}
            <div className="flex gap-3 sm:gap-4">
              <ScanImageBox
                url={imageUrl}
                caption="Front"
                alt="Front side of scanned package label"
              />
              <ScanImageBox
                url={backImageUrl}
                caption="Back"
                alt="Back side of scanned package label"
              />
            </div>
          </div>
        </section>

        {reportMessage && (
          <p role="status" className="report-actions mb-4 text-xs text-primary">
            {reportMessage}
          </p>
        )}

        {/* Source Images */}
        <section className="mb-6">
          <Card className="p-5">
            <SectionHeading title="Source Images" subtitle="Scanned package label artwork (front & back)." />
            {imageUrl || backImageUrl ? (
              <div className={cn('grid gap-3', backImageUrl ? 'grid-cols-1 sm:grid-cols-2' : '')}>
                {imageUrl && (
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt="Front side of scanned package label"
                      className="max-h-72 w-full rounded-lg border border-outline-variant bg-surface-container-low object-contain"
                    />
                    <figcaption className="mt-1 text-center text-[11px] font-semibold text-on-surface-variant">
                      Front Side
                    </figcaption>
                  </figure>
                )}
                {backImageUrl && (
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={backImageUrl}
                      alt="Back side of scanned package label"
                      className="max-h-72 w-full rounded-lg border border-outline-variant bg-surface-container-low object-contain"
                    />
                    <figcaption className="mt-1 text-center text-[11px] font-semibold text-on-surface-variant">
                      Back Side
                    </figcaption>
                  </figure>
                )}
              </div>
            ) : (
              <div className="grid h-48 place-items-center rounded-lg bg-surface-container-low text-sm text-on-surface-variant">
                Image preview unavailable
              </div>
            )}
          </Card>
        </section>

        {/* Score & confidence */}
        <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <div className={cn('flex flex-col justify-between rounded-2xl border p-6 sm:flex-row sm:items-center', status.tone)}>
            <div className="flex items-center gap-5">
              <div
                className="relative flex size-28 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(currentColor 0% ${Math.max(0, score)}%, rgba(0,0,0,0.12) ${Math.max(0, score)}% 100%)`,
                }}
                role="img"
                aria-label={`Compliance score ${score} out of 100`}
              >
                <div className="flex size-[86px] flex-col items-center justify-center rounded-full bg-surface-container-lowest">
                  <span className="font-mono text-2xl font-bold leading-none text-on-surface">{score}</span>
                  <span className="mt-1 text-[10px] font-label-bold uppercase tracking-wider text-on-surface-variant">
                    / 100
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] opacity-60">Legal Metrology Compliance Score</p>
                <p className="mt-1 text-2xl font-bold">{status.label}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Calculated over applicable statutory rules only</p>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed opacity-80 sm:mt-0">{status.description}</p>
          </div>

          <Card className="flex flex-col justify-center gap-1 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant">
              OCR & Image Assessment
            </p>
            <p className={cn('mt-2 font-mono text-3xl font-bold', confidenceColor(confidence.label))}>
              {confidence.label}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{confidence.reason}</p>
          </Card>
        </section>

        {/* Summary */}
        <section aria-label="Inspection summary" className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryItem value={counts.verified} label="PASS (Compliant)" tone="text-emerald-600" />
          <SummaryItem value={counts.review} label="UNCERTAIN (Review Required)" tone="text-amber-600" />
          <SummaryItem value={counts.failed} label="FAIL (Violation)" tone="text-red-600" />
          <SummaryItem value={counts.notApplicable} label="NOT APPLICABLE" tone="text-on-surface-variant" />
        </section>

        {/* Compliance Checklist Table */}
        <section className="mb-8">
          <SectionHeading
            title="Legal Metrology Rules Compliance Evaluation"
            subtitle="Verified against codified provisions of the Legal Metrology (Packaged Commodities) Rules, 2011 & Amendments."
          />
          <Card flush className="overflow-hidden">
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[700px] text-left">
                <thead className="bg-surface-container-lowest text-xs uppercase tracking-wider text-on-surface-variant">
                  <tr>
                    <th className="p-4 w-1/4">Rule & Provision</th>
                    <th className="p-4 w-1/4">Requirement</th>
                    <th className="p-4 w-1/5">Detected Declaration</th>
                    <th className="p-4 w-28">Status</th>
                    <th className="p-4">Reason & Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/60 text-sm">
                  {enrichedResults.map((result, idx) => (
                    <tr key={result.id || idx} className="align-top hover:bg-surface-container-lowest/50 transition-colors">
                      <td className="p-4">
                        <span className="font-mono text-xs text-primary font-bold">{result.rule_code || result.rule_id}</span>
                        <p className="font-semibold text-on-surface">{result.rule_name}</p>
                      </td>
                      <td className="p-4 text-xs text-on-surface-variant">
                        {result.requirement || result.ruleDescription}
                      </td>
                      <td className="p-4 text-xs font-mono font-medium text-on-surface">
                        {result.extracted_value || result.detected_value ? (
                          <span className="bg-surface-container px-2 py-1 rounded">
                            {result.extracted_value || result.detected_value}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant italic">Not detected</span>
                        )}
                      </td>
                      <td className="p-4">
                        <ResultPill result={result.status || result.result} />
                      </td>
                      <td className="p-4 text-xs text-on-surface-variant">
                        <p>{result.explanation || result.reason}</p>
                        {result.evidence && (
                          <p className="mt-1 text-[11px] text-primary/80 font-mono">
                            {result.evidence}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="divide-y divide-outline-variant/60 lg:hidden">
              {enrichedResults.map((result, idx) => (
                <div key={result.id || idx} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-mono text-primary font-bold">{result.rule_code || result.rule_id}</span>
                      <p className="text-sm font-semibold text-on-surface">{result.rule_name}</p>
                    </div>
                    <ResultPill result={result.status || result.result} />
                  </div>
                  {result.extracted_value && (
                    <p className="text-xs font-mono bg-surface-container p-1.5 rounded text-on-surface">
                      <strong>Detected:</strong> {result.extracted_value}
                    </p>
                  )}
                  <p className="text-xs leading-relaxed text-on-surface-variant">
                    {result.explanation || result.reason}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* Product Information Grid + Issues */}
        <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Core Legal Metrology Extracted Product Info */}
          <Card className="p-5">
            <SectionHeading
              title="Extracted Legal Metrology Declarations"
              subtitle="Core 16 mandatory & conditional declarations required under Legal Metrology Rules."
            />
            <dl className="divide-y divide-outline-variant/60">
              {populatedFields.map((item) => (
                <div key={item.key} className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-4 py-2.5 text-sm">
                  <dt className="text-on-surface-variant font-medium text-xs sm:text-sm">{item.name}</dt>
                  <dd>
                    <ProductFieldValue field={item.field} sensitive={CONFLICT_SENSITIVE_FIELDS.has(item.key)} />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Issues Found & Compliance Recommendations */}
          <div className="space-y-4">
            <Card className="border-red-200 bg-red-50/60 p-5">
              <SectionHeading
                title="Violations & Attention Required"
                subtitle="Issues flagged against statutory Legal Metrology provisions."
              />
              {issues.length ? (
                <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                  {issues.map((issue, idx) => (
                    <div key={issue.id || idx} className="border-l-2 border-red-400 pl-3">
                      <div className="flex items-center gap-2">
                        <ResultPill result={issue.status || issue.result} />
                        <span className="text-sm font-semibold text-on-surface">{issue.rule_name}</span>
                      </div>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {issue.explanation || issue.reason || 'Could not be verified from the image.'}
                      </p>
                      {issue.legal_reference && (
                        <p className="mt-1 text-[11px] font-mono text-red-800">
                          <strong>Citation:</strong> {issue.legal_reference}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-medium text-emerald-800">
                  No Legal Metrology violations detected in the provided image.
                </p>
              )}
            </Card>

            {/* Other Detected Information (Distinct non-LM card) */}
            <Card className="p-5 border-dashed border-outline-variant bg-surface-container-low/40">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-on-surface">Other Detected Information</h3>
                <span className="text-[10px] bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded font-mono">
                  Not evaluated under Legal Metrology compliance
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mb-3">
                Detected package text (nutrition facts, brand, FSSAI, veg symbols) separated from Legal Metrology compliance scoring.
              </p>
              
              <div className="space-y-2 text-xs">
                {otherInfo.nutrition_info && Object.keys(otherInfo.nutrition_info).length > 0 && (
                  <div className="bg-surface-container p-2 rounded">
                    <span className="font-semibold text-on-surface">Nutrition Table Detected:</span>
                    <div className="grid grid-cols-2 gap-1 mt-1 font-mono text-[11px] text-on-surface-variant">
                      {Object.entries(otherInfo.nutrition_info).map(([k, v]) => (
                        <span key={k}>{k}: {String(v)}</span>
                      ))}
                    </div>
                  </div>
                )}
                {otherInfo.brand_name && (
                  <p><strong className="text-on-surface">Brand:</strong> {otherInfo.brand_name}</p>
                )}
                {otherInfo.batch_number && (
                  <p><strong className="text-on-surface">Batch / Lot No:</strong> {otherInfo.batch_number}</p>
                )}
                {otherInfo.fssai_number && (
                  <p><strong className="text-on-surface">FSSAI Licence:</strong> {otherInfo.fssai_number}</p>
                )}
                {otherInfo.vegetarian_mark && (
                  <p><strong className="text-on-surface">Vegetarian Mark:</strong> {otherInfo.vegetarian_mark}</p>
                )}
              </div>
            </Card>
          </div>
        </section>

        {/* Source Image + Quality Diagnostics */}
        <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-5">
            <SectionHeading title="Source Images" subtitle="Scanned package label artwork (front & back)." />
            {imageUrl || backImageUrl ? (
              <div className={cn('grid gap-3', backImageUrl ? 'grid-cols-1 sm:grid-cols-2' : '')}>
                {imageUrl && (
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt="Front side of scanned package label"
                      className="max-h-72 w-full rounded-lg border border-outline-variant bg-surface-container-low object-contain"
                    />
                    <figcaption className="mt-1 text-center text-[11px] font-semibold text-on-surface-variant">
                      Front Side
                    </figcaption>
                  </figure>
                )}
                {backImageUrl && (
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={backImageUrl}
                      alt="Back side of scanned package label"
                      className="max-h-72 w-full rounded-lg border border-outline-variant bg-surface-container-low object-contain"
                    />
                    <figcaption className="mt-1 text-center text-[11px] font-semibold text-on-surface-variant">
                      Back Side
                    </figcaption>
                  </figure>
                )}
              </div>
            ) : (
              <div className="grid h-48 place-items-center rounded-lg bg-surface-container-low text-sm text-on-surface-variant">
                Image preview unavailable
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeading title="Pipeline & Image Quality Diagnostics" subtitle="Independent from statutory compliance scores." />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <QualityItem label="Image Quality" value={image ? 'Usable' : 'Unavailable'} />
              <QualityItem label="OCR Status" value={rawOcr ? 'Readable text extracted' : 'No readable text'} />
              <QualityItem
                label="OCR Confidence"
                value={
                  image?.ocr_confidence ?? label?.extraction_confidence
                    ? `${Math.round(image?.ocr_confidence ?? label?.extraction_confidence ?? 0)}%`
                    : 'Not available'
                }
              />
              <QualityItem label="Extraction Engine" value={formatExtractionSource(pipelineMeta)} />
              {pipelineMeta.vision_used && (
                <QualityItem label="Vision Verification" value="Multi-modal verified" />
              )}
              <QualityItem label="Overall Assessment" value={confidence.label} />
            </div>
            <details className="mt-5 border-t border-outline-variant pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-on-surface">
                View Raw OCR Text
              </summary>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-container-lowest p-3 text-xs text-on-surface-variant font-mono">
                {rawOcr || 'No readable OCR text was detected.'}
              </pre>
            </details>
          </Card>
        </section>

        <footer className="report-footer mt-8 border-t border-outline-variant pt-5 text-xs text-on-surface-variant">
          PackIntel · Legal Metrology Rule-Driven Automated Compliance System (SIH034) · Report generated{' '}
          {formatDate(new Date().toISOString())}
        </footer>
      </main>
    </AppShell>
  );
}

function confidenceColor(level: string) {
  if (level === 'High') return 'text-emerald-600';
  if (level === 'Medium') return 'text-amber-600';
  return 'text-red-600';
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-5xl py-16 text-center">
      <span className="material-symbols-outlined animate-spin text-4xl text-primary">autorenew</span>
      <p className="mt-3 text-sm text-on-surface-variant">Loading report...</p>
      <p className="mt-1 text-xs text-on-surface-variant">
        Fetching inspection, OCR, and compliance data.
      </p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  onBack,
}: {
  message: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="material-symbols-outlined text-5xl text-error">error</span>
      <h2 className="mt-3 text-xl font-bold text-on-surface">Unable to load report</h2>
      <p className="mt-2 mb-6 text-sm text-on-surface-variant">{message}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="primary" icon="refresh" onClick={onRetry}>
          Try Again
        </Button>
        <Button variant="outline" icon="arrow_back" onClick={onBack}>
          Back to History
        </Button>
      </div>
    </div>
  );
}

function NotFoundState({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="material-symbols-outlined text-5xl text-error">search_off</span>
      <h2 className="mt-3 text-xl font-bold text-on-surface">Report not found</h2>
      <p className="mt-2 mb-6 text-sm text-on-surface-variant">
        The requested inspection report could not be found. It may have been deleted or the link may be
        incorrect.
      </p>
      <Button variant="primary" icon="arrow_back" onClick={onBack}>
        Back to History
      </Button>
    </div>
  );
}

/** Equal-sized, responsive thumbnail box for a scanned package label side. */
function ScanImageBox({
  url,
  caption,
  alt,
}: {
  url: string | null;
  caption: 'Front' | 'Back';
  alt: string;
}) {
  return (
    <figure className="group flex w-[150px] flex-col sm:w-[220px]">
      {url ? (
        <div className="h-[110px] w-full overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md sm:h-[150px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="h-full w-full object-contain p-1.5" />
        </div>
      ) : (
        <div className="grid h-[110px] w-full place-items-center rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-2 text-center text-[11px] leading-tight text-on-surface-variant sm:h-[150px]">
          {caption} image unavailable
        </div>
      )}
      <figcaption className="mt-1.5 inline-block self-center rounded-full bg-surface-container-high px-2.5 py-0.5 text-center text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
        {caption}
      </figcaption>
    </figure>
  );
}
