// SIH Evaluation Demo — sample data set.
//
// Everything in this module is FICTIONAL demonstration data. It is bundled
// locally (never read from Supabase or any other service) and is used only by
// the public, read-only evaluation experience at /demo. It deliberately
// contains no real names, emails, inspector identities, invoice numbers, or
// storage references so it can never be confused with — or leak — a real
// PackIntel user's data.

export interface SampleDeclaration {
  ruleCode: string;
  label: string;
  value: string;
  confidence: number;
}

export type SampleRuleResultKind = 'pass' | 'fail' | 'warning' | 'not_applicable';

export interface SampleRuleResult {
  rule_code: string;
  rule_name: string;
  result: SampleRuleResultKind;
  extracted_value: string | null;
  explanation: string;
}

export interface SampleReport {
  type: 'PDF' | 'JSON' | 'Excel';
  name: string;
  sizeKb: number;
  generatedAt: string;
}

export interface SampleInspection {
  inspection_number: string;
  product_name: string;
  brand_name: string;
  product_category: string;
  is_imported: boolean;
  status: 'completed' | 'processing';
  overall_result: 'pass' | 'fail' | 'review';
  risk_score: number;
  compliance_score: number;
  inspected_at: string;
  inspector: string;
  ocr_confidence: number;
  label_image: string;
  evidence_crops: number;
  net_quantity: string;
  declarations: SampleDeclaration[];
  rules: SampleRuleResult[];
  reports: SampleReport[];
}

const OIL_IMAGE = '/screen.png';

// ─── Rule helper ─────────────────────────────────────────────────────────────
function rule(
  rule_code: string,
  rule_name: string,
  result: SampleRuleResultKind,
  extracted_value: string | null,
  explanation: string
): SampleRuleResult {
  return { rule_code, rule_name, result, extracted_value, explanation };
}

// ─── Sample 1: Compliant sunflower oil ───────────────────────────────────────
const freshPressSunflowerOil: SampleInspection = {
  inspection_number: 'SMP-000001',
  product_name: 'Refined Sunflower Oil',
  brand_name: 'FreshPress',
  product_category: 'Edible Oils',
  is_imported: false,
  status: 'completed',
  overall_result: 'pass',
  risk_score: 8,
  compliance_score: 96,
  inspected_at: '2026-09-12T09:40:00',
  inspector: 'SMP-INSP-101',
  ocr_confidence: 97,
  label_image: OIL_IMAGE,
  evidence_crops: 4,
  net_quantity: '1 L',
  declarations: [
    { ruleCode: 'RULE-PC-01', label: 'Manufacturer / Packer', value: 'FreshPress Agro Foods Pvt. Ltd., B-102 MIDC, Pune 411046', confidence: 98 },
    { ruleCode: 'RULE-PC-02', label: 'Common Name', value: 'Refined Sunflower Oil', confidence: 99 },
    { ruleCode: 'RULE-PC-03', label: 'Net Quantity', value: '1 L', confidence: 96 },
    { ruleCode: 'RULE-PC-04', label: 'Month & Year of Packing', value: '08 2026', confidence: 94 },
    { ruleCode: 'RULE-PC-05', label: 'MRP', value: 'Rs. 145.00 (incl. of all taxes)', confidence: 97 },
    { ruleCode: 'RULE-PC-06', label: 'Tax-Inclusive Affirmation', value: '(incl. of all taxes)', confidence: 95 },
    { ruleCode: 'RULE-PC-08', label: 'Consumer Care', value: '1800-266-2555 / care@freshpress.in', confidence: 93 },
    { ruleCode: 'RULE-PC-11', label: 'Standard Units', value: '1 L', confidence: 98 },
    { ruleCode: 'RULE-PC-12', label: 'Letter Height', value: '3.5 mm (PDP 120 sq.cm)', confidence: 90 },
  ],
  rules: [
    rule('RULE-PC-01', 'Manufacturer / Packer / Importer Name and Address', 'pass', 'FreshPress Agro Foods Pvt. Ltd., B-102 MIDC, Pune 411046', 'Name and complete address present on principal display panel.'),
    rule('RULE-PC-02', 'Common / Generic Name of Commodity', 'pass', 'Refined Sunflower Oil', 'Generic designation declared clearly.'),
    rule('RULE-PC-03', 'Net Quantity Declaration', 'pass', '1 L', 'Net quantity in standard metric unit (L) with correct symbol.'),
    rule('RULE-PC-04', 'Month and Year of Manufacture / Pre-packing', 'pass', '08 2026', 'Month and year declared in MM YYYY form.'),
    rule('RULE-PC-05', 'Maximum Retail Price (MRP)', 'pass', 'Rs. 145.00 (incl. of all taxes)', 'MRP in Indian currency with rupee symbol.'),
    rule('RULE-PC-06', 'MRP Inclusive of All Taxes', 'pass', '(incl. of all taxes)', 'Explicit tax-inclusive affirmation present.'),
    rule('RULE-PC-07', 'Unit Sale Price (USP)', 'not_applicable', null, 'Package is exactly 1 L — USP not triggered (>1 L or sold by number).'),
    rule('RULE-PC-08', 'Consumer Care Contact Details', 'pass', '1800-266-2555 / care@freshpress.in', 'Consumer care phone and email present.'),
    rule('RULE-PC-09', 'Country of Origin for Imported Packages', 'not_applicable', null, 'Domestic product — rule applies to imported packages only.'),
    rule('RULE-PC-10', 'Best Before / Use By Declaration', 'warning', 'Best before 12 months from packing', 'Best-before printed, but font size is below the recommended minimum.'),
    rule('RULE-PC-11', 'Standard Units and Symbols', 'pass', '1 L', 'SI symbols used correctly without pluralisation.'),
    rule('RULE-PC-12', 'Size of Letters and Numerals', 'pass', '3.5 mm', 'Letter height meets Table 1 for the PDP area.'),
    rule('RULE-PC-13', 'Manner / Visibility / Legibility of Declarations', 'pass', 'Contrast verified', 'Declarations legible with distinct contrast.'),
    rule('RULE-PC-14', 'Principal Display Panel Grouping and Placement', 'pass', 'Grouped on PDP', 'Mandatory declarations grouped on the principal display panel.'),
    rule('RULE-PC-15', 'Commodity-Specific / Conditional Requirements', 'pass', 'Standard pack checked', 'No commodity-specific standard size conflict detected.'),
  ],
  reports: [
    { type: 'PDF', name: 'Compliance Report — SMP-000001', sizeKb: 412, generatedAt: '2026-09-12T09:41:00' },
    { type: 'JSON', name: 'Extracted Data — SMP-000001', sizeKb: 86, generatedAt: '2026-09-12T09:41:00' },
    { type: 'Excel', name: 'Evidence Log — SMP-000001', sizeKb: 204, generatedAt: '2026-09-12T09:41:30' },
  ],
};

// ─── Sample 2: Non-compliant salt ────────────────────────────────────────────
const trueSaltIodizedSalt: SampleInspection = {
  inspection_number: 'SMP-000002',
  product_name: 'Iodized Salt',
  brand_name: 'TrueSalt',
  product_category: 'Spices & Salt',
  is_imported: false,
  status: 'completed',
  overall_result: 'fail',
  risk_score: 38,
  compliance_score: 71,
  inspected_at: '2026-09-11T14:25:00',
  inspector: 'SMP-INSP-102',
  ocr_confidence: 88,
  label_image: OIL_IMAGE,
  evidence_crops: 3,
  net_quantity: '500 g',
  declarations: [
    { ruleCode: 'RULE-PC-01', label: 'Manufacturer / Packer', value: 'TrueSalt Industries, Plot 7, Haridwar 249401', confidence: 96 },
    { ruleCode: 'RULE-PC-02', label: 'Common Name', value: 'Iodized Salt', confidence: 98 },
    { ruleCode: 'RULE-PC-03', label: 'Net Quantity', value: '500 gm', confidence: 97 },
    { ruleCode: 'RULE-PC-04', label: 'Month & Year of Packing', value: '07 2026', confidence: 92 },
    { ruleCode: 'RULE-PC-05', label: 'MRP', value: 'Rs. 22.00', confidence: 95 },
    { ruleCode: 'RULE-PC-08', label: 'Consumer Care', value: 'Missing', confidence: 0 },
  ],
  rules: [
    rule('RULE-PC-01', 'Manufacturer / Packer / Importer Name and Address', 'pass', 'TrueSalt Industries, Plot 7, Haridwar 249401', 'Name and address declared.'),
    rule('RULE-PC-02', 'Common / Generic Name of Commodity', 'pass', 'Iodized Salt', 'Generic designation declared.'),
    rule('RULE-PC-03', 'Net Quantity Declaration', 'fail', '500 gm', 'Non-standard unit symbol "gm" — must be "g" under Rule 13.'),
    rule('RULE-PC-04', 'Month and Year of Manufacture / Pre-packing', 'pass', '07 2026', 'Month and year declared.'),
    rule('RULE-PC-05', 'Maximum Retail Price (MRP)', 'warning', 'Rs. 22.00', 'MRP missing the statutory tax-inclusive affirmation.'),
    rule('RULE-PC-06', 'MRP Inclusive of All Taxes', 'fail', null, '"(incl. of all taxes)" phrase not found next to MRP.'),
    rule('RULE-PC-07', 'Unit Sale Price (USP)', 'not_applicable', null, 'Package is 500 g — USP not triggered.'),
    rule('RULE-PC-08', 'Consumer Care Contact Details', 'fail', null, 'No consumer care phone or email declared on the label.'),
    rule('RULE-PC-09', 'Country of Origin for Imported Packages', 'not_applicable', null, 'Domestic product.'),
    rule('RULE-PC-10', 'Best Before / Use By Declaration', 'pass', 'Best before 24 months', 'Best-before present for packaged salt.'),
    rule('RULE-PC-11', 'Standard Units and Symbols', 'fail', '500 gm', '"gm" is not an SI-approved abbreviation; use "g".'),
    rule('RULE-PC-12', 'Size of Letters and Numerals', 'pass', '2.8 mm', 'Letter height compliant for PDP area.'),
    rule('RULE-PC-13', 'Manner / Visibility / Legibility of Declarations', 'pass', 'Contrast verified', 'Declarations visible against package background.'),
    rule('RULE-PC-14', 'Principal Display Panel Grouping and Placement', 'pass', 'Grouped on PDP', 'Mandatory declarations grouped.'),
    rule('RULE-PC-15', 'Commodity-Specific / Conditional Requirements', 'not_applicable', null, 'No conditional standard size applies.'),
  ],
  reports: [
    { type: 'PDF', name: 'Compliance Report — SMP-000002', sizeKb: 428, generatedAt: '2026-09-11T14:26:00' },
    { type: 'JSON', name: 'Extracted Data — SMP-000002', sizeKb: 91, generatedAt: '2026-09-11T14:26:00' },
  ],
};

// ─── Sample 3: Needs-review skincare lotion ──────────────────────────────────
const cocoBloomLotion: SampleInspection = {
  inspection_number: 'SMP-000003',
  product_name: 'Moisturizing Lotion',
  brand_name: 'CocoBloom',
  product_category: 'Personal Care',
  is_imported: false,
  status: 'completed',
  overall_result: 'review',
  risk_score: 24,
  compliance_score: 79,
  inspected_at: '2026-09-10T16:12:00',
  inspector: 'SMP-INSP-101',
  ocr_confidence: 84,
  label_image: OIL_IMAGE,
  evidence_crops: 2,
  net_quantity: '200 ml',
  declarations: [
    { ruleCode: 'RULE-PC-01', label: 'Manufacturer / Packer', value: 'CocoBloom Beauty Pvt. Ltd., A-14 Okhla, New Delhi 110020', confidence: 95 },
    { ruleCode: 'RULE-PC-02', label: 'Common Name', value: 'Moisturizing Lotion', confidence: 97 },
    { ruleCode: 'RULE-PC-03', label: 'Net Quantity', value: '200 ml', confidence: 96 },
    { ruleCode: 'RULE-PC-04', label: 'Month & Year of Packing', value: '06 2026', confidence: 91 },
    { ruleCode: 'RULE-PC-05', label: 'MRP', value: 'MRP Rs. 89.00 (incl. of all taxes)', confidence: 94 },
  ],
  rules: [
    rule('RULE-PC-01', 'Manufacturer / Packer / Importer Name and Address', 'pass', 'CocoBloom Beauty Pvt. Ltd., A-14 Okhla, New Delhi 110020', 'Name and address declared.'),
    rule('RULE-PC-02', 'Common / Generic Name of Commodity', 'pass', 'Moisturizing Lotion', 'Generic designation declared.'),
    rule('RULE-PC-03', 'Net Quantity Declaration', 'pass', '200 ml', 'Standard metric unit and symbol used.'),
    rule('RULE-PC-04', 'Month and Year of Manufacture / Pre-packing', 'pass', '06 2026', 'Month and year declared.'),
    rule('RULE-PC-05', 'Maximum Retail Price (MRP)', 'pass', 'MRP Rs. 89.00 (incl. of all taxes)', 'MRP declared in Indian currency.'),
    rule('RULE-PC-06', 'MRP Inclusive of All Taxes', 'pass', '(incl. of all taxes)', 'Tax-inclusive affirmation present.'),
    rule('RULE-PC-07', 'Unit Sale Price (USP)', 'not_applicable', null, 'Package is 200 ml — USP not triggered.'),
    rule('RULE-PC-08', 'Consumer Care Contact Details', 'warning', 'Email only', 'Consumer care email present but telephone number is missing.'),
    rule('RULE-PC-09', 'Country of Origin for Imported Packages', 'not_applicable', null, 'Domestic product.'),
    rule('RULE-PC-10', 'Best Before / Use By Declaration', 'warning', 'Use within 24 months', 'Shelf-life printed in fine print near the crimp; not on principal display panel.'),
    rule('RULE-PC-11', 'Standard Units and Symbols', 'pass', '200 ml', 'SI-compliant.'),
    rule('RULE-PC-12', 'Size of Letters and Numerals', 'warning', '1.9 mm', 'Retail-sale-price numeral height marginally below Table 1 minimum — needs manual re-measurement.'),
    rule('RULE-PC-13', 'Manner / Visibility / Legibility of Declarations', 'pass', 'Contrast verified', 'Declarations legible.'),
    rule('RULE-PC-14', 'Principal Display Panel Grouping and Placement', 'pass', 'Grouped on PDP', 'Grouping correct.'),
    rule('RULE-PC-15', 'Commodity-Specific / Conditional Requirements', 'warning', 'Small package threshold', 'Close to the 10g/10ml exemption assessment boundary; review recommended.'),
  ],
  reports: [
    { type: 'PDF', name: 'Compliance Report — SMP-000003', sizeKb: 401, generatedAt: '2026-09-10T16:13:00' },
    { type: 'JSON', name: 'Extracted Data — SMP-000003', sizeKb: 82, generatedAt: '2026-09-10T16:13:00' },
    { type: 'Excel', name: 'Evidence Log — SMP-000003', sizeKb: 195, generatedAt: '2026-09-10T16:13:30' },
  ],
};

// ─── Sample 4: High-risk shampoo ─────────────────────────────────────────────
const blueCartonShampoo: SampleInspection = {
  inspection_number: 'SMP-000004',
  product_name: 'Anti-Dandruff Shampoo',
  brand_name: 'BlueCarton',
  product_category: 'Personal Care',
  is_imported: false,
  status: 'completed',
  overall_result: 'fail',
  risk_score: 52,
  compliance_score: 64,
  inspected_at: '2026-09-09T11:05:00',
  inspector: 'SMP-INSP-102',
  ocr_confidence: 76,
  label_image: OIL_IMAGE,
  evidence_crops: 5,
  net_quantity: '340 ml',
  declarations: [
    { ruleCode: 'RULE-PC-01', label: 'Manufacturer / Packer', value: 'BlueCarton Consumer Ltd., 4th Floor Tower B, Gurugram 122002', confidence: 93 },
    { ruleCode: 'RULE-PC-02', label: 'Common Name', value: 'Anti-Dandruff Shampoo', confidence: 96 },
    { ruleCode: 'RULE-PC-03', label: 'Net Quantity', value: '340ml', confidence: 95 },
    { ruleCode: 'RULE-PC-04', label: 'Month & Year of Packing', value: '05 2026', confidence: 90 },
    { ruleCode: 'RULE-PC-05', label: 'MRP', value: 'Rs. 115.00', confidence: 83 },
    { ruleCode: 'RULE-PC-08', label: 'Consumer Care', value: 'Missing', confidence: 0 },
  ],
  rules: [
    rule('RULE-PC-01', 'Manufacturer / Packer / Importer Name and Address', 'pass', 'BlueCarton Consumer Ltd., 4th Floor Tower B, Gurugram 122002', 'Name and address declared.'),
    rule('RULE-PC-02', 'Common / Generic Name of Commodity', 'pass', 'Anti-Dandruff Shampoo', 'Generic designation declared.'),
    rule('RULE-PC-03', 'Net Quantity Declaration', 'warning', '340ml', 'Missing whitespace before unit ("340ml") — ambiguous against Rule 6(1)(c) formatting.'),
    rule('RULE-PC-04', 'Month and Year of Manufacture / Pre-packing', 'pass', '05 2026', 'Month and year declared.'),
    rule('RULE-PC-05', 'Maximum Retail Price (MRP)', 'warning', 'Rs. 115.00', 'MRP present but tax-inclusive affirmation missing.'),
    rule('RULE-PC-06', 'MRP Inclusive of All Taxes', 'fail', null, '"(incl. of all taxes)" not found — statutory phrase required.'),
    rule('RULE-PC-07', 'Unit Sale Price (USP)', 'not_applicable', null, 'Package is 340 ml — USP not triggered.'),
    rule('RULE-PC-08', 'Consumer Care Contact Details', 'fail', null, 'No consumer care details anywhere on the package.'),
    rule('RULE-PC-09', 'Country of Origin for Imported Packages', 'not_applicable', null, 'Domestic product.'),
    rule('RULE-PC-10', 'Best Before / Use By Declaration', 'warning', 'Use within 36 months', 'Shelf-life only in the side panel legalese.'),
    rule('RULE-PC-11', 'Standard Units and Symbols', 'warning', '340ml', 'Unit symbol correct but spacing non-standard.'),
    rule('RULE-PC-12', 'Size of Letters and Numerals', 'fail', '1.4 mm', 'MRP numeral height below Table 1 minimum for the PDP area.'),
    rule('RULE-PC-13', 'Manner / Visibility / Legibility of Declarations', 'fail', 'Low contrast detected', 'MRP printed over a dark artwork band with poor contrast — Rule 9 violation.'),
    rule('RULE-PC-14', 'Principal Display Panel Grouping and Placement', 'pass', 'Grouped on PDP', 'Grouping correct.'),
    rule('RULE-PC-15', 'Commodity-Specific / Conditional Requirements', 'not_applicable', null, 'No conditional standard size applies.'),
  ],
  reports: [
    { type: 'PDF', name: 'Compliance Report — SMP-000004', sizeKb: 446, generatedAt: '2026-09-09T11:06:00' },
    { type: 'JSON', name: 'Extracted Data — SMP-000004', sizeKb: 94, generatedAt: '2026-09-09T11:06:00' },
  ],
};

// ─── Sample 5: Imported chocolate (needs review) ─────────────────────────────
const importedBelgianChocolate: SampleInspection = {
  inspection_number: 'SMP-000005',
  product_name: 'Belgian Chocolate Bar 80%',
  brand_name: 'NoirBelge',
  product_category: 'Imported Confectionery',
  is_imported: true,
  status: 'completed',
  overall_result: 'review',
  risk_score: 20,
  compliance_score: 83,
  inspected_at: '2026-09-08T13:20:00',
  inspector: 'SMP-INSP-101',
  ocr_confidence: 91,
  label_image: OIL_IMAGE,
  evidence_crops: 3,
  net_quantity: '80 g',
  declarations: [
    { ruleCode: 'RULE-PC-01', label: 'Importer', value: 'Global Foods Imports, 12 Worli Sea Face, Mumbai 400030', confidence: 97 },
    { ruleCode: 'RULE-PC-02', label: 'Common Name', value: 'Dark Chocolate', confidence: 98 },
    { ruleCode: 'RULE-PC-03', label: 'Net Quantity', value: '80 g', confidence: 96 },
    { ruleCode: 'RULE-PC-04', label: 'Month & Year of Import', value: '07 2026', confidence: 92 },
    { ruleCode: 'RULE-PC-05', label: 'MRP', value: 'Rs. 250.00 (incl. of all taxes)', confidence: 95 },
    { ruleCode: 'RULE-PC-09', label: 'Country of Origin', value: 'Belgium', confidence: 94 },
  ],
  rules: [
    rule('RULE-PC-01', 'Manufacturer / Packer / Importer Name and Address', 'pass', 'Global Foods Imports, 12 Worli Sea Face, Mumbai 400030', 'Importer name and address declared per Rule 6(1)(a) for imports.'),
    rule('RULE-PC-02', 'Common / Generic Name of Commodity', 'pass', 'Dark Chocolate', 'Generic designation declared.'),
    rule('RULE-PC-03', 'Net Quantity Declaration', 'pass', '80 g', 'Net quantity in standard unit.'),
    rule('RULE-PC-04', 'Month and Year of Manufacture / Pre-packing', 'pass', '07 2026', 'Month and year of import declared.'),
    rule('RULE-PC-05', 'Maximum Retail Price (MRP)', 'pass', 'Rs. 250.00 (incl. of all taxes)', 'MRP declared with rupee symbol.'),
    rule('RULE-PC-06', 'MRP Inclusive of All Taxes', 'pass', '(incl. of all taxes)', 'Tax-inclusive affirmation present.'),
    rule('RULE-PC-07', 'Unit Sale Price (USP)', 'not_applicable', null, 'Package is 80 g — USP not triggered.'),
    rule('RULE-PC-08', 'Consumer Care Contact Details', 'pass', 'care@noirbelge.in', 'Consumer care email present.'),
    rule('RULE-PC-09', 'Country of Origin for Imported Packages', 'pass', 'Belgium', 'Country of origin clearly declared.'),
    rule('RULE-PC-10', 'Best Before / Use By Declaration', 'warning', 'Best before 09 2027', 'Best-before printed in fine print on the rear flap, partially obscured by a seal.'),
    rule('RULE-PC-11', 'Standard Units and Symbols', 'pass', '80 g', 'SI-compliant.'),
    rule('RULE-PC-12', 'Size of Letters and Numerals', 'pass', '2.5 mm', 'Letter height compliant.'),
    rule('RULE-PC-13', 'Manner / Visibility / Legibility of Declarations', 'warning', 'Back panel legibility', 'English declarations blocked by a large French-only marketing banner.'),
    rule('RULE-PC-14', 'Principal Display Panel Grouping and Placement', 'pass', 'Grouped on PDP', 'Grouping correct.'),
    rule('RULE-PC-15', 'Commodity-Specific / Conditional Requirements', 'not_applicable', null, 'No conditional standard size applies.'),
  ],
  reports: [
    { type: 'PDF', name: 'Compliance Report — SMP-000005', sizeKb: 418, generatedAt: '2026-09-08T13:21:00' },
    { type: 'JSON', name: 'Extracted Data — SMP-000005', sizeKb: 88, generatedAt: '2026-09-08T13:21:00' },
  ],
};

// ─── Sample 6: In-progress scan (processing state) ───────────────────────────
const tasteLeafCoffee: SampleInspection = {
  inspection_number: 'SMP-000006',
  product_name: 'Instant Coffee',
  brand_name: 'TasteLeaf',
  product_category: 'Beverages',
  is_imported: false,
  status: 'processing',
  overall_result: 'review',
  risk_score: 0,
  compliance_score: 0,
  inspected_at: '2026-09-13T10:02:00',
  inspector: 'SMP-INSP-102',
  ocr_confidence: 0,
  label_image: OIL_IMAGE,
  evidence_crops: 0,
  net_quantity: '—',
  declarations: [],
  rules: [],
  reports: [],
};

export const sampleInspections: SampleInspection[] = [
  freshPressSunflowerOil,
  trueSaltIodizedSalt,
  cocoBloomLotion,
  blueCartonShampoo,
  importedBelgianChocolate,
  tasteLeafCoffee,
];

export const featuredSample = freshPressSunflowerOil;

export const sampleBrandMark = {
  name: 'PACKINTEL',
  subtitle: 'SIH Evaluation Demo',
};

export const demoNotice =
  'Demonstration mode — sample data only. Get full main-inspector access to the complete PackIntel workflow; nothing shown is real user data and no changes are saved.';