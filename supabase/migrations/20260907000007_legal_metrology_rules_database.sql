-- 20260907000007_legal_metrology_rules_database.sql
-- Legal Metrology (Packaged Commodities) Rules, 2011 codified compliance rules database.
-- Supports exact rule citations, requirements, descriptions, applicability, validation logic,
-- severity, source, version, and effective dates.

CREATE TABLE IF NOT EXISTS public.compliance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT UNIQUE NOT NULL,
  rule_name TEXT NOT NULL,
  legal_reference TEXT NOT NULL,
  requirement TEXT NOT NULL,
  description TEXT NOT NULL,
  applicability TEXT NOT NULL DEFAULT 'all',
  validation_logic JSONB DEFAULT '{}'::jsonb,
  severity TEXT DEFAULT 'mandatory' CHECK (severity IN ('mandatory', 'conditional', 'standard')),
  source TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '2011.amended',
  effective_from DATE DEFAULT '2011-04-01',
  effective_to DATE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read compliance rules" ON public.compliance_rules;
CREATE POLICY "Public read compliance rules" ON public.compliance_rules
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated insert/update compliance rules" ON public.compliance_rules;
CREATE POLICY "Authenticated insert/update compliance rules" ON public.compliance_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_compliance_rules_rule_id ON public.compliance_rules(rule_id);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_active ON public.compliance_rules(active);

-- Seed / Upsert the 15 Core Legal Metrology Codified Rules
INSERT INTO public.compliance_rules (
  rule_id, rule_name, legal_reference, requirement, description, applicability, validation_logic, severity, source, version, effective_from, active
) VALUES
(
  'RULE-PC-01',
  'Manufacturer / Packer / Importer Name and Address',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(a)',
  'Name and complete address of the manufacturer, packer or importer shall be declared on the package.',
  'Every package shall bear the name and complete address of the manufacturer, or where the manufacturer is not the packer, the name and address of the manufacturer and packer, or for imported goods, the name and address of the importer.',
  'all',
  '{"target_fields": ["manufacturer_name", "manufacturer_address", "packer_name", "packer_address", "importer_name", "importer_address"], "criteria": "at_least_one_identity_with_address"}'::jsonb,
  'mandatory',
  'Ministry of Consumer Affairs, Food and Public Distribution, Notification G.S.R. 202(E)',
  '2011.amended',
  '2011-04-01',
  true
),
(
  'RULE-PC-02',
  'Common / Generic Name of Commodity',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(b)',
  'The common or generic name of the commodity contained in the package must be clearly declared.',
  'The common or generic name of the commodity contained in the package and, in case of packages with more than one product, the name and quantity of each product shall be declared.',
  'all',
  '{"target_fields": ["commodity_name", "generic_name"], "criteria": "non_empty_string"}'::jsonb,
  'mandatory',
  'Ministry of Consumer Affairs, Food and Public Distribution, Notification G.S.R. 202(E)',
  '2011.amended',
  '2011-04-01',
  true
),
(
  'RULE-PC-03',
  'Net Quantity Declaration',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(c), Rule 11 & Rule 12',
  'The net quantity in terms of standard unit of weight, measure or number must be declared.',
  'The net quantity shall be declared on the principal display panel in standard metric units (g, kg, ml, l, m, cm, unit/number) with permissible maximum error limits as specified under the Second Schedule.',
  'all',
  '{"target_fields": ["net_quantity", "quantity_unit"], "criteria": "valid_quantity_and_metric_unit"}'::jsonb,
  'mandatory',
  'Ministry of Consumer Affairs, Food and Public Distribution, Notification G.S.R. 202(E) & Second Schedule',
  '2011.amended',
  '2011-04-01',
  true
),
(
  'RULE-PC-04',
  'Month and Year of Manufacture / Pre-packing / Import',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(d)',
  'The month and year in which the commodity is manufactured, pre-packed, or imported must be stated.',
  'The month and year of manufacture or pre-packing or import shall be declared in words or numerals (MM/YYYY or Month YYYY) on the label.',
  'all',
  '{"target_fields": ["manufacturing_date", "packing_date", "import_date"], "criteria": "valid_month_year_format"}'::jsonb,
  'mandatory',
  'Ministry of Consumer Affairs, Food and Public Distribution, Notification G.S.R. 202(E)',
  '2011.amended',
  '2011-04-01',
  true
),
(
  'RULE-PC-05',
  'Maximum Retail Price (MRP)',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(e)',
  'The maximum retail sale price of the package must be clearly declared.',
  'The retail sale price of the package shall be declared in Indian Rupees as Maximum Retail Price or MRP, with the currency symbol ₹ or Rs.',
  'all',
  '{"target_fields": ["mrp"], "criteria": "valid_currency_and_amount"}'::jsonb,
  'mandatory',
  'Ministry of Consumer Affairs, Food and Public Distribution, Notification G.S.R. 202(E)',
  '2011.amended',
  '2011-04-01',
  true
),
(
  'RULE-PC-06',
  'MRP Inclusive of All Taxes',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(e) Proviso & Amendments',
  'Maximum Retail Price must be declared as inclusive of all taxes.',
  'The MRP declaration shall be expressed in the form: Maximum or Max. Retail Price Rs./₹ ... (incl. of all taxes) or (inclusive of all taxes).',
  'all',
  '{"target_fields": ["mrp", "mrp_tax_inclusive"], "criteria": "tax_inclusive_affirmation"}'::jsonb,
  'mandatory',
  'Legal Metrology (Packaged Commodities) Amendment Rules, 2017 & G.S.R. 779(E)',
  '2017.amended',
  '2018-01-01',
  true
),
(
  'RULE-PC-07',
  'Unit Sale Price (USP)',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(da)',
  'Unit sale price per g/ml (for <= 1kg/1L) or per kg/L (for > 1kg/1L) or per item.',
  'Declaration of unit sale price in rupees rounded off to the nearest two decimal places for packages containing commodities more than 1 kg or 1 L or sold by number.',
  'conditional',
  '{"target_fields": ["unit_sale_price", "net_quantity"], "criteria": "valid_unit_sale_price_or_exempt"}'::jsonb,
  'conditional',
  'Legal Metrology (Packaged Commodities) Amendment Rules, 2021 (G.S.R. 779(E))',
  '2021.amended',
  '2022-12-01',
  true
),
(
  'RULE-PC-08',
  'Consumer Care Contact Details',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(h)',
  'Complete contact details (name, address, phone/telephone, and email) for consumer grievance redressal.',
  'Name, address, telephone number and email address of the person who can be contacted by the consumer in case of complaints or consumer care details.',
  'all',
  '{"target_fields": ["consumer_care_details", "customer_care_phone", "customer_care_email", "customer_care_name", "customer_care_address"], "criteria": "has_phone_or_email_and_address"}'::jsonb,
  'mandatory',
  'Ministry of Consumer Affairs, Food and Public Distribution, Notification G.S.R. 202(E)',
  '2011.amended',
  '2011-04-01',
  true
),
(
  'RULE-PC-09',
  'Country of Origin for Imported Packages',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(10) & Rule 6(1)(d) Proviso',
  'Country of origin or manufacturer country must be stated for all imported packages.',
  'For imported packages, the name of the country of origin or manufacture shall be mentioned clearly on the label.',
  'imported',
  '{"target_fields": ["country_of_origin"], "criteria": "valid_country_name_if_imported"}'::jsonb,
  'conditional',
  'Legal Metrology (Packaged Commodities) Amendment Rules & G.S.R. 584(E)',
  '2017.amended',
  '2018-01-01',
  true
),
(
  'RULE-PC-10',
  'Best Before / Use By Declaration',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1) Proviso & Commodity Rules',
  'Best before or use by date declaration for perishable commodities or commodities with limited shelf life.',
  'Packages of commodities that may become unfit for consumption after a period shall bear best before or use by date declarations.',
  'conditional',
  '{"target_fields": ["best_before_date", "expiry_date", "use_by_date"], "criteria": "valid_expiry_or_shelf_life_if_applicable"}'::jsonb,
  'conditional',
  'Legal Metrology (Packaged Commodities) Rules, 2011',
  '2011.amended',
  '2011-04-01',
  true
),
(
  'RULE-PC-11',
  'Standard Units and Symbols',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 13 & First/Second Schedules',
  'Standard metric units and official symbols (g, kg, ml, L, cm, m, U, N) must be used without alteration.',
  'The unit of measurement shall be in accordance with the International System of Units (SI) - e.g., "g" or "kg" for mass, "ml" or "L" for volume, "m" or "cm" for length, without pluralization or non-standard symbols.',
  'all',
  '{"target_fields": ["quantity_unit", "net_quantity"], "criteria": "strict_si_symbol_adherence"}'::jsonb,
  'mandatory',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 13',
  '2011.amended',
  '2011-04-01',
  true
),
(
  'RULE-PC-12',
  'Size of Letters and Numerals',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 7 & Table 1',
  'Height of letters and numerals on declarations shall meet minimum height standards based on PDP area.',
  'The height of any numeral and letter in the declaration on the principal display panel shall not be less than the minimum height prescribed in Table 1 (ranging from 1.0mm to 6.0mm depending on package size/weight) where technically determinable.',
  'all',
  '{"target_fields": ["letter_height_estimate", "pdp_area"], "criteria": "evaluable_when_resolution_permits"}'::jsonb,
  'standard',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 7',
  '2011.amended',
  '2011-04-01',
  true
),
(
  'RULE-PC-13',
  'Manner / Visibility / Legibility of Declarations',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 9',
  'Every declaration shall be legible, prominent, definite, plain and conspicuous.',
  'All declarations required to be made on a package shall be legible and conspicuous, with distinct contrast between the background and the inscription.',
  'all',
  '{"target_fields": ["legibility_score", "ocr_confidence", "image_quality"], "criteria": "text_clarity_and_contrast"}'::jsonb,
  'mandatory',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 9',
  '2011.amended',
  '2011-04-01',
  true
),
(
  'RULE-PC-14',
  'Principal Display Panel (PDP) Grouping and Placement',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 2(h) & Rule 6',
  'Mandatory declarations shall appear on the principal display panel in a clear and grouped layout.',
  'All mandatory declarations (generic name, net quantity, retail sale price, manufacturing date) shall be grouped together and displayed clearly on the principal display panel of the package.',
  'all',
  '{"target_fields": ["pdp_grouping", "layout_regions"], "criteria": "declarations_grouped_on_pdp"}'::jsonb,
  'standard',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 2(h)',
  '2011.amended',
  '2011-04-01',
  true
),
(
  'RULE-PC-15',
  'Commodity-Specific / Conditional Requirements',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Schedules & Package Size Exemptions',
  'Support for commodity-specific standard pack sizes and small package exemptions (<= 10g / 10ml).',
  'Specific commodities packed in standardized quantities (Second Schedule) or exemptions applicable to small packages containing 10g/10ml or less (Rule 26) shall be conditionally evaluated.',
  'conditional',
  '{"target_fields": ["commodity_type", "net_quantity", "exemptions"], "criteria": "evaluate_schedule_or_exemption"}'::jsonb,
  'conditional',
  'Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 26 & Schedules',
  '2011.amended',
  '2011-04-01',
  true
)
ON CONFLICT (rule_id) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  legal_reference = EXCLUDED.legal_reference,
  requirement = EXCLUDED.requirement,
  description = EXCLUDED.description,
  applicability = EXCLUDED.applicability,
  validation_logic = EXCLUDED.validation_logic,
  severity = EXCLUDED.severity,
  source = EXCLUDED.source,
  version = EXCLUDED.version,
  effective_from = EXCLUDED.effective_from,
  active = EXCLUDED.active,
  updated_at = NOW();
