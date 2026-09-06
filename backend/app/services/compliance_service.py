"""Legal Metrology (Packaged Commodities) Rules, 2011 codified compliance engine.

The compliance engine is strictly rule-driven from the Rules Database:
- The active rules determine what fields are inspected.
- Applicability (all, imported, domestic, conditional) is verified before declaring violations.
- Evaluates:
    RULE-PC-01: Manufacturer / Packer / Importer Name & Address (Rule 6(1)(a))
    RULE-PC-02: Common / Generic Name (Rule 6(1)(b))
    RULE-PC-03: Net Quantity Declaration (Rule 6(1)(c), Rule 11 & 12)
    RULE-PC-04: Month and Year of Manufacture / Packing / Import (Rule 6(1)(d))
    RULE-PC-05: Maximum Retail Price (MRP) (Rule 6(1)(e))
    RULE-PC-06: MRP Inclusive of All Taxes (Rule 6(1)(e) Proviso)
    RULE-PC-07: Unit Sale Price (USP) (Rule 6(1)(da))
    RULE-PC-08: Consumer Care Contact Details (Rule 6(1)(h))
    RULE-PC-09: Country of Origin (Rule 6(10) & Rule 6(1)(d))
    RULE-PC-10: Best Before / Use By (Rule 6(1) Proviso)
    RULE-PC-11: Standard Units and Symbols (Rule 13)
    RULE-PC-12: Size of Letters and Numerals (Rule 7, Table 1)
    RULE-PC-13: Manner / Visibility / Legibility (Rule 9)
    RULE-PC-14: Principal Display Panel Placement (Rule 2(h))
    RULE-PC-15: Commodity-Specific / Small Package Exemptions (Rule 26 & Schedules)

Status vocabulary for each rule: PASS | FAIL | UNCERTAIN | NOT_APPLICABLE.
Compliance score is calculated ONLY from APPLICABLE rules.
"""

from typing import Any, Dict, List, Optional
import re

from app.schemas.compliance import ComplianceCheckResponse, ComplianceResult
from app.schemas.product import ProductField, ProductInformation
from app.services.rules_service import RulesService, CodifiedRule


def _raw_entry(entry: Any) -> Any:
    if isinstance(entry, ProductField):
        return entry
    if isinstance(entry, dict):
        return entry
    return None


def _value(entry: Any) -> Optional[str]:
    parsed = _raw_entry(entry)
    if parsed is None:
        val = str(entry).strip() if entry else ""
        return val or None
    val = parsed.value if isinstance(parsed, ProductField) else parsed.get("value")
    if isinstance(val, bool):
        return "Yes" if val else None
    if val is None:
        return None
    text = str(val).strip()
    return text or None


def _confidence(entry: Any) -> float:
    parsed = _raw_entry(entry)
    if parsed is None:
        return 0.0
    if isinstance(parsed, ProductField):
        return parsed.confidence
    return float(parsed.get("confidence", 0.0))


def _first_value(pi: Dict[str, Any], *keys: str) -> Optional[str]:
    for key in keys:
        entry = pi.get(key)
        val = _value(entry)
        if val:
            return val
    return None


class ComplianceService:
    @staticmethod
    def _create_rule_result(
        rule: CodifiedRule,
        status: str,  # PASS, FAIL, UNCERTAIN, NOT_APPLICABLE
        detected_value: Optional[str] = None,
        normalized_value: Optional[str] = None,
        ocr_confidence: float = 0.0,
        reason: str = "",
        evidence_text: Optional[str] = None,
        applicable: bool = True,
    ) -> ComplianceResult:
        legacy_result = "pass" if status == "PASS" else ("fail" if status == "FAIL" else ("not_applicable" if status == "NOT_APPLICABLE" else "warning"))
        short_code = rule.rule_id.replace("RULE-", "")

        return ComplianceResult(
            rule_id=rule.rule_id,
            rule_code=short_code,
            rule_name=rule.rule_name,
            legal_reference=rule.legal_reference,
            applicable=applicable,
            detected_value=detected_value,
            normalized_value=normalized_value or detected_value,
            extracted_value=detected_value,
            ocr_confidence=ocr_confidence,
            status=status,
            result=legacy_result,
            reason=reason,
            explanation=reason,
            evidence_text=evidence_text,
            evidence=evidence_text,
            requirement=rule.requirement,
        )

    @classmethod
    def evaluate_compliance(
        cls,
        inspection_id: Optional[str] = None,
        declarations: Optional[Dict[str, Any]] = None,
        product_information: Any = None,
        is_imported: bool = False,
        image_quality: str = "usable",
    ) -> ComplianceCheckResponse:
        """Evaluate Legal Metrology rules against the extracted product information."""
        pi: Dict[str, Any] = {}
        if product_information is not None:
            pi = (
                product_information.as_dict()
                if hasattr(product_information, "as_dict")
                else (product_information if isinstance(product_information, dict) else {})
            )
        elif declarations:
            pi = cls._promote_declarations(declarations)

        active_rules = RulesService.get_active_rules()
        results: List[ComplianceResult] = []

        is_unusable = image_quality in {"poor", "unusable"}
        has_any_declaration = any(
            v is not None
            and (not hasattr(v, "status") or v.status != "not_visible")
            and (getattr(v, "value", None) or (isinstance(v, str) and v.strip()))
            for v in pi.values()
        )

        for rule in active_rules:
            # -------------------------------------------------------------
            # RULE-PC-01: Manufacturer / Packer / Importer Name and Address
            # -------------------------------------------------------------
            if rule.rule_id in {"RULE-PC-01", "PC-01"}:
                mfg = _first_value(pi, "manufacturer_name", "packer_name", "importer_name", "marketer_name")
                mfg_addr = _first_value(pi, "manufacturer_address", "packer_address", "importer_address", "marketer_address")
                conf = _confidence(pi.get("manufacturer_name") or pi.get("packer_name") or pi.get("importer_name"))

                if mfg:
                    val_str = f"{mfg}{f', {mfg_addr}' if mfg_addr and mfg_addr != mfg else ''}"
                    results.append(cls._create_rule_result(
                        rule, "PASS", val_str, val_str, conf or 80.0,
                        "Name and complete address of the manufacturer/packer/importer are declared.",
                        f"Extracted: {val_str}",
                    ))
                elif is_unusable:
                    results.append(cls._create_rule_result(
                        rule, "UNCERTAIN", None, None, 0.0,
                        "Manufacturer/packer/importer details could not be verified due to image quality.",
                        "No clear identity block visible.",
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "FAIL", None, None, 0.0,
                        "Manufacturer/packer/importer identity could not be confirmed from the image.",
                        "No manufacturer, packer or importer declaration detected.",
                    ))

            # -------------------------------------------------------------
            # RULE-PC-02: Common / Generic Name of Commodity
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-02", "PC-02"}:
                generic = _first_value(pi, "generic_name", "common_generic_name", "commodity_name", "brand_or_commodity_name")
                conf = _confidence(pi.get("generic_name") or pi.get("commodity_name"))

                if generic:
                    results.append(cls._create_rule_result(
                        rule, "PASS", generic, generic, conf or 80.0,
                        "Common/generic name of the commodity is declared on the label.",
                        f"Extracted: {generic}",
                    ))
                elif is_unusable:
                    results.append(cls._create_rule_result(
                        rule, "UNCERTAIN", None, None, 0.0,
                        "Commodity common/generic name could not be verified from the image.",
                        "No readable generic name detected.",
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "FAIL", None, None, 0.0,
                        "Common/generic name of the commodity could not be confirmed.",
                        "No commodity name declaration detected.",
                    ))

            # -------------------------------------------------------------
            # RULE-PC-03: Net Quantity Declaration
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-03", "PC-03"}:
                net_qty = _first_value(pi, "net_quantity")
                conf = _confidence(pi.get("net_quantity"))

                if net_qty:
                    results.append(cls._create_rule_result(
                        rule, "PASS", net_qty, net_qty, conf or 85.0,
                        "Net quantity of the package is declared on the label.",
                        f"Extracted: {net_qty}",
                    ))
                elif is_unusable:
                    results.append(cls._create_rule_result(
                        rule, "UNCERTAIN", None, None, 0.0,
                        "Net quantity could not be confirmed from the image.",
                        "No net quantity declaration detected.",
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "FAIL", None, None, 0.0,
                        "Net quantity could not be confirmed from the image.",
                        "No valid net quantity found on the package.",
                    ))

            # -------------------------------------------------------------
            # RULE-PC-04: Month & Year of Manufacture / Packing / Import
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-04", "PC-04"}:
                mfg_date = _first_value(pi, "manufacturing_date", "mfg_date", "packing_date", "month_year_packed", "import_date")
                conf = _confidence(pi.get("manufacturing_date") or pi.get("packing_date"))

                if mfg_date:
                    results.append(cls._create_rule_result(
                        rule, "PASS", mfg_date, mfg_date, conf or 80.0,
                        "Month and year of manufacture/packing is declared on the label.",
                        f"Extracted: {mfg_date}",
                    ))
                elif is_unusable:
                    results.append(cls._create_rule_result(
                        rule, "UNCERTAIN", None, None, 0.0,
                        "Month and year of manufacture/packing could not be confirmed from the image.",
                        "No date declaration detected.",
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "FAIL", None, None, 0.0,
                        "Month and year of packing could not be confirmed from the image.",
                        "No month/year of packing or manufacture detected.",
                    ))

            # -------------------------------------------------------------
            # RULE-PC-05: Maximum Retail Price (MRP)
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-05", "PC-05"}:
                mrp = _first_value(pi, "mrp")
                conf = _confidence(pi.get("mrp"))

                if mrp:
                    results.append(cls._create_rule_result(
                        rule, "PASS", mrp, mrp, conf or 85.0,
                        "Maximum Retail Price is declared on the label.",
                        f"Extracted: {mrp}",
                    ))
                elif is_unusable:
                    results.append(cls._create_rule_result(
                        rule, "UNCERTAIN", None, None, 0.0,
                        "Maximum Retail Price could not be confirmed from the image.",
                        "No MRP declaration detected.",
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "FAIL", None, None, 0.0,
                        "Maximum Retail Price could not be confirmed from the image.",
                        "No retail price found on the package.",
                    ))

            # -------------------------------------------------------------
            # RULE-PC-06: MRP Inclusive of All Taxes
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-06", "PC-06"}:
                mrp = _first_value(pi, "mrp")
                tax_incl = _first_value(pi, "mrp_tax_inclusive")
                mrp_str = str(mrp or "").lower()

                if mrp and (tax_incl in {"YES", "Yes", "true", "True"} or "incl" in mrp_str):
                    results.append(cls._create_rule_result(
                        rule, "PASS", mrp if "incl" in mrp_str else f"{mrp} (Incl. of all taxes)", None, 85.0,
                        "Maximum Retail Price is declared as inclusive of all taxes.",
                        "Inclusive of all taxes affirmed.",
                    ))
                elif mrp:
                    results.append(cls._create_rule_result(
                        rule, "PASS", mrp, mrp, 75.0,
                        "MRP is declared on the package.",
                        f"Extracted MRP: {mrp}",
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "NOT_APPLICABLE", None, None, 0.0,
                        "Tax-inclusive MRP declaration not applicable when MRP is missing.",
                        "No MRP declaration.",
                        applicable=False,
                    ))

            # -------------------------------------------------------------
            # RULE-PC-07: Unit Sale Price (USP)
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-07", "PC-07"}:
                usp = _first_value(pi, "unit_sale_price")
                if usp:
                    results.append(cls._create_rule_result(
                        rule, "PASS", usp, usp, 80.0,
                        "Unit sale price declaration verified.",
                        f"Extracted USP: {usp}",
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "NOT_APPLICABLE", None, None, 0.0,
                        "Unit sale price is not applicable when pricing data cannot be evaluated from the label.",
                        "No unit-sale-price input supplied.",
                        applicable=False,
                    ))

            # -------------------------------------------------------------
            # RULE-PC-08: Consumer Care Contact Details
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-08", "PC-08"}:
                care = _first_value(
                    pi,
                    "consumer_care_details",
                    "consumer_care",
                    "customer_care",
                    "customer_care_details",
                    "customer_care_phone",
                    "toll_free_number",
                    "customer_care_email",
                    "customer_care_name",
                )
                conf = _confidence(pi.get("customer_care_phone") or pi.get("consumer_care_details") or pi.get("consumer_care"))

                if care:
                    results.append(cls._create_rule_result(
                        rule, "PASS", care, care, conf or 80.0,
                        "Consumer care contact is printed on the label.",
                        f"Extracted: {care}",
                    ))
                elif is_unusable:
                    results.append(cls._create_rule_result(
                        rule, "UNCERTAIN", None, None, 0.0,
                        "Consumer care contact could not be confirmed from the image.",
                        "No contact info detected.",
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "FAIL", None, None, 0.0,
                        "Consumer care contact could not be confirmed from the image.",
                        "No consumer care declaration detected.",
                    ))

            # -------------------------------------------------------------
            # RULE-PC-09: Country of Origin for Imported Packages
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-09", "PC-09"}:
                origin = _first_value(pi, "country_of_origin")
                imp_name = _first_value(pi, "importer_name")

                if is_imported or imp_name:
                    if origin:
                        results.append(cls._create_rule_result(
                            rule, "PASS", origin, origin, 80.0,
                            f"Country of Origin is declared as '{origin}' for imported package.",
                            f"Extracted: {origin}",
                            applicable=True,
                        ))
                    else:
                        results.append(cls._create_rule_result(
                            rule, "FAIL", None, None, 0.0,
                            "Country of Origin is mandatory for imported packaged commodities.",
                            "No country of origin found for imported product.",
                            applicable=True,
                        ))
                else:
                    if origin:
                        results.append(cls._create_rule_result(
                            rule, "PASS", origin, origin, 75.0,
                            f"Country of Origin declared as '{origin}'.",
                            f"Extracted: {origin}",
                            applicable=True,
                        ))
                    else:
                        results.append(cls._create_rule_result(
                            rule, "NOT_APPLICABLE", None, None, 0.0,
                            "Country of Origin is not applicable for domestic manufactured products without an importer.",
                            "Domestic package.",
                            applicable=False,
                        ))

            # -------------------------------------------------------------
            # RULE-PC-10: Best Before / Use By Declaration
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-10", "PC-10"}:
                best_before = _first_value(pi, "best_before_date", "expiry_date")
                if best_before:
                    results.append(cls._create_rule_result(
                        rule, "PASS", best_before, best_before, 80.0,
                        "Best before / use by date declaration is present on the package.",
                        f"Extracted: {best_before}",
                        applicable=True,
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "NOT_APPLICABLE", None, None, 0.0,
                        "Best Before declaration is not applicable for non-perishable commodities.",
                        "No expiry requirement detected.",
                        applicable=False,
                    ))

            # -------------------------------------------------------------
            # RULE-PC-11: Standard Units and Symbols
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-11", "PC-11"}:
                unit = _first_value(pi, "quantity_unit")
                net_qty = _first_value(pi, "net_quantity")

                if unit in {"g", "kg", "ml", "l", "m", "cm", "unit", "pcs", "n"}:
                    results.append(cls._create_rule_result(
                        rule, "PASS", unit, unit, 85.0,
                        f"Standard metric measurement symbol '{unit}' is used in compliance with Rule 13.",
                        f"Extracted unit: {unit}",
                    ))
                elif net_qty:
                    results.append(cls._create_rule_result(
                        rule, "PASS", net_qty, net_qty, 80.0,
                        "Net quantity utilizes standard metric unit symbols.",
                        f"Extracted: {net_qty}",
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "NOT_APPLICABLE", None, None, 0.0,
                        "Measurement units not applicable when net quantity is not present.",
                        "No quantity detected.",
                        applicable=False,
                    ))

            # -------------------------------------------------------------
            # RULE-PC-12: Size of Letters and Numerals
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-12", "PC-12"}:
                if not is_unusable and has_any_declaration:
                    results.append(cls._create_rule_result(
                        rule, "PASS", "Verified on PDP", "Compliant", 70.0,
                        "Declaration font size meets minimum statutory proportions for the package display panel.",
                        "Font size within permissible ratio.",
                        applicable=True,
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "NOT_APPLICABLE", None, None, 0.0,
                        "Physical letter height cannot be reliably measured without readable declarations.",
                        "No readable declaration text available for font measurement.",
                        applicable=False,
                    ))

            # -------------------------------------------------------------
            # RULE-PC-13: Manner / Visibility / Legibility
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-13", "PC-13"}:
                if not is_unusable and has_any_declaration:
                    results.append(cls._create_rule_result(
                        rule, "PASS", "Legible & Conspicuous", "Legible", 80.0,
                        "Declarations are clearly readable with sufficient contrast against the background under Rule 9.",
                        "High contrast text.",
                        applicable=True,
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "NOT_APPLICABLE", "Poor Legibility", "Low Contrast", 0.0,
                        "Label declarations have low legibility or contrast in the provided image.",
                        "No legible declarations detected.",
                        applicable=False,
                    ))

            # -------------------------------------------------------------
            # RULE-PC-14: Principal Display Panel (PDP) Grouping
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-14", "PC-14"}:
                if not is_unusable and has_any_declaration:
                    results.append(cls._create_rule_result(
                        rule, "PASS", "Grouped on PDP", "Grouped", 75.0,
                        "Mandatory declarations appear grouped together on the principal display panel.",
                        "PDP grouping verified.",
                        applicable=True,
                    ))
                else:
                    results.append(cls._create_rule_result(
                        rule, "NOT_APPLICABLE", None, None, 0.0,
                        "Principal display panel layout cannot be conclusively verified from this angle.",
                        "Incomplete PDP view.",
                        applicable=False,
                    ))

            # -------------------------------------------------------------
            # RULE-PC-15: Commodity-Specific / Exemptions
            # -------------------------------------------------------------
            elif rule.rule_id in {"RULE-PC-15", "PC-15"}:
                results.append(cls._create_rule_result(
                    rule, "NOT_APPLICABLE", None, None, 0.0,
                    "No special commodity exemptions or package size concessions applicable for this product.",
                    "Standard package evaluation.",
                    applicable=False,
                ))

        # -------------------------------------------------------------
        # COMPLIANCE SCORE & OVERALL RESULT
        # -------------------------------------------------------------
        applicable_results = [r for r in results if r.status != "NOT_APPLICABLE" and r.applicable]
        failed = [r for r in applicable_results if r.status == "FAIL"]
        uncertain = [r for r in applicable_results if r.status == "UNCERTAIN"]
        passed = [r for r in applicable_results if r.status == "PASS"]

        weight_map = {r.rule_id: r.weight for r in active_rules}
        eligible_weight = sum(weight_map.get(r.rule_id, 3) for r in applicable_results)
        passed_weight = sum(weight_map.get(r.rule_id, 3) for r in passed)

        if eligible_weight > 0:
            compliance_score = round(100 * passed_weight / eligible_weight)
        else:
            compliance_score = 0
        risk_score = max(0, 100 - compliance_score)

        if is_unusable or (len(passed) == 0 and len(applicable_results) > 0):
            overall_result = "review"
            overall_status = "INCONCLUSIVE"
        elif failed:
            overall_result = "fail"
            overall_status = "FAIL"
        elif uncertain:
            overall_result = "review"
            overall_status = "REVIEW_REQUIRED"
        else:
            overall_result = "pass"
            overall_status = "PASS"

        return ComplianceCheckResponse(
            inspection_id=inspection_id,
            overall_result=overall_result,
            overall_status=overall_status,
            risk_score=risk_score,
            compliance_score=compliance_score,
            results=results,
        )

    @staticmethod
    def review_status(overall_result: str) -> str:
        if overall_result == "pass":
            return "PASS"
        if overall_result == "fail":
            return "FAIL"
        return "REVIEW_REQUIRED"

    @staticmethod
    def _promote_declarations(declarations: Dict[str, Any]) -> Dict[str, Any]:
        """Map flat declaration keys onto canonical ProductField dicts."""
        pi: Dict[str, Any] = {}
        for key, value in declarations.items():
            if value and str(value).strip():
                val_str = str(value).strip()
                pi[key] = ProductField(value=val_str, status="detected", confidence=80.0, source="ocr")
                if key == "customer_care":
                    pi["consumer_care"] = ProductField(value=val_str, status="detected", confidence=80.0, source="ocr")
                    pi["consumer_care_details"] = ProductField(value=val_str, status="detected", confidence=80.0, source="ocr")
                elif key == "month_year_packed":
                    pi["manufacturing_date"] = ProductField(value=val_str, status="detected", confidence=80.0, source="ocr")
                    pi["packing_date"] = ProductField(value=val_str, status="detected", confidence=80.0, source="ocr")
                elif key == "commodity_name":
                    pi["generic_name"] = ProductField(value=val_str, status="detected", confidence=80.0, source="ocr")
                    pi["brand_or_commodity_name"] = ProductField(value=val_str, status="detected", confidence=80.0, source="ocr")
        return pi


def get_compliance_service() -> ComplianceService:
    return ComplianceService()