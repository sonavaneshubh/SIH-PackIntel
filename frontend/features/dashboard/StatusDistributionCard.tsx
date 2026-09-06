'use client';

import React from 'react';
import { DashboardStats } from '@/types/database';
import { DashboardCard, DashboardCardHeader } from './DashboardCard';
import { DonutChart } from '@/components/ui/DonutChart';

interface StatusDistributionCardProps {
  stats: DashboardStats;
}

export function StatusDistributionCard({ stats }: StatusDistributionCardProps) {
  const total = stats.total || 0;
  const compliant = stats.compliant;
  const review = stats.needsReview;
  const nonCompliant = stats.nonCompliant;

  const legend = [
    { label: 'Compliant', count: compliant, percent: total ? Math.round((compliant / total) * 100) : 0, color: '#00B074' },
    { label: 'Needs Review', count: review, percent: total ? Math.round((review / total) * 100) : 0, color: '#F5A623' },
    { label: 'Non-compliant', count: nonCompliant, percent: total ? Math.round((nonCompliant / total) * 100) : 0, color: '#EF4444' },
  ];

  return (
    <DashboardCard className="flex flex-col gap-4">
      <DashboardCardHeader title="Status Distribution" subtitle={`Total passed statutory scans: ${total}`} />
      <div className="flex items-center justify-center py-1">
        <DonutChart
          segments={legend.map((l) => ({ key: l.label, label: l.label, value: l.count, color: l.color }))}
          total={total}
          centerValue={total}
          centerLabel="Total Scans"
          size={150}
          thickness={16}
        />
      </div>
      <ul className="flex flex-col gap-2">
        {legend.map((l) => (
          <li key={l.label} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2.5 text-[#475569]">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="truncate">{l.label}</span>
            </span>
            <span className="shrink-0 font-semibold text-[#334155]">
              {l.percent}% · {l.count}
            </span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}