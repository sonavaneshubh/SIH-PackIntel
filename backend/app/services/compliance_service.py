"""Legal Metrology (Packaged Commodities) Rules compliance engine.

Phase 2: compliance consumes ONLY the canonical ProductInformation produced by
the extraction pipeline. There is no separate parsing logic here. Rule IDs are
preserved from Phase 1; their scope follows the Phase 2 mapping:

    PC-01  Manufacturer / Packer / Importer  (identity on the principal display panel)
    PC-02  Common / Generic name
    PC-03  Net quantity
    PC-04  Month & year of packing / manufacture
    PC-05  MRP (maximum retail price)
    PC-06  Unit sale price  (kept not_applicable: pricing data is not available)
    PC-07  Consumer care contact

A missing extraction is a 'warning' (routes the scan to review), never a 'fail',
because the absence may be a property of the image rather than the package.
"""

from typing import Any, Dict, List, Optional

from app.schemas.compliance import ComplianceCheckResponse, ComplianceResult
from app.schemas.product import ProductField

_RULE_WEIGHTS = {
    "PC-01": 5,
    "PC-02": 3,
    "PC-03": 5,
    "PC-04": 3,
    "PC-05": 5,
    "PC-06": 2,
    "PC-07": 2,
}

_REQUIREMENTS = {
    "PC-01": "Name and complete address of the manufacturer, packer or importer on the principal display panel.",
    "PC-02": "Common or generic name of the commodity declared on the label.",
    "PC-03": "Net quantity of the package declared on the label.",
    "PC-04": "Month and year of manufacture or packing printed on the label.",
    "PC-05": "Maximum Retail Price (MRP) inclusive of all taxes printed on the label.",
    "PC-06": "Unit sale price declaration (not applicable when the pricing data cannot be evaluated).",
    "PC-07": "Consumer care / grievance-handling contact printed on the label.",
}


def _raw_entry(entry: Any) -> Any:
    if isinstance(entry, ProductField):
        return entry
    if isinstance(entry, dict):
        return entry
    return None


def _value(entry: Any) -> Optional[str]:
    parsed = _raw_entry(entry)
    if parsed is None:
        value = str(entry).strip() if entry else ""
        return value or None
    value = parsed.value if isinstance(parsed, ProductField) else parsed.get("value")
    if isinstance(value, bool):
        return "Yes" if value else None
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _source(entry: Any, default: str = "ocr") -> str:
    parsed = _raw_entry(entry)
    if parsed is None:
        return default
    if isinstance(parsed, ProductField):
        return parsed.source
    return str(parsed.get("source") or default)


def _first_value(pi: Any, *keys: str) -> Optional[str]:
    if pi is None:
        return None
    fields: Dict[str, Any] = pi.as_dict() if hasattr(pi, "as_dict") else (pi or {})
    for key in keys:
        entry = fields.get(key)
        value = _value(entry)
        if value:
            return value
    return None


class ComplianceService:
    @staticmethod
    def _rule(
        code: str,
        result: str,
        extracted_value: Optional[str],
        explanation: str,
        evidence: Optional[str] = None,
    ) -> ComplianceResult:
        return ComplianceResult(
            rule_code=code,
            rule_name=code,
            result=result,
            extracted_value=extracted_value or None,
            explanation=explanation,
            evidence=evidence,
            requirement=_REQUIREMENTS.get(code),
        )

    @classmethod
    def evaluate_compliance(
        cls,
        inspection_id: Optional[str] = None,
        declarations: Optional[Dict[str, Any]] = None,
        product_information: Any = None,
        is_imported: bool = False,
    ) -> ComplianceCheckResponse:
        """Evaluate rules against the canonical product information.

        ``product_information`` may be a ProductInformation model, a dict of
        ProductField models, or a dict of {value/status/confidence/source}
        dicts. ``declarations`` remains supported for legacy callers/tests and
        is promoted to the canonical key set before evaluation.
        """
        pi: Dict[str, Any] = {}
        if product_information is not None:
            pi = (
                product_information.as_dict()
                if hasattr(product_information, "as_dict")
                else (product_information if isinstance(product_information, dict) else {})
            )
        elif declarations:
            pi = cls._promote_declarations(declarations)

        results: List[ComplianceResult] = []

        mfg = _first_value(pi, "manufacturer_name", "packer_name", "marketer_name")
        if mfg:
            results.append(cls._rule(
                "PC-01", "pass", mfg,
                "Name and complete address of the manufacturer/packer/importer are declared.",
                evidence=f"Extracted: {mfg}",
            ))
        else:
            results.append(cls._rule(
                "PC-01", "warning", mfg,
                "Manufacturer/packer/importer identity could not be confirmed from the image.",
                evidence="No manufacturer/packer/importer declaration detected.",
            ))

        generic = _first_value(pi, "generic_name", "brand_or_commodity_name")
        if generic:
            results.append(cls._rule(
                "PC-02", "pass", generic,
                "Common/generic name of the commodity is declared on the label.",
                evidence=f"Extracted: {generic}",
            ))
        else:
            results.append(cls._rule(
                "PC-02", "warning", generic,
                "Common/generic name of the commodity could not be confirmed.",
                evidence="No commodity/generic name declaration detected.",
            ))

        net_qty = _first_value(pi, "net_quantity")
        if net_qty:
            results.append(cls._rule(
                "PC-03", "pass", net_qty,
                "Net quantity of the package is declared on the label.",
                evidence=f"Extracted: {net_qty}",
            ))
        else:
            results.append(cls._rule(
                "PC-03", "warning", net_qty,
                "Net quantity could not be confirmed from the image.",
                evidence="No net quantity declaration detected.",
            ))

        packed = _first_value(pi, "packing_date", "manufacturing_date")
        if packed:
            results.append(cls._rule(
                "PC-04", "pass", packed,
                "Month and year of manufacture/packing is declared on the label.",
                evidence=f"Extracted: {packed}",
            ))
        else:
            results.append(cls._rule(
                "PC-04", "warning", packed,
                "Month and year of packing could not be confirmed from the image.",
                evidence="No manufacturing/packing date declaration detected.",
            ))

        mrp = _first_value(pi, "mrp")
        if mrp:
            results.append(cls._rule(
                "PC-05", "pass", mrp,
                "Maximum Retail Price is declared on the label.",
                evidence=f"Extracted: {mrp}",
            ))
        else:
            results.append(cls._rule(
                "PC-05", "warning", mrp,
                "Maximum Retail Price could not be confirmed from the image.",
                evidence="No MRP declaration detected.",
            ))

        results.append(cls._rule(
            "PC-06", "not_applicable", None,
            "Unit sale price is not applicable when pricing data cannot be evaluated from the label.",
            evidence="No unit-sale-price input supplied.",
        ))

        care = _first_value(
            pi,
            "customer_care_phone",
            "toll_free_number",
            "customer_care_email",
            "customer_care_name",
        )
        if care:
            results.append(cls._rule(
                "PC-07", "pass", care,
                "Consumer care contact is printed on the label.",
                evidence=f"Extracted: {care}",
            ))
        else:
            results.append(cls._rule(
                "PC-07", "warning", care,
                "Consumer care contact could not be confirmed from the image.",
                evidence="No consumer care declaration detected.",
            ))

        failed = [r for r in results if r.result == "fail"]
        warnings = [r for r in results if r.result == "warning"]
        applicable = [r for r in results if r.result != "not_applicable"]
        eligible_weight = sum(_RULE_WEIGHTS[r.rule_code] for r in applicable)
        passed_weight = sum(
            _RULE_WEIGHTS[r.rule_code] for r in applicable if r.result == "pass"
        )

        compliance_score = (
            round(100 * passed_weight / eligible_weight) if eligible_weight else 0
        )
        risk_score = 100 - compliance_score

        if failed:
            overall = "fail"
        elif warnings:
            overall = "review"
        else:
            overall = "pass"

        return ComplianceCheckResponse(
            inspection_id=inspection_id,
            overall_result=overall,
            risk_score=risk_score,
            compliance_score=compliance_score,
            results=results,
        )

    @staticmethod
    def review_status(overall_result: str) -> str:
        """Map the legacy overall result to the scan status vocabulary.

        ``REVIEW_REQUIRED`` is returned whenever evidence is missing or
        ambiguous (the legal-metrology rules must never auto-fail a package
        merely because OCR could not see a declaration). ``PASS`` and ``FAIL``
        map directly; ``NOT_DETERMINED`` is reserved for scans that produced
        no usable information at all.
        """
        if overall_result == "pass":
            return "PASS"
        if overall_result == "fail":
            return "FAIL"
        return "REVIEW_REQUIRED"

    @staticmethod
    def _promote_declarations(declarations: Dict[str, Any]) -> Dict[str, Any]:
        """Map the flat Phase 1 declaration keys onto the canonical schema."""
        pi: Dict[str, Any] = {}

        def put(canonical_key: str, *legacy_keys: str) -> None:
            for key in legacy_keys:
                value = declarations.get(key)
                if value and str(value).strip():
                    pi[canonical_key] = {"value": str(value).strip(), "source": "ocr"}
                    return

        for key, value in declarations.items():
            if key in {
                "brand_or_commodity_name", "generic_name", "net_quantity",
                "quantity_unit", "manufacturer_name", "manufacturer_address",
                "packer_name", "packer_address", "marketer_name",
                "marketer_address", "mrp", "mrp_tax_inclusive", "unit_sale_price",
                "packing_date", "manufacturing_date", "expiry_date",
                "batch_number", "customer_care_name", "customer_care_phone",
                "toll_free_number", "customer_care_email", "country_of_origin",
                "vegetarian_mark", "non_vegetarian_mark", "fssai_number",
                "certifications",
            }:
                pi[key] = {"value": value, "source": "ocr"}

        if "brand_or_commodity_name" not in pi:
            put("brand_or_commodity_name", "commodity_name")
        if "generic_name" not in pi:
            put("generic_name", "common_generic_name", "commodity_name")
        if "packing_date" not in pi:
            put("packing_date", "month_year_packed", "packing_date")
        if "manufacturing_date" not in pi:
            put("manufacturing_date", "mfg_date", "manufacturing_date")
        if "customer_care_phone" not in pi:
            put(
                "customer_care_phone",
                "customer_care",
                "customer_care_details",
                "consumer_care",
                "customer_care_phone",
            )
        if "mrp" not in pi:
            put("mrp", "mrp", "price")
        return pi


def get_compliance_service() -> ComplianceService:
    return ComplianceService()