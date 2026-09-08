// Supabase Database Types for PackIntel
// Corresponds to: profiles, inspections, inspection_images, extracted_labels, compliance_results, inspection_reports

import type {
  ProductField,
  ProductFieldStatus,
  ProductFieldSource,
  ProductInformation,
} from './product';

export type {
  ProductFieldStatus,
  ProductFieldSource,
  ProductInformation,
} from './product';

export type ExtractedField = ProductField;

export type InspectionStatus = 'draft' | 'processing' | 'completed' | 'failed';
export type OverallResult = 'pass' | 'fail' | 'review' | 'pending';
export type ComplianceResult = 'pass' | 'fail' | 'warning' | 'not_applicable';
export type ImageType = 'label_front' | 'label_back' | 'label_side' | 'product_full' | 'evidence_crop';

// Priority / risk level derived from the existing compliance fields. Critical
// and High are considered "high-priority" for the High Priority Inspections
// page; Medium and Low are not.
export type InspectionPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

// Count of scored inspections at each derived priority level.
export type PriorityDistribution = Record<InspectionPriority, number>;

// ─── profiles ────────────────────────────────────────────────────────────────
export interface Profile {
  id: string;                     // = auth.users.id
  full_name: string | null;
  email: string | null;
  department: string | null;
  designation: string | null;
  employee_id: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── inspections ─────────────────────────────────────────────────────────────
export interface Inspection {
  id: string;
  inspection_number: string;       // e.g. INS-000001
  inspector_id: string;            // = profiles.id
  status: InspectionStatus;
  product_name: string | null;
  brand_name: string | null;
  manufacturer_name: string | null;
  product_category: string | null;
  is_imported: boolean;
  overall_result: OverallResult | null;
  risk_score: number | null;       // 0-100
  compliance_score: number | null; // 0-100, computed by the backend
  notes: string | null;
  inspected_at: string | null;
  created_at: string;
  updated_at: string;
}

export type InspectionInsert = {
  id?: string;
  inspection_number?: string;
  inspector_id: string;
  status?: InspectionStatus;
  product_name?: string | null;
  brand_name?: string | null;
  manufacturer_name?: string | null;
  product_category?: string | null;
  is_imported?: boolean;
  overall_result?: OverallResult | null;
  risk_score?: number | null;
  compliance_score?: number | null;
  notes?: string | null;
  inspected_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type InspectionUpdate = Partial<
  Omit<Inspection, 'id' | 'inspector_id' | 'created_at'>
>;

// ─── inspection_images ───────────────────────────────────────────────────────
export interface InspectionImage {
  id: string;
  inspection_id: string;
  storage_path: string;            // e.g. {user_id}/{inspection_id}/{filename}
  public_url: string | null;
  image_type: ImageType;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  ocr_text: string | null;
  ocr_confidence: number | null;   // 0-100, real mean word confidence from Tesseract
  ocr_engine: string | null;
  ocr_regions: unknown[] | null;   // word-level bounding boxes (normalized 0-1)
  created_at?: string;
  uploaded_at?: string;
}

export type InspectionImageInsert = {
  id?: string;
  inspection_id: string;
  storage_path: string;
  public_url?: string | null;
  image_type?: ImageType;
  file_name?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  ocr_text?: string | null;
  ocr_confidence?: number | null;
  ocr_engine?: string | null;
  ocr_regions?: unknown[] | null;
  created_at?: string;
  uploaded_at?: string;
};

// ─── extracted_labels ────────────────────────────────────────────────────────
export interface ExtractedLabel {
  id: string;
  inspection_id: string;
  manufacturer_name: string | null;
  packer_name: string | null;
  importer_name: string | null;
  commodity_name: string | null;
  net_quantity: string | null;
  mrp: string | null;
  month_year_packed: string | null;
  customer_care_details: string | null;
  country_of_origin: string | null;
  other_declarations: string | null;
  product_information?: ProductInformation | null;
  raw_ocr_text: string | null;
  extraction_confidence: number | null; // 0-100 (raw, no normalization)
  ocr_confidence: number | null;        // 0-100 real OCR confidence
  created_at: string;
  updated_at: string;
}

export type ExtractedLabelInsert = {
  id?: string;
  inspection_id: string;
  manufacturer_name?: string | null;
  packer_name?: string | null;
  importer_name?: string | null;
  commodity_name?: string | null;
  net_quantity?: string | null;
  mrp?: string | null;
  month_year_packed?: string | null;
  customer_care_details?: string | null;
  country_of_origin?: string | null;
  other_declarations?: string | null;
  product_information?: ProductInformation | null;
  raw_ocr_text?: string | null;
  extraction_confidence?: number | null;
  ocr_confidence?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type ExtractedLabelUpdate = Partial<
  Omit<ExtractedLabel, 'id' | 'inspection_id' | 'created_at'>
>;

// ─── compliance_results ──────────────────────────────────────────────────────
export interface ComplianceResultRow {
  id: string;
  inspection_id: string;
  rule_code: string;               // e.g. LM-R6-1
  rule_name: string;
  requirement: string;
  extracted_value: string | null;
  result: ComplianceResult;
  explanation: string | null;
  evidence: string | null;         // JSON string or description
  created_at: string;
}

export type ComplianceResultInsert = {
  id?: string;
  inspection_id: string;
  rule_code: string;               // e.g. LM-R6-1
  rule_name: string;
  requirement?: string | null;
  extracted_value?: string | null;
  result: ComplianceResult;
  explanation?: string | null;
  evidence?: string | null;         // JSON string or description
  created_at?: string;
};

// ─── inspection_reports ──────────────────────────────────────────────────────
export interface InspectionReport {
  id: string;
  inspection_id: string;
  storage_path: string;            // e.g. {user_id}/{inspection_id}/report.pdf
  public_url: string | null;
  report_type: string;             // 'pdf' | 'json' | 'excel'
  file_size_bytes: number | null;
  generated_at: string;
}

export type InspectionReportInsert = Omit<InspectionReport, 'id' | 'generated_at'> & {
  id?: string;
  generated_at?: string;
};

// ─── Aggregated / Joined Types ───────────────────────────────────────────────
export interface InspectionWithDetails extends Inspection {
  extracted_labels: ExtractedLabel | null;
  compliance_results: ComplianceResultRow[];
  inspection_images: InspectionImage[];
  inspection_reports: InspectionReport[];
}

// ─── High Priority Inspections ──────────────────────────────────────────────
// A completed inspection whose priority (derived from the real risk_score the
// compliance engine persisted) is Critical or High, joined with its actual
// rule-level compliance results so violation counts are real scan data.
export interface HighPriorityInspectionRecord extends Inspection {
  priority: 'CRITICAL' | 'HIGH';
  compliance_results: ComplianceResultRow[];
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
export interface DashboardStats {
  total: number;
  compliant: number;
  needsReview: number;
  nonCompliant: number;
  highPriority: number;
  avgRiskScore: number;
}
