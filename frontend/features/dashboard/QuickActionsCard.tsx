'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { DashboardCard, DashboardCardHeader } from './DashboardCard';

interface QuickAction {
  label: string;
  icon: string;
  href: string;
}

const actions: QuickAction[] = [
  { label: 'Start New Scan', icon: 'qr_code_scanner', href: '/scan/new' },
  { label: 'View Scan History', icon: 'history', href: '/history' },
  { label: 'Check Violations', icon: 'report', href: '/analytics' },
  { label: 'Open Reports', icon: 'description', href: '/reports' },
];

export function QuickActionsCard() {
  const router = useRouter();

  return (
    <DashboardCard className="flex flex-col gap-3">
      <DashboardCardHeader icon="bolt" title="Quick Actions" />
      <div className="flex flex-col gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => router.push(a.href)}
            className="flex w-full items-center gap-3 rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-left transition-colors hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#EDF2F7] text-[#334155]">
              <span className="material-symbols-outlined text-[18px]">{a.icon}</span>
            </span>
            <span className="flex-1 text-[13px] font-semibold text-[#1E293B]">{a.label}</span>
            <span className="material-symbols-outlined text-[18px] text-[#94A3B8]">chevron_right</span>
          </button>
        ))}
      </div>
    </DashboardCard>
  );
}