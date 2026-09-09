'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMyInspections } from '@/lib/hooks/useSupabaseData';
import { getInspectionById, getSignedImageUrl, derivePriority } from '@/lib/supabase/inspectionService';
import { Inspection, ExtractedLabel, ComplianceResultRow } from '@/types/database';
import { EvidenceDetails } from '@/types';
import { EvidenceModal } from '@/features/dashboard/EvidenceModal';
import { RecentInspectionsTable, FilterStatus } from '@/features/dashboard/RecentInspectionsTable';

export function RecentInspectionsView() {
  const router = useRouter();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceDetails | null>(null);
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const {
    inspections,
    count,
    isLoading,
    error,
    refetch,
  } = useMyInspections();

  // Composes the OCR-detected declaration value from the real extracted label
  // fields (MRP, net quantity, packed month/year, manufacturer, origin). Falls
  // back to the compliance engine's extracted value, then to inspection fields.
  const buildDetectedValue = (
    scan: Inspection,
    label: ExtractedLabel | null,
    primaryResult: ComplianceResultRow | null
  ): string => {
    const parts: string[] = [];
    if (label?.mrp) parts.push(`MRP: ${label.mrp}`);
    if (label?.net_quantity) parts.push(`Net Qty: ${label.net_quantity}`);
    if (label?.month_year_packed) parts.push(`Packed: ${label.month_year_packed}`);
    if (label?.manufacturer_name) parts.push(`Manufacturer: ${label.manufacturer_name}`);
    if (label?.country_of_origin) parts.push(`Origin: ${label.country_of_origin}`);
    if (parts.length) return parts.join(' | ');
    if (primaryResult?.extracted_value) return primaryResult.extracted_value;
    return `Category: ${scan.product_category ?? 'N/A'} | Manufacturer: ${scan.manufacturer_name ?? 'N/A'}`;
  };

  const handleOpenScanEvidence = async (scan: Inspection) => {
    if (evidenceLoading) return;
    setIsEvidenceModalOpen(true);
    setEvidenceLoading(true);
    setEvidenceError(null);
    setSelectedEvidence(null);

    const { data, error: loadError } = await getInspectionById(scan.id);
    if (loadError || !data) {
      setEvidenceError(loadError || 'Could not load inspection details.');
      setEvidenceLoading(false);
      return;
    }

    const images = data.inspection_images || [];
    const frontImage = images.find((img) => img.image_type === 'label_front') || images[0] || null;
    const backImage = images.find((img) => img.image_type === 'label_back') || null;
    const label = data.extracted_labels;
    const results = data.compliance_results || [];
    const primaryResult = results[0] || null;
    const failedResults = results.filter((r) => (r.result || '').toLowerCase() === 'fail');
    const reviewResults = results.filter((r) =>
      ['warning', 'uncertain'].includes((r.result || '').toLowerCase())
    );

    const resolveImageUrl = async (image: { public_url: string | null; storage_path: string | null } | null) => {
      if (!image) return null;
      if (image.public_url) return image.public_url;
      if (image.storage_path) {
        const { url } = await getSignedImageUrl(image.storage_path);
        return url;
      }
      return null;
    };
    const [primaryImageUrl, secondaryImageUrl] = await Promise.all([
      resolveImageUrl(frontImage),
      resolveImageUrl(backImage),
    ]);

    const isFail = (data.overall_result || '').toLowerCase() === 'fail';
    const isReview = (data.overall_result || '').toLowerCase() === 'review';
    const riskScore = data.risk_score ?? (isFail ? 85 : isReview ? 50 : 10);
    const riskLevel = derivePriority(riskScore);
    const riskSource = failedResults[0] || reviewResults[0] || primaryResult || null;

    const riskReasons =
      failedResults.length > 0
        ? failedResults.map((r) => `${r.rule_name}: ${r.requirement || r.explanation || 'Non-compliant declaration detected'}`)
        : reviewResults.length > 0
          ? reviewResults.map((r) => `${r.rule_name}: ${r.explanation || 'Ambiguous declaration requiring manual review'}`)
          : isFail
            ? ['Detected statutory non-compliance in declarations']
            : isReview
              ? ['Verification recommended before market dispatch']
              : ['Statutory requirements fully satisfied'];

    setSelectedEvidence({
      id: `EVD-${data.inspection_number}`,
      inspectionId: data.id,
      productName: data.product_name || label?.commodity_name || 'Unknown Product',
      attribute: primaryResult?.requirement || 'Statutory Declarations',
      detectedValue: buildDetectedValue(data, label, primaryResult),
      ocrConfidence: label?.ocr_confidence ?? frontImage?.ocr_confidence ?? null,
      applicableRule: primaryResult?.rule_name || 'Legal Metrology (Packaged Commodities) Rules, 2011',
      ruleVersion: primaryResult?.rule_code || 'LM Rules, 2011',
      detectedIssue:
        riskSource?.explanation ||
        (isFail
          ? 'Detected statutory compliance violation on product label.'
          : isReview
            ? 'Ambiguous declaration or low confidence fields require manual review.'
            : 'All statutory declarations verified compliant with Legal Metrology Rules.'),
      explanation:
        riskSource?.explanation || 'Screening record stored in Supabase database from the automated visual check.',
      complianceStatus: isFail ? 'FAIL' : isReview ? 'REVIEW' : 'PASS',
      riskScore,
      riskLevel,
      riskReasons,
      imageUrl: primaryImageUrl,
      secondaryImageUrl: secondaryImageUrl || undefined,
    });
    setEvidenceLoading(false);
  };

  const filteredInspections = inspections.filter((scan) => {
    if (filterStatus === 'ALL') return true;
    return (scan.overall_result || '').toUpperCase() === filterStatus;
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Inspection Records"
        title="Recent Inspections"
        subtitle="Audit records from field operations and automated visual checks, newest first."
        actions={
          <>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-label-bold text-primary">
              <span className="material-symbols-outlined text-[14px]">fact_check</span>
              {count} Total Inspections
            </span>
            
          </>
        }
      />

      {isLoading ? (
        <div className="animate-pulse rounded-2xl border border-[#E2E8F0] bg-white" aria-hidden="true">
          <div className="border-b border-[#E2E8F0] p-4">
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 w-20 rounded-lg bg-slate-200" />
              ))}
            </div>
          </div>
          {Array.from({ length: 6 }).map((_, row) => (
            <div key={row} className="flex items-center gap-4 border-b border-[#F1F5F9] px-4 py-3">
              <div className="h-4 w-28 rounded bg-slate-200/80" />
              <div className="h-4 w-40 rounded bg-slate-200/80" />
              <div className="ml-auto h-4 w-16 rounded bg-slate-200/80" />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon="error"
          title="Failed to load inspections"
          description={error}
          action={
            <Button variant="primary" size="sm" icon="refresh" onClick={refetch}>
              Retry
            </Button>
          }
        />
      ) : (
        <RecentInspectionsTable
          allInspections={inspections}
          inspections={filteredInspections}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
          onViewHistory={() => router.push('/history')}
          onOpenEvidence={handleOpenScanEvidence}
        />
      )}

      <EvidenceModal
        evidence={selectedEvidence}
        isOpen={isEvidenceModalOpen}
        isLoading={evidenceLoading}
        loadError={evidenceError}
        onClose={() => setIsEvidenceModalOpen(false)}
      />
    </AppShell>
  );
}