import React from 'react';
import Link from 'next/link';

const features = [
  {
    icon: 'document_scanner',
    title: 'AI OCR',
    text: 'Extracts key details from labels & images',
  },
  {
    icon: 'rule',
    title: 'Rule-Based Engine',
    text: 'Checks against Legal Metrology rules',
  },
  {
    icon: 'bolt',
    title: 'Instant Results',
    text: 'Pass / Fail with confidence score',
  },
  {
    icon: 'description',
    title: 'Detailed Reports',
    text: 'PDF & JSON with evidence',
  },
];

const extractedDetails = [
  { label: 'Product Name', value: 'GoodDay Classic Masala' },
  { label: 'Net Weight', value: '75 g' },
  { label: 'MRP', value: '₹ 50.00' },
  { label: 'Mfg. Date', value: '15/10/2023' },
];

const complianceChecks = ['Net Quantity', 'MRP', 'Mfg. Date', 'FSSAI License', 'Labeling Format'];

function ScannerCorners() {
  const corner = 'absolute h-5 w-5 border-[#00E0B8]';
  return (
    <div className="pointer-events-none absolute inset-3 z-20" aria-hidden="true">
      <span className={`${corner} left-0 top-0 rounded-tl-lg border-l-2 border-t-2`} />
      <span className={`${corner} right-0 top-0 rounded-tr-lg border-r-2 border-t-2`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-lg border-b-2 border-l-2`} />
      <span className={`${corner} bottom-0 right-0 rounded-br-lg border-b-2 border-r-2`} />
    </div>
  );
}

export function AuthHero() {
  return (
    <div className="relative flex min-h-full w-full flex-col overflow-hidden bg-gradient-to-br from-[#071A33] via-[#0B2A52] to-[#084454] px-5 py-10 text-white sm:px-8 lg:px-12 lg:py-14">
      {/* ── Background: gradients, glows & shield effect ──────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#1677FF]/25 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-[#00C896]/15 blur-3xl" />
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-[#1677FF]/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.7)_1px,transparent_0)] bg-[size:28px_28px] opacity-[0.05]" />
        <span className="material-symbols-outlined absolute -right-12 bottom-2 rotate-[-8deg] text-[260px] leading-none text-white/[0.04]">
          verified_user
        </span>
      </div>

      <div className="relative mx-auto w-full max-w-[1200px]">
        {/* ── Branding row ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1677FF] to-[#00BFA6] shadow-lg shadow-blue-500/25">
              <span className="material-symbols-outlined text-[22px]">verified_user</span>
            </div>
            <span className="text-xl font-extrabold tracking-tight">PackIntel</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1677FF]/40 bg-[#1677FF]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7DD3FC]">
            <span className="material-symbols-outlined text-[13px]">auto_awesome</span>
            AI | OCR Compliance
          </span>
        </div>

        {/* ── Hero grid: copy + CTAs + highlights | scanning composition ── */}
        <div className="mt-8 grid items-center gap-10 lg:mt-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          {/* Left: headline, subtext, CTAs, feature highlights */}
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#7DD3FC]">
              <span className="h-px w-7 bg-gradient-to-r from-[#1677FF] to-[#00C896]" />
              Scan. Analyze. Ensure Compliance.
            </p>

            <h1 className="mt-4 text-[28px] font-extrabold leading-[1.1] tracking-tight sm:text-4xl lg:text-[42px]">
              <span className="bg-gradient-to-r from-[#6CB1FF] to-[#00E0B8] bg-clip-text text-transparent">
                AI-Powered
              </span>
              <br />
              Faster Compliance Inspection for Packaged Commodities
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-relaxed text-[#C7D2E0] sm:text-[15px]">
              Scan packaging with AI. Detect missing declarations, labeling errors and compliance risks in
              seconds.
            </p>

            <div className="mt-6 flex flex-col gap-3 min-[430px]:flex-row sm:flex-wrap">
              <Link
                href="/scan/new"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1677FF] to-[#0D5FD6] px-6 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition duration-150 hover:brightness-110"
              >
                Start Inspection
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
              <Link
                href="/rules"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-[18px]">play_circle</span>
                See How It Works
              </Link>
            </div>

            {/* 4 feature highlights */}
            <ul className="mt-8 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              {features.map((f) => (
                <li
                  key={f.title}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1677FF]/25 to-[#00C896]/25 text-[#00E0B8] ring-1 ring-white/10">
                    <span className="material-symbols-outlined text-[18px]">{f.icon}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-white">{f.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-[#94A7C0]">{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: package scanning visual + extracted details + compliance */}
          <div className="relative min-w-0">
            {/* Scanning frame */}
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)] backdrop-blur sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1677FF]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6CB1FF]">
                  <span className="material-symbols-outlined text-[13px]">document_scanner</span>
                  AI OCR Scanning
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#00C896]">
                  <span className="relative flex h-2 w-2">
                    <span className="scanner-dot-ping absolute inline-flex h-full w-full rounded-full bg-[#00C896]" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00C896]" />
                  </span>
                  Live
                </span>
              </div>

              {/* Package inside scanning frame */}
              <div className="relative mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1A3A66] to-[#123052] p-4 sm:p-5">
                <ScannerCorners />
                <div className="scanner-scan-line pointer-events-none absolute left-0 right-0 top-0 z-10 h-16 bg-gradient-to-b from-transparent via-[#00E0B8]/35 to-transparent" />

                <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-2xl border border-[#00000010] bg-gradient-to-br from-[#FDF3D8] to-[#F3D79B] px-4 py-5 text-left text-[#3A2610] shadow-lg shadow-black/20">
                  <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#B9731F]">
                    <span>GoodDay</span>
                    <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A5A1F]">
                      Est. 1983
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold leading-none">Masala</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8A5A1F]">
                    Biscuits
                  </p>
                  <div className="mt-3 flex items-end justify-between border-t border-[#E7C886] pt-3">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-[#8A5A1F]">Net Wt.</p>
                      <p className="text-base font-extrabold">75 g</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] uppercase tracking-wider text-[#8A5A1F]">MRP</p>
                      <p className="text-base font-extrabold">₹ 50.00</p>
                    </div>
                  </div>
                  <div className="mt-4 flex h-8 items-end gap-[2px] overflow-hidden">
                    {Array.from({ length: 28 }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-full w-[3px] shrink-0 rounded-[1px] ${
                          i % 3 === 0 ? 'bg-[#3A2610]' : 'bg-[#8A5A1F]/60'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <span className="absolute bottom-5 right-3 z-20 inline-flex items-center gap-1 rounded-md bg-[#00C896]/20 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#00E0B8] backdrop-blur sm:bottom-6 sm:right-4">
                  <span className="material-symbols-outlined text-[12px]">auto_detect</span>
                  Scan
                </span>
              </div>

              {/* Detected chips */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-[#00C896]/15 px-2 py-1 text-[10px] font-bold text-[#00C896]">
                  <span className="material-symbols-outlined text-[12px]">check_circle</span>
                  8 fields detected
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-[#D6E4F5]">
                  <span className="material-symbols-outlined text-[12px]">tag</span>
                  Label identified
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-[#D6E4F5]">
                  <span className="material-symbols-outlined text-[12px]">barcode_scanner</span>
                  Barcode 10012031000312
                </span>
              </div>
            </div>

            {/* Extracted Details + Compliance cards */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7DD3FC]">
                    Extracted Details
                  </p>
                  <span className="material-symbols-outlined text-[16px] text-[#7DD3FC]">pageview</span>
                </div>
                <dl className="mt-3 space-y-2">
                  {extractedDetails.map((d) => (
                    <div key={d.label} className="flex items-center justify-between gap-3">
                      <dt className="truncate text-[11px] text-[#94A7C0]">{d.label}</dt>
                      <dd className="shrink-0 text-[11px] font-bold text-white">{d.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="rounded-2xl border border-[#00C896]/25 bg-gradient-to-br from-[#00C896]/15 to-[#00C896]/5 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#00C896] text-[#062A20]">
                    <span className="material-symbols-outlined text-[14px]">check</span>
                  </span>
                  <p className="text-sm font-extrabold text-white">Compliant</p>
                  <span className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#00C896]">
                    96%
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[#C7D2E0]">
                  All mandatory declarations found and valid.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {complianceChecks.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-[#D6E4F5]"
                    >
                      <span className="material-symbols-outlined text-[11px] text-[#00C896]">check_circle</span>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}