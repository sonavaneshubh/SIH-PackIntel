'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/authContext';

export function EvaluationDemoCard() {
  const { signInAsDemo } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDemoLogin() {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signInAsDemo();
      if (!result.success) {
        setError(result.error || 'The demo account is not available right now.');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="evaluation-demo-title"
      className="relative w-full max-w-[540px] rounded-xl border border-[#E3ECF7] bg-white p-4 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.18)] sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id="evaluation-demo-title" className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#0F172A]">
          SIH 2026 Evaluation
        </h2>
        <span className="inline-flex items-center rounded-full border border-[#34B376]/50 bg-[#ECFAF2] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0E9F5B]">
          Instant Access
        </span>
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={isSubmitting}
        onClick={handleDemoLogin}
        className="mt-3 h-11 w-full rounded-lg border border-dashed border-[#9CC5F5] bg-white text-sm font-bold text-[#1677FF] hover:bg-[#F2F7FF] focus:ring-[#1677FF] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="material-symbols-outlined text-[20px] text-[#1677FF]">{isSubmitting ? 'hourglass_top' : 'smart_toy'}</span>
        {isSubmitting ? 'Signing in to demo account…' : 'Use Demo Inspector Account'}
      </Button>

      {error && (
        <p className="mt-2.5 text-xs font-medium leading-relaxed text-red-600">{error}</p>
      )}

      <p className="mt-2.5 text-xs leading-relaxed text-[#64748B]">
        Signs you in as the pre-authorized demo inspector (DEMO-INS-001) so you can
        scan products and explore every page like a live officer.
      </p>
    </section>
  );
}