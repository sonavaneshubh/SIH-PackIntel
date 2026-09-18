'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  SampleDeclaration,
  SampleInspection,
  SampleRuleResult,
  demoNotice,
  sampleInspections,
} from '@/features/evaluation/sampleData';

type DemoTabId = 'dashboard' | 'scan' | 'compliance' | 'history' | 'reports';

const TABS: Array<{ id: DemoTabId; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'scan', label: 'Scan', icon: 'center_focus_strong' },
  { id: 'compliance', label: 'Compliance', icon: 'rule' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'reports', label: 'Reports & Evidence', icon: 'description' },
];

function priorityOf(risk: number): { label: string; classes: string } {
  if (risk >= 70) return { label: 'CRITICAL', classes: 'bg-[#FEE2E2] text-[#B91C1C]' };
  if (risk >= 40) return { label: 'HIGH', classes: 'bg-[#FEF3C7] text-[#B45309]' };
  if (risk >= 20) return { label: 'MEDIUM', classes: 'bg-[#E0F2FE] text-[#0369A1]' };
  return { label: 'LOW', classes: 'bg-[#DCFCE7] text-[#15803D]' };
}

function ResultBadge({ result }: { result: SampleRuleResult['result'] }) {
  const map: Record<SampleRuleResult['result'], string> = {
    pass: 'bg-[#DCFCE7] text-[#15803D]',
    fail: 'bg-[#FEE2E2] text-[#B91C1C]',
    warning: 'bg-[#FEF3C7] text-[#B45309]',
    not_applicable: 'bg-[#E2E8F0] text-[#475569]',
  };
  const label = result === 'not_applicable' ? 'N/A' : result.toUpperCase();
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${map[result]}`}>
      {label}
    </span>
  );
}

function OverallBadge({ result, status }: { result: SampleInspection['overall_result']; status: SampleInspection['status'] }) {
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#E0F2FE] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0369A1]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0369A1]" />
        Processing
      </span>
    );
  }
  const map: Record<string, string> = {
    pass: 'bg-[#DCFCE7] text-[#15803D]',
    fail: 'bg-[#FEE2E2] text-[#B91C1C]',
    review: 'bg-[#FEF3C7] text-[#B45309]',
  };
  const label = { pass: 'PASS', fail: 'FAIL', review: 'REVIEW' }[result];
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${map[result]}`}>{label}</span>;
}

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1677FF] to-[#00BFA6] text-white">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      <div>
        <h2 className="text-base font-extrabold tracking-tight text-[#0F172A]">{title}</h2>
        {subtitle && <p className="text-xs text-[#64748B]">{subtitle}</p>}
      </div>
    </div>
  );
}

const kpiCardBase =
  'rounded-2xl border border-[#E6EEF8] bg-white p-4 shadow-sm sm:p-5';

function KpiCards() {
  const completed = sampleInspections.filter((i) => i.status === 'completed');
  const pass = completed.filter((i) => i.overall_result === 'pass').length;
  const fail = completed.filter((i) => i.overall_result === 'fail').length;
  const review = completed.filter((i) => i.overall_result === 'review').length;
  const avgRisk = Math.round((completed.reduce((s, i) => s + i.risk_score, 0) / completed.length) * 10) / 10;
  const avgCompliance = Math.round(completed.reduce((s, i) => s + i.compliance_score, 0) / completed.length);

  const items = [
    { label: 'Total Inspections', value: String(sampleInspections.length), icon: 'fact_check', tint: 'text-[#1677FF] bg-[#EAF3FF]' },
    { label: 'Compliant', value: String(pass), icon: 'check_circle', tint: 'text-[#15803D] bg-[#E7F8EF]' },
    { label: 'Needs Review', value: String(review), icon: 'feedback', tint: 'text-[#B45309] bg-[#FFF4DB]' },
    { label: 'Non-Compliant', value: String(fail), icon: 'cancel', tint: 'text-[#B91C1C] bg-[#FEE9E9]' },
    { label: 'Avg Risk Score', value: `${avgRisk}%`, icon: 'speed', tint: 'text-[#0369A1] bg-[#E0F2FE]' },
    { label: 'Avg Compliance', value: `${avgCompliance}%`, icon: 'verified', tint: 'text-[#00A98F] bg-[#E6FAF6]' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
      {items.map((item, idx) => (
        <div key={idx} className={kpiCardBase}>
          <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${item.tint}`}>
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
          </div>
          <p className="text-xl font-extrabold tracking-tight text-[#0F172A] sm:text-2xl">{item.value}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-[#64748B]">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function RecentInspectionsTable({ inspections }: { inspections: SampleInspection[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E6EEF8] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#E6EEF8] bg-[#F8FBFE] text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              <th className="px-4 py-3">Inspection</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Inspected</th>
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Compliance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFF4FA]">
            {inspections.slice(0, 5).map((i) => {
              const p = priorityOf(i.risk_score);
              return (
                <tr key={i.inspection_number} className="transition-colors hover:bg-[#FAFCFF]">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-[#1677FF]">{i.inspection_number}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#0F172A]">{i.brand_name} {i.product_name}</p>
                    <p className="text-[11px] text-[#64748B]">{i.product_category}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#475569]">{new Date(i.inspected_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-3"><OverallBadge result={i.overall_result} status={i.status} /></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${p.classes}`}>{p.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#E6EEF8]">
                        <div
                          className={`h-full rounded-full ${i.compliance_score >= 80 ? 'bg-[#16A34A]' : i.compliance_score >= 60 ? 'bg-[#F59E0B]' : 'bg-[#DC2626]'}`}
                          style={{ width: `${i.compliance_score || 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-[#0F172A]">{i.status === 'processing' ? '—' : `${i.compliance_score}%`}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Scan tab ────────────────────────────────────────────────────────────────
const SCAN_STAGES = [
  'Uploading package image…',
  'Running OCR (Tesseract + Vision)…',
  'Extracting declaration fields…',
  'Applying Legal Metrology Rules 2011…',
  'Computing compliance & risk score…',
];

function ScanTab() {
  const [selectedId, setSelectedId] = useState(sampleInspections[0].inspection_number);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [stageIndex, setStageIndex] = useState(0);
  const timersRef = useRef<number[]>([]);

  const current = sampleInspections.find((i) => i.inspection_number === selectedId) ?? sampleInspections[0];
  const scanFinished = phase === 'done';

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const startScan = () => {
    clearTimers();
    setPhase('running');
    setStageIndex(0);
    SCAN_STAGES.forEach((_, idx) => {
      timersRef.current.push(
        window.setTimeout(() => setStageIndex(idx), idx * 900)
      );
    });
    timersRef.current.push(
      window.setTimeout(() => setPhase('done'), SCAN_STAGES.length * 900 + 400)
    );
  };

  const progress = Math.round(((stageIndex + (scanFinished ? 1 : 0)) / SCAN_STAGES.length) * 100);

  return (
    <div className="space-y-5">
      <SectionHeader icon="center_focus_strong" title="AI Scan Simulation" subtitle="Select a sample product and run the pipeline locally." />

      <div className="flex flex-wrap gap-2">
        {sampleInspections.map((i) => (
          <button
            key={i.inspection_number}
            type="button"
            onClick={() => {
              setSelectedId(i.inspection_number);
              setPhase('idle');
              setStageIndex(0);
            }}
            className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedId === i.inspection_number
                ? 'border-[#1677FF] bg-[#1677FF] text-white shadow-sm'
                : 'border-[#DCE9FF] bg-white text-[#475569] hover:border-[#1677FF] hover:text-[#1677FF]'
            }`}
          >
            {i.inspection_number} · {i.brand_name}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E6EEF8] bg-white shadow-sm">
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-2">
          {/* Image pane */}
          <div className="relative flex flex-col items-center justify-center bg-[#F8FBFE] p-6">
            <div className="relative w-full max-w-[300px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.label_image}
                alt={`Sample package image for ${current.product_name}`}
                className={`w-full rounded-2xl border border-[#E6EEF8] bg-white object-contain transition-opacity ${phase === 'running' ? 'opacity-80' : 'opacity-100'}`}
              />
              {phase === 'running' && (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-pulse bg-gradient-to-r from-transparent via-[#1677FF] to-transparent" />
              )}
            </div>
            <p className="mt-3 text-[11px] font-medium text-[#64748B]">
              Sample image on record · {current.product_category} · {current.is_imported ? 'Imported' : 'Domestic'}
            </p>
          </div>

          {/* Pipeline pane */}
          <div className="border-t border-[#E6EEF8] p-6 lg:border-l lg:border-t-0">
            {phase === 'idle' && (
              <div className="flex h-full flex-col gap-4">
                <div className="rounded-xl border border-[#DCE9FF] bg-[#F5F9FF] px-4 py-3 text-sm text-[#475569]">
                  <span className="font-bold text-[#0F172A]">{current.inspection_number}</span> · {current.brand_name}{' '}
                  {current.product_name} · {current.net_quantity}
                </div>
                <button
                  type="button"
                  onClick={startScan}
                  className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-transparent bg-gradient-to-r from-[#1677FF] to-[#0D5FD6] px-6 text-sm font-bold tracking-wide text-white shadow-lg shadow-blue-500/25 transition duration-150 hover:brightness-105"
                >
                  <span className="material-symbols-outlined text-[18px]">scan</span>
                  Start AI Scan
                </button>
                <p className="text-xs leading-relaxed text-[#94A3B8]">
                  Runs OCR, declaration extraction, and the Legal Metrology compliance engine against the selected sample
                  — fully local, nothing is saved.
                </p>
              </div>
            )}

            {phase === 'running' && (
              <div className="flex h-full flex-col justify-center gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1677FF]/20 border-t-[#1677FF]" />
                  Analyzing {current.brand_name} {current.product_name}…
                </div>
                <div className="space-y-2">
                  {SCAN_STAGES.map((step, idx) => (
                    <div
                      key={step}
                      className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors ${
                        idx < stageIndex || scanFinished
                          ? 'bg-[#E7F8EF] text-[#15803D]'
                          : idx === stageIndex
                          ? 'bg-[#EAF3FF] text-[#1677FF] font-semibold'
                          : 'text-[#94A3B8]'
                      }`}
                    >
                      <span className="material-symbols-outlined shrink-0 text-[16px]">
                        {idx < stageIndex || scanFinished ? 'check_circle' : idx === stageIndex ? 'sync' : 'circle'}
                      </span>
                      {step}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-[11px] font-bold text-[#64748B]">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E6EEF8]">
                    <div className="h-full rounded-full bg-[#1677FF] transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>
            )}

            {phase === 'done' && (
              <div className="flex h-full flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-[#1677FF]">fact_check</span>
                    <span className="text-sm font-extrabold text-[#0F172A]">Scan Complete</span>
                  </div>
                  <OverallBadge result={current.overall_result} status={current.status} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[#E6EEF8] bg-[#F8FBFE] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Compliance Score</p>
                    <p className="text-lg font-extrabold text-[#0F172A]">{current.compliance_score}%</p>
                  </div>
                  <div className="rounded-xl border border-[#E6EEF8] bg-[#F8FBFE] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Risk Score</p>
                    <p className="text-lg font-extrabold text-[#0F172A]">{current.risk_score}%</p>
                  </div>
                  <div className="rounded-xl border border-[#E6EEF8] bg-[#F8FBFE] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Fields Extracted</p>
                    <p className="text-lg font-extrabold text-[#0F172A]">{current.declarations.length}</p>
                  </div>
                  <div className="rounded-xl border border-[#E6EEF8] bg-[#F8FBFE] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">OCR Confidence</p>
                    <p className="text-lg font-extrabold text-[#0F172A]">{current.ocr_confidence || '—'}%</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startScan}
                  className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#DCE9FF] bg-white px-6 text-xs font-bold text-[#1677FF] transition-colors hover:bg-[#F5F9FF]"
                >
                  <span className="material-symbols-outlined text-[16px]">replay</span>
                  Re-run scan
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {phase === 'done' && <DeclarationsPanel inspection={current} />}
    </div>
  );
}

function DeclarationsPanel({ inspection }: { inspection: SampleInspection }) {
  if (!inspection.declarations.length) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E6EEF8] bg-white shadow-sm">
      <div className="border-b border-[#E6EEF8] bg-[#F8FBFE] px-4 py-3 text-sm font-bold text-[#0F172A]">
        Extracted Declarations
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#E6EEF8] text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              <th className="px-4 py-2.5">Field</th>
              <th className="px-4 py-2.5">Extracted Value</th>
              <th className="px-4 py-2.5">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFF4FA]">
            {inspection.declarations.map((d: SampleDeclaration, idx: number) => (
              <tr key={idx} className="hover:bg-[#FAFCFF]">
                <td className="px-4 py-2.5 text-xs font-semibold text-[#0F172A]">{d.label}</td>
                <td className="px-4 py-2.5 text-xs text-[#475569]">{d.value || <span className="italic text-[#B91C1C]">Not found</span>}</td>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs font-bold text-[#1677FF]">{d.confidence ? `${d.confidence}%` : '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Compliance tab ──────────────────────────────────────────────────────────
function ComplianceTab() {
  const [selectedId, setSelectedId] = useState(sampleInspections[0].inspection_number);
  const current = sampleInspections.find((i) => i.inspection_number === selectedId) ?? sampleInspections[0];

  const stats = useMemo(() => {
    const counts = { pass: 0, fail: 0, warning: 0, not_applicable: 0 };
    current.rules.forEach((r) => {
      counts[r.result] += 1;
    });
    return counts;
  }, [current]);

  const statTiles = [
    { label: 'Pass', value: stats.pass, classes: 'text-[#15803D]', bg: 'bg-[#E7F8EF]' },
    { label: 'Fail', value: stats.fail, classes: 'text-[#B91C1C]', bg: 'bg-[#FEE9E9]' },
    { label: 'Warning', value: stats.warning, classes: 'text-[#B45309]', bg: 'bg-[#FFF4DB]' },
    { label: 'N/A', value: stats.not_applicable, classes: 'text-[#475569]', bg: 'bg-[#E2E8F0]' },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader icon="rule" title="Legal Metrology Compliance Engine" subtitle="Rules from the Legal Metrology (Packaged Commodities) Rules, 2011 — evaluated per inspection." />

      <div className="flex flex-wrap gap-2">
        {sampleInspections.filter((i) => i.status === 'completed').map((i) => (
          <button
            key={i.inspection_number}
            type="button"
            onClick={() => setSelectedId(i.inspection_number)}
            className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedId === i.inspection_number
                ? 'border-[#1677FF] bg-[#1677FF] text-white shadow-sm'
                : 'border-[#DCE9FF] bg-white text-[#475569] hover:border-[#1677FF] hover:text-[#1677FF]'
            }`}
          >
            {i.inspection_number} · {i.brand_name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statTiles.map((s) => (
          <div key={s.label} className={kpiCardBase}>
            <p className={`text-2xl font-extrabold ${s.classes}`}>{s.value}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-[#64748B]">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E6EEF8] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6EEF8] bg-[#F8FBFE] px-4 py-3">
          <div>
            <p className="text-sm font-bold text-[#0F172A]">{current.inspection_number} · {current.brand_name} {current.product_name}</p>
            <p className="text-[11px] text-[#64748B]">Compliance {current.compliance_score}% · Risk {current.risk_score}% · OCR {current.ocr_confidence}%</p>
          </div>
          <OverallBadge result={current.overall_result} status={current.status} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E6EEF8] text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                <th className="px-4 py-2.5">Rule</th>
                <th className="px-4 py-2.5">Result</th>
                <th className="px-4 py-2.5">Extracted Value</th>
                <th className="px-4 py-2.5">Explanation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFF4FA]">
              {current.rules.map((r) => (
                <tr key={r.rule_code} className="align-top hover:bg-[#FAFCFF]">
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-bold text-[#1677FF]">{r.rule_code}</p>
                    <p className="mt-0.5 max-w-[260px] text-xs font-semibold text-[#0F172A]">{r.rule_name}</p>
                  </td>
                  <td className="px-4 py-3"><ResultBadge result={r.result} /></td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-xs text-[#475569]">{r.extracted_value ?? <span className="italic text-[#94A3B8]">—</span>}</td>
                  <td className="max-w-[320px] px-4 py-3 text-xs leading-relaxed text-[#475569]">{r.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Reports & Evidence tab ──────────────────────────────────────────────────
function ReportsTab() {
  const [preview, setPreview] = useState<SampleInspection | null>(null);

  return (
    <div className="space-y-5">
      <SectionHeader icon="description" title="Reports & Evidence" subtitle="Generated deliverables for each completed sample inspection." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sampleInspections.filter((i) => i.status === 'completed').map((i) => (
          <div key={i.inspection_number} className="overflow-hidden rounded-2xl border border-[#E6EEF8] bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-[#E6EEF8] bg-[#F8FBFE] px-4 py-3">
              <p className="font-mono text-xs font-bold text-[#1677FF]">{i.inspection_number}</p>
              <OverallBadge result={i.overall_result} status={i.status} />
            </div>
            <div className="p-4">
              <p className="text-sm font-bold text-[#0F172A]">{i.brand_name} {i.product_name}</p>
              <p className="text-[11px] text-[#64748B]">{i.inspector} · {new Date(i.inspected_at).toLocaleDateString('en-IN')}</p>

              <div className="mt-4 space-y-2">
                {i.reports.map((r) => (
                  <div key={r.name} className="flex items-center justify-between gap-2 rounded-xl border border-[#E6EEF8] px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF3FF] text-[#1677FF]">
                        <span className="material-symbols-outlined text-[18px]">
                          {r.type === 'PDF' ? 'picture_as_pdf' : r.type === 'Excel' ? 'table_chart' : 'data_object'}
                        </span>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[#0F172A]">{r.name}</p>
                        <p className="text-[10px] text-[#64748B]">{r.type} · {r.sizeKb} KB · {new Date(r.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreview(i)}
                      className="cursor-pointer rounded-lg border border-[#DCE9FF] px-2.5 py-1 text-[10px] font-bold text-[#1677FF] transition-colors hover:bg-[#F5F9FF]"
                    >
                      Preview
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#F5F9FF] px-3 py-2 text-[11px] font-medium text-[#64748B]">
                <span className="material-symbols-outlined text-[15px] text-[#1677FF]">photo_library</span>
                {i.evidence_crops} high-confidence evidence crops attached
              </div>
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Sample report preview"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#E6EEF8] bg-[#F8FBFE] px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-[#0F172A]">Sample Evidence Preview</p>
                <p className="text-[11px] text-[#64748B]">{preview.inspection_number} · {preview.brand_name} {preview.product_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#EAF3FF] hover:text-[#1677FF]"
                aria-label="Close preview"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.label_image}
                alt={`Evidence crop — ${preview.product_name}`}
                className="w-full rounded-xl border border-[#E6EEF8] bg-[#F8FBFE] object-contain"
              />
              <div className="rounded-xl border border-[#E6EEF8] bg-[#FAFCFF] p-4 text-xs leading-relaxed text-[#475569]">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Sample report snippet</p>
                <p className="font-mono text-[11px] text-[#0F172A]">
                  {`{`}<br />
                  &nbsp;&nbsp;"inspection_number": "{preview.inspection_number}",<br />
                  &nbsp;&nbsp;"product": "{preview.brand_name} {preview.product_name}",<br />
                  &nbsp;&nbsp;"overall_result": "{preview.overall_result}",<br />
                  &nbsp;&nbsp;"compliance_score": {preview.compliance_score},<br />
                  &nbsp;&nbsp;"risk_score": {preview.risk_score},<br />
                  &nbsp;&nbsp;"rules_checked": {preview.rules.length},<br />
                  &nbsp;&nbsp;"evidence_crops": {preview.evidence_crops}<br />
                  {`}`}
                </p>
              </div>
            </div>
            <div className="border-t border-[#E6EEF8] bg-[#FFF9E6] px-5 py-3 text-[11px] font-medium text-[#8A6100]">
              Sample deliverables only — no real data and no files are downloaded in this read-only demo.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main demo component ─────────────────────────────────────────────────────
export function EvaluationDemo() {
  const router = useRouter();
  const [tab, setTab] = useState<DemoTabId>('dashboard');

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#F6FAFF] to-[#EAF6F4] text-[#0F172A] antialiased">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-[#E0EAF5] bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1677FF] to-[#00BFA6] text-white shadow-sm">
              <span className="material-symbols-outlined text-[22px]">rocket_launch</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold tracking-tight text-[#0F172A]">PackIntel</p>
              <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-[#1677FF]">SIH Evaluation Demo</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 rounded-md border border-[#F5C453] bg-[#FFF9E6] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#8A6100] sm:inline-flex">
              <span className="material-symbols-outlined text-[14px]">visibility</span>
              Read-Only · Sample Data
            </span>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#DCE9FF] bg-white px-3.5 text-xs font-bold text-[#64748B] transition-colors hover:border-[#1677FF] hover:text-[#1677FF]"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              Exit Demo
            </button>
          </div>
        </div>
      </header>

      {/* Demo notice */}
      <div className="border-b border-[#F5C453]/40 bg-[#FFF9E6]">
        <div className="mx-auto flex w-full max-w-[1280px] items-start gap-2 px-4 py-2.5 sm:px-6">
          <span className="material-symbols-outlined mt-0.5 text-[16px] text-[#B7791F]">info</span>
          <p className="text-[12px] leading-relaxed text-[#8A6100]">{demoNotice}</p>
        </div>
      </div>

      {/* Tabs */}
      <nav
        aria-label="Evaluation demo sections"
        className="sticky top-[57px] z-30 border-b border-[#E0EAF5] bg-white/80 backdrop-blur sm:top-[57px]"
      >
        <div className="mx-auto flex w-full max-w-[1280px] gap-1 overflow-x-auto px-4 sm:px-6">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-bold transition-colors sm:px-4 ${
                  active
                    ? 'border-[#1677FF] text-[#1677FF]'
                    : 'border-transparent text-[#64748B] hover:text-[#1677FF]'
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">{t.icon}</span>
                <span className="whitespace-nowrap">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
        {tab === 'dashboard' && (
          <div className="space-y-5">
            <SectionHeader icon="dashboard" title="Workflow Dashboard" subtitle="Sample overview of a Legal Metrology inspector workspace." />
            <KpiCards />
            <RecentInspectionsTable inspections={sampleInspections} />
          </div>
        )}
        {tab === 'scan' && <ScanTab />}
        {tab === 'compliance' && <ComplianceTab />}
        {tab === 'history' && (
          <div className="space-y-5">
            <SectionHeader icon="history" title="Inspection History" subtitle="All sample inspections performed by the evaluation dataset." />
            <RecentInspectionsTable inspections={sampleInspections} />
          </div>
        )}
        {tab === 'reports' && <ReportsTab />}

        <p className="mt-8 flex items-center justify-center gap-1.5 border-t border-[#E0EAF5] pt-4 text-center text-[11px] text-[#94A3B8]">
          <span className="material-symbols-outlined text-[14px] text-[#1677FF]">science</span>
          SIH 2026 · PackIntel Team · Sample data only — read-only, nothing saved.
        </p>
      </main>
    </div>
  );
}