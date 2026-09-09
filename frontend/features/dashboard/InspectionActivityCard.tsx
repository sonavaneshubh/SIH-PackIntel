'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Inspection } from '@/types/database';
import { buildActivitySeries } from './dashboardData';
import { DashboardCard, DashboardCardHeader } from './DashboardCard';

interface InspectionActivityCardProps {
  items: Inspection[];
}

const W = 720;
const H = 220;
const PAD = { top: 20, right: 16, bottom: 34, left: 12 };

export function InspectionActivityCard({ items }: InspectionActivityCardProps) {
  const router = useRouter();
  const series = buildActivitySeries(items, 30);
  const max = Math.max(1, ...series.map((p) => p.count));

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (innerW * i) / (series.length - 1);
  const y = (v: number) => PAD.top + innerH - (innerH * v) / max;

  const linePts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.count).toFixed(1)}`);
  const areaPts = `${PAD.left},${PAD.top + innerH} ${linePts.join(' ')} ${PAD.left + innerW},${PAD.top + innerH}`;

  const last = series[series.length - 1];
  const lastPt = { x: x(series.length - 1), y: y(last.count) };

  const ticks = [0, 1, 2, 3, 4].map((i) => i * 0.25);
  const labelSteps: Array<[number, string]> = [
    0, 5, 10, 15, 20, 25, 29,
  ].map((i) => [i, series[i].label] as [number, string]);

  return (
    <DashboardCard className="flex flex-col gap-4">
      <DashboardCardHeader
        icon="monitoring"
        iconBg="bg-[#EDF2F7] text-[#334155]"
        title={
          <>
            Inspection Activity <span className="font-normal text-[#64748B]">(Last 30 Days)</span>
          </>
        }
        subtitle="Track inspection trends and compliance over time."
        action={
          <button
            onClick={() => router.push('/analytics')}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#1A73E8] hover:underline"
          >
            View Details
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        }
      />

      <div className="relative flex w-full flex-col">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 w-full sm:h-[220px]"
          role="img"
          aria-label="Inspection activity over the last 30 days"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="figmaActivityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1A73E8" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#1A73E8" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <line key={t} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH * t} y2={PAD.top + innerH * t} stroke="#E2E8F0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <polygon points={areaPts} fill="url(#figmaActivityFill)" />
          <polyline points={linePts.join(' ')} fill="none" stroke="#1A73E8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <circle cx={lastPt.x} cy={lastPt.y} r="5" fill="#fff" stroke="#1A73E8" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* X-axis labels (HTML so they never distort) */}
        <div className="relative h-5">
          {labelSteps.map(([i, label], idx) => {
            const pct = (x(i) / W) * 100;
            const align = idx === 0 ? 'left-0 -translate-x-0' : idx === labelSteps.length - 1 ? 'right-0 -translate-x-0' : '-translate-x-1/2';
            return (
              <span
                key={label}
                className={`absolute text-[11px] text-[#94A3B8] ${align}`}
                style={{ left: `${pct}%` }}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>
    </DashboardCard>
  );
}