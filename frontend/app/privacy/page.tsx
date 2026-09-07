"use client";

import React from "react";
import { AppShell } from "@/components/layout/AppShell";

export default function PrivacyPage() {
  return (
    <AppShell pageTitle="Privacy Policy">
      <div className="max-w-3xl bg-surface border border-outline-variant rounded-xl p-4 sm:p-6 md:p-8 shadow-xs">
        <h2 className="text-display-lg font-display-lg text-on-surface mb-4">
          Privacy Policy
        </h2>
        <p className="text-xs text-on-surface-variant mb-6 font-data-tabular">
          Effective Date: August 25, 2026
        </p>
        <div className="space-y-4 text-xs text-on-surface leading-relaxed">
          <p>
            PackIntel is committed to maintaining the confidentiality and
            integrity of product labels, proprietary artwork, and manufacturing
            metadata processed through our compliance intelligence system.
          </p>
          <h3 className="text-sm font-bold text-on-surface mt-4">
            Data Processing
          </h3>
          <p>
            Label images are analyzed transiently for text entity extraction and
            Legal Metrology rule matching. No proprietary recipes or non-public
            manufacturing specifications are stored beyond statutory audit log
            requirements.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
