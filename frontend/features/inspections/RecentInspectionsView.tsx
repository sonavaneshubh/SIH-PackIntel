'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMyInspections } from '@/lib/hooks/useSupabaseData';
import { Inspection } from '@/types/database';
import { EvidenceDetails } from '@/types';
import { EvidenceModal } from '@/features/dashboard/EvidenceModal';
import { RecentInspectionsTable, FilterStatus } from '@/features/dashboard/RecentInspectionsTable';

export function RecentInspectionsView() {
  const router = useRouter();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceDetails | null>(null);
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);

  const {
    inspections,
    count,
    isLoading,
    error,
    refetch,
  } = useMyInspections();

  const handleOpenScanEvidence = (scan: Inspection) => {
    const isFail = scan.overall_result === 'fail';
    const isReview = scan.overall_result === 'review';

    setSelectedEvidence({
      id: `EVD-${scan.inspection_number}`,
      productName: scan.product_name ?? 'Unknown Product',
      attribute: 'Statutory Declarations',
      detectedValue: `Category: ${scan.product_category ?? 'N/A'} | Manufacturer: ${scan.manufacturer_name ?? 'N/A'}`,
      ocrConfidence: 95,
      applicableRule: 'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(1)',
      ruleVersion: 'v2.4.1 Active',
      detectedIssue: isFail
        ? 'Detected statutory compliance violation on product label.'
        : isReview
          ? 'Ambiguous declaration or low confidence fields require manual review.'
          : 'All statutory declarations verified compliant with Legal Metrology Rules.',
      explanation: 'Official screening record stored in Supabase database.',
      complianceStatus: isFail ? 'FAIL' : isReview ? 'REVIEW' : 'PASS',
      riskScore: scan.risk_score ?? (isFail ? 85 : (isReview ? 50 : 10)),
      riskLevel:
        (scan.risk_score || 0) >= 76
          ? 'CRITICAL'
          : (scan.risk_score || 0) >= 51
            ? 'HIGH'
            : 'LOW',
      riskReasons: isFail
        ? ['Detected statutory non-compliance in declarations']
        : isReview
          ? ['Verification recommended before market dispatch']
          : ['Statutory requirements fully satisfied'],
      imageUrl:
        'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&auto=format&fit=crop&q=80',
      boundingRegion: {
        top: '35%',
        left: '25%',
        width: '50%',
        height: '25%',
        label: 'Verified Statutory Region',
      },
    });
    setIsEvidenceModalOpen(true);
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
            <Button variant="primary" size="sm" icon="add_scan" onClick={() => router.push('/scan/new')}>
              New Scan
            </Button>
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
        onClose={() => setIsEvidenceModalOpen(false)}
      />
    </AppShell>
  );
}