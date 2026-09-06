'use client';

import React from 'react';
import { ProductField } from '@/types/product';
import { resultKind, sourceLabel } from './reportUtils';
import { cn } from '@/lib/utils';

export function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-on-surface">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>}
    </div>
  );
}

export function SummaryItem({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-[0_1px_2px_rgba(25,28,29,0.04)]">
      <p className={cn('font-mono text-2xl font-bold tracking-tight', tone)}>{value}</p>
      <p className="mt-1 text-xs font-medium text-on-surface-variant">{label}</p>
    </div>
  );
}

export function QualityItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className="mt-1 font-semibold text-on-surface">{value}</p>
    </div>
  );
}

export function ResultPill({ result }: { result: string }) {
  const config = resultKind(result);
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold',
        config.className
      )}
    >
      {config.label}
    </span>
  );
}

export function ProductFieldValue({
  field,
  sensitive,
}: {
  field: ProductField;
  sensitive?: boolean;
}) {
  const confidence = Math.round(field.confidence ?? 0);

  if (field.status === 'detected') {
    return (
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="break-words font-medium text-on-surface">{field.value || 'Not Visible'}</span>
        {confidence > 0 ? (
          <span
            className="shrink-0 text-xs text-on-surface-variant"
            title={`Extracted via ${sourceLabel(field.source)} at ${confidence}% confidence.`}
          >
            {confidence}% · {sourceLabel(field.source)}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-on-surface-variant">{sourceLabel(field.source)}</span>
        )}
      </div>
    );
  }

  if (field.status === 'uncertain') {
    return (
      <div className="text-amber-800">
        <span className="inline-flex items-center gap-1 font-semibold">
          <span className="material-symbols-outlined text-sm">warning</span>
          Needs Review
        </span>
        {field.conflicts && field.conflicts.length > 0 ? (
          <span className="mt-1 block text-xs normal-case text-on-surface-variant">
            {field.conflicts.map((c) => `${sourceLabel(c.source)}: ${c.value || '—'}`).join(' · ')}
          </span>
        ) : null}
        {sensitive ? (
          <span className="mt-0.5 block text-xs normal-case text-amber-700">
            OCR and vision disagree on this sensitive field.
          </span>
        ) : null}
      </div>
    );
  }

  if (field.status === 'not_printed') {
    return <span className="italic text-on-surface-variant">Not Printed / Unmarked</span>;
  }

  return <span className="italic text-on-surface-variant">Not Visible</span>;
}