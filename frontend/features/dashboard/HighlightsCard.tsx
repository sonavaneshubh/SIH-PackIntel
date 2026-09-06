'use client';

import React from 'react';
import { DashboardStats } from '@/types/database';
import { DashboardCard, DashboardCardHeader } from './DashboardCard';

interface HighlightsCardProps {
  stats: DashboardStats;
  complianceRate: number;
  weeklyChange: number | null;
}

export function HighlightsCard({ stats, complianceRate, weeklyChange }: HighlightsCardProps) {
  const highlights = [
    {
      icon: 'trending_up',
      iconBg: 'bg-[#ECFDF5] text-[#059669]',
      title:
        weeklyChange == null
          ? 'Inspection activity running'
          : weeklyChange >= 0
            ? `Inspection activity increased ${weeklyChange}%`
            : `Inspection activity decreased ${Math.abs(weeklyChange)}%`,
      description:
        weeklyChange == null
          ? 'Recorded scans so far. Volume trends appear with more activity.'
          : `${Math.abs(weeklyChange)}% ${weeklyChange >= 0 ? 'more' : 'fewer'} scans completed this week.`,
    },
    {
      icon: 'verified_user',
      iconBg: 'bg-[#F5F3FF] text-[#7C3AED]',
      title: `Compliance rate at ${complianceRate}%`,
      description: 'Focus on addressing pending review violations.',
    },
    {
      icon: 'error',
      iconBg: 'bg-[#FFF7ED] text-[#EA580C]',
      title: `${stats.needsReview} item${stats.needsReview === 1 ? '' : 's'} pending review`,
      description: 'Please check and take necessary action.',
    },
  ];

  return (
    <DashboardCard className="flex flex-col gap-3">
      <DashboardCardHeader icon="auto_awesome" iconBg="bg-[#EDF2F7] text-[#334155]" title="Highlights" />
      <ul className="flex flex-col gap-3">
        {highlights.map((h) => (
          <li key={h.title} className="flex items-start gap-3">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${h.iconBg}`}>
              <span className="material-symbols-outlined text-[18px]">{h.icon}</span>
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#1E293B]">{h.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#64748B]">{h.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}