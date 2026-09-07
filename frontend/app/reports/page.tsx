'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/Badge';
import { getMyComplianceReports } from '@/lib/supabase/inspectionService';
import { buildComplianceReportRow, generateComplianceReport } from '@/lib/reporting';
import { ComplianceReportSummary, JoinedInspection } from '@/types/report';
import { cn } from '@/lib/utils';

function formatDate(value: string): string {
  if (!value) return 'N/A';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function ReportsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ComplianceReportSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await getMyComplianceReports();
      if (fetchError) throw new Error(fetchError);
      setRows((data as JoinedInspection[]).map(buildComplianceReportRow));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load compliance reports. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.title,
        row.reportId,
        row.inspectionId,
        row.product.name,
        row.product.manufacturer,
        row.product.brand,
        row.product.batchNumber,
        row.product.id,
        row.scanReference,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return haystack.some((value) => value.includes(q));
    });
  }, [rows, searchTerm]);

  const handleDownload = async (row: ComplianceReportSummary) => {
    setDownloadingId(row.inspectionId);
    setDownloadError(null);
    setDownloadMessage(null);
    try {
      const result = await generateComplianceReport(row.inspectionId);
      if (result.error || !result.downloadUrl) {
        throw new Error(result.error || 'Report generation did not return a download URL.');
      }
      const anchor = document.createElement('a');
      anchor.href = result.downloadUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setDownloadMessage(
        `Report ${result.reportId} generated for ${row.product.name || 'this product'}. If the download did not start, use the View action and pick Download PDF.`
      );
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : 'Failed to generate the compliance report.'
      );
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <AppShell pageTitle="Compliance Reports">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-display-lg-mobile md:text-display-lg font-display-lg text-on-surface mb-2">
            Compliance &amp; Inspection Reports
          </h2>
          <p className="text-body-base font-body-base text-on-surface-variant">
            Reports are generated automatically from your real scan and inspection records.
          </p>
        </div>
        <Button variant="primary" icon="qr_code_scanner" onClick={() => router.push('/scan/new')}>
          New Scan
        </Button>
      </div>

      {/* Search */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4 mb-6 shadow-xs">
        <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 w-full">
          <span className="material-symbols-outlined text-outline mr-2 text-[18px]">search</span>
          <input
            type="text"
            placeholder="Search company, product, product ID, brand, batch, scan ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-xs text-on-surface placeholder:text-outline"
            aria-label="Search compliance reports"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="p-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Status/feedback banners */}
      {downloadMessage && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{downloadMessage}</span>
        </div>
      )}
      {downloadError && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <span>{downloadError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant bg-surface">
          <span className="material-symbols-outlined animate-spin text-4xl text-primary">
            autorenew
          </span>
          <p className="text-sm font-medium text-on-surface-variant">
            Loading compliance reports...
          </p>
        </div>
      ) : error ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-outline-variant bg-surface px-6 py-12 text-center">
          <span className="material-symbols-outlined text-5xl text-error">error</span>
          <div>
            <p className="text-sm font-bold text-on-surface">
              Unable to load compliance reports.
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">{error}</p>
          </div>
          <Button variant="primary" icon="refresh" onClick={() => void loadReports()}>
            Try Again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-outline-variant bg-surface">
          <EmptyState
            icon="description"
            title="No compliance reports available."
            description="Run a scan to generate your first compliance report. Each scan produces a real, data-driven report."
            action={
              <Button variant="primary" icon="qr_code_scanner" onClick={() => router.push('/scan/new')}>
                Start a Scan
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-outline-variant bg-surface">
          <EmptyState
            icon="search_off"
            title="No matching compliance reports"
            description="No reports match your search. Try a different company, product, batch or ID."
          />
        </div>
      ) : (
        <div className="bg-surface border border-outline-variant rounded-xl shadow-xs overflow-hidden">
          {/* Desktop / tablet table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-bright border-b border-outline-variant text-label-bold font-label-bold text-on-surface-variant uppercase tracking-wider text-xs">
                  <th className="py-3.5 px-4 min-w-[280px]">Report Title</th>
                  <th className="py-3.5 px-4 w-40">Report ID</th>
                  <th className="py-3.5 px-4 w-36">Period / Date</th>
                  <th className="py-3.5 px-4 w-32">Format</th>
                  <th className="py-3.5 px-4 w-40">Scan</th>
                  <th className="py-3.5 px-4 w-[190px]">Action</th>
                </tr>
              </thead>
              <tbody className="text-body-base font-body-base text-on-surface divide-y divide-outline-variant/60">
                {filtered.map((row) => (
                  <tr key={row.inspectionId} className="align-top hover:bg-surface-container-lowest transition-colors">
                    <td className="py-3 px-4">
                      <p className="text-xs font-semibold leading-snug text-on-surface break-words">
                        {row.title}
                      </p>
                      <p className="mt-1 text-[11px] text-on-surface-variant break-words">
                        {[row.product.brand, row.product.batchNumber]
                          .filter(Boolean)
                          .join(' · ') || 'No brand / batch detected'}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs text-on-surface-variant break-all">
                        {row.reportId}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-data-tabular text-xs text-on-surface-variant">
                      {formatDate(row.date)}
                    </td>
                    <td className="py-3 px-4 text-xs text-on-surface-variant">{row.format}</td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] text-on-surface-variant break-all">
                        Scan {row.scanReference}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-on-surface-variant">
                        {row.imageCount} image{row.imageCount === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          icon="visibility"
                          onClick={() =>
                            router.push(`/results?inspection=${encodeURIComponent(row.inspectionId)}`)
                          }
                        >
                          View
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          icon="download"
                          disabled={downloadingId === row.inspectionId}
                          onClick={() => void handleDownload(row)}
                        >
                          {downloadingId === row.inspectionId ? 'Generating...' : 'Download'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet card list */}
          <div className="divide-y divide-outline-variant/60 lg:hidden">
            {filtered.map((row) => (
              <div key={row.inspectionId} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug text-on-surface break-words">
                      {row.title}
                    </p>
                    <p className="mt-1 text-[11px] text-on-surface-variant font-mono break-all">
                      {row.reportId} · {row.scanReference}
                    </p>
                  </div>
                  <StatusBadge
                    status={
                      row.compliance.status === 'PASS'
                        ? 'PASS'
                        : row.compliance.status === 'FAIL'
                          ? 'FAIL'
                          : row.compliance.status === 'REVIEW'
                            ? 'REVIEW'
                            : 'DRAFT'
                    }
                    className="shrink-0"
                  >
                    {row.compliance.status}
                  </StatusBadge>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                  <span>
                    Date: <strong className="text-on-surface">{formatDate(row.date)}</strong>
                  </span>
                  <span>
                    Format: <strong className="text-on-surface">{row.format}</strong>
                  </span>
                  <span>
                    Images: <strong className="text-on-surface">{row.imageCount}</strong>
                  </span>
                </div>

                {row.product.brand && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                    <span>Brand: {row.product.brand}</span>
                    {row.product.batchNumber && <span>Batch: {row.product.batchNumber}</span>}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 border-t border-outline-variant/60">
                  <Button
                    variant="outline"
                    size="sm"
                    icon="visibility"
                    className="flex-1"
                    onClick={() =>
                      router.push(`/results?inspection=${encodeURIComponent(row.inspectionId)}`)
                    }
                  >
                    View
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon="download"
                    className="flex-1"
                    disabled={downloadingId === row.inspectionId}
                    onClick={() => void handleDownload(row)}
                  >
                    {downloadingId === row.inspectionId ? 'Generating...' : 'Download'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}