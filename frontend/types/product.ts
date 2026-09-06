// Canonical product-information schema (mirrors backend/app/schemas/product.py).
// Single source of truth for the dynamic results grid and any future edit UI.

export type ProductFieldStatus = 'detected' | 'not_printed' | 'not_visible' | 'uncertain' | 'not_applicable';
export type ProductFieldSource = 'ocr' | 'vision' | 'merged' | 'user' | 'none';
export type ProductFieldStatus = 'detected' | 'not_printed' | 'not_visible' | 'uncertain';
export type ProductFieldSource = 'ocr' | 'vision' | 'merged' | 'user' | 'none' | 'gemini_vision';

export interface ProductField {
  value: string | null;
  status: ProductFieldStatus;
  confidence: number;
  source: ProductFieldSource;
  normalized?: string | null;
  conflicts?: Array<{ source: string; value: string | null }> | null;
}

export interface OtherDetectedInformation {
  brand_name?: string | null;
  marketer_name?: string | null;
  marketer_address?: string | null;
  batch_number?: string | null;
  fssai_number?: string | null;
  vegetarian_mark?: string | null;
  non_vegetarian_mark?: string | null;
  nutrition_info?: Record<string, string>;
  ingredients?: string | null;
  certifications?: string | null;
}

export type ProductInformation = Record<string, ProductField | OtherDetectedInformation | any>;

// The 16 Core Legal Metrology Fields in display order
export const CORE_LEGAL_METROLOGY_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'commodity_name', label: 'Common / Generic Name' },
  { key: 'net_quantity', label: 'Net Quantity' },
  { key: 'quantity_unit', label: 'Measurement Unit' },
  { key: 'manufacturer_name', label: 'Manufacturer Name' },
  { key: 'manufacturer_address', label: 'Manufacturer Address' },
  { key: 'packer_name', label: 'Packer Name' },
  { key: 'packer_address', label: 'Packer Address' },
  { key: 'importer_name', label: 'Importer Name' },
  { key: 'importer_address', label: 'Importer Address' },
  { key: 'country_of_origin', label: 'Country of Origin' },
  { key: 'mrp', label: 'Maximum Retail Price (MRP)' },
  { key: 'mrp_tax_inclusive', label: 'MRP Tax Inclusive' },
  { key: 'unit_sale_price', label: 'Unit Sale Price' },
  { key: 'manufacturing_date', label: 'Manufacturing / Applicable Date' },
  { key: 'best_before_date', label: 'Best Before / Use By' },
  { key: 'consumer_care_details', label: 'Consumer Care Details' },
];

// Complete 26 canonical fields for backward compatibility
export const PRODUCT_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'brand_or_commodity_name', label: 'Commodity / Generic Name' },
  { key: 'generic_name', label: 'Generic Name' },
  { key: 'net_quantity', label: 'Net Quantity' },
  { key: 'quantity_unit', label: 'Quantity Unit' },
  { key: 'manufacturer_name', label: 'Manufacturer Name' },
  { key: 'manufacturer_address', label: 'Manufacturer Address' },
  { key: 'packer_name', label: 'Packer Name' },
  { key: 'packer_address', label: 'Packer Address' },
  { key: 'importer_name', label: 'Importer Name' },
  { key: 'importer_address', label: 'Importer Address' },
  { key: 'country_of_origin', label: 'Country of Origin' },
  { key: 'mrp', label: 'MRP (Max Retail Price)' },
  { key: 'mrp_tax_inclusive', label: 'MRP Tax Inclusive' },
  { key: 'unit_sale_price', label: 'Unit Sale Price' },
  { key: 'manufacturing_date', label: 'Manufacturing Date' },
  { key: 'packing_date', label: 'Packing Date' },
  { key: 'expiry_date', label: 'Best Before / Expiry' },
  { key: 'customer_care_phone', label: 'Customer Care Phone' },
  { key: 'customer_care_email', label: 'Customer Care Email' },
  { key: 'customer_care_name', label: 'Customer Care Details' },
  { key: 'marketer_name', label: 'Marketer Name' },
  { key: 'marketer_address', label: 'Marketer Address' },
  { key: 'batch_number', label: 'Batch Number' },
  { key: 'vegetarian_mark', label: 'Vegetarian Mark' },
  { key: 'non_vegetarian_mark', label: 'Non-Vegetarian Mark' },
  { key: 'fssai_number', label: 'FSSAI Number' },
  { key: 'certifications', label: 'Certifications' },
];

// Fields whose OCR/vision disagreement must not be silently resolved.
export const CONFLICT_SENSITIVE_FIELDS = new Set([
  'mrp',
  'net_quantity',
  'packing_date',
  'manufacturing_date',
  'expiry_date',
]);

export function isProductInformation(value: unknown): value is ProductInformation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return true;
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