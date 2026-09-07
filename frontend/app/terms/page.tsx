"use client";

import React from "react";
import { AppShell } from "@/components/layout/AppShell";

export default function TermsPage() {
  return (
    <AppShell pageTitle="Terms of Service">
      <div className="max-w-3xl bg-surface border border-outline-variant rounded-xl p-4 sm:p-6 md:p-8 shadow-xs">
        <h2 className="text-display-lg font-display-lg text-on-surface mb-4">
          Terms of Service
        </h2>
        <p className="text-xs text-on-surface-variant mb-6 font-data-tabular">
          Effective Date: August 25, 2026
        </p>
        <div className="space-y-4 text-xs text-on-surface leading-relaxed">
          <p>
            By using PackIntel, you acknowledge that AI-assisted screenings
            serve as decision-support tooling and do not replace formal
            statutory adjudications by appointed Controllers of Legal Metrology.
          </p>
          <h3 className="text-sm font-bold text-on-surface mt-4">
            Statutory Disclaimers
          </h3>
          <p>
            The rule engine matches codified standards under the Legal Metrology
            Act, 2009 and the Legal Metrology (Packaged Commodities) Rules,
            2011. Users remain responsible for packaging veracity.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
