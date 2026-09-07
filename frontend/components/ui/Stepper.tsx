'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface Step {
  id: string;
  label: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  currentIndex: number;
  className?: string;
}

export function Stepper({ steps, currentIndex, className }: StepperProps) {
  return (
    <ol
      className={cn('no-scrollbar flex items-center overflow-x-auto', className)}
    >
      {steps.map((step, index) => {
        const isComplete = index < currentIndex;
        const isActive = index === currentIndex;
        const isPending = index > currentIndex;

        return (
          <React.Fragment key={step.id}>
            <li className="flex min-w-[84px] flex-1 flex-col items-center gap-2 text-center">
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold transition-colors',
                  isComplete &&
                    'border-emerald-500 bg-emerald-500 font-mono text-white',
                  isActive && 'border-primary bg-primary text-white shadow-sm pulsing-dot',
                  isPending && 'border-outline-variant bg-surface-container-low text-on-surface-variant'
                )}
              >
                {isComplete ? (
                  <span className="material-symbols-outlined text-[16px]">check</span>
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  'text-xs leading-tight',
                  isActive
                    ? 'font-bold text-on-surface'
                    : isComplete
                      ? 'font-semibold text-emerald-700'
                      : 'font-medium text-on-surface-variant'
                )}
              >
                {step.label}
              </span>
            </li>
            {index < steps.length - 1 && (
              <li
                className={cn(
                  'mb-6 h-0.5 min-w-8 flex-1 rounded-full transition-colors',
                  index < currentIndex ? 'bg-primary' : 'bg-outline-variant'
                )}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}