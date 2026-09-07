'use client';

import React, { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';

export default function SettingsPage() {
  const [confidenceThreshold, setConfidenceThreshold] = useState(85);
  const [autoVerifyPass, setAutoVerifyPass] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <AppShell pageTitle="Settings">
      <div className="mb-6">
        <h2 className="text-display-lg-mobile md:text-display-lg font-display-lg text-on-surface mb-2">
          Engine Settings & Regulatory Rules
        </h2>
        <p className="text-body-base font-body-base text-on-surface-variant">
          Configure OCR sensitivity, minimum confidence thresholds, and compliance rule triggers.
        </p>
      </div>

      <div className="max-w-3xl space-y-6">
        <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-xs">
          <h3 className="text-headline-md font-headline-md text-on-surface mb-4">
            AI Inference & Confidence Thresholds
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-label-bold uppercase text-on-surface">
                  Minimum Confidence for Automatic Pass: {confidenceThreshold}%
                </label>
              </div>
              <input
                type="range"
                min="70"
                max="98"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                className="w-full h-2 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <p className="text-xs text-on-surface-variant mt-1">
                Fields recognized below {confidenceThreshold}% confidence will automatically trigger an Amber Review requirement.
              </p>
            </div>

            <div className="pt-3 border-t border-outline-variant">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoVerifyPass}
                  onChange={(e) => setAutoVerifyPass(e.target.checked)}
                  className="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary bg-surface-container-lowest"
                />
                <div>
                  <p className="text-xs font-semibold text-on-surface">
                    Auto-Certify 100% High-Confidence Scans
                  </p>
                  <p className="text-[11px] text-on-surface-variant">
                    Automatically generate dispatch clearance for labels with all 7 statutory fields &gt;95% confidence.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-xs">
          <h3 className="text-headline-md font-headline-md text-on-surface mb-4">
            Stitch MCP & Platform Integration
          </h3>
          <div className="space-y-3 text-xs text-on-surface-variant">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 py-2 border-b border-outline-variant/60">
              <span className="font-medium text-on-surface shrink-0">Design System Source</span>
              <span className="font-mono text-primary break-all">Google Stitch MCP (Project: 6874572683199449301)</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 py-2 border-b border-outline-variant/60">
              <span className="font-medium text-on-surface shrink-0">Active Color Theme</span>
              <span>Regulatory Integrity Interface (#1A73E8 / #005BBF)</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 py-2 border-b border-outline-variant/60">
              <span className="font-medium text-on-surface shrink-0">Typography Engine</span>
              <span>Google Inter • Enterprise Density</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 py-2">
              <span className="font-medium text-on-surface shrink-0">Rule Codification</span>
              <span>Legal Metrology (Packaged Commodities) Act, 2011</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="primary" onClick={handleSave}>
            {saved ? 'Settings Saved Successfully!' : 'Save Configuration'}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
