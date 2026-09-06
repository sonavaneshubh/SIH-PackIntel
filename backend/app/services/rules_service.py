"""Legal Metrology (Packaged Commodities) Rules, 2011 codified Rules Database service.

The Rules Database is the single source of truth for:
1. What fields must be extracted from the package.
2. Which rules apply under specific conditions (domestic, imported, small pack, perishable).
3. How declarations are validated under statutory provisions.
4. Exact legal citations (Rule numbers, sub-rules, and amendments).
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from app.core.config import settings

try:
    from supabase import create_client, Client
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False


class CodifiedRule(BaseModel):
    rule_id: str
    rule_name: str
    legal_reference: str
    requirement: str
    description: str
    applicability: str  # 'all', 'imported', 'domestic', 'conditional', 'perishable'
    validation_logic: Dict[str, Any]
    severity: str  # 'mandatory', 'conditional', 'standard'
    source: str
    version: str = "2011.amended"
    effective_from: str = "2011-04-01"
    effective_to: Optional[str] = None
    active: bool = True
    weight: int = 3


# Authoritative Codified Legal Metrology (Packaged Commodities) Rules, 2011 & Amendments
CODIFIED_RULES: List[CodifiedRule] = [
    CodifiedRule(
        rule_id="RULE-PC-01",
        rule_name="Manufacturer / Packer / Importer Name and Address",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(a)",
        requirement="Name and complete address of the manufacturer, packer or importer shall be declared on the package.",
        description="Every package shall bear the name and complete address of the manufacturer, or where the manufacturer is not the packer, the name and address of the manufacturer and packer, or for imported goods, the name and address of the importer.",
        applicability="all",
        validation_logic={
            "target_fields": ["manufacturer_name", "manufacturer_address", "packer_name", "packer_address", "importer_name", "importer_address"],
            "criteria": "at_least_one_identity_with_address",
        },
        severity="mandatory",
        source="Ministry of Consumer Affairs, Food and Public Distribution, Notification G.S.R. 202(E)",
        version="2011.amended",
        effective_from="2011-04-01",
        active=True,
        weight=5,
    ),
    CodifiedRule(
        rule_id="RULE-PC-02",
        rule_name="Common / Generic Name of Commodity",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(b)",
        requirement="The common or generic name of the commodity contained in the package must be clearly declared.",
        description="The common or generic name of the commodity contained in the package and, in case of packages with more than one product, the name and quantity of each product shall be declared.",
        applicability="all",
        validation_logic={
            "target_fields": ["commodity_name", "generic_name"],
            "criteria": "non_empty_string",
        },
        severity="mandatory",
        source="Ministry of Consumer Affairs, Food and Public Distribution, Notification G.S.R. 202(E)",
        version="2011.amended",
        effective_from="2011-04-01",
        active=True,
        weight=4,
    ),
    CodifiedRule(
        rule_id="RULE-PC-03",
        rule_name="Net Quantity Declaration",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(c), Rule 11 & Rule 12",
        requirement="The net quantity in terms of standard unit of weight, measure or number must be declared.",
        description="The net quantity shall be declared on the principal display panel in standard metric units (g, kg, ml, l, m, cm, unit/number) with permissible maximum error limits as specified under the Second Schedule.",
        applicability="all",
        validation_logic={
            "target_fields": ["net_quantity", "quantity_unit"],
            "criteria": "valid_quantity_and_metric_unit",
        },
        severity="mandatory",
        source="Ministry of Consumer Affairs, Food and Public Distribution, Notification G.S.R. 202(E) & Second Schedule",
        version="2011.amended",
        effective_from="2011-04-01",
        active=True,
        weight=5,
    ),
    CodifiedRule(
        rule_id="RULE-PC-04",
        rule_name="Month and Year of Manufacture / Pre-packing / Import",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(d)",
        requirement="The month and year in which the commodity is manufactured, pre-packed, or imported must be stated.",
        description="The month and year of manufacture or pre-packing or import shall be declared in words or numerals (MM/YYYY or Month YYYY) on the label.",
        applicability="all",
        validation_logic={
            "target_fields": ["manufacturing_date", "packing_date", "import_date"],
            "criteria": "valid_month_year_format",
        },
        severity="mandatory",
        source="Ministry of Consumer Affairs, Food and Public Distribution, Notification G.S.R. 202(E)",
        version="2011.amended",
        effective_from="2011-04-01",
        active=True,
        weight=4,
    ),
    CodifiedRule(
        rule_id="RULE-PC-05",
        rule_name="Maximum Retail Price (MRP)",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(e)",
        requirement="The maximum retail sale price of the package must be clearly declared.",
        description="The retail sale price of the package shall be declared in Indian Rupees as Maximum Retail Price or MRP, with the currency symbol ₹ or Rs.",
        applicability="all",
        validation_logic={
            "target_fields": ["mrp"],
            "criteria": "valid_currency_and_amount",
        },
        severity="mandatory",
        source="Ministry of Consumer Affairs, Food and Public Distribution, Notification G.S.R. 202(E)",
        version="2011.amended",
        effective_from="2011-04-01",
        active=True,
        weight=5,
    ),
    CodifiedRule(
        rule_id="RULE-PC-06",
        rule_name="MRP Inclusive of All Taxes",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(e) Proviso & Amendments",
        requirement="Maximum Retail Price must be declared as inclusive of all taxes.",
        description="The MRP declaration shall be expressed in the form: Maximum or Max. Retail Price Rs./₹ ... (incl. of all taxes) or (inclusive of all taxes).",
        applicability="all",
        validation_logic={
            "target_fields": ["mrp", "mrp_tax_inclusive"],
            "criteria": "tax_inclusive_affirmation",
        },
        severity="mandatory",
        source="Legal Metrology (Packaged Commodities) Amendment Rules, 2017 & G.S.R. 779(E)",
        version="2017.amended",
        effective_from="2018-01-01",
        active=True,
        weight=3,
    ),
    CodifiedRule(
        rule_id="RULE-PC-07",
        rule_name="Unit Sale Price (USP)",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(da)",
        requirement="Unit sale price per g/ml (for <= 1kg/1L) or per kg/L (for > 1kg/1L) or per item.",
        description="Declaration of unit sale price in rupees rounded off to the nearest two decimal places for packages containing commodities more than 1 kg or 1 L or sold by number.",
        applicability="conditional",
        validation_logic={
            "target_fields": ["unit_sale_price", "net_quantity"],
            "criteria": "valid_unit_sale_price_or_exempt",
        },
        severity="conditional",
        source="Legal Metrology (Packaged Commodities) Amendment Rules, 2021 (G.S.R. 779(E))",
        version="2021.amended",
        effective_from="2022-12-01",
        active=True,
        weight=2,
    ),
    CodifiedRule(
        rule_id="RULE-PC-08",
        rule_name="Consumer Care Contact Details",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1)(h)",
        requirement="Complete contact details (name, address, phone/telephone, and email) for consumer grievance redressal.",
        description="Name, address, telephone number and email address of the person who can be contacted by the consumer in case of complaints or consumer care details.",
        applicability="all",
        validation_logic={
            "target_fields": ["consumer_care_details", "customer_care_phone", "customer_care_email", "customer_care_name", "customer_care_address"],
            "criteria": "has_phone_or_email_and_address",
        },
        severity="mandatory",
        source="Ministry of Consumer Affairs, Food and Public Distribution, Notification G.S.R. 202(E)",
        version="2011.amended",
        effective_from="2011-04-01",
        active=True,
        weight=3,
    ),
    CodifiedRule(
        rule_id="RULE-PC-09",
        rule_name="Country of Origin for Imported Packages",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(10) & Rule 6(1)(d) Proviso",
        requirement="Country of origin or manufacturer country must be stated for all imported packages.",
        description="For imported packages, the name of the country of origin or manufacture shall be mentioned clearly on the label.",
        applicability="imported",
        validation_logic={
            "target_fields": ["country_of_origin"],
            "criteria": "valid_country_name_if_imported",
        },
        severity="conditional",
        source="Legal Metrology (Packaged Commodities) Amendment Rules & G.S.R. 584(E)",
        version="2017.amended",
        effective_from="2018-01-01",
        active=True,
        weight=3,
    ),
    CodifiedRule(
        rule_id="RULE-PC-10",
        rule_name="Best Before / Use By Declaration",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 6(1) Proviso & Commodity Rules",
        requirement="Best before or use by date declaration for perishable commodities or commodities with limited shelf life.",
        description="Packages of commodities that may become unfit for consumption after a period shall bear best before or use by date declarations.",
        applicability="conditional",
        validation_logic={
            "target_fields": ["best_before_date", "expiry_date", "use_by_date"],
            "criteria": "valid_expiry_or_shelf_life_if_applicable",
        },
        severity="conditional",
        source="Legal Metrology (Packaged Commodities) Rules, 2011",
        version="2011.amended",
        effective_from="2011-04-01",
        active=True,
        weight=2,
    ),
    CodifiedRule(
        rule_id="RULE-PC-11",
        rule_name="Standard Units and Symbols",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 13 & First/Second Schedules",
        requirement="Standard metric units and official symbols (g, kg, ml, L, cm, m, U, N) must be used without alteration.",
        description="The unit of measurement shall be in accordance with the International System of Units (SI) - e.g., 'g' or 'kg' for mass, 'ml' or 'L' for volume, 'm' or 'cm' for length, without pluralization or non-standard symbols.",
        applicability="all",
        validation_logic={
            "target_fields": ["quantity_unit", "net_quantity"],
            "criteria": "strict_si_symbol_adherence",
        },
        severity="mandatory",
        source="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 13",
        version="2011.amended",
        effective_from="2011-04-01",
        active=True,
        weight=3,
    ),
    CodifiedRule(
        rule_id="RULE-PC-12",
        rule_name="Size of Letters and Numerals",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 7 & Table 1",
        requirement="Height of letters and numerals on declarations shall meet minimum height standards based on PDP area.",
        description="The height of any numeral and letter in the declaration on the principal display panel shall not be less than the minimum height prescribed in Table 1 (ranging from 1.0mm to 6.0mm depending on package size/weight) where technically determinable.",
        applicability="all",
        validation_logic={
            "target_fields": ["letter_height_estimate", "pdp_area"],
            "criteria": "evaluable_when_resolution_permits",
        },
        severity="standard",
        source="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 7",
        version="2011.amended",
        effective_from="2011-04-01",
        active=True,
        weight=2,
    ),
    CodifiedRule(
        rule_id="RULE-PC-13",
        rule_name="Manner / Visibility / Legibility of Declarations",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 9",
        requirement="Every declaration shall be legible, prominent, definite, plain and conspicuous.",
        description="All declarations required to be made on a package shall be legible and conspicuous, with distinct contrast between the background and the inscription.",
        applicability="all",
        validation_logic={
            "target_fields": ["legibility_score", "ocr_confidence", "image_quality"],
            "criteria": "text_clarity_and_contrast",
        },
        severity="mandatory",
        source="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 9",
        version="2011.amended",
        effective_from="2011-04-01",
        active=True,
        weight=3,
    ),
    CodifiedRule(
        rule_id="RULE-PC-14",
        rule_name="Principal Display Panel (PDP) Grouping and Placement",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 2(h) & Rule 6",
        requirement="Mandatory declarations shall appear on the principal display panel in a clear and grouped layout.",
        description="All mandatory declarations (generic name, net quantity, retail sale price, manufacturing date) shall be grouped together and displayed clearly on the principal display panel of the package.",
        applicability="all",
        validation_logic={
            "target_fields": ["pdp_grouping", "layout_regions"],
            "criteria": "declarations_grouped_on_pdp",
        },
        severity="standard",
        source="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 2(h)",
        version="2011.amended",
        effective_from="2011-04-01",
        active=True,
        weight=2,
    ),
    CodifiedRule(
        rule_id="RULE-PC-15",
        rule_name="Commodity-Specific / Conditional Requirements",
        legal_reference="Legal Metrology (Packaged Commodities) Rules, 2011 - Schedules & Package Size Exemptions",
        requirement="Support for commodity-specific standard pack sizes and small package exemptions (<= 10g / 10ml).",
        description="Specific commodities packed in standardized quantities (Second Schedule) or exemptions applicable to small packages containing 10g/10ml or less (Rule 26) shall be conditionally evaluated.",
        applicability="conditional",
        validation_logic={
            "target_fields": ["commodity_type", "net_quantity", "exemptions"],
            "criteria": "evaluate_schedule_or_exemption",
        },
        severity="conditional",
        source="Legal Metrology (Packaged Commodities) Rules, 2011 - Rule 26 & Schedules",
        version="2011.amended",
        effective_from="2011-04-01",
        active=True,
        weight=2,
    ),
]


class RulesService:
    @classmethod
    def get_active_rules(cls) -> List[CodifiedRule]:
        """Fetch active rules from database or fallback to the built-in codified registry."""
        if HAS_SUPABASE and settings.SUPABASE_SERVICE_ROLE_KEY and settings.clean_supabase_url:
            try:
                client = create_client(settings.clean_supabase_url, settings.SUPABASE_SERVICE_ROLE_KEY)
                resp = client.table("compliance_rules").select("*").eq("active", True).execute()
                if resp.data and len(resp.data) >= 5:
                    rules = []
                    for row in resp.data:
                        rules.append(CodifiedRule(
                            rule_id=row["rule_id"],
                            rule_name=row["rule_name"],
                            legal_reference=row["legal_reference"],
                            requirement=row["requirement"],
                            description=row["description"],
                            applicability=row.get("applicability", "all"),
                            validation_logic=row.get("validation_logic") or {},
                            severity=row.get("severity", "mandatory"),
                            source=row.get("source", "Legal Metrology Rules, 2011"),
                            version=row.get("version", "2011.amended"),
                            effective_from=str(row.get("effective_from") or "2011-04-01"),
                            effective_to=row.get("effective_to"),
                            active=bool(row.get("active", True)),
                        ))
                    return rules
            except Exception:
                pass
        return [r for r in CODIFIED_RULES if r.active]

    @classmethod
    def get_rule_by_id(cls, rule_id: str) -> Optional[CodifiedRule]:
        rules = cls.get_active_rules()
        for r in rules:
            if r.rule_id == rule_id:
                return r
        return None


def get_rules_service() -> RulesService:
    return RulesService()
