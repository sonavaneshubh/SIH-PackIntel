'use client';

import React, { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { complianceRules } from '@/lib/constants/complianceRules';

export default function RulesPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRules = complianceRules.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.clause.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppShell pageTitle="Rule Database">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-display-lg-mobile md:text-display-lg font-display-lg text-on-surface">
              Legal Metrology Rule Database
            </h2>
            <span className="text-xs bg-primary/10 text-primary font-semibold px-2.5 py-1 rounded-full border border-primary/20">
              v2.4.1 Active
            </span>
          </div>
          <p className="text-body-base font-body-base text-on-surface-variant mt-1">
            Official codified provisions under Legal Metrology (Packaged Commodities) Rules, 2011 & Amendments.
          </p>
        </div>
      </div>

      {/* Search Filter */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4 mb-6 shadow-xs">
        <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 max-w-md">
          <span className="material-symbols-outlined text-outline mr-2 text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search rules, clauses, penalties..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-xs text-on-surface placeholder:text-outline"
          />
        </div>
      </div>

      {/* Rules Grid */}
      <div className="space-y-4">
        {filteredRules.map((rule) => (
          <div
            key={rule.id}
            className="bg-surface border border-outline-variant rounded-xl p-5 shadow-xs hover:border-primary/50 transition-colors"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-outline-variant pb-3 mb-3">
              <div>
                <span className="text-xs font-mono text-primary font-bold">
                  {rule.id}
                </span>
                <h3 className="text-base font-bold text-on-surface mt-0.5">
                  {rule.name}
                </h3>
              </div>
              <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-0.5 rounded-full font-semibold self-start md:self-auto">
                Mandatory Statutory Clause
              </span>
            </div>

            <p className="text-sm font-semibold text-on-surface mb-2">
              {rule.clause}
            </p>
            <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
              {rule.description}
            </p>

            <div className="bg-surface-container-low p-3 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 text-xs">
              <span className="text-on-surface-variant">
                Standard Statutory Penalty:
              </span>
              <span className="font-semibold text-error font-mono">
                {rule.standardPenalty}
              </span>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
