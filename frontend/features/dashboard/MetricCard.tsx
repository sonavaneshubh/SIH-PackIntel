import React from 'react';
import { cn } from '@/lib/utils';

type MetricTone = 'green' | 'orange' | 'purple' | 'red';

interface MetricCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: string;
  tone?: MetricTone;
  change?: number | null;
  className?: string;
}

const toneConfig: Record<MetricTone, { iconBg: string; iconColor: string }> = {
  green: { iconBg: 'bg-[#ECFDF5]', iconColor: 'text-[#059669]' },
  orange: { iconBg: 'bg-[#FFF7ED]', iconColor: 'text-[#EA580C]' },
  purple: { iconBg: 'bg-[#F5F3FF]', iconColor: 'text-[#7C3AED]' },
  red: { iconBg: 'bg-[#FEF2F2]', iconColor: 'text-[#DC2626]' },
};

export function MetricCard({
  title,
  value,
  description,
  icon,
  tone = 'green',
  change,
  className,
}: MetricCardProps) {
  const config = toneConfig[tone];

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium leading-snug text-[#64748B]">{title}</span>
        <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', config.iconBg)}>
          <span className={cn('material-symbols-outlined text-[24px]', config.iconColor)}>{icon}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[32px] font-bold leading-none tracking-tight text-[#1E293B]">{value}</span>
        {typeof change === 'number' && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
              change >= 0 ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEF2F2] text-[#DC2626]'
            )}
          >
            <span className="material-symbols-outlined text-[13px]">
              {change >= 0 ? 'arrow_upward' : 'arrow_downward'}
            </span>
            {Math.abs(change)}%
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-[#94A3B8]">{description}</p>
    </div>
  );
}