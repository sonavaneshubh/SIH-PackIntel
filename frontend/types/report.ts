// Compliance Report types for PackIntel.
//
// A "compliance report" is derived from a REAL scan/inspection record already
// persisted by the scan pipeline. This module therefore reuses the existing
// database types (Inspection, ExtractedLabel, ComplianceResultRow,
// InspectionImage, InspectionReport) and provides a thin report view-model on
// top of them. No dummy/mock report records live here.

import type {
  Inspection,
  ExtractedLabel,
  ComplianceResultRow,
  InspectionImage,
  InspectionReport,
} from './database';

export type ReportComplianceStatus =
  | 'PASS'
  | 'REVIEW'
  | 'FAIL'
  | 'INCONCLUSIVE'
  | 'PENDING';

/** Product-level facts shown on a report, taken directly from the scan. */
export interface ComplianceReportProduct {
  /** Actual database/API identifier of the scanned product/inspection. */
  id: string;
  name: string | null;
  brand: string | null;
  manufacturer: string | null;
  mrp: string | null;
  netQuantity: string | null;
  batchNumber: string | null;
  manufacturingDate: string | null;
  expiryDate: string | null;
  countryOfOrigin: string | null;
}

export interface ComplianceReportSummary {
  /** Actual report/inspection number (e.g. INS-20260907-XXXXXX). */
  reportId: string;
  /** Actual inspection database id used for navigation/download. */
  inspectionId: string;
  /** Dynamically generated title: Company – Product – Product ID. */
  title: string;
  product: ComplianceReportProduct;
  /** ISO date of inspection/report creation. */
  date: string;
  /** Report format/type. */
  format: string;
  /** Scan/inspection reference. */
  scanReference: string;
  /** Number of images captured for this scan. */
  imageCount: number;
  compliance: {
    status: ReportComplianceStatus;
    score: number | null;
    riskScore: number | null;
    confidence: number | null;
    violationsCount: number;
    warningsCount: number;
  };
  /** Real underlying records (source of truth for the detail page). */
  inspection: Inspection;
  label: ExtractedLabel | null;
  complianceResults: ComplianceResultRow[];
  images: InspectionImage[];
  reportFiles: InspectionReport[];
}

/** A joined inspection record as returned by the report list query. */
export interface JoinedInspection extends Inspection {
  extracted_labels: ExtractedLabel | null;
  compliance_results: ComplianceResultRow[];
  inspection_images: InspectionImage[];
  inspection_reports: InspectionReport[];
}

export interface ReportDownloadResult {
  reportId: string;
  inspectionId: string;
  downloadUrl: string;
  generatedAt: string;
  error: string | null;
}