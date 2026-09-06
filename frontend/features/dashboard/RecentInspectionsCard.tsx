'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Inspection } from '@/types/database';
import { DashboardCard, DashboardCardHeader } from './DashboardCard';

interface RecentInspectionsCardProps {
  items: Inspection[];
}

function resultUi(overall?: string | null) {
  const v = (overall || '').toLowerCase();
  if (v === 'pass') {
    return {
      label: 'Compliant',
      pill: 'bg-[#ECFDF5] text-[#059669]',
      icon: 'check_circle',
      iconClass: 'text-[#059669]',
    };
  }
  if (v === 'review') {
    return {
      label: 'Needs Review',
      pill: 'bg-[#FFF7ED] text-[#EA580C]',
      icon: 'error',
      iconClass: 'text-[#EA580C]',
    };
  }
  return {
    label: 'Failed',
    pill: 'bg-[#FEF2F2] text-[#DC2626]',
    icon: 'cancel',
    iconClass: 'text-[#DC2626]',
  };
}

export function RecentInspectionsCard({ items }: RecentInspectionsCardProps) {
  const router = useRouter();

  const open = (id: string) => router.push(`/results?inspection=${encodeURIComponent(id)}`);

  return (
    <DashboardCard className="flex min-w-0 flex-col gap-3">
      <DashboardCardHeader
        icon="inventory_2"
        iconBg="bg-[#EDF2F7] text-[#334155]"
        title="Recent Inspections"
        action={
          <button
            onClick={() => router.push('/recent-inspections')}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#1A73E8] hover:underline"
          >
            View All
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        }
      />

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E2E8F0] px-4 py-8 text-center text-sm text-[#64748B]">
          No inspections yet. Run your first scan.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left">
              <caption className="sr-only">Recent inspections</caption>
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  <th className="pb-2 pr-3">Date &amp; Time</th>
                  <th className="pb-2 pr-3">Product</th>
                  <th className="pb-2 pr-3">Result</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {items.map((item) => {
                  const r = resultUi(item.overall_result);
                  return (
                    <tr key={item.id} className="cursor-pointer transition-colors hover:bg-[#F8FAFC]" onClick={() => open(item.id)}>
                      <td className="py-3 pr-3 text-[13px] text-[#64748B]">
                        {new Date(item.created_at || Date.now()).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                        {' · '}
                        {new Date(item.created_at || Date.now()).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 pr-3 text-[13px] font-semibold text-[#1E293B]">
                        {item.product_name || item.inspection_number || 'Packaging'}
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${r.pill}`}>
                          {r.label}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <span className={`material-symbols-outlined align-middle text-[20px] ${r.iconClass}`}>{r.icon}</span>
                        <span className="material-symbols-outlined ml-1 align-middle text-[18px] text-[#CBD5E1]">chevron_right</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="divide-y divide-[#F1F5F9] sm:hidden">
            {items.map((item) => {
              const r = resultUi(item.overall_result);
              return (
                <li key={item.id} className="flex cursor-pointer items-center gap-3 py-3" onClick={() => open(item.id)}>
                  <span className={`material-symbols-outlined shrink-0 text-[22px] ${r.iconClass}`}>{r.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#1E293B]">
                      {item.product_name || item.inspection_number || 'Packaging'}
                    </p>
                    <p className="text-xs text-[#94A3B8]">
                      {new Date(item.created_at || Date.now()).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.pill}`}>{r.label}</span>
                  <span className="material-symbols-outlined shrink-0 text-[18px] text-[#CBD5E1]">chevron_right</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </DashboardCard>
  );
}