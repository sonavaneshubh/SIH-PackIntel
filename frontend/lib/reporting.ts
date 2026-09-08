// Report data derivation helpers.
//
// These functions build the report title and product facts STRICTLY from the
// real scan data returned by the backend pipeline (inspections, extracted
// labels, product_information JSONB). They never invent or fall back to dummy
// values. Unless a value was actually detected, callers render "N/A".

import type {
  Inspection,
  ExtractedLabel,
} from '@/types/database';
import {
  parseProductInformation,
  ProductInformation,
} from '@/types/product';
import {
  ComplianceReportProduct,
  ComplianceReportSummary,
  JoinedInspection,
  ReportComplianceStatus,
  ReportDownloadResult,
} from '@/types/report';

const NOT_DETECTED = 'N/A';

/** Reads a single canonical field value from the structured extraction JSON. */
export function fieldValue(
  productInformation: ProductInformation,
  key: string
): string | null {
  const entry = productInformation?.[key];
  if (
    entry &&
    typeof entry === 'object' &&
    'value' in entry &&
    entry.value != null &&
    String(entry.value).trim().length > 0
  ) {
    return String(entry.value).trim();
  }
  return null;
}

/**
 * Best available company/manufacturer identity detected during the scan.
 * Resolution order follows the backend extraction schema.
 */
export function reportCompanyName(
  inspection: Inspection | null,
  label: ExtractedLabel | null,
  productInformation?: ProductInformation
): string | null {
  const pi = productInformation ?? parseProductInformation(label?.product_information);
  return (
    fieldValue(pi, 'manufacturer_name') ||
    fieldValue(pi, 'packer_name') ||
    fieldValue(pi, 'importer_name') ||
    label?.manufacturer_name ||
    label?.packer_name ||
    label?.importer_name ||
    inspection?.manufacturer_name ||
    inspection?.brand_name ||
    null
  );
}

/** Actual product name extracted during the scan. */
export function reportProductName(
  inspection: Inspection | null,
  label: ExtractedLabel | null,
  productInformation?: ProductInformation
): string | null {
  const pi = productInformation ?? parseProductInformation(label?.product_information);
  return (
    inspection?.product_name ||
    label?.commodity_name ||
    fieldValue(pi, 'brand_or_commodity_name') ||
    fieldValue(pi, 'generic_name') ||
    null
  );
}

/**
 * Actual product/inspection identifier. The schema has no separate product
 * table, so the real inspection identifier is used consistently (never a
 * randomly generated frontend ID).
 */
export function reportProductId(inspection: Inspection): string {
  return inspection.inspection_number || inspection.id;
}

/** Brand as detected on the label. */
export function reportBrandName(
  inspection: Inspection | null,
  label: ExtractedLabel | null,
  productInformation?: ProductInformation
): string | null {
  const pi = productInformation ?? parseProductInformation(label?.product_information);
  return (
    inspection?.brand_name ||
    fieldValue(pi, 'brand_or_commodity_name') ||
    null
  );
}

/**
 * Dynamically generated report title:
 *
 *   Company / Manufacturer – Product Name – Product ID
 */
export function buildReportTitle(
  inspection: Inspection,
  label: ExtractedLabel | null,
  productInformation?: ProductInformation
): string {
  const company = reportCompanyName(inspection, label, productInformation) || NOT_DETECTED;
  const product = reportProductName(inspection, label, productInformation) || NOT_DETECTED;
  return `${company} – ${product} – ${reportProductId(inspection)}`;
}

export function reportComplianceStatus(
  inspection: Inspection,
  resultsCount: number
): ReportComplianceStatus {
  switch ((inspection.overall_result || '').toLowerCase()) {
    case 'pass':
      return 'PASS';
    case 'fail':
      return 'FAIL';
    case 'review':
      return 'REVIEW';
    default:
      return resultsCount > 0 ? 'INCONCLUSIVE' : 'PENDING';
  }
}

export function reportConfidence(label: ExtractedLabel | null): number | null {
  const raw = label?.ocr_confidence ?? label?.extraction_confidence;
  if (raw == null) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return Math.round(num > 0 && num <= 1 ? num * 100 : num);
}

function buildProduct(
  inspection: Inspection,
  label: ExtractedLabel | null,
  productInformation: ProductInformation
): ComplianceReportProduct {
  return {
    id: reportProductId(inspection),
    name: reportProductName(inspection, label, productInformation),
    brand: reportBrandName(inspection, label, productInformation),
    manufacturer: reportCompanyName(inspection, label, productInformation),
    mrp: label?.mrp || fieldValue(productInformation, 'mrp') || null,
    netQuantity:
      label?.net_quantity || fieldValue(productInformation, 'net_quantity') || null,
    batchNumber: fieldValue(productInformation, 'batch_number'),
    manufacturingDate:
      label?.month_year_packed ||
      fieldValue(productInformation, 'manufacturing_date') ||
      fieldValue(productInformation, 'packing_date') ||
      null,
    expiryDate:
      fieldValue(productInformation, 'expiry_date') ||
      fieldValue(productInformation, 'best_before_date') ||
      null,
    countryOfOrigin:
      label?.country_of_origin ||
      fieldValue(productInformation, 'country_of_origin') ||
      null,
  };
}

/** Assembles a real report row from a joined inspection record. */
export function buildComplianceReportRow(joined: JoinedInspection): ComplianceReportSummary {
  const label = joined.extracted_labels;
  const productInformation = parseProductInformation(label?.product_information);
  const results = joined.compliance_results || [];
  const violationsCount = results.filter((r) => r.result === 'fail').length;
  const warningsCount = results.filter((r) => r.result === 'warning').length;
  const firstReport = (joined.inspection_reports || [])[0];
  const format = firstReport?.report_type
    ? `${firstReport.report_type.toUpperCase()} Report`
    : 'Compliance Report';

  return {
    reportId: joined.inspection_number,
    inspectionId: joined.id,
    title: buildReportTitle(joined, label, productInformation),
    product: buildProduct(joined, label, productInformation),
    date: joined.inspected_at || joined.created_at,
    format,
    scanReference: joined.inspection_number,
    imageCount: (joined.inspection_images || []).length,
    compliance: {
      status: reportComplianceStatus(joined, results.length),
      score: joined.compliance_score,
      riskScore: joined.risk_score,
      confidence: reportConfidence(label),
      violationsCount,
      warningsCount,
    },
    inspection: joined,
    label,
    complianceResults: results,
    images: joined.inspection_images || [],
    reportFiles: joined.inspection_reports || [],
  };
}

/**
 * Requests the backend to generate the real report document for an inspection
 * and returns the signed download URL (txt report by default).
 */
export async function generateComplianceReport(
  inspectionId: string
): Promise<ReportDownloadResult> {
  try {
    const { api } = await import('@/lib/api');
    const response = await api.generateReport({ inspection_id: inspectionId });
    return {
      reportId: response.report_id,
      inspectionId: response.inspection_id,
      downloadUrl: response.download_url,
      generatedAt: response.generated_at,
      error: null,
    };
  } catch (err) {
    return {
      reportId: '',
      inspectionId,
      downloadUrl: '',
      generatedAt: '',
      error:
        err instanceof Error
          ? err.message
          : 'The report generation service is unavailable. Please try again later.',
    };
  }
}