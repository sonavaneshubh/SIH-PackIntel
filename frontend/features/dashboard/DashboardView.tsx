'use client';

import React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useDashboardStats, useMyInspections } from '@/lib/hooks/useSupabaseData';
import { DashboardHeader } from './DashboardHeader';
import { MetricCard } from './MetricCard';
import { InspectionActivityCard } from './InspectionActivityCard';
import { RecentInspectionsCard } from './RecentInspectionsCard';
import { StatusDistributionCard } from './StatusDistributionCard';
import { ComplianceStatusCard } from './ComplianceStatusCard';
import { weeklyChangePercent, buildActivitySeries } from './dashboardData';

export function DashboardView() {
  const { stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { inspections, isLoading: itemsLoading, error: itemsError } = useMyInspections();

  const loading = statsLoading || itemsLoading;
  const error = statsError || itemsError;

  const total = stats.total || 0;
  const complianceRate = total > 0 ? Math.round((stats.compliant / total) * 100) : 0;
  const weeklyChange = weeklyChangePercent(inspections);
  // small sparkline series for KPI cards (last 8 days)
  const series8 = buildActivitySeries(inspections, 8);
  const sparkTotal = series8.map((s) => s.count);
  const sparkPending = buildActivitySeries(inspections.filter((it) => (it.overall_result || '') === 'review'), 8).map((s) => s.count);
  const sparkCompliant = buildActivitySeries(inspections.filter((it) => (it.overall_result || '') === 'pass'), 8).map((s) => s.count);
  const sparkHighPriority = buildActivitySeries(inspections.filter((it) => (it.risk_score ?? 0) >= 76), 8).map((s) => s.count);

  return (
    <AppShell pageTitle="Dashboard">
      <div className="flex flex-col gap-5">
        <DashboardHeader />

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        )}

        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* Metric cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Total Scans"
                value={total}
                change={weeklyChange}
                description={weeklyChange == null ? 'Total inspections recorded' : `${Math.abs(weeklyChange)}% from last 7 days`}
                icon="package_2"
                tone="green"
              />
              <MetricCard
                title="Pending Review"
                value={stats.needsReview}
                description="Requires attention"
                icon="error"
                tone="orange"
              />
              <MetricCard
                title="Compliance Rate"
                value={`${complianceRate}%`}
                description={`${stats.compliant} of ${total} compliant`}
                icon="shield"
                tone="purple"
              />
              <MetricCard
                title="Immediate Attention"
                value={stats.highPriority}
                description="Critical violations found"
                icon="report"
                tone="red"
              />
            </div>
        {/* Metric cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Scans"
            value={total}
            change={weeklyChange}
            description={weeklyChange == null ? 'Total inspections recorded' : `${Math.abs(weeklyChange)}% from last 7 days`}
            icon="package_2"
            tone="green"
            sparkData={sparkTotal}
          />
          <MetricCard
            title="Pending Review"
            value={stats.needsReview}
            description="Requires attention"
            icon="error"
            tone="orange"
            sparkData={sparkPending}
          />
          <MetricCard
            title="Compliance Rate"
            value={`${complianceRate}%`}
            description={`${stats.compliant} of ${total} compliant`}
            icon="shield"
            tone="purple"
            sparkData={sparkCompliant}
          />
          <MetricCard
            title="Immediate Attention"
            value={stats.highPriority}
            description="Critical violations found"
            icon="report"
            tone="red"
            sparkData={sparkHighPriority}
          />
        </div>

            {/* Main content: left column + right rail */}
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="flex min-w-0 flex-col gap-4">
                <InspectionActivityCard items={inspections} />
                <RecentInspectionsCard items={inspections.slice(0, 4)} />
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <StatusDistributionCard stats={stats} />
                <AllSetCard />
                <QuickActionsCard />
                <HighlightsCard stats={stats} complianceRate={complianceRate} weeklyChange={weeklyChange} />
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5 animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <div className="h-4 w-24 rounded bg-slate-200" />
            <div className="mt-3 h-8 w-16 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-32 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <div className="h-4 w-40 rounded bg-slate-200" />
            <div className="mt-4 h-40 rounded bg-slate-200/60" />
            <div className="mt-4 h-20 rounded bg-slate-200/60" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <div className="h-4 w-32 rounded bg-slate-200" />
            <div className="mt-4 flex justify-center">
              <div className="h-32 w-32 rounded-full bg-slate-200/60" />
            </div>
          </div>
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <div className="h-4 w-24 rounded bg-slate-200" />
          </div>
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="flex min-w-0 flex-col gap-4">
            <StatusDistributionCard stats={stats} />
            <ComplianceStatusCard complianceRate={complianceRate} />
          </div>
        </div>
      </div>
    </div>
  );
}