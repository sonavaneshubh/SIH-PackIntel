// API Client module for Backend FastAPI integration
import type { ProductInformation } from '@/types/product';

const LOCAL_API_BASE_URL = 'http://localhost:5000';

// Loopback hosts must never be targeted by a production deployment. A leftover
// NEXT_PUBLIC_API_URL pointing at localhost produces a clear configuration
// error instead of a confusing "Scan Fetch Failed".
const LOOPBACK_URL_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(?::|\/|$)/i,
  /^https?:\/\/127\.0\.0\.1(?::|\/|$)/,
  /^https?:\/\/0\.0\.0\.0(?::|\/|$)/,
];

function isLoopbackUrl(url: string): boolean {
  return LOOPBACK_URL_PATTERNS.some((pattern) => pattern.test(url));
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function resolveApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (envUrl) {
    if (process.env.NODE_ENV === 'production' && isLoopbackUrl(envUrl)) {
      return '';
    }
    return normalizeBaseUrl(envUrl);
  }

  // A production deployment must never silently fall back to a local server.
  // The scanner surfaces a configuration error instead of "Scan Fetch Failed".
  if (process.env.NODE_ENV === 'production') return '';

  // Local development convenience fallback.
  return LOCAL_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();

export const API_CONFIG_ERROR_MESSAGE =
  'The scan server is not reachable. Please verify that NEXT_PUBLIC_API_URL is set to the PackIntel backend URL.';

export function isApiConfigured(): boolean {
  return API_BASE_URL.length > 0;
}

export function assertApiConfigured(): void {
  if (!isApiConfigured()) {
    throw new Error(API_CONFIG_ERROR_MESSAGE);
  }
}

export interface HealthResponse {
  status: string;
}

export interface ScanRequest {
  image_url?: string;
  product_name?: string;
  category?: string;
  manufacturer?: string;
  is_imported?: boolean;
}

export interface ImageDetection {
  is_food_package: boolean;
  confidence: number;
  reason: string;
}

export interface ImageQuality {
  overall: 'usable' | 'poor' | 'unusable' | 'unknown';
  score: number;
  reason?: string | null;
}

export interface ScanSide {
  label?: 'front' | 'back' | string | null;
  source?: string | null;
  ocr_raw_text: string;
  ocr_engine?: string | null;
  ocr_confidence: number;
  ocr_regions?: Array<{
    text: string;
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  layout_regions?: Array<Record<string, unknown>>;
  layout_text?: string | null;
  image_quality?: ImageQuality | null;
  detection?: ImageDetection | null;
}

export interface ScanResponse {
  status: string;
  success: boolean;
  scan_completed: boolean;
  inspection_id: string;
  message: string;
  ocr_raw_text?: string;
  ocr_engine?: string;
  ocr_confidence: number;
  ocr_regions?: Array<{
    text: string;
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  // Canonical per-field extraction (single source of truth for the results grid).
  product_information?: ProductInformation;
  extraction_source?: 'ocr' | 'vision' | 'ocr+vision' | 'gemini_vision';
  vision_used?: boolean;
  vision_error?: string | null;
  extracted_declarations?: Record<string, unknown>;
  extraction_confidence?: number;
  compliance_results?: Array<{
    rule_code: string;
    rule_name: string;
    result: 'pass' | 'fail' | 'warning' | 'not_applicable';
    extracted_value?: string | null;
    explanation: string;
    evidence?: string | null;
    requirement?: string | null;
  }>;
  score: number;
  compliance_score: number;
  risk_score: number;
  overall_result: 'pass' | 'review' | 'fail';
  image_quality: string;
  quality_reason?: string;
  report?: string;
  // Two-image scan additions (present only when the pipeline runs multi-side).
  front_side?: ScanSide;
  back_side?: ScanSide;
  images_processed?: number;
  detection?: ImageDetection;
  warnings?: string[];
}

export interface ComplianceCheckRequest {
  inspection_id?: string;
  declarations?: Record<string, unknown>;
}

export interface ComplianceCheckResponse {
  inspection_id?: string;
  overall_result: 'pass' | 'review' | 'fail';
  risk_score: number;
  compliance_score: number;
  results: Array<{
    rule_code: string;
    rule_name: string;
    result: 'pass' | 'fail' | 'warning' | 'not_applicable';
    extracted_value?: string | null;
    explanation: string;
    evidence?: string | null;
    requirement?: string | null;
  }>;
}

export interface ReportGenerationRequest {
  inspection_id: string;
  format?: 'pdf' | 'json';
}

export interface ReportGenerationResponse {
  report_id: string;
  inspection_id: string;
  download_url: string;
  generated_at: string;
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function ok<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(
      `API error (${response.status}): ${response.statusText}`,
    );
  }
  return response.json() as Promise<T>;
}

export const api = {
  getHealth: (): Promise<HealthResponse> => fetchApi<HealthResponse>('/health'),

  scan: (data: ScanRequest): Promise<ScanResponse> =>
    fetchApi<ScanResponse>('/api/scan', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  scanUpload: (
    frontImage: File,
    backImage: File | null,
    metadata?: Partial<Omit<ScanRequest, 'image_url' | 'front_image_url' | 'back_image_url'>>,
  ): Promise<ScanResponse> => {
    const form = new FormData();
    form.append('front_image', frontImage);
    if (backImage) {
      form.append('back_image', backImage);
    }
    (Object.keys(metadata || {}) as Array<keyof typeof metadata>).forEach((key) => {
      const value = metadata?.[key];
      if (value !== undefined && value !== null) {
        form.append(String(key), String(value));
      }
    });
    return fetch(`${API_BASE_URL}/api/scan`, { method: 'POST', body: form }).then(ok<ScanResponse>);
  },

  createInspection: (data: Record<string, unknown>): Promise<Record<string, unknown>> =>
    fetchApi<Record<string, unknown>>('/api/inspection', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getInspections: (): Promise<Record<string, unknown>[]> =>
    fetchApi<Record<string, unknown>[]>('/api/inspections'),

  getInspectionById: (inspectionId: string): Promise<Record<string, unknown>> =>
    fetchApi<Record<string, unknown>>(`/api/inspection/${inspectionId}`),

  checkCompliance: (data: ComplianceCheckRequest): Promise<ComplianceCheckResponse> =>
    fetchApi<ComplianceCheckResponse>('/api/compliance/check', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  generateReport: (data: ReportGenerationRequest): Promise<ReportGenerationResponse> =>
    fetchApi<ReportGenerationResponse>('/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
