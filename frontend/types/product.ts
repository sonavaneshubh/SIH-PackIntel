// Canonical product-information schema (mirrors backend/app/schemas/product.py).
// Single source of truth for the dynamic results grid and any future edit UI.

export type ProductFieldStatus = 'detected' | 'not_printed' | 'not_visible' | 'uncertain';
export type ProductFieldSource = 'ocr' | 'vision' | 'merged' | 'user' | 'none' | 'gemini_vision';

export interface ProductField {
  value: string | null;
  status: ProductFieldStatus;
  confidence: number;
  source: ProductFieldSource;
  conflicts?: Array<{ source: string; value: string | null }> | null;
}

export type ProductInformation = Record<string, ProductField>;

// The 26 canonical fields in display order (must match PRODUCT_FIELDS).
export const PRODUCT_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'brand_or_commodity_name', label: 'Brand / Commodity name' },
  { key: 'generic_name', label: 'Generic name' },
  { key: 'net_quantity', label: 'Net quantity' },
  { key: 'quantity_unit', label: 'Quantity unit' },
  { key: 'manufacturer_name', label: 'Manufacturer name' },
  { key: 'manufacturer_address', label: 'Manufacturer address' },
  { key: 'packer_name', label: 'Packer name' },
  { key: 'packer_address', label: 'Packer address' },
  { key: 'marketer_name', label: 'Marketer name' },
  { key: 'marketer_address', label: 'Marketer address' },
  { key: 'mrp', label: 'MRP (max retail price)' },
  { key: 'mrp_tax_inclusive', label: 'MRP tax inclusive' },
  { key: 'unit_sale_price', label: 'Unit sale price' },
  { key: 'packing_date', label: 'Packing date' },
  { key: 'manufacturing_date', label: 'Manufacturing date' },
  { key: 'expiry_date', label: 'Expiry date' },
  { key: 'batch_number', label: 'Batch number' },
  { key: 'customer_care_name', label: 'Customer care name' },
  { key: 'customer_care_phone', label: 'Customer care phone' },
  { key: 'toll_free_number', label: 'Toll-free contact' },
  { key: 'customer_care_email', label: 'Customer care email' },
  { key: 'country_of_origin', label: 'Country of origin' },
  { key: 'vegetarian_mark', label: 'Vegetarian mark' },
  { key: 'non_vegetarian_mark', label: 'Non-vegetarian mark' },
  { key: 'fssai_number', label: 'FSSAI number' },
  { key: 'certifications', label: 'Certifications' },
];

// Fields whose OCR/vision disagreement must not be silently resolved.
export const CONFLICT_SENSITIVE_FIELDS = new Set([
  'mrp',
  'net_quantity',
  'packing_date',
  'manufacturing_date',
  'expiry_date',
  'fssai_number',
]);

export function isProductInformation(value: unknown): value is ProductInformation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(
    (entry) =>
      !!entry &&
      typeof entry === 'object' &&
      'status' in entry &&
      'confidence' in entry &&
      'source' in entry,
  );
}

// Legacy rows may store the JSONB payload as a JSON string.
export function parseProductInformation(raw: unknown): ProductInformation {
  if (!raw) return {};
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return isProductInformation(value) ? value : {};
}