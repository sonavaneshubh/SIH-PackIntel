'use client';

import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';

function FoundBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path
          clipRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
          fillRule="evenodd"
        />
      </svg>
      Found
    </span>
  );
}

function HeroSection() {
  return (
    <section
      className="relative pt-12 pb-20 lg:pt-16 lg:pb-24 glow-cyan-bg border-b border-slate-100"
      data-purpose="hero-section"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Hero Left Content */}
          <div className="lg:col-span-6 space-y-7">
            {/* Top Tag Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-100/80 text-blue-600 text-xs font-semibold tracking-wide shadow-sm">
              <span>AI</span>
              <span className="text-blue-300">•</span>
              <span>OCR</span>
              <span className="text-blue-300">•</span>
              <span>Compliance</span>
              <span className="text-blue-300">•</span>
              <span>Faster</span>
            </div>
            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold text-slate-900 leading-[1.15] tracking-tight">
              AI-Powered Compliance Inspection for{' '}
              <span className="text-emerald-500">Packaged Commodities</span>
            </h1>
            {/* Subtitle */}
            <p className="text-slate-600 text-lg sm:text-xl font-normal leading-relaxed max-w-xl">
              Scan packaging with AI. Detect missing declarations, labeling errors and compliance
              risks in seconds.
            </p>
            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                className="inline-flex items-center justify-center px-6 py-3.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-full shadow-lg shadow-blue-500/25 transition duration-150"
                href="/scan/new"
              >
                Start Inspection
                <svg
                  className="ml-2 w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <a
                className="inline-flex items-center justify-center px-6 py-3.5 text-base font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-full shadow-sm transition duration-150"
                href="#how-it-works"
              >
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 text-blue-600 mr-2.5">
                  <svg className="w-3 h-3 fill-current ml-0.5" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                See How It Works
              </a>
            </div>
            {/* Micro Features Row */}
            <div
              className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-200/70"
              data-purpose="hero-micro-features"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-slate-700">AI Vision</span>
              </div>
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-slate-700">OCR</span>
              </div>
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-slate-700 leading-tight">
                  Rule-Based Validation
                </span>
              </div>
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-slate-700">Instant Report</span>
              </div>
            </div>
          </div>

          {/* Hero Right Graphic (Simulated AI Packaging Scan) */}
          <div className="lg:col-span-6 relative flex justify-center items-center" data-purpose="hero-scanner-preview">
            {/* Ambient Glow Ring Behind Scanner */}
            <div className="absolute w-80 h-80 sm:w-96 sm:h-96 bg-cyan-100/60 rounded-full blur-3xl -z-10 pointer-events-none"></div>
            {/* Main Visual Card Container */}
            <div className="relative w-full max-w-lg bg-white/70 backdrop-blur-md rounded-3xl p-6 border border-slate-100 shadow-2xl shadow-slate-200/50">
              {/* Floating AI Status Badge */}
              <div className="mb-4 inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-3.5 py-1.5 rounded-xl shadow-sm">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600"></span>
                </span>
                <span className="text-xs font-bold text-blue-900">AI Inspection in Progress...</span>
              </div>
              {/* Scanner Content Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                {/* Chips Package with Bounding Box Overlay */}
                <div className="relative rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center justify-center h-64 sm:h-80 border-2 border-dashed border-emerald-400/80 group select-none bg-slate-50">
                  <img
                    src="/screen.png"
                    alt="GoodDay Classic Masala Potato Chips"
                    className="w-full h-full object-contain rounded-lg drop-shadow-md"
                  />
                  <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-emerald-400 z-20 pointer-events-none"></div>
                  <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-emerald-400 z-20 pointer-events-none"></div>
                  <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-emerald-400 z-20 pointer-events-none"></div>
                  <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-emerald-400 z-20 pointer-events-none"></div>
                  <div className="absolute inset-x-2 top-11 bottom-20 border-2 border-emerald-400/90 bg-emerald-500/10 rounded-lg pointer-events-none z-20 animate-pulse"></div>
                  <div className="absolute z-20 bottom-3 inset-x-2 bg-white/95 backdrop-blur-md rounded-lg p-2 text-[9px] space-y-1 border border-emerald-500/50 shadow-md">
                    <div className="flex justify-between border-b border-slate-200/60 pb-0.5">
                      <span className="text-slate-600 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                        Net Wt:
                      </span>
                      <span className="font-bold text-slate-900">52 g</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200/60 pb-0.5">
                      <span className="text-slate-600 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                        MRP:
                      </span>
                      <span className="font-bold text-slate-900">₹ 20.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                        FSSAI:
                      </span>
                      <span className="font-bold text-emerald-600">10012031000312</span>
                    </div>
                  </div>
                </div>
                {/* Inspection Detection Checklist Card */}
                <div className="space-y-2.5 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <span className="font-medium text-slate-700">
                      MRP <strong className="text-slate-900">₹ 20.00</strong>
                    </span>
                    <FoundBadge />
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <span className="font-medium text-slate-700">
                      Net Quantity <strong className="text-slate-900">52 g</strong>
                    </span>
                    <FoundBadge />
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <span className="font-medium text-slate-700">
                      Mfg. Date <strong className="text-slate-900">12/05/2025</strong>
                    </span>
                    <FoundBadge />
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <span className="font-medium text-slate-700">
                      Use By <strong className="text-slate-900">11/08/2025</strong>
                    </span>
                    <FoundBadge />
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <span className="font-medium text-slate-700">
                      FSSAI <strong className="text-slate-900">10012031000312</strong>
                    </span>
                    <FoundBadge />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemVsSolutionSection() {
  return (
    <section className="py-20 bg-white" data-purpose="comparison-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* The Problem Column */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">The Problem</h2>
              <p className="text-sm sm:text-base text-slate-500 mt-2">
                Manual inspection is slow, error-prone and misses critical violations.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="bg-[#FFF5F5] border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Time-consuming</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">verification</p>
                </div>
              </div>
              <div className="bg-[#FFF5F5] border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Human errors</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">in label reading</p>
                </div>
              </div>
              <div className="bg-[#FFF5F5] border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Missing declarations</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">&amp; labeling violations</p>
                </div>
              </div>
              <div className="bg-[#FFF5F5] border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Inconsistent</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">compliance checks</p>
                </div>
              </div>
            </div>
          </div>
          {/* Center Transition Arrow */}
          <div className="hidden lg:flex lg:col-span-1 justify-center items-center">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          {/* PackIntel Solves It Column */}
          <div className="lg:col-span-6 space-y-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                <span className="text-emerald-500">PackIntel</span> Solves It
              </h2>
              <p className="text-sm sm:text-base text-slate-500 mt-2">
                Automate inspection with AI and get accurate, actionable results.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
              {/* Features List */}
              <div className="sm:col-span-7 bg-[#F4FDF8] border border-emerald-100 rounded-3xl p-5 space-y-3.5">
                <div className="flex items-center space-x-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs shrink-0">
                    ✓
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-700">
                    Faster &amp; more accurate
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs shrink-0">
                    ✓
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-700">
                    Detects hidden violations
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs shrink-0">
                    ✓
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-700">
                    Ensures regulatory compliance
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs shrink-0">
                    ✓
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-700">
                    Saves time and resources
                  </span>
                </div>
              </div>
              {/* Illustration Card */}
              <div className="sm:col-span-5 flex justify-center">
                <div className="relative w-40 h-40 bg-gradient-to-tr from-cyan-100/60 to-emerald-100/40 rounded-3xl p-4 flex items-center justify-center border border-emerald-200/50">
                  {/* Outer Corner Bracket Lines */}
                  <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-emerald-400"></div>
                  <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-emerald-400"></div>
                  <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-emerald-400"></div>
                  <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-emerald-400"></div>
                  {/* Cube Box Illustration */}
                  <div className="w-20 h-20 bg-blue-200/60 rounded-xl shadow-md border border-blue-300 flex flex-col justify-center items-center relative">
                    <div className="w-8 h-1.5 bg-blue-300 rounded mb-1.5"></div>
                    <div className="w-12 h-1 bg-blue-300 rounded"></div>
                    {/* Green Verified Badge */}
                    <div className="absolute -right-3 -top-3 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg border-2 border-white">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          clipRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          fillRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section
      className="py-20 bg-slate-50/60 border-t border-slate-100"
      data-purpose="how-it-works-section"
      id="how-it-works"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Section Heading */}
        <h2 className="text-3xl font-extrabold text-slate-900">How It Works</h2>
        <p className="text-sm sm:text-base text-slate-500 mt-2">Just 3 simple steps to ensure compliance.</p>
        {/* Steps Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Step 1 */}
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center shadow-sm">
                1
              </div>
              <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shadow-sm">
                <svg
                  className="w-7 h-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <div className="max-w-xs">
              <h3 className="text-base font-bold text-slate-800">Upload Package</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Add an image or scan of the product package (JPG, PNG, PDF).
              </p>
            </div>
          </div>
          {/* Step 2 */}
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-sm">
                2
              </div>
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm">
                <svg
                  className="w-7 h-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 5.25v13.5A2.25 2.25 0 006.75 21z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <div className="max-w-xs">
              <h3 className="text-base font-bold text-slate-800">AI Analyzes Label</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                OCR + computer vision + rule-based validation checks the label.
              </p>
            </div>
          </div>
          {/* Step 3 */}
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-sm flex items-center justify-center shadow-sm">
                3
              </div>
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm">
                <svg
                  className="w-7 h-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <div className="max-w-xs">
              <h3 className="text-base font-bold text-slate-800">Get Compliance Report</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                View violations, risk level, and complete inspection report instantly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CapabilitiesSection() {
  return (
    <section className="py-20 bg-white" data-purpose="capabilities-and-demo-section" id="demo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-12">
          <h2 className="text-3xl font-extrabold text-slate-900">Key AI Capabilities</h2>
          <p className="text-sm sm:text-base text-slate-500 mt-1">Advanced AI. Real compliance impact.</p>
        </div>
        {/* 6 Capability Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-14" data-purpose="capability-cards">
          <div className="p-4 rounded-2xl bg-[#F0F5FF] border border-blue-100 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-xl bg-blue-100/70 text-blue-600 flex items-center justify-center mb-3">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight">OCR &amp; Label Detection</span>
          </div>
          <div className="p-4 rounded-2xl bg-[#F0FDF4] border border-emerald-100 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-100/70 text-emerald-600 flex items-center justify-center mb-3">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight">
              Mandatory Declaration Detection
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-[#F0F5FF] border border-blue-100 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-xl bg-blue-100/70 text-blue-600 flex items-center justify-center mb-3">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.97zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.97z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight">
              Unit &amp; Measurement Validation
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-[#F0FDF4] border border-emerald-100 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-100/70 text-emerald-600 flex items-center justify-center mb-3">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight">Compliance Rule Checking</span>
          </div>
          <div className="p-4 rounded-2xl bg-[#FFF5F5] border border-red-100 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-xl bg-red-100/70 text-red-600 flex items-center justify-center mb-3">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight">
              Risk &amp; Violation Detection
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-[#F0F5FF] border border-blue-100 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-xl bg-blue-100/70 text-blue-600 flex items-center justify-center mb-3">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight">
              AI-Generated Inspection Report
            </span>
          </div>
        </div>
        {/* Live Inspection Dashboard Preview */}
        <div
          className="bg-[#F8FAFC] border border-slate-200/90 rounded-3xl p-6 lg:p-8 shadow-sm"
          data-purpose="live-dashboard-preview"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Column 1: Scanned Pouch with Label Detection Callouts */}
            <div className="lg:col-span-5 flex flex-col sm:flex-row items-center gap-4">
              {/* Pouch Thumbnail */}
              <div className="relative w-36 h-52 rounded-2xl overflow-hidden shadow-md shrink-0 border-2 border-dashed border-emerald-400 flex flex-col justify-center items-center select-none bg-slate-50 p-1">
                <img
                  src="/screen.png"
                  alt="GoodDay Classic Masala Potato Chips"
                  className="w-full h-full object-contain rounded-lg"
                />
                <div className="absolute top-1.5 left-1.5 w-3 h-3 border-t-2 border-l-2 border-emerald-400 z-20 pointer-events-none"></div>
                <div className="absolute top-1.5 right-1.5 w-3 h-3 border-t-2 border-r-2 border-emerald-400 z-20 pointer-events-none"></div>
                <div className="absolute bottom-1.5 left-1.5 w-3 h-3 border-b-2 border-l-2 border-emerald-400 z-20 pointer-events-none"></div>
                <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-b-2 border-r-2 border-emerald-400 z-20 pointer-events-none"></div>
                <div className="absolute inset-x-1.5 top-9 bottom-12 border border-emerald-400/80 bg-emerald-500/10 rounded pointer-events-none z-20"></div>
                <div className="absolute inset-x-2 bottom-2 bg-white/95 backdrop-blur-sm rounded p-1 text-[8px] text-slate-800 leading-tight font-semibold border border-slate-200/80 shadow-sm z-20">
                  <div className="flex justify-between">
                    <span>MRP:</span>
                    <span className="font-bold text-emerald-700">₹ 20.00</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-0.5">
                    <span>Net Wt:</span>
                    <span className="font-bold text-slate-900">52g</span>
                  </div>
                </div>
              </div>
              {/* Detection Pill Badges */}
              <div className="w-full space-y-2">
                <div className="bg-white px-3 py-1.5 rounded-xl border border-emerald-300 text-emerald-600 text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                  <span>✓</span>
                  <span>MRP – Found (₹ 20.00)</span>
                </div>
                <div className="bg-white px-3 py-1.5 rounded-xl border border-emerald-300 text-emerald-600 text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                  <span>✓</span>
                  <span>Net Quantity – Found (52 g)</span>
                </div>
                <div className="bg-white px-3 py-1.5 rounded-xl border border-emerald-300 text-emerald-600 text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                  <span>✓</span>
                  <span>FSSAI License – Found (10012031000312)</span>
                </div>
                <div className="bg-white px-3 py-1.5 rounded-xl border border-emerald-300 text-emerald-600 text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                  <span>✓</span>
                  <span>Batch &amp; Mfg Date – Found (12/05/2025)</span>
                </div>
                <div className="bg-white px-3 py-1.5 rounded-xl border border-emerald-300 text-emerald-600 text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                  <span>✓</span>
                  <span>Ingredients &amp; Nutritional Info – Found</span>
                </div>
              </div>
            </div>
            {/* Column 2: Radial Gauge Compliance Score */}
            <div className="lg:col-span-3 flex flex-col items-center justify-center bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
                Compliance Score
              </h4>
              <div className="relative w-36 h-36 rounded-full bg-emerald-500 flex items-center justify-center shadow-inner">
                <div className="w-28 h-28 bg-white rounded-full flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-slate-900">100%</span>
                  <span className="text-[11px] font-semibold text-emerald-500">Compliant</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 w-full mt-6 text-center">
                <div className="bg-emerald-50 rounded-xl p-2 border border-emerald-100">
                  <div className="text-sm font-bold text-emerald-600">✓ 10</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-medium">Passed</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-2 border border-slate-200">
                  <div className="text-sm font-bold text-slate-600">0</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-medium">Warnings</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-2 border border-slate-200">
                  <div className="text-sm font-bold text-slate-600">0</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-medium">Violations</div>
                </div>
              </div>
            </div>
            {/* Column 3: Inspection Summary Details Table Card */}
            <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between h-full">
              <div>
                <h4 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100">
                  Inspection Summary
                </h4>
                <dl className="text-xs divide-y divide-slate-100 mt-2">
                  <div className="py-2 flex justify-between">
                    <dt className="text-slate-500">Product Name</dt>
                    <dd className="font-semibold text-slate-800">Classic Masala Potato Chips</dd>
                  </div>
                  <div className="py-2 flex justify-between">
                    <dt className="text-slate-500">Net Quantity</dt>
                    <dd className="font-semibold text-slate-800">52 g</dd>
                  </div>
                  <div className="py-2 flex justify-between">
                    <dt className="text-slate-500">MRP</dt>
                    <dd className="font-semibold text-slate-800">₹ 20.00</dd>
                  </div>
                  <div className="py-2 flex justify-between">
                    <dt className="text-slate-500">Manufacturer</dt>
                    <dd className="font-semibold text-slate-800">ITC Limited</dd>
                  </div>
                  <div className="py-2 flex justify-between">
                    <dt className="text-slate-500">FSSAI License</dt>
                    <dd className="font-bold text-emerald-600">10012031000312 (Valid)</dd>
                  </div>
                  <div className="py-2 flex justify-between">
                    <dt className="text-slate-500">Use By</dt>
                    <dd className="font-semibold text-slate-800">11/08/2025</dd>
                  </div>
                </dl>
              </div>
              <div className="pt-4">
                <Link
                  href="/scan/new"
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition flex items-center justify-center gap-1.5 shadow"
                >
                  <span>Try Live Inspection</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FooterBanner() {
  return (
    <footer className="bg-[#0A2540] text-white py-12 border-t border-slate-800" data-purpose="bottom-cta-footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Left Banner Content */}
          <div className="space-y-1.5 text-center md:text-left">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Turn Package Inspection Into an <span className="text-emerald-400">Intelligent Process.</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-400">
              Ensure safer products. Build a more compliant tomorrow.
            </p>
          </div>
          {/* Center CTA Button */}
          <div>
            <Link
              className="inline-flex items-center px-6 py-3 text-xs sm:text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 rounded-full shadow-lg shadow-emerald-500/20 transition duration-150"
              href="/scan/new"
            >
              Start Your First Inspection
              <svg
                className="ml-2 w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
          {/* Right Logo and Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path
                  d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight text-white block leading-none">
                PackIntel
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Safer Products. Smarter Compliance.
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function HomepageView() {
  return (
    <AppShell pageTitle="Home" noPadding>
      <div
        className="bg-[#F8FAFC] text-slate-800 font-sans antialiased overflow-x-hidden"
        style={{ fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif' }}
      >
        <HeroSection />
        <ProblemVsSolutionSection />
        <HowItWorksSection />
        <CapabilitiesSection />
        <FooterBanner />
      </div>
    </AppShell>
  );
}