'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge, RiskBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase/client';
import { Inspection } from '@/types/database';

interface HistoryInspection extends Inspection {
  display_status: 'PASS' | 'REVIEW' | 'FAIL' | 'DRAFT';
  display_risk_level: 'LOW' | 'HIGH' | 'CRITICAL';
}

export default function HistoryPage() {
  const [inspections, setInspections] = useState<HistoryInspection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PASS' | 'REVIEW' | 'FAIL'>('ALL');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const fetchInspections = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('inspections')
          .select(`
            *,
            compliance_results (result)
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const mapped = (data || []).map(insp => ({
          ...insp,
          display_status: (insp.overall_result?.toUpperCase() as 'PASS' | 'REVIEW' | 'FAIL' | 'DRAFT') || 'DRAFT',
          display_risk_level: (insp.risk_score ?? 0) >= 76 ? 'CRITICAL' : (insp.risk_score ?? 0) >= 51 ? 'HIGH' : 'LOW',
        }));

        setInspections(mapped);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInspections();
  }, [reloadKey]);

  const filtered = inspections.filter(s => {
    const matchesSearch =
      s.inspection_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.manufacturer_name || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || s.display_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <AppShell pageTitle="Scan History">
        <HistorySkeleton />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell pageTitle="Scan History">
        <div className="max-w-md mx-auto text-center py-12">
          <span className="material-symbols-outlined text-6xl text-error mb-4">error</span>
          <h2 className="text-headline-lg font-headline-lg text-on-surface mb-2">Failed to Load History</h2>
          <p className="text-body-base text-on-surface-variant mb-6">{error}</p>
          <Button variant="primary" onClick={() => setReloadKey((k) => k + 1)}>Retry</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="Scan History">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-display-lg-mobile md:text-display-lg font-display-lg text-on-surface mb-2">
            Scan History
          </h2>
          <p className="text-body-base font-body-base text-on-surface-variant">
            Archive of all compliance audits conducted.
          </p>
        </div>
        <Link href="/scan/new">
          <Button variant="primary" icon="add">New Scan</Button>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4 mb-6 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 w-full md:w-80">
          <span className="material-symbols-outlined text-outline mr-2 text-[18px]">search</span>
          <input
            type="text"
            placeholder="Search by ID, product, brand..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-xs text-on-surface placeholder:text-outline"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(['ALL', 'FAIL', 'REVIEW', 'PASS'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-label-bold font-semibold transition-all ${statusFilter === st
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                }`}
            >
              {st === 'ALL' ? 'All' : st === 'FAIL' ? 'Non-Compliant' : st === 'REVIEW' ? 'Needs Review' : 'Compliant'}
            </button>
          ))}
        </div>
      </div>

      {/* History Table */}
      <div className="bg-surface border border-outline-variant rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-bright border-b border-outline-variant text-label-bold font-label-bold text-on-surface-variant uppercase tracking-wider text-xs">
                <th className="py-3.5 px-4 w-44">Inspection ID</th>
                <th className="py-3.5 px-4">Product Name</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4 w-32">Date</th>
                <th className="py-3.5 px-4 w-36">Status</th>
                <th className="py-3.5 px-4 w-28 text-center">Risk Score</th>
                <th className="py-3.5 px-4 w-28 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="text-body-base font-body-base text-on-surface divide-y divide-outline-variant/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-body-base text-on-surface-variant">
                    {searchTerm || statusFilter !== 'ALL'
                      ? 'No matching inspections found.'
                      : 'No inspections yet. Start your first scan to see history.'}
                  </td>
                </tr>
              ) : (
                filtered.map((scan) => (
                  <tr key={scan.id} className="hover:bg-surface-container-lowest transition-colors h-14">
                    <td className="py-2 px-4 font-data-tabular text-on-surface-variant font-medium text-xs">
                      {scan.inspection_number}
                    </td>
                    <td className="py-2 px-4">
                      <p className="font-semibold text-xs text-on-surface">{scan.product_name || 'Unknown Product'}</p>
                      <p className="text-[11px] text-on-surface-variant">{scan.manufacturer_name || 'Manufacturer not specified'}</p>
                    </td>
                    <td className="py-2 px-4 text-xs text-on-surface-variant">{scan.product_category || 'N/A'}</td>
                    <td className="py-2 px-4 font-data-tabular text-on-surface-variant text-xs">
                      {new Date(scan.created_at || Date.now()).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-2 px-4">
                      <StatusBadge
                        status={
                          scan.display_status === "PASS"
                            ? "good"
                            : scan.display_status === "FAIL"
                              ? "error"
                              : scan.display_status === "REVIEW"
                                ? "warning"
                                : "pending"
                        }
                      />
                    </td>
                    <td className="py-2 px-4 text-center">
                      <RiskBadge
                        score={scan.risk_score ?? (scan.display_status === 'FAIL' ? 85 : scan.display_status === 'REVIEW' ? 50 : 10)}
                        level={scan.display_risk_level}
                      />
                    </td>
                    <td className="py-2 px-4 text-center">
                      <Link
                        href={`/results?inspection=${scan.id}`}
                        className="text-primary hover:underline text-label-bold font-label-bold text-xs"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function HistorySkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <div className="h-7 w-48 rounded bg-slate-200" />
          <div className="mt-2 h-4 w-72 max-w-full rounded bg-slate-200/70" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-slate-200" />
      </div>

      <div className="bg-surface border border-outline-variant rounded-xl p-4 mb-6 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 w-full md:w-80">
          <div className="h-4 w-full rounded bg-slate-200" />
        </div>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-24 rounded-lg bg-slate-200" />
          ))}
        </div>
      </div>

      <div className="bg-surface border border-outline-variant rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-bright border-b border-outline-variant">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <th key={i} className="py-3.5 px-4">
                    <div className="h-3 w-16 rounded bg-slate-200" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60">
              {Array.from({ length: 6 }).map((_, row) => (
                <tr key={row}>
                  {[0, 1, 2, 3, 4, 5, 6].map((col) => (
                    <td key={col} className="py-4 px-4">
                      <div className="h-4 w-20 max-w-full rounded bg-slate-200/80" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}