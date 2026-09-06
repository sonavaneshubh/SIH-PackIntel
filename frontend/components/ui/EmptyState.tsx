import React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  iconTone?: 'primary' | 'muted' | 'success';
}

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
  className,
  iconTone = 'muted',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className
      )}
    >
      <span
        className={cn(
          'mb-3 flex size-12 items-center justify-center rounded-full',
          iconTone === 'success'
            ? 'bg-emerald-50 text-emerald-600'
            : iconTone === 'primary'
              ? 'bg-primary/10 text-primary'
              : 'bg-surface-container-high text-on-surface-variant'
        )}
      >
        <span className="material-symbols-outlined text-[26px]">{icon}</span>
      </span>
      <p className="text-sm font-bold text-on-surface">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-body-sm font-body-sm text-on-surface-variant">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}