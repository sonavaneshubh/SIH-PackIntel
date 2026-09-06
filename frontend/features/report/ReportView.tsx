'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase/client';
import { getSignedImageUrl, normalizeExtractedLabel } from '@/lib/supabase/inspectionService';
import { api } from '@/lib/api';
import {
  Inspection,
  ComplianceResultRow,
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
import { cn } from '@/lib/utils';

export function ReportView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inspectionId = searchParams.get('inspection');
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [results, setResults] = useState<ComplianceResultWithRule[]>([]);
  const [label, setLabel] = useState<ExtractedLabel | null>(null);
  const [image, setImage] = useState<InspectionImage | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportMessage, setReportMessage] = useState('');

  useEffect(() => {
    if (!inspectionId) {
      setError('No inspection ID was provided.');
      setIsLoading(false);
      return;
    }
    const loadReport = async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('inspections')
          .select('*, extracted_labels (*), compliance_results (*), inspection_images (*)')
          .eq('id', inspectionId)
          .single();
        if (queryError) throw queryError;
        const rawLabel = Array.isArray(data.extracted_labels)
          ? data.extracted_labels[0]
          : data.extracted_labels;
        setInspection(data);
        setLabel(normalizeExtractedLabel(rawLabel));
        setResults(data.compliance_results || []);
        const latestImage = data.inspection_images?.[0] || null;
        setImage(latestImage);
        if (latestImage?.storage_path) {
          const signed = await getSignedImageUrl(latestImage.storage_path);
          setImageUrl(signed.url || latestImage.public_url || null);
        }
      } catch {
        setError('We could not load this inspection.');
      } finally {
        setIsLoading(false);
      }
    };
    void loadReport();
  }, [inspectionId]);

  const enrichedResults = useMemo(
    () => results.map((result) => ({ ...result, ruleDescription: result.requirement || undefined })),
    [results]
  );

  const counts = useMemo(
    () => ({
      verified: results.filter((result) => result.result === 'pass').length,
      review: results.filter((result) => result.result === 'warning').length,
      failed: results.filter((result) => result.result === 'fail').length,
      notDetected: results.filter(
        (result) => result.result === 'not_applicable' || !result.extracted_value
      ).length,
    }),
    [results]
  );

  const computedScore = results.length > 0 ? Math.round((counts.verified / results.length) * 100) : 0;
  // Score is authoritative from the backend; fall back to a local estimate only
  // for legacy records that have no stored compliance_score.
  const score =
    inspection?.compliance_score ??
    (inspection?.risk_score === 0 && inspection.overall_result === 'review' ? 0 : computedScore);
  const status = getStatus(inspection, counts, results.length);
  const confidence = getConfidence(label, image, score);
  const issues = enrichedResults.filter(
    (result) => result.result === 'fail' || result.result === 'warning' || !result.extracted_value
  );
  const rawOcr = image?.ocr_text || label?.raw_ocr_text || '';
  const productInformation = parseProductInformation(label?.product_information);
  const pipelineMeta = parsePipelineMeta(label?.other_declarations);
  const populatedFields = useMemo(
    () => buildPopulatedFields(inspection, label, productInformation),
    [inspection, label, productInformation]
  );

  const handlePdf = async () => {
    setReportMessage('Preparing report...');
    try {
      const report = await api.generateReport({ inspection_id: inspectionId || '', format: 'pdf' });
      if (report.download_url.startsWith('http')) {
        window.open(report.download_url, '_blank', 'noopener,noreferrer');
      } else {
        window.print();
        setReportMessage('Use “Save as PDF” in the print dialog to download this report.');
      }
    } catch {
      window.print();
      setReportMessage('Report prepared for printing. Use “Save as PDF” to download it.');
    }
  };

  if (isLoading) return <AppShell pageTitle="Inspection Report"><LoadingState /></AppShell>;
  if (error || !inspection)
    return (
      <AppShell pageTitle="Inspection Report">
        <ErrorState message={error || 'Inspection not found.'} onNewScan={() => router.push('/scan/new')} />
      </AppShell>
    );

  return (
    <AppShell pageTitle="Inspection Report">
      <main className="report-page mx-auto w-full max-w-6xl pb-12">
        {/* Report header */}
        <header className="report-header mb-6 flex flex-col gap-5 border-b border-outline-variant pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1.5 text-label-bold font-label-bold uppercase tracking-[0.18em] text-primary">
              PackIntel
            </p>
            <h1 className="text-3xl font-bold text-on-surface md:text-4xl">Inspection Report</h1>
            <p className="mt-1.5 text-sm text-on-surface-variant">
              Packaged Commodity Compliance Analysis
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-on-surface-variant">
              <span>
                Report ID: <strong className="text-on-surface">{inspection.inspection_number || inspection.id}</strong>
              </span>
              <span>
                Scanned: <strong className="text-on-surface">{formatDate(inspection.inspected_at || inspection.created_at)}</strong>
              </span>
              <span className="text-primary font-medium">AI-assisted inspection</span>
            </div>
          </div>
          <div className="report-actions flex flex-wrap gap-2">
            <Button variant="secondary" icon="download" onClick={handlePdf}>
              Download PDF Report
            </Button>
            <Button variant="outline" icon="print" onClick={() => window.print()}>
              Print Report
            </Button>
            <Link href="/scan/new">
              <Button variant="primary" icon="add">
                New Scan
              </Button>
            </Link>
          </div>
        </header>

        {reportMessage && (
          <p role="status" className="report-actions mb-4 text-xs text-primary">
            {reportMessage}
          </p>
        )}

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
                <p className="text-xs font-bold uppercase tracking-[0.15em] opacity-60">Compliance Score</p>
                <p className="mt-1 text-2xl font-bold">{status.label}</p>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed opacity-80 sm:mt-0">{status.description}</p>
          </div>

          <Card className="flex flex-col justify-center gap-1 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant">
              Inspection Confidence
            </p>
            <p className={cn('mt-2 font-mono text-3xl font-bold', confidenceColor(confidence.label))}>
              {confidence.label}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{confidence.reason}</p>
          </Card>
        </section>

        {/* Summary */}
        <section aria-label="Inspection summary" className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryItem value={counts.verified} label="Verified" tone="text-emerald-600" />
          <SummaryItem value={counts.review} label="Needs review" tone="text-amber-600" />
          <SummaryItem value={counts.failed} label="Failed" tone="text-red-600" />
          <SummaryItem value={counts.notDetected} label="Not detected" tone="text-on-surface-variant" />
        </section>

        {/* Checks applied */}
        <section className="mb-8">
          <SectionHeading
            title="What did PackIntel check?"
            subtitle="Applicable checks from the Legal Metrology inspection engine."
          />
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 border-y border-outline-variant py-4 md:grid-cols-2">
            {enrichedResults.map((result) => (
              <div key={result.id} className="flex gap-3 py-2 text-sm">
                <span className="text-primary">•</span>
                <div>
                  <p className="font-semibold text-on-surface">{result.rule_name}</p>
                  <p className="text-on-surface-variant">{result.ruleDescription || result.requirement}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Compliance checklist */}
        <section className="mb-8">
          <SectionHeading
            title="Compliance checklist"
            subtitle="Evidence is based on the information readable in the uploaded image."
          />
          <Card flush className="overflow-hidden">
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[640px] text-left">
                <thead className="bg-surface-container-lowest text-xs uppercase tracking-wider text-on-surface-variant">
                  <tr>
                    <th className="p-4">Requirement</th>
                    <th className="w-40 p-4">Result</th>
                    <th className="p-4">Explanation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/60 text-sm">
                  {enrichedResults.map((result) => (
                    <tr key={result.id} className="align-top">
                      <td className="p-4 font-semibold text-on-surface">{result.rule_name}</td>
                      <td className="p-4">
                        <ResultPill result={result.result} />
                      </td>
                      <td className="p-4 text-on-surface-variant">
                        {result.explanation ||
                          result.evidence ||
                          (result.extracted_value
                            ? `Detected: ${result.extracted_value}`
                            : 'This information was not detected.')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-outline-variant/60 lg:hidden">
              {enrichedResults.map((result) => (
                <div key={result.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-on-surface">{result.rule_name}</p>
                    <ResultPill result={result.result} />
                  </div>
                  <p className="text-xs leading-relaxed text-on-surface-variant">
                    {result.explanation ||
                      result.evidence ||
                      (result.extracted_value
                        ? `Detected: ${result.extracted_value}`
                        : 'This information was not detected.')}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* Issues + product info */}
        <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-red-200 bg-red-50/60 p-5">
            <SectionHeading
              title="Issues found"
              subtitle="Items that need attention before a final determination."
            />
            {issues.length ? (
              <div className="space-y-4">
                {issues.map((issue) => (
                  <div key={issue.id} className="border-l-2 border-red-400 pl-3">
                    <div className="flex items-center gap-2">
                      <ResultPill result={issue.result} />
                      <span className="text-sm font-semibold text-on-surface">{issue.rule_name}</span>
                    </div>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      {issue.explanation || 'PackIntel could not verify this requirement from the available image.'}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      <strong>Recommendation:</strong> Upload a clearer image of the relevant package panel.
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-medium text-emerald-800">
                No compliance issues detected in the available image.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeading
              title="Product information"
              subtitle="Values are extracted from the package artwork; field status and confidence are preserved."
            />
            <dl className="divide-y divide-outline-variant/60">
              {populatedFields.map((item) => (
                <div key={item.key} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4 py-2.5 text-sm">
                  <dt className="text-on-surface-variant">{item.name}</dt>
                  <dd>
                    <ProductFieldValue field={item.field} sensitive={CONFLICT_SENSITIVE_FIELDS.has(item.key)} />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>

        {/* Source image + quality */}
        <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-5">
            <SectionHeading title="Source image" subtitle="The image used for this inspection." />
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Uploaded product label"
                className="max-h-72 w-full rounded-lg border border-outline-variant bg-surface-container-low object-contain"
              />
            ) : (
              <div className="grid h-48 place-items-center rounded-lg bg-surface-container-low text-sm text-on-surface-variant">
                Image preview unavailable
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeading title="Image and OCR quality" subtitle="Quality is separate from the compliance score." />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <QualityItem label="Image quality" value={image ? 'Available' : 'Unavailable'} />
              <QualityItem label="OCR status" value={rawOcr ? 'Readable text found' : 'No readable text'} />
              <QualityItem
                label="OCR confidence"
                value={
                  image?.ocr_confidence ?? label?.extraction_confidence
                    ? `${Math.round(image?.ocr_confidence ?? label?.extraction_confidence ?? 0)}%`
                    : 'Not available'
                }
              />
              <QualityItem label="Extraction source" value={formatExtractionSource(pipelineMeta)} />
              {pipelineMeta.vision_used && (
                <QualityItem label="Vision fallback" value="Multi-modal verified" />
              )}
              {pipelineMeta.vision_error && (
                <div className="col-span-2 rounded bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200">
                  <strong>Vision fallback unavailable:</strong> {pipelineMeta.vision_error}. Results rely on OCR only.
                </div>
              )}
              <QualityItem label="Assessment" value={confidence.label} />
            </div>
            <details className="mt-5 border-t border-outline-variant pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-on-surface">
                View raw OCR text
              </summary>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-container-lowest p-3 text-xs text-on-surface-variant">
                {rawOcr || 'No readable OCR text was detected.'}
              </pre>
            </details>
          </Card>
        </section>

        {/* Recommendations */}
        <section>
          <SectionHeading title="Recommendations" />
          {issues.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-on-surface-variant">
              <li>Upload a clearer image of the relevant package panel.</li>
              <li>Include the complete label so every declaration can be checked.</li>
            </ul>
          ) : (
            <p className="text-sm text-on-surface-variant">
              No further action is recommended based on the available image.
            </p>
          )}
        </section>

        <footer className="report-footer mt-8 border-t border-outline-variant pt-5 text-xs text-on-surface-variant">
          PackIntel · AI-assisted packaged commodity inspection · Report generated{' '}
          {formatDate(new Date().toISOString())}
          <br />
          <span>
            This report is an AI-assisted preliminary inspection and should not be treated as a final legal
            determination.
          </span>
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
      <p className="mt-3 text-sm text-on-surface-variant">Preparing inspection report...</p>
    </div>
  );
}

function ErrorState({ message, onNewScan }: { message: string; onNewScan: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="material-symbols-outlined text-5xl text-error">error</span>
      <h2 className="mt-3 text-xl font-bold text-on-surface">Report unavailable</h2>
      <p className="mt-2 mb-6 text-sm text-on-surface-variant">{message}</p>
      <Button variant="primary" onClick={onNewScan}>
        Start new scan
      </Button>
    </div>
  );
}