import React from 'react';
import { Inspection } from '@/types/database';
import { StatusBadge, RiskBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

export type FilterStatus = 'ALL' | 'FAIL' | 'REVIEW' | 'PASS';

interface RecentInspectionsTableProps {
  allInspections: Inspection[];
  inspections: Inspection[];
  filterStatus: FilterStatus;
  onFilterChange: (status: FilterStatus) => void;
  onViewHistory: () => void;
  onOpenEvidence: (inspection: Inspection) => void;
}

const filterLabels: Record<FilterStatus, string> = {
  ALL: 'All Scans',
  FAIL: 'Non-compliant',
  REVIEW: 'Needs review',
  PASS: 'Compliant',
};

// Formats the inspection's scan date strictly from the stored inspection record
// (inspected_at when set, otherwise created_at). It never falls back to the
// current system date, so every render shows the same, correct date.
function formatInspectionDate(inspection: Inspection): string {
  const timestamp = inspection.inspected_at || inspection.created_at;
  if (!timestamp) return '—';
  try {
    return new Date(timestamp).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function RecentInspectionsTable({
  allInspections,
  inspections,
  filterStatus,
  onFilterChange,
  onViewHistory,
  onOpenEvidence,
}: RecentInspectionsTableProps) {
  // Derive the scan date once per inspection and share it between the desktop
  // table and the mobile cards, so a single inspection never renders two
  // different/duplicated dates.
  const scanDateByInspection = new Map(
    inspections.map((inspection) => [inspection.id, formatInspectionDate(inspection)])
  );

  return (
    <Card flush className="flex min-w-0 flex-col">
      <div className="p-4 md:p-5">
        <CardHeader
          title="Recent Inspections"
          subtitle="Audit records from field operations and automated visual checks."
          actions={
            <Button variant="ghost" size="sm" onClick={onViewHistory} className="shrink-0 px-1 text-body-sm text-primary">
              View History →
            </Button>
          }
        />

        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Filter inspections by status">
          {(Object.keys(filterLabels) as FilterStatus[]).map((status) => {
            const count =
              status === 'ALL'
                ? allInspections.length
                : allInspections.filter(
                    (item) => (item.overall_result || '').toUpperCase() === status
                  ).length;
            return (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={filterStatus === status}
                onClick={() => onFilterChange(status)}
                className={cn(
                  'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  filterStatus === status
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                )}
              >
                {filterLabels[status]}
                <span
                  className={cn(
                    'rounded px-1 py-0.5 text-[10px] font-label-bold',
                    filterStatus === status
                      ? 'bg-white/20 text-white'
                      : 'bg-surface-container-highest text-on-surface-variant'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {inspections.length === 0 ? (
        <EmptyState
          icon="content_paste_search"
          title="No inspections found"
          description="Try changing your status filter or scan a new product."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-surface-container-low text-label-bold font-label-bold uppercase tracking-wider text-on-surface-variant">
                  <th className="p-3 text-[11px]">Product</th>
                  <th className="p-3 text-[11px]">Manufacturer</th>
                  <th className="w-[120px] p-3 text-[11px]">Scan Date</th>
                  <th className="w-[110px] p-3 text-[11px]">Status</th>
                  <th className="w-[110px] p-3 text-[11px]">Risk</th>
                  <th className="w-24 p-3 text-right text-[11px]">Action</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((inspection) => {
                  const result = (inspection.overall_result || 'pending').toUpperCase();
                  const status = result === 'PASS' ? 'PASS' : result === 'REVIEW' ? 'REVIEW' : result === 'FAIL' ? 'FAIL' : 'pending';
                  const riskScore = inspection.risk_score ?? (status === 'FAIL' ? 85 : status === 'REVIEW' ? 50 : 10);
                  return (
                    <tr key={inspection.id} className="border-b border-outline-variant/60 text-body-sm font-body-sm text-on-surface-variant transition-colors hover:bg-surface-container-lowest">
                      <td className="p-3">
                        <div className="max-w-[200px] truncate text-[13px] font-semibold leading-tight text-on-surface">
                          {inspection.product_name || 'Unknown Product'}
                        </div>
                        <span className="font-mono text-[11px] text-on-surface-variant">
                          ID: {inspection.inspection_number}
                        </span>
                      </td>
                      <td className="p-3">{inspection.manufacturer_name || 'N/A'}</td>
                      <td className="p-3 font-data-tabular text-xs">
                        {scanDateByInspection.get(inspection.id) || '—'}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="p-3">
                        <RiskBadge score={riskScore} showScore={false} />
                      </td>
                      <td className="p-3 text-right">
                        <Button variant={status === 'REVIEW' ? 'primary' : 'outline'} size="sm" onClick={() => onOpenEvidence(inspection)}>
                          {status === 'REVIEW' ? 'Analyze' : 'Details'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="divide-y divide-outline-variant/60 md:hidden">
            {inspections.map((inspection) => {
              const result = (inspection.overall_result || 'pending').toUpperCase();
              const status = result === 'PASS' ? 'PASS' : result === 'REVIEW' ? 'REVIEW' : result === 'FAIL' ? 'FAIL' : 'pending';
              const riskScore = inspection.risk_score ?? (status === 'FAIL' ? 85 : status === 'REVIEW' ? 50 : 10);
              return (
                <div key={inspection.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-on-surface">
                        {inspection.product_name || 'Unknown Product'}
                      </p>
                      <p className="mt-0.5 break-words text-xs text-on-surface-variant">
                        {inspection.manufacturer_name || 'N/A'} ·{' '}
                        {scanDateByInspection.get(inspection.id) || '—'}
                      </p>
                    </div>
                    <StatusBadge status={status} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <RiskBadge score={riskScore} showScore={false} />
                    <Button variant={status === 'REVIEW' ? 'primary' : 'outline'} size="sm" onClick={() => onOpenEvidence(inspection)}>
                      {status === 'REVIEW' ? 'Analyze' : 'Details'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}