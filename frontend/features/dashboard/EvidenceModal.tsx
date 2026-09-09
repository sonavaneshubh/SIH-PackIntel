'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EvidenceDetails } from '@/types';
import { RiskBadge, ConfidenceBadge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface EvidenceModalProps {
  evidence: EvidenceDetails | null;
  isOpen: boolean;
  isLoading?: boolean;
  loadError?: string | null;
  onClose: () => void;
}

export function EvidenceModal({ evidence, isOpen, isLoading = false, loadError = null, onClose }: EvidenceModalProps) {
  const router = useRouter();
  const [activeSurface, setActiveSurface] = useState<'primary' | 'secondary'>('primary');

  if (!isOpen) return null;

  const hasSecondary = Boolean(evidence?.secondaryImageUrl);

  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-4xl bg-surface border border-outline-variant rounded-xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in-95 duration-150">
        {children}
      </div>
    </div>
  );

  if (isLoading || (!evidence && !loadError)) {
    return shell(
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <span className="material-symbols-outlined text-[40px] text-primary animate-spin">progress_activity</span>
        <p className="text-sm font-semibold text-on-surface">Loading inspection evidence…</p>
        <p className="text-xs text-on-surface-variant">
          Fetching scan image, extracted declarations, and compliance rulings.
        </p>
      </div>
    );
  }

  if (!evidence) {
    return shell(
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <span className="material-symbols-outlined text-[40px] text-error">error</span>
        <p className="text-sm font-semibold text-on-surface">{loadError || 'Could not load inspection details.'}</p>
        <Button variant="outline" size="sm" icon="close" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  const activeImageUrl =
    activeSurface === 'primary' ? evidence.imageUrl : (evidence.secondaryImageUrl || evidence.imageUrl);
  const activeRegion =
    activeSurface === 'primary' ? evidence.boundingRegion : evidence.secondaryBoundingRegion;
  const ocrText = evidence.ocrConfidence != null ? `OCR ${evidence.ocrConfidence}%` : null;

  return shell(
    <>
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 border-b border-outline-variant bg-surface-container-low">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {evidence.id}
              </span>
              <RiskBadge score={evidence.riskScore} level={evidence.riskLevel} />
              <StatusBadge status={evidence.complianceStatus} />
            </div>
            <h3 className="text-headline-md font-headline-md text-on-surface">
              {evidence.productName} — PackIntel Evidence Chain Dossier
            </h3>
            <p className="text-body-sm font-body-sm text-on-surface-variant mt-0.5">
              Target Field: <strong className="text-on-surface">{evidence.attribute}</strong> • Codified Rule: <strong className="text-primary">{evidence.applicableRule}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-5 md:p-6 overflow-y-auto space-y-6 flex-1 bg-surface">
          {/* Surface Toggle if secondary exists */}
          {hasSecondary && (
            <div className="flex items-center gap-2 border-b border-outline-variant pb-3">
              <span className="text-xs font-label-bold font-semibold text-on-surface-variant uppercase tracking-wider mr-2">
                Multi-Surface Inspection:
              </span>
              <button
                onClick={() => setActiveSurface('primary')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  activeSurface === 'primary'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                Primary Surface (Front)
              </button>
              <button
                onClick={() => setActiveSurface('secondary')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  activeSurface === 'secondary'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                Conflicting Surface (Back/Side)
              </button>
            </div>
          )}

          {/* Evidence Split Layout: Image & Detection */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Package Image with Highlighted Region */}
            <div className="lg:col-span-6 flex flex-col">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-label-bold font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">document_scanner</span>
                  Optical Scan & Evidence Region
                </span>
                <span className="text-[11px] font-mono text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded">
                  {activeSurface === 'primary' ? 'Surface: FRONT' : 'Surface: BACK / SIDE'}
                </span>
              </div>

              <div className="relative rounded-lg border border-outline-variant bg-black/5 overflow-hidden h-[300px] flex items-center justify-center group shadow-inner">
                {/* Package Image */}
                {activeImageUrl ? (
                  <img
                    src={activeImageUrl}
                    alt={`${evidence.productName} — packaging evidence scan`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 text-on-surface-variant px-4">
                    <span className="material-symbols-outlined text-[40px]">image_not_supported</span>
                    <span className="text-xs font-label-bold">No scan image stored for this inspection</span>
                  </div>
                )}

                {/* Detected Region (only when the OCR engine recorded one) */}
                {activeRegion && (
                  <div
                    className="absolute border-2 border-red-500 bg-red-500/25 rounded transition-all flex flex-col justify-start p-1 pointer-events-none animate-pulse"
                    style={{
                      top: activeRegion.top,
                      left: activeRegion.left,
                      width: activeRegion.width,
                      height: activeRegion.height,
                    }}
                  >
                    <span className="bg-red-600 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shadow-xs w-fit">
                      {activeRegion.label}
                    </span>
                  </div>
                )}

                {/* Region coordinates overlay watermark */}
                <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] font-mono px-2 py-0.5 rounded backdrop-blur-xs">
                  {activeRegion
                    ? `BBox [${activeRegion.top}, ${activeRegion.left}]`
                    : activeSurface === 'primary'
                      ? 'Capture View'
                      : 'Surface: BACK / SIDE'}
                  {ocrText ? ` • ${ocrText}` : ''}
                </div>
              </div>
            </div>

            {/* Right: Statutory Inspection Analysis */}
            <div className="lg:col-span-6 flex flex-col justify-between space-y-4">
              {/* Detected vs Conflicting Box */}
              <div className="bg-surface-container-low border border-outline-variant/80 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-outline-variant/60 pb-2">
                  <span className="text-xs font-label-bold font-bold text-on-surface uppercase">
                    Extracted Declaration
                  </span>
                  {evidence.ocrConfidence != null ? (
                      <ConfidenceBadge confidence={evidence.ocrConfidence} />
                    ) : (
                      <span className="text-[11px] font-label-bold text-on-surface-variant">Confidence: —</span>
                    )}
                </div>

                <div>
                  <span className="text-[11px] font-medium text-on-surface-variant block">
                    OCR Detected Value:
                  </span>
                  <p className="text-sm font-bold font-mono text-on-surface mt-0.5 bg-surface p-2 rounded border border-outline-variant">
                    {evidence.detectedValue}
                  </p>
                </div>

                {evidence.conflictingValue && (
                  <div className="bg-red-50 border border-red-200 rounded p-2.5">
                    <span className="text-[11px] font-bold text-red-800 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px]">difference</span>
                      Contradicting Evidence Detected:
                    </span>
                    <p className="text-xs font-mono font-bold text-red-700 mt-1">
                      {evidence.conflictingValue}
                    </p>
                    {evidence.conflictingSource && (
                      <span className="text-[10px] text-red-600 mt-0.5 block">
                        Source: {evidence.conflictingSource}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Explainable Risk Factors */}
              <div className="bg-surface border border-outline-variant rounded-lg p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-label-bold font-bold text-on-surface uppercase flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-orange-500">rule</span>
                    Explainable Risk Analysis
                  </span>
                  <span className="text-xs font-mono font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                    Risk: {evidence.riskScore}/100
                  </span>
                </div>
                <div className="space-y-1.5">
                  {evidence.riskReasons.map((reason, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-on-surface">
                      <span className="text-red-500 font-bold">•</span>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Statutory Rule & Violation Details */}
          <div className="bg-surface-container-low border border-outline-variant rounded-lg p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-outline-variant/60 pb-2">
              <span className="text-xs font-label-bold font-bold text-on-surface uppercase flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">gavel</span>
                Statutory Provision: {evidence.applicableRule}
              </span>
              <span className="text-[11px] text-on-surface-variant font-mono">
                {evidence.ruleVersion}
              </span>
            </div>

            <div>
              <span className="text-xs font-semibold text-error block">
                Detected Issue:
              </span>
              <p className="text-xs text-on-surface font-medium mt-0.5">
                {evidence.detectedIssue}
              </p>
            </div>

            <div className="bg-surface p-3 rounded border border-outline-variant/80">
              <span className="text-xs font-semibold text-on-surface block mb-1">
                Legal Metrology Enforcement Rationale:
              </span>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {evidence.explanation}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-outline-variant bg-surface-container-lowest flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px] text-green-600">verified</span>
            PackIntel Evidence Chain Verified • Deterministic Rule Decision
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                router.push('/rules');
              }}
            >
              Examine Rule DB
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="description"
              onClick={() => {
                onClose();
                router.push(evidence.inspectionId ? `/results?inspection=${encodeURIComponent(evidence.inspectionId)}` : '/results');
              }}
            >
              Open Full Compliance Audit
            </Button>
          </div>
        </div>
    </>
  );
}
