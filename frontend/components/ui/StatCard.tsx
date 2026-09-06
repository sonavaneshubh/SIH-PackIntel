import React from 'react';
import { cn } from '@/lib/utils';

export type StatTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: string;
  badge?: string;
  detail?: string;
  tone?: StatTone;
  className?: string;
}

const toneConfig: Record<StatTone, { icon: string; iconBg: string; badge: string; bar: string }> = {
  primary: {
    icon: 'text-primary',
    iconBg: 'bg-primary/10',
    badge: 'bg-primary/10 text-primary border-primary/20',
    bar: 'bg-primary',
  },
  success: {
    icon: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bar: 'bg-emerald-500',
  },
  warning: {
    icon: 'text-amber-600',
    iconBg: 'bg-amber-50',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    bar: 'bg-amber-500',
  },
  danger: {
    icon: 'text-red-600',
    iconBg: 'bg-red-50',
    badge: 'bg-red-50 text-red-700 border-red-200',
    bar: 'bg-red-500',
  },
  neutral: {
    icon: 'text-on-surface-variant',
    iconBg: 'bg-surface-container-high',
    badge: 'bg-surface-container-high text-on-surface-variant border-outline-variant',
    bar: 'bg-outline-variant',
  },
};

export function StatCard({
  label,
  value,
  icon,
  badge,
  detail,
  tone = 'primary',
  className,
}: StatCardProps) {
  const config = toneConfig[tone];

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-[0_1px_2px_rgba(25,28,29,0.04)] transition-shadow hover:shadow-md',
        className
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="truncate text-label-bold font-label-bold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        {icon && (
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg',
              config.iconBg
            )}
          >
            <span className={cn('material-symbols-outlined text-[18px]', config.icon)}>
              {icon}
            </span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-[28px] font-bold leading-none tracking-tight text-on-surface">
          {value}
        </span>
        {badge && (
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-label-bold',
              config.badge
            )}
          >
            {badge}
          </span>
        )}
      </div>

      {detail && (
        <p className="truncate text-body-sm font-body-sm text-on-surface-variant">{detail}</p>
      )}

      <span className={cn('absolute inset-x-0 bottom-0 h-0.5', config.bar)} aria-hidden="true" />
    </div>
  );
}