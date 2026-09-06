'use client';

import React, { Suspense } from 'react';
import { ReportView } from '@/features/report/ReportView';

export default function ResultsPage() {
  return (
    <Suspense fallback={null}>
      <ReportView />
    </Suspense>
  );
}