import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Remove default padding from the body (e.g. when rendering a table). */
  flush?: boolean;
}

export function Card({ className, flush, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0_1px_2px_rgba(25,28,29,0.04)]',
        !flush && 'p-4 md:p-5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="material-symbols-outlined text-[20px] text-primary">
              {icon}
            </span>
          )}
          <h2 className="text-headline-md font-headline-md text-on-surface">
            {title}
          </h2>
        </div>
        {subtitle && (
          <p className="mt-0.5 text-body-sm font-body-sm text-on-surface-variant">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}