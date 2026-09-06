import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Dashboard card styled to the Figma dashboard frame:
 * white surface, #E2E8F0 border, 16px radius, subtle shadow.
 */
export function DashboardCard({
  className,
  flush,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { flush?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]',
        !flush && 'p-5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface DashboardCardHeaderProps {
  icon?: string;
  iconBg?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}

export function DashboardCardHeader({
  icon,
  iconBg = 'bg-[#EDF2F7] text-[#64748B]',
  title,
  subtitle,
  action,
}: DashboardCardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', iconBg)}>
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-snug text-[#1E293B]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-[#64748B]">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}