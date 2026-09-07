'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { complianceRules } from '@/lib/constants/complianceRules';
import { ComplianceRule } from '@/types/compliance';

export default function RulesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [rules, setRules] = useState<ComplianceRule[]>(complianceRules);
  const [filterApplicability, setFilterApplicability] = useState<string>('all');

  useEffect(() => {
    // Attempt live fetch from backend API, fallback to codified constants
    fetch('http://localhost:5000/api/compliance/rules')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped: ComplianceRule[] = data.map((d: any) => ({
            id: d.rule_id,
            name: d.rule_name,
            clause: d.legal_reference,
            legal_reference: d.legal_reference,
            requirement: d.requirement,
            mandatory: d.severity === 'mandatory',
            applicability: d.applicability,
            standardPenalty: d.severity === 'mandatory' ? 'Section 36(1) Notice / Fine up to ₹25,000' : 'Section 36(1) Compliance Review',
            description: d.description,
            source: d.source,
            version: d.version,
            effective_from: d.effective_from,
          }));
          setRules(mapped);
        }
      })
      .catch(() => {
        // Fallback already set to complianceRules
      });
  }, []);

  const filteredRules = rules.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.clause.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesApplicability =
      filterApplicability === 'all' ||
      (filterApplicability === 'mandatory' && r.mandatory) ||
      (filterApplicability === 'conditional' && !r.mandatory) ||
      r.applicability === filterApplicability;

    return matchesSearch && matchesApplicability;
  });

  return (
    <AppShell pageTitle="Legal Metrology Rule Database">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-display-lg-mobile md:text-display-lg font-display-lg text-on-surface">
              Legal Metrology Rule Database
            </h2>
            <span className="text-xs bg-primary/10 text-primary font-semibold px-2.5 py-1 rounded-full border border-primary/20">
              15 Codified Rules · Active
            </span>
          </div>
          <p className="text-body-base font-body-base text-on-surface-variant mt-1">
            Official statutory provisions under the Legal Metrology (Packaged Commodities) Rules, 2011 & Gazette Amendments.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4 mb-6 shadow-xs flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 flex-1 max-w-md">
          <span className="material-symbols-outlined text-outline mr-2 text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search rule ID, sub-rule, commodity, penalty..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-xs text-on-surface placeholder:text-outline"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterApplicability('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterApplicability === 'all'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            All Rules ({rules.length})
          </button>
          <button
            onClick={() => setFilterApplicability('mandatory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterApplicability === 'mandatory'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            Mandatory
          </button>
          <button
            onClick={() => setFilterApplicability('conditional')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterApplicability === 'conditional'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            Conditional
          </button>
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
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    rule.mandatory
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {rule.mandatory ? 'Mandatory Statutory Clause' : 'Conditional Requirement'}
                </span>
                {rule.applicability && rule.applicability !== 'all' && (
                  <span className="text-xs bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-md font-mono uppercase">
                    {rule.applicability}
                  </span>
                )}
              </div>
            </div>

            <p className="text-sm font-semibold text-primary/90 mb-1">
              {rule.legal_reference || rule.clause}
            </p>
            {rule.requirement && (
              <p className="text-xs font-medium text-on-surface mb-2">
                <strong>Requirement:</strong> {rule.requirement}
              </p>
            )}
            <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
              {rule.description}
            </p>

            <div className="bg-surface-container-low p-3 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 text-xs">
            <div className="bg-surface-container-low p-3 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
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
