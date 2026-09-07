'use client';

import React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useDashboardStats, useMyInspections } from '@/lib/hooks/useSupabaseData';
import { DashboardHeader } from './DashboardHeader';
import { MetricCard } from './MetricCard';
import { InspectionActivityCard } from './InspectionActivityCard';
import { RecentInspectionsCard } from './RecentInspectionsCard';
import { StatusDistributionCard } from './StatusDistributionCard';
import { AllSetCard } from './AllSetCard';
import { QuickActionsCard } from './QuickActionsCard';
import { HighlightsCard } from './HighlightsCard';
import { weeklyChangePercent, buildActivitySeries } from './dashboardData';

export function DashboardView() {
  const { stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { inspections, isLoading: itemsLoading, error: itemsError } = useMyInspections();

  const loading = statsLoading || itemsLoading;
  const error = statsError || itemsError;

  const total = stats.total || 0;
  const complianceRate = total > 0 ? Math.round((stats.compliant / total) * 100) : 0;
  const weeklyChange = weeklyChangePercent(inspections);

  if (loading) {
    return (
      <AppShell pageTitle="Dashboard">
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
          <span className="material-symbols-outlined animate-spin text-4xl text-[#1A73E8]">autorenew</span>
          <p className="text-sm font-medium text-[#64748B]">Loading dashboard…</p>
        </div>
      </AppShell>
    );
  }

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
      </div>
    </AppShell>
  );
}