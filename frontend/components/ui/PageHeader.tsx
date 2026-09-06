import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  status,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-6 flex flex-col gap-5 border-b border-outline-variant/60 pb-5',
        className
      )}
    >
      <div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-label-bold font-label-bold uppercase tracking-[0.14em] text-primary">
              {eyebrow}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-display-lg-mobile font-display-lg-mobile md:text-display-lg md:font-display-lg text-on-surface">
              {title}
            </h1>
            {status}
          </div>
          {subtitle && (
            <p className="mt-1.5 max-w-2xl text-body-base font-body-base text-on-surface-variant">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}