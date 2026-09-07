'use client';

import React from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────────
   Shared building blocks
   ───────────────────────────────────────────────────────────── */

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="text-center">
      {eyebrow && (
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#E6F7F2] px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#0F766E]">
          <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
          {eyebrow}
        </span>
      )}
      <h2 className="text-2xl font-black tracking-tight text-[#0B1B33] sm:text-3xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mx-auto mt-3 max-w-xl text-[#475569] sm:text-lg">{subtitle}</p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Section 1 — Hero
   ───────────────────────────────────────────────────────────── */

const HERO_RESULTS = [
  { label: 'MRP ₹20.00', status: 'Found', tone: 'ok' },
  { label: 'Net Quantity 50 g', status: 'Found', tone: 'ok' },
  { label: 'Mfg. Date 12/05/2025', status: 'Found', tone: 'ok' },
  { label: 'Best Before 11/11/2025', status: 'Found', tone: 'ok' },
  { label: 'FSSAI License', status: 'Missing', tone: 'err' },
];

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 right-0 h-[440px] w-[520px] rounded-full bg-[#1A73E8]/[0.08] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/4 h-[380px] w-[460px] rounded-full bg-[#0F766E]/[0.07] blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-20">
        {/* LEFT */}
        <div className="home-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#BFE3D8] bg-[#E6F7F2] px-3.5 py-1.5 text-xs font-semibold tracking-wide text-[#0F766E]">
            <span className="material-symbols-outlined text-[15px]">verified_user</span>
            AI • OCR • Compliance • Faster
          </span>

          <h1 className="mt-6 text-3xl font-black leading-[1.15] text-[#0B1B33] sm:text-4xl lg:text-[46px]">
            AI-Powered Compliance Inspection for{' '}
            <span className="text-[#0F766E]">Packaged Commodities</span>
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-[#475569] sm:text-lg">
            Scan packaging with AI. Detect missing declarations, labeling errors
            and compliance risks in seconds.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/scan/new"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A73E8] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#1A73E8]/25 transition-all hover:-translate-y-0.5 hover:bg-[#005BBF] hover:shadow-xl hover:shadow-[#1A73E8]/30 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:ring-offset-2"
            >
              Start Inspection
              <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-0.5">
                arrow_forward
              </span>
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#CBD5E1] bg-white px-6 py-3.5 text-sm font-semibold text-[#0B1B33] transition-all hover:-translate-y-0.5 hover:border-[#94A3B8] hover:bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#CBD5E1]"
            >
              <span className="material-symbols-outlined text-[18px] text-[#0F766E]">
                play_circle
              </span>
              See How It Works
            </a>
          </div>

          <div className="mt-9 flex flex-wrap gap-2.5">
            {['AI Vision', 'OCR', 'Rule-Based Validation', 'Instant Report'].map((cap) => (
              <span
                key={cap}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#475569]"
              >
                <span className="material-symbols-outlined text-[16px] text-[#0F766E]">
                  check_circle
                </span>
                {cap}
              </span>
            ))}
          </div>
        </div>

        {/* RIGHT — inspection visual */}
        <div className="home-fade-up relative" style={{ animationDelay: '120ms' }}>
          <div className="relative mx-auto max-w-md rounded-3xl border border-[#E2E8F0] bg-gradient-to-br from-white to-[#F0F6FF] p-6 shadow-2xl shadow-[#0B1B33]/[0.08]">
            <div className="flex items-center justify-between pb-4">
              <span className="text-xs font-semibold text-[#475569]">
                Package Inspection
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6F7F2] px-2.5 py-1 text-[11px] font-semibold text-[#0F766E]">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#0F766E] opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-[#0F766E]" />
                </span>
                Live
              </span>
            </div>

            <div className="relative flex items-center justify-center py-8">
              <div className="absolute inset-x-6 -inset-y-1 rounded-3xl bg-gradient-to-br from-[#1A73E8]/[0.10] to-[#0F766E]/[0.10]" />
              <div className="relative flex aspect-[3/4] w-40 flex-col justify-between overflow-hidden rounded-2xl border-2 border-[#1A73E8]/40 bg-gradient-to-b from-[#FDE68A] to-[#F59E0B] p-3 shadow-lg scanner-border-active">
                <div className="flex justify-between">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#0F766E]" />
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0F766E] text-[12px] font-black text-white">
                    P
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 rounded bg-white/50" />
                  <div className="h-2 w-3/4 rounded bg-white/50" />
                  <div className="mt-2 h-6 w-20 rounded-md bg-white/80" />
                </div>
                <div className="scanner-scan-line pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-gradient-to-r from-transparent via-[#22D3EE] to-transparent" />
              </div>
            </div>

            <div className="relative -mt-2 mb-4 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0B1B33] px-4 py-1.5 text-xs font-medium text-white shadow-lg">
                <span className="material-symbols-outlined text-[15px] text-[#22D3EE]">
                  auto_awesome
                </span>
                AI Inspection in Progress...
              </span>
            </div>

            <div className="space-y-2">
              {HERO_RESULTS.map((r) => (
                <div
                  key={r.label}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm',
                    r.tone === 'ok'
                      ? 'border-[#BFE3D8] bg-[#F2FBF8]'
                      : 'border-[#FECACA] bg-[#FEF2F2]'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2 font-medium text-[#1E293B]">
                    <span
                      className={cn(
                        'material-symbols-outlined text-[17px]',
                        r.tone === 'ok' ? 'text-[#0F766E]' : 'text-[#DC2626]'
                      )}
                    >
                      {r.tone === 'ok' ? 'check_circle' : 'cancel'}
                    </span>
                    {r.label}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      r.tone === 'ok' ? 'text-[#0F766E]' : 'text-[#DC2626]'
                    )}
                  >
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Section 2 — Why PackIntel (concise benefit cards)
   ───────────────────────────────────────────────────────────── */

const BENEFITS = [
  {
    icon: 'bolt',
    title: 'Lightning Fast',
    desc: 'Scan a label and get results in seconds.',
  },
  {
    icon: 'visibility',
    title: 'Catch Hidden Violations',
    desc: 'AI spots missing declarations humans miss.',
  },
  {
    icon: 'verified',
    title: 'Regulatory Accuracy',
    desc: 'Rule-based checks aligned with legal metrology.',
  },
];

function WhySection() {
  return (
    <section className="border-y border-[#E8EEF7] bg-[#F7FAFF]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:py-14">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div className="home-fade-up">
            <h2 className="text-2xl font-black tracking-tight text-[#0B1B33] sm:text-3xl">
              Stop slow, manual label checks.
              <br />
              <span className="text-[#0F766E]">Inspect with AI.</span>
            </h2>
            <p className="mt-4 max-w-md text-[#475569]">
              Manual inspection is error-prone and misses critical violations.
              PackIntel automates the whole process with accurate, actionable
              results.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {BENEFITS.map((b, i) => (
              <div
                key={b.title}
                className="home-fade-up group rounded-2xl border border-[#E2E8F0] bg-white p-5 text-center shadow-sm transition-all hover:-translate-y-1 hover:border-[#1A73E8]/30 hover:shadow-lg"
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#EAF3FF] text-[#1A73E8] transition-colors group-hover:bg-[#1A73E8] group-hover:text-white">
                  <span className="material-symbols-outlined text-[24px]">{b.icon}</span>
                </div>
                <h3 className="mt-4 text-sm font-bold text-[#0B1B33]">{b.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Section 3 — How It Works
   ───────────────────────────────────────────────────────────── */

const STEPS = [
  {
    num: '01',
    title: 'Upload Package',
    desc: 'Add an image or scan of the product package (JPG, PNG, PDF).',
    icon: 'add_photo_alternate',
  },
  {
    num: '02',
    title: 'AI Analyzes Label',
    desc: 'OCR + computer vision + rule-based validation check the label.',
    icon: 'document_scanner',
  },
  {
    num: '03',
    title: 'Get Compliance Report',
    desc: 'View violations, risk level, and the full report instantly.',
    icon: 'description',
  },
];

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
      <SectionHeading
        eyebrow="Simple workflow"
        title="How It Works"
        subtitle="Just 3 simple steps to ensure compliance."
      />

      <div className="relative mt-12 grid items-start gap-10 md:grid-cols-3 md:gap-0">
        <div className="pointer-events-none absolute left-0 right-0 top-8 hidden h-0.5 bg-gradient-to-r from-[#1A73E8]/30 via-[#0F766E]/40 to-[#1A73E8]/30 md:block" />

        {STEPS.map((step, i) => (
          <div
            key={step.num}
            className={cn(
              'home-fade-up relative flex flex-col items-center px-6 text-center',
              i !== 0 && 'mt-10 md:mt-0'
            )}
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="relative z-10 flex size-16 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-[#1A73E8] to-[#0F766E] text-white shadow-lg shadow-[#1A73E8]/25">
              <span className="material-symbols-outlined text-[26px]">{step.icon}</span>
            </div>
            <span className="mt-4 text-xs font-bold tracking-widest text-[#0F766E]">
              STEP {step.num}
            </span>
            <h3 className="mt-1.5 text-lg font-bold text-[#0B1B33]">{step.title}</h3>
            <p className="mt-2 max-w-[240px] text-sm leading-relaxed text-[#64748B]">
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Section 4 — Key AI Capabilities
   ───────────────────────────────────────────────────────────── */

const CAPABILITIES = [
  { icon: 'document_scanner', title: 'OCR & Label Detection' },
  { icon: 'fact_check', title: 'Mandatory Declaration Detection' },
  { icon: 'straighten', title: 'Unit & Measurement Validation' },
  { icon: 'rule', title: 'Compliance Rule Checking' },
  { icon: 'gpp_maybe', title: 'Risk & Violation Detection' },
  { icon: 'summarize', title: 'AI-Generated Inspection Report' },
];

function CapabilitiesSection() {
  return (
    <section className="border-y border-[#E8EEF7] bg-[#F7FAFF]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
        <SectionHeading
          eyebrow="What it does"
          title="Key AI Capabilities"
          subtitle="Advanced AI. Real compliance impact."
        />

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((cap, i) => (
            <div
              key={cap.title}
              className="home-fade-up group flex items-center gap-4 rounded-2xl border border-[#DCEBFF] bg-gradient-to-br from-[#EAF3FF] to-[#EDFAF6] p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#1A73E8] shadow-sm transition-colors group-hover:bg-[#1A73E8] group-hover:text-white">
                <span className="material-symbols-outlined text-[24px]">{cap.icon}</span>
              </div>
              <h3 className="text-sm font-bold leading-snug text-[#0B1B33] sm:text-base">
                {cap.title}
              </h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Section 5 — Interactive Inspection Demo
   ───────────────────────────────────────────────────────────── */

const DEMO_FIELDS = [
  { label: 'MRP', status: 'Found', tone: 'ok' },
  { label: 'Net Quantity', status: 'Found', tone: 'ok' },
  { label: 'Manufacturer Details', status: 'Warning', tone: 'warn' },
  { label: 'FSSAI License', status: 'Missing', tone: 'err' },
  { label: 'Expiry Date', status: 'Found', tone: 'ok' },
];

const DEMO_STATS = [
  { label: 'Passed', value: 8, icon: 'check_circle', tone: 'ok' },
  { label: 'Warnings', value: 2, icon: 'warning', tone: 'warn' },
  { label: 'Violation', value: 1, icon: 'cancel', tone: 'err' },
];

const DEMO_SUMMARY: { label: string; value: string; alert?: boolean }[] = [
  { label: 'Product Name', value: 'Potato Chips' },
  { label: 'Net Quantity', value: '50 g' },
  { label: 'MRP', value: '₹20.00' },
  { label: 'Manufacturer', value: 'ABC Foods Pvt. Ltd.' },
  { label: 'FSSAI License', value: 'Missing', alert: true },
  { label: 'Best Before', value: '11/11/2025' },
];

function DemoSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
      <SectionHeading
        eyebrow="See it in action"
        title="Live Inspection Demo"
        subtitle="A real-style AI inspection result at a glance."
      />

      <div className="home-fade-up mt-10 rounded-3xl border border-[#E2E8F0] bg-gradient-to-br from-[#F4F9FF] to-white p-6 shadow-lg shadow-[#0B1B33]/[0.04] sm:p-8">
        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr_1.1fr] lg:gap-6">
          {/* LEFT — package + detected fields */}
          <div>
            <div className="flex items-center gap-6">
              <div className="relative flex aspect-[3/4] w-32 shrink-0 flex-col justify-between overflow-hidden rounded-2xl border-2 border-[#1A73E8]/40 bg-gradient-to-b from-[#FDBA74] to-[#F97316] p-3 shadow-md">
                <div className="flex justify-between">
                  <span className="h-2 w-2 rounded-sm bg-[#0F766E]" />
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0F766E] text-[10px] font-black text-white">
                    P
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-1.5 rounded bg-white/50" />
                  <div className="h-1.5 w-3/4 rounded bg-white/50" />
                </div>
                <div className="scanner-scan-line pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-gradient-to-r from-transparent via-[#22D3EE] to-transparent" />
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                {DEMO_FIELDS.map((f) => (
                  <div
                    key={f.label}
                    className={cn(
                      'flex items-center justify-between rounded-lg border px-3 py-2 text-sm',
                      f.tone === 'ok' && 'border-[#BFE3D8] bg-[#F2FBF8]',
                      f.tone === 'warn' && 'border-[#FDE68A] bg-[#FFFBEB]',
                      f.tone === 'err' && 'border-[#FECACA] bg-[#FEF2F2]'
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-medium text-[#1E293B]">
                      <span
                        className={cn(
                          'material-symbols-outlined text-[16px]',
                          f.tone === 'ok' && 'text-[#0F766E]',
                          f.tone === 'warn' && 'text-[#B45309]',
                          f.tone === 'err' && 'text-[#DC2626]'
                        )}
                      >
                        {f.tone === 'ok' && 'check_circle'}
                        {f.tone === 'warn' && 'warning'}
                        {f.tone === 'err' && 'cancel'}
                      </span>
                      {f.label}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] font-semibold',
                        f.tone === 'ok' && 'text-[#0F766E]',
                        f.tone === 'warn' && 'text-[#B45309]',
                        f.tone === 'err' && 'text-[#DC2626]'
                      )}
                    >
                      {f.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CENTER — compliance score */}
          <div className="flex flex-col items-center">
            <div className="relative flex size-40 items-center justify-center">
              <svg className="size-40 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke="#E2E8F0" strokeWidth="9" />
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="#0F766E"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={`${0.72 * 276.46} 276.46`}
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-4xl font-black text-[#0B1B33]">72%</span>
                <span className="mt-0.5 text-xs font-semibold text-[#0F766E]">
                  Compliant
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {DEMO_STATS.map((s) => (
                <span
                  key={s.label}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
                    s.tone === 'ok' && 'border-[#BFE3D8] bg-[#F2FBF8] text-[#0F766E]',
                    s.tone === 'warn' && 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]',
                    s.tone === 'err' && 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
                  )}
                >
                  <span className="material-symbols-outlined text-[15px]">{s.icon}</span>
                  {s.value} {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* RIGHT — inspection summary */}
          <div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1B33]">
                <span className="material-symbols-outlined text-[18px] text-[#1A73E8]">
                  description
                </span>
                Inspection Summary
              </h3>
              <div className="mt-4 space-y-2.5">
                {DEMO_SUMMARY.map((row) => (
                  <div key={row.label} className="flex justify-between gap-3 text-sm">
                    <span className="text-[#64748B]">{row.label}</span>
                    <span
                      className={cn(
                        'text-right font-semibold',
                        row.alert ? 'text-[#DC2626]' : 'text-[#1E293B]'
                      )}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href="/scan/new"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1A73E8] py-3 text-sm font-semibold text-white shadow-lg shadow-[#1A73E8]/25 transition-all hover:-translate-y-0.5 hover:bg-[#005BBF] focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:ring-offset-2"
              >
                Try Live Inspection
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Section 6 — Final CTA
   ───────────────────────────────────────────────────────────── */

function FinalCtaSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-2">
      <div className="home-fade-up relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1B33] to-[#0F3A5F] px-6 py-12 text-center shadow-2xl sm:px-12">
        <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-[#1A73E8]/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 -right-10 h-48 w-48 rounded-full bg-[#0F766E]/20 blur-2xl" />

        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-2xl font-black leading-tight text-white sm:text-3xl lg:text-4xl">
            Turn Package Inspection
            <br />
            Into an Intelligent Process.
          </h2>
          <p className="mt-4 text-[#BFDBFE]">
            Ensure safer products. Build a more compliant tomorrow.
          </p>
          <Link
            href="/scan/new"
            className="group mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-[#0B1B33] shadow-lg transition-all hover:-translate-y-0.5 hover:bg-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#0B1B33]"
          >
            Start Your First Inspection
            <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-0.5">
              arrow_forward
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Home page assembly
   ───────────────────────────────────────────────────────────── */

export function HomepageView() {
  return (
    <AppShell pageTitle="Home">
      <div className="mx-auto flex max-w-7xl flex-col">
        <HeroSection />
        <WhySection />
        <HowItWorksSection />
        <CapabilitiesSection />
        <DemoSection />
        <FinalCtaSection />
      </div>
    </AppShell>
  );
}
