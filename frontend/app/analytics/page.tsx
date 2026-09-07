'use client';

import React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { TOP_VIOLATION_PATTERNS } from '@/lib/mockData';

export default function AnalyticsPage() {
  return (
    <AppShell pageTitle="Violation Analytics">
      <div className="mb-6">
        <h2 className="text-display-lg-mobile md:text-display-lg font-display-lg text-on-surface mb-2">
          Violation Pattern Intelligence
        </h2>
        <p className="text-body-base font-body-base text-on-surface-variant">
          Statistical breakdowns of statutory violation patterns, recurring non-compliance frequencies, and enforcement trends under Legal Metrology Rules, 2011.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-surface border border-outline-variant rounded-xl p-5 shadow-xs">
          <span className="text-label-bold font-label-bold text-on-surface-variant uppercase text-xs">
            Avg OCR Accuracy
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-display-lg font-display-lg text-primary">95.4%</span>
            <span className="text-xs text-green-700 font-semibold bg-green-50 px-1.5 py-0.5 rounded">↑ 1.8%</span>
          </div>
          <p className="text-xs text-on-surface-variant mt-2">Across 1,248 processed SKUs</p>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-5 shadow-xs">
          <span className="text-label-bold font-label-bold text-on-surface-variant uppercase text-xs">
            Avg Inference Time
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-display-lg font-display-lg text-on-surface">1.84s</span>
            <span className="text-xs text-green-700 font-semibold bg-green-50 px-1.5 py-0.5 rounded">Fast</span>
          </div>
          <p className="text-xs text-on-surface-variant mt-2">Neural OCR & parsing pipeline</p>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-5 shadow-xs">
          <span className="text-label-bold font-label-bold text-on-surface-variant uppercase text-xs">
            Top Discrepancy Field
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-headline-md font-headline-md text-amber-600 font-bold">Packing Date</span>
          </div>
          <p className="text-xs text-on-surface-variant mt-2">48% of review flags relate to date formats</p>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-5 shadow-xs">
          <span className="text-label-bold font-label-bold text-on-surface-variant uppercase text-xs">
            Direct Pass Rate
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-display-lg font-display-lg text-green-600">67.5%</span>
          </div>
          <p className="text-xs text-on-surface-variant mt-2">Zero human intervention required</p>
        </div>
      </div>

      {/* Discrepancy Breakdown */}
      <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-xs mb-8">
        <h3 className="text-headline-md font-headline-md text-on-surface mb-4">
          Statutory Violation Distribution
        </h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between gap-3 text-xs font-semibold text-on-surface mb-1">
              <span className="min-w-0 flex-1 sm:flex-none">Rule 6(1)(d) — Ambiguous Packing Date Format</span>
              <span>48%</span>
            </div>
            <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
              <div className="bg-amber-500 h-full rounded-full w-[48%]" />
            </div>
          </div>

          <div>
            <div className="flex justify-between gap-3 text-xs font-semibold text-on-surface mb-1">
              <span className="min-w-0 flex-1 sm:flex-none">Rule 6(1)(e) — Missing Inclusive of all taxes text in MRP</span>
              <span>28%</span>
            </div>
            <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
              <div className="bg-red-500 h-full rounded-full w-[28%]" />
            </div>
          </div>

          <div>
            <div className="flex justify-between gap-3 text-xs font-semibold text-on-surface mb-1">
              <span className="min-w-0 flex-1 sm:flex-none">Rule 6(1)(c) — Non-standard metric units in Net Quantity</span>
              <span>16%</span>
            </div>
            <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
              <div className="bg-primary h-full rounded-full w-[16%]" />
            </div>
          </div>

          <div>
            <div className="flex justify-between gap-3 text-xs font-semibold text-on-surface mb-1">
              <span className="min-w-0 flex-1 sm:flex-none">Rule 6(1)(h) — Missing Consumer Care phone or email</span>
              <span>8%</span>
            </div>
            <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
              <div className="bg-secondary h-full rounded-full w-[8%]" />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
