'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/Badge';
import { DonutChart } from '@/components/ui/DonutChart';
import {
  getHighPriorityInspections,
  getPriorityDistribution,
} from '@/lib/supabase/inspectionService';
import { HighPriorityInspectionRecord, PriorityDistribution } from '@/types/database';
import { cn } from '@/lib/utils';

type PriorityFilter = 'ALL' | 'CRITICAL' | 'HIGH';
type StatusFilter = 'ALL' | 'PASS' | 'FAIL' | 'REVIEW';

const PRIORITY_SEGMENTS: ReadonlyArray<{
  key: keyof PriorityDistribution;
  label: string;
  color: string;
}> = [
  { key: 'CRITICAL', label: 'Critical', color: '#EF4444' },
  { key: 'HIGH', label: 'High', color: '#F97316' },
  { key: 'MEDIUM', label: 'Medium', color: '#F5A623' },
  { key: 'LOW', label: 'Low', color: '#00B074' },
];

const STATUS_FILTER_OPTIONS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'PASS', label: 'Compliant' },
  { key: 'FAIL', label: 'Non-Compliant' },
  { key: 'REVIEW', label: 'Warning' },
];

const PRIORITY_FILTER_OPTIONS: ReadonlyArray<{ key: PriorityFilter; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'CRITICAL', label: 'Critical' },
  { key: 'HIGH', label: 'High' },
];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'N/A';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

/** Priority chip. Text + icon (never color alone) so it stays accessible. */
function PriorityBadge({ priority }: { priority: 'CRITICAL' | 'HIGH' }) {
  const isCritical = priority === 'CRITICAL';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-label-bold font-label-bold shadow-2xs',
        isCritical
          ? 'border-red-300 bg-red-50 text-red-700'
          : 'border-orange-200 bg-orange-50 text-orange-700'
      )}
    >
      <span className={cn('material-symbols-outlined text-[15px]', isCritical ? 'fill' : '')}>
        {isCritical ? 'gpp_bad' : 'warning'}
      </span>
      <span className="uppercase tracking-wider">{priority}</span>
    </span>
  );
}

function HighPriorityCard({
  inspection,
  onViewReport,
}: {
  inspection: HighPriorityInspectionRecord;
  onViewReport: (inspection: HighPriorityInspectionRecord) => void;
}) {
  const rawStatus = (inspection.overall_result || 'pending').toUpperCase();
  const badgeStatus =
    rawStatus === 'PASS' ? 'PASS' : rawStatus === 'REVIEW' ? 'REVIEW' : rawStatus === 'FAIL' ? 'FAIL' : 'pending';

  const violations = inspection.compliance_results.filter((r) => r.result === 'fail').length;
  const warnings = inspection.compliance_results.filter((r) => r.result === 'warning').length;

  const isCritical = inspection.priority === 'CRITICAL';

  return (
    <article
      className={cn(
        'relative flex h-full flex-col rounded-xl border bg-surface-container-lowest p-4 shadow-[0_1px_2px_rgba(25,28,29,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md md:p-5',
        isCritical ? 'border-l-4 border-l-red-500 border-outline-variant' : 'border-orange-200'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <PriorityBadge priority={inspection.priority} />
        <StatusBadge status={badgeStatus} />
      </div>

      <h3 className="mt-3 text-sm font-bold leading-snug text-on-surface break-words md:text-base">
        {inspection.product_name || 'Unknown Product'}
      </h3>
      {(inspection.brand_name || inspection.manufacturer_name) && (
        <p className="mt-0.5 text-xs text-on-surface-variant">
          {[inspection.brand_name, inspection.manufacturer_name].filter(Boolean).join(' / ')}
        </p>
      )}

      <dl className="mt-3 space-y-1.5 border-t border-outline-variant/60 pt-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-on-surface-variant">Product ID</dt>
          <dd className="font-mono font-medium text-on-surface">
            {inspection.inspection_number || inspection.id}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-on-surface-variant">Inspection ID</dt>
          <dd
            className="max-w-[55%] truncate font-mono font-medium text-on-surface"
            title={inspection.id}
          >
            {inspection.id}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-on-surface-variant">Inspected</dt>
          <dd className="font-medium text-on-surface">
            {formatDateTime(inspection.inspected_at || inspection.created_at)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-on-surface-variant">Priority</dt>
          <dd className={cn('font-label-bold', isCritical ? 'text-red-700' : 'text-orange-700')}>
            {inspection.priority}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-on-surface-variant">Violations</dt>
          <dd className="font-semibold text-on-surface">
            {violations} <span className="text-on-surface-variant">Violation{violations === 1 ? '' : 's'}</span>
            {warnings > 0 && (
              <span className="ml-1.5 text-amber-700">· {warnings} Warning{warnings === 1 ? '' : 's'}</span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-on-surface-variant">Status</dt>
          <dd className="font-semibold text-on-surface">
            {rawStatus === 'PASS' ? 'Compliant' : rawStatus === 'FAIL' ? 'Non-Compliant' : rawStatus === 'REVIEW' ? 'Warning' : 'Pending'}
          </dd>
        </div>
      </dl>

      <div className="mt-auto pt-4">
        <Button
          variant={isCritical ? 'danger' : 'primary'}
          size="sm"
          icon="description"
          className="w-full"
          onClick={() => onViewReport(inspection)}
        >
          View Report
        </Button>
      </div>
    </article>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-outline-variant bg-surface-container-lowest p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="h-7 w-24 rounded-lg bg-slate-200" />
            <div className="h-7 w-20 rounded-full bg-slate-200" />
          </div>
          <div className="mt-4 h-4 w-3/4 rounded bg-slate-200" />
          <div className="mt-2 h-3 w-1/2 rounded bg-slate-200/70" />
          <div className="mt-4 space-y-2.5 border-t border-outline-variant/60 pt-4">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="flex items-center justify-between">
                <div className="h-3 w-16 rounded bg-slate-200/70" />
                <div className="h-3 w-24 rounded bg-slate-200/80" />
              </div>
            ))}
          </div>
          <div className="mt-5 h-8 w-full rounded-lg bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export function HighPriorityInspectionsView() {
  const router = useRouter();
  const [inspections, setInspections] = useState<HighPriorityInspectionRecord[]>([]);
  const [distribution, setDistribution] = useState<PriorityDistribution>({
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const loadInspections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [inspectionsResult, distributionResult] = await Promise.all([
        getHighPriorityInspections(),
        getPriorityDistribution(),
      ]);
      if (inspectionsResult.error) throw new Error(inspectionsResult.error);
      if (distributionResult.error) throw new Error(distributionResult.error);
      setInspections(inspectionsResult.data);
      setDistribution(distributionResult.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load high priority inspections.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInspections();
  }, [loadInspections, reloadKey]);

  const hasActiveFilters = Boolean(searchTerm.trim()) || priorityFilter !== 'ALL' || statusFilter !== 'ALL';

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return inspections.filter((inspection) => {
      const matchesPriority = priorityFilter === 'ALL' || inspection.priority === priorityFilter;

      const rawStatus = (inspection.overall_result || 'pending').toUpperCase();
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PASS' && rawStatus === 'PASS') ||
        (statusFilter === 'FAIL' && rawStatus === 'FAIL') ||
        (statusFilter === 'REVIEW' && rawStatus === 'REVIEW');

      const matchesSearch =
        !q ||
        [inspection.product_name, inspection.brand_name, inspection.manufacturer_name, inspection.inspection_number, inspection.id]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));

      return matchesPriority && matchesStatus && matchesSearch;
    });
  }, [inspections, priorityFilter, statusFilter, searchTerm]);

  const criticalCount = inspections.filter((i) => i.priority === 'CRITICAL').length;
  const highCount = inspections.filter((i) => i.priority === 'HIGH').length;

  const distributionTotal = Object.values(distribution).reduce(
    (sum, count) => sum + count,
    0
  );

  const clearFilters = () => {
    setSearchTerm('');
    setPriorityFilter('ALL');
    setStatusFilter('ALL');
  };

  const handleViewReport = (inspection: HighPriorityInspectionRecord) => {
    router.push(`/results?inspection=${encodeURIComponent(inspection.id)}`);
  };

  const filterButtonClass = (active: boolean) =>
    cn(
      'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
      active
        ? 'bg-primary text-on-primary shadow-xs'
        : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
    );

  return (
    <AppShell pageTitle="High Priority Inspections">
      <PageHeader
        eyebrow="Compliance Priority Queue"
        title="High Priority Inspections"
        subtitle="Review inspections with critical and high-risk compliance violations."
        status={
          inspections.length > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-label-bold text-red-700">
              <span className="material-symbols-outlined text-[14px]">priority_high</span>
              {criticalCount} Critical · {highCount} High
            </span>
          ) : undefined
        }
      />

      {/* Toolbar: search + filters */}
      <div className="mb-5 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
            <span className="material-symbols-outlined mr-2 text-[18px] text-outline">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search inspections..."
              aria-label="Search inspections"
              className="w-full bg-transparent text-xs text-on-surface outline-none placeholder:text-outline"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="cursor-pointer p-1 text-on-surface-variant hover:text-on-surface"
                aria-label="Clear search"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon="filter_alt_off"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className={cn(!hasActiveFilters && 'opacity-40')}
          >
            Clear Filters
          </Button>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Priority
            </span>
            {PRIORITY_FILTER_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPriorityFilter(option.key)}
                className={filterButtonClass(priorityFilter === option.key)}
                role="radio"
                aria-checked={priorityFilter === option.key}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Status
            </span>
            {STATUS_FILTER_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setStatusFilter(option.key)}
                className={filterButtonClass(statusFilter === option.key)}
                role="radio"
                aria-checked={statusFilter === option.key}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Priority distribution chart */}
      {!error && (
        <section className="mb-5 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-xs md:p-5">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row" aria-hidden="true">
              <div className="size-[132px] animate-pulse rounded-full bg-slate-200" />
              <div className="grid w-full max-w-sm grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-slate-200/70" />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
              <DonutChart
                segments={PRIORITY_SEGMENTS.map((s) => ({
                  key: s.key,
                  label: s.label,
                  value: distribution[s.key],
                  color: s.color,
                }))}
                total={distributionTotal}
                centerValue={distributionTotal}
                centerLabel="Scored"
                size={140}
                thickness={16}
              />
              <div className="grid w-full max-w-xs grid-cols-2 gap-x-6 gap-y-3 sm:flex-1 sm:grid-cols-1 lg:grid-cols-2">
                {PRIORITY_SEGMENTS.map((s) => {
                  const count = distribution[s.key];
                  const percent = distributionTotal
                    ? Math.round((count / distributionTotal) * 100)
                    : 0;
                  return (
                    <div
                      key={s.key}
                      className="flex items-center gap-2.5 text-[13px]"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="whitespace-nowrap text-on-surface-variant">
                        {s.label}
                      </span>
                      <span className="ml-auto whitespace-nowrap font-semibold text-on-surface">
                        {percent}% · {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {isLoading ? (
        <CardsSkeleton />
      ) : error ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest">
          <EmptyState
            icon="error"
            iconTone="muted"
            title="Unable to load high priority inspections"
            description={error}
            action={
              <Button variant="primary" size="sm" icon="refresh" onClick={() => setReloadKey((k) => k + 1)}>
                Retry
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest">
              {inspections.length === 0 ? (
                <EmptyState
                  icon="verified_user"
                  iconTone="success"
                  title="No High Priority Inspections"
                  description="Great! There are currently no critical or high-risk inspections requiring attention."
                  action={
                    <Button variant="primary" size="sm" icon="add_scan" onClick={() => router.push('/scan/new')}>
                      Start an Inspection
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon="search_off"
                  title="No matching high priority inspections"
                  description="No inspections match the current search or filters. Try adjusting your criteria."
                  action={
                    <Button variant="outline" size="sm" icon="filter_alt_off" onClick={clearFilters}>
                      Clear Filters
                    </Button>
                  }
                />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((inspection) => (
                <HighPriorityCard
                  key={inspection.id}
                  inspection={inspection}
                  onViewReport={handleViewReport}
                />
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}