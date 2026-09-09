'use client';

import React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAnalytics } from '@/lib/hooks/useSupabaseData';
import { AnalyticsData, AnalyticsRuleStats } from '@/types/database';

function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon: string;
}) {
  return (
    <div className="bg-surface border border-outline-variant rounded-xl p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label-bold font-label-bold text-on-surface-variant uppercase text-xs">
          {label}
        </span>
        <span className="material-symbols-outlined text-[20px] text-on-surface-variant opacity-60">
          {icon}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-display-lg font-display-lg ${accent || 'text-on-surface'}`}>
          {value}
        </span>
      </div>
      {sub && <p className="text-xs text-on-surface-variant mt-2">{sub}</p>}
    </div>
  );
}

function RuleBar({ rule, max, index }: { rule: AnalyticsRuleStats; max: number; index: number }) {
  const barPct = max > 0 ? Math.round((rule.violations / max) * 100) : 0;
  const severity =
    rule.fail > 0
      ? 'bg-red-500'
      : rule.warning > 0
        ? 'bg-amber-500'
        : 'bg-emerald-500';
  return (
    <div>
      <div className="flex justify-between gap-3 text-xs font-semibold text-on-surface mb-1">
        <span className="min-w-0 flex-1 sm:flex-none">
          {rule.rule_name || rule.rule_code}
        </span>
        <span className="shrink-0 text-on-surface-variant tabular-nums">
          {rule.violations} violation{rule.violations === 1 ? '' : 's'}{' '}
          <span className="text-outline">({rule.violation_pct}%)</span>
        </span>
      </div>
      <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
        <div className={`${severity} h-full rounded-full`} style={{ width: `${barPct}%` }} />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-outline tabular-nums">
        <span>{rule.fail} fail · {rule.warning} warning · {rule.pass} pass</span>
        <span>#{index + 1} by frequency</span>
      </div>
    </div>
  );
}

function formatTrendDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function TrendChart({ data }: { data: AnalyticsData['trend'] }) {
  const maxDay = Math.max(
    1,
    ...data.map((p) => p.pass + p.review + p.fail)
  );
  return (
    <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-xs">
      <h3 className="text-headline-md font-headline-md text-on-surface mb-1">
        Completed Inspections — Last 14 Days
      </h3>
      <p className="text-body-sm font-body-sm text-on-surface-variant mb-5">
        Daily outcome trend from your actual inspection records.
      </p>
      <div className="flex items-end gap-1.5 sm:gap-2" style={{ minHeight: '160px' }}>
        {data.map((point) => {
          const total = point.pass + point.review + point.fail;
          const hPass = maxDay > 0 ? Math.round((point.pass / maxDay) * 120) : 0;
          const hReview = maxDay > 0 ? Math.round((point.review / maxDay) * 120) : 0;
          const hFail = maxDay > 0 ? Math.round((point.fail / maxDay) * 120) : 0;
          return (
            <div
              key={point.date}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${formatTrendDate(point.date)}: ${point.pass} pass, ${point.review} review, ${point.fail} fail`}
            >
              <div
                className="flex w-full flex-col-reverse justify-start"
                style={{ height: '120px' }}
              >
                {point.fail > 0 && (
                  <div className="w-full bg-red-500 rounded-t-sm" style={{ height: `${hFail}px` }} />
                )}
                {point.review > 0 && (
                  <div className="w-full bg-amber-500" style={{ height: `${hReview}px` }} />
                )}
                {point.pass > 0 && (
                  <div className="w-full bg-emerald-500 rounded-t-sm" style={{ height: `${hPass}px` }} />
                )}
              </div>
              <span className="text-[10px] text-outline tabular-nums truncate max-w-full">
                {formatTrendDate(point.date)}
              </span>
              <span className="text-[10px] font-semibold text-on-surface-variant tabular-nums">
                {total}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-500" /> Pass
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-amber-500" /> Review
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-500" /> Fail
        </span>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[118px] animate-pulse rounded-xl bg-surface border border-outline-variant" />
        ))}
      </div>
      <div className="h-[320px] animate-pulse rounded-xl bg-surface border border-outline-variant" />
      <div className="h-[240px] animate-pulse rounded-xl bg-surface border border-outline-variant" />
    </div>
  );
}

export default function AnalyticsPage() {
  const { analytics, isLoading, error, refetch } = useAnalytics();

  return (
    <AppShell pageTitle="Violation Analytics">
      <PageHeader
        eyebrow="Enforcement Intelligence"
        title="Violation Analytics"
        subtitle="Real-time statistical breakdowns computed from your actual inspection scans, rule-level compliance results and OCR confidence."
        actions={
          <Button variant="outline" size="sm" icon="refresh" onClick={refetch}>
            Refresh Data
          </Button>
        }
      />

      {isLoading && <LoadingSkeleton />}

      {!isLoading && error && (
        <div className="bg-surface border border-error/30 rounded-xl p-6 shadow-xs">
          <EmptyState
            icon="error"
            iconTone="muted"
            title="Could not load analytics"
            description={error}
            action={
              <Button variant="primary" size="sm" icon="refresh" onClick={refetch}>
                Try Again
              </Button>
            }
          />
        </div>
      )}

      {!isLoading && !error && !analytics && (
        <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-xs">
          <EmptyState
            icon="assessment"
            iconTone="primary"
            title="No analytics yet"
            description="Run your first scan to start building violation intelligence from real inspection data."
          />
        </div>
      )}

      {!isLoading && !error && analytics && analytics.completed_inspections === 0 && (
        <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-xs">
          <EmptyState
            icon="bar_chart"
            iconTone="primary"
            title="No completed inspections"
            description={`You have ${analytics.total_inspections} record(s) but none completed yet. Completed scans unlock the full violation analytics view.`}
          />
        </div>
      )}

      {!isLoading && !error && analytics && analytics.completed_inspections > 0 && (
        <div className="space-y-8">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Inspections"
              value={String(analytics.total_inspections)}
              sub={`${analytics.completed_inspections} completed · ${analytics.processing_count} processing · ${analytics.failed_count} failed`}
              accent="text-on-surface"
              icon="inventory_2"
            />
            <StatCard
              label="Avg OCR Accuracy"
              value={analytics.avg_ocr_accuracy != null ? `${analytics.avg_ocr_accuracy}%` : '—'}
              sub="Mean real OCR confidence across scans"
              accent="text-primary"
              icon="text_fields"
            />
            <StatCard
              label="Avg Compliance Score"
              value={analytics.avg_compliance_score != null ? `${analytics.avg_compliance_score}%` : '—'}
              sub={`Avg risk score ${analytics.avg_risk_score != null ? analytics.avg_risk_score : '—'}`}
              accent="text-green-600"
              icon="verified"
            />
            <StatCard
              label="Direct Pass Rate"
              value={`${analytics.pass_rate}%`}
              sub={`${analytics.pass_count} pass · ${analytics.review_count} review · ${analytics.fail_count} fail`}
              accent="text-green-600"
              icon="fact_check"
            />
          </div>

          {/* Violation Distribution */}
          <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-xs">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-headline-md font-headline-md text-on-surface">
                  Statutory Violation Distribution
                </h3>
                <p className="text-body-sm font-body-sm text-on-surface-variant mt-0.5">
                  Ranked by total failures & warnings across your completed inspections.
                </p>
              </div>
              {analytics.top_violated_rule && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-error/25 bg-error/10 px-3 py-1.5 text-xs font-label-bold text-error">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  Top rule: {analytics.top_violated_rule.rule_name || analytics.top_violated_rule.rule_code}
                </span>
              )}
            </div>
            {analytics.rule_distribution.length === 0 ? (
              <EmptyState
                icon="verified_user"
                iconTone="success"
                title="No violations flagged"
                description="Every applicable rule passed — your inspected products are fully compliant."
              />
            ) : (
              <div className="space-y-5">
                {analytics.rule_distribution.map((rule, index) => (
                  <RuleBar key={rule.rule_code} rule={rule} max={analytics.rule_distribution[0].violations} index={index} />
                ))}
              </div>
            )}
          </div>

          {/* Trend */}
          <TrendChart data={analytics.trend} />
        </div>
      )}
    </AppShell>
  );
}