"use client";

import React from 'react';
import { DashboardCard } from './DashboardCard';

interface ComplianceStatusCardProps {
  complianceRate: number | string;
}

export function ComplianceStatusCard({ complianceRate }: ComplianceStatusCardProps) {
  const value = typeof complianceRate === 'number' ? `${complianceRate}%` : complianceRate;

  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#0b5ed7] to-[#1a73e8] p-5 text-white shadow-[0_6px_18px_rgba(26,115,232,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold leading-snug">Compliance Status</h3>
          <p className="mt-1 text-sm">Needs Improvement</p>
          <p className="mt-2 text-xs opacity-90">Focus on pending reviews and non-compliant scans.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/12 text-white text-[20px]">
            <span className="material-symbols-outlined">shield</span>
          </span>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/90 font-semibold">Overall Progress</span>
          <span className="text-white font-bold">{value}</span>
        </div>
        <div className="mt-2 h-3 w-full rounded-full bg-white/20">
          <div className="h-3 rounded-full bg-white" style={{ width: `${Number(String(value).replace('%',''))}%` }} />
        </div>
      </div>
    </div>
  );
}
