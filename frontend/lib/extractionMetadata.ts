// ─── Derived Inspection Metadata ─────────────────────────────────────────────
// Product name/category/manufacturer are derived ONLY from the structured
// extraction (OCR) result — never from hardcoded placeholders or request meta.

export interface DerivedInspectionMetadata {
  product_name: string | null;
  brand_name: string | null;
  manufacturer_name: string | null;
  product_category: string | null;
}

type ExtractionField =
  | { value?: unknown; status?: unknown; confidence?: unknown; source?: unknown }
  | undefined
  | null;

const TRUSTED_STATUS = 'detected';

/**
 * Reads a single field from the structured extraction result.
 * A value is trusted only when the field is marked `status: 'detected'`
 * and carries a non-empty string value.
 */
function readDetectedField(
  productInformation: Record<string, unknown>,
  fallbackDeclarations: Record<string, unknown>,
  productKey: string,
  declarationKey?: string
): string | null {
  const entry = (productInformation ? productInformation[productKey] : null) as
    | ExtractionField
    | undefined;
  if (
    entry &&
    typeof entry === 'object' &&
    entry.status === TRUSTED_STATUS &&
    typeof entry.value === 'string' &&
    entry.value.trim().length > 0
  ) {
    return entry.value.trim();
  }
  if (fallbackDeclarations) {
    const fallback = fallbackDeclarations[declarationKey ?? productKey];
    if (typeof fallback === 'string' && fallback.trim().length > 0) {
      return fallback.trim();
    }
  }
  return null;
}

/**
 * Computes the product metadata to store on the inspection record from the
 * scan's own structured extraction. Returns `null` for any field that was not
 * detected, so downstream UI falls back to "Unknown Product" / "N/A".
 */
export function deriveInspectionMetadataFromExtraction(
  productInformation: Record<string, unknown>,
  extractedDeclarations: Record<string, unknown>
): DerivedInspectionMetadata {
  const commodity = readDetectedField(
    productInformation,
    extractedDeclarations,
    'brand_or_commodity_name',
    'commodity_name'
  );
  const generic = readDetectedField(
    productInformation,
    extractedDeclarations,
    'generic_name',
    'common_generic_name'
  );
  const manufacturer = readDetectedField(
    productInformation,
    extractedDeclarations,
    'manufacturer_name'
  );

  return {
    product_name: commodity || generic || null,
    brand_name: commodity,
    manufacturer_name: manufacturer,
    product_category: generic,
  };
}