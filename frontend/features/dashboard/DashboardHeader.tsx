'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/Button';
import { firstName } from './dashboardData';

export function DashboardHeader() {
  const router = useRouter();
  const { user } = useAuth();
  const [date] = React.useState(() =>
    new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  );

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1">
        <h1 className="text-[28px] font-bold leading-none tracking-tight text-[#1E293B]">
          Good Morning, {firstName(user?.name)} <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-2 text-sm text-[#64748B] max-w-xl">
          Here&apos;s what&apos;s happening with your packaging compliance today.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex flex-col items-end">
          <div className="text-right text-sm font-semibold text-[#1A73E8]">Safer Packaging</div>
          <div className="-mt-1 text-right text-sm font-medium text-[#1A73E8]">Healthier Tomorrow</div>
          <div className="h-[3px] w-24 mt-2 rounded-full bg-gradient-to-r from-[#93C5FD] to-[#1A73E8]" />
        </div>

        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm font-medium text-[#334155]"
            role="status"
          >
            <span className="material-symbols-outlined text-[18px] text-[#64748B]">calendar_today</span>
            {date}
            <span className="material-symbols-outlined text-[16px] text-[#94A3B8]" aria-hidden="true">
              expand_more
            </span>
          </span>
          <Button variant="primary" size="sm" icon="qr_code_scanner" onClick={() => router.push('/scan/new')}>
            New Scan
          </Button>
        </div>
      </div>
    </div>
  );
}