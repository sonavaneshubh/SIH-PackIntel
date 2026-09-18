import React from 'react';

/**
 * Left promotional panel for the Login Page.
 * Adapted from the actual Home Page hero section (features/home/HomepageView.tsx)
 * so the Login Page visually shares the Home Page's design language:
 * badge, headline, description, CTA styling, package scanning visual and
 * compliance checklist.
 */
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

export function HomeHeroPanel() {
  return (
    <div
      className="relative flex min-h-full w-full flex-col overflow-hidden bg-[#F8FAFC] text-slate-800 antialiased glow-cyan-bg"
      style={{ fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif' }}
    >
      {/* Ambient glows behind content */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-cyan-100/50 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-emerald-50/80 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center px-5 py-6 sm:px-8 lg:py-8 lg:pl-10 lg:pr-4">
        <div className="space-y-5">
          {/* Top Tag Badge — same as Home Page */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-100/80 text-blue-600 text-xs font-semibold tracking-wide shadow-sm">
            <span>AI</span>
            <span className="text-blue-300">•</span>
            <span>OCR</span>
            <span className="text-blue-300">•</span>
            <span>Compliance</span>
            <span className="text-blue-300">•</span>
            <span>Faster</span>
          </div>

          {/* Headline — same as Home Page */}
          <h1 className="text-2xl sm:text-3xl lg:text-[2.5rem] font-extrabold text-slate-900 leading-[1.5] tracking-tight">
            AI-Powered Compliance Inspection for{' '}
            <span className="bg-gradient-to-r from-blue-600 via-[#0EA5A6] to-emerald-500 bg-clip-text text-transparent">
              Packaged Commodities
            </span>
          </h1>

          {/* Subtitle — same as Home Page */}
          <p className="text-slate-600 text-sm sm:text-base lg:text-lg font-normal leading-relaxed max-w-xl">
            Scan packaging with AI. Detect missing declarations, labeling errors and compliance
            risks in seconds.
          </p>

          {/* Action Button — blue styling same as the Home Page "Start Inspection" CTA */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <a
              className="inline-flex items-center justify-center px-6 py-2.5 text-sm sm:text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-full shadow-lg shadow-blue-500/25 transition duration-150"
              href="/#how-it-works"
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 mr-2.5">
                <svg className="w-3 h-3 fill-current ml-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              See How It Works
            </a>
          </div>

          {/* Hero Visual — simulated AI packaging scan (same composition as Home Page) */}
          <div className="relative flex justify-center items-center" data-purpose="hero-scanner-preview">
            <div className="absolute w-72 h-72 sm:w-96 sm:h-96 bg-cyan-100/60 rounded-full blur-3xl -z-10 pointer-events-none"></div>
            <div className="relative w-full max-w-2xl bg-white/70 backdrop-blur-md rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-2xl shadow-slate-200/50">
              {/* Floating AI Status Badge */}
              <div className="mb-3 inline-flex items-center gap-3 bg-blue-50 border border-blue-200 px-5 py-2.5 rounded-xl shadow-sm">
                <span className="flex h-3.5 w-3.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-600"></span>
                </span>
                <span className="text-base font-bold text-blue-900">AI Inspection in Progress...</span>
              </div>
              {/* Scanner Content Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                {/* Chips Package with Bounding Box Overlay */}
                <div className="relative rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center justify-center h-40 sm:h-52 border-2 border-dashed border-emerald-400/80 group select-none bg-slate-50">
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
    </div>
  );
}