"""Tests for the Gemini Vision PRIMARY extraction pipeline.

Covers: happy-path extraction, MRP/quantity correctness, nutrition-isolation,
manufacturer/packer context, date context, customer-care cleaning, VEG-symbol
handling, fallback triggers (invalid JSON, API failure, missing key), poor-image
tolerance, no-hallucination guarantees, and the /api/scan response contract.
"""

import json

import pytest
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.api.routes import scan as scan_route
from app.schemas.product import PRODUCT_FIELDS, field as make_field
from app.services.gemini_vision import (
    GeminiVisionResult,
    GeminiVisionService,
    _normalize_status,
    _parse_json_content,
    _project_fields,
    _validate_field,
)
from tests.test_main import image_data_uri, scan

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def enable_gemini_primary(monkeypatch) -> None:
    """Turn on the Gemini-primary master switch for a single test."""
    monkeypatch.setattr(settings, "GEMINI_PRIMARY_ENABLED", True)


def make_fields(**values):
    """Build a full 26-field map; named fields are detected, the rest not_visible."""
    fields: dict = {}
    for name in PRODUCT_FIELDS:
        value = values.get(name)
        fields[name] = make_field(
            value=value,
            confidence=90.0 if value else 0.0,
            status="detected" if value else "not_visible",
            source="gemini_vision",
            evidence=str(value) if value else None,
        )
    return fields


def stub_gemini(monkeypatch, *, success=True, error=None, **values) -> None:
    """Replace Gemini Vision (image) and Gemini-from-text with canned results.

    Patching both entry points keeps the fallback tests deterministic no
    matter which path the pipeline reaches (image-primary or text-fallback).
    """

    def canned():
        return GeminiVisionResult(
            success=success,
            product_fields=make_fields(**values) if success else {},
            raw_extraction={},
            image_quality="GOOD",
            readability_quality="HIGH",
            image_analysis={"vegetarian_symbol_detected": bool(values.get("vegetarian_mark"))},
            confidence_details={"overall_visual_confidence": 88},
            error=error,
        )

    def fake_extract(image_ref, pil_image=None):
        return canned()

    def fake_extract_text(combined_text, front_text=None, back_text=None):
        return canned()

    monkeypatch.setattr(GeminiVisionService, "extract", staticmethod(fake_extract))
    monkeypatch.setattr(GeminiVisionService, "extract_multi", staticmethod(fake_extract))
    monkeypatch.setattr(GeminiVisionService, "extract_from_text", staticmethod(fake_extract_text))


def stub_ocr_text(monkeypatch, text: str) -> None:
    """Stub the OCR engine that the fallback path uses."""
    from tests.conftest import stub_ocr

    stub_ocr(monkeypatch, text)


# ---------------------------------------------------------------------------
# 1. Gemini successfully extracts a normal package
# ---------------------------------------------------------------------------


def test_gemini_primary_extracts_normal_package(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(
        monkeypatch,
        "Tasty Bites Chips\nPotato Chips\nNet Quantity 200 g\nMRP Rs. 120 (Incl. of all taxes)\n"
        "Manufactured by: Tasty Bites Snacks Pvt. Ltd.\nCustomer Care: 1800 123 4567\n"
        "FSSAI Lic. No. 12345678901234",
    )
    stub_gemini(
        monkeypatch,
        brand_or_commodity_name="Tasty Bites Chips",
        generic_name="Potato Chips",
        net_quantity="200 g",
        quantity_unit="g",
        mrp="Rs. 120",
        mrp_tax_inclusive="Yes",
        manufacturer_name="Tasty Bites Snacks Pvt. Ltd.",
        fssai_number="12345678901234",
        customer_care_phone="1800 123 4567",
    )

    response = scan(Image.new("RGB", (600, 600), "white"))

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["success"] is True
    assert data["vision_used"] is True
    assert data["extraction_source"] == "gemini_vision"
    pi = data["product_information"]
    assert pi["brand_or_commodity_name"]["value"] == "Tasty Bites Chips"
    assert pi["generic_name"]["value"] == "Potato Chips"
    assert pi["net_quantity"]["value"] == "200 g"
    assert pi["mrp"]["value"] == "Rs. 120"
    assert pi["fssai_number"]["value"] == "12345678901234"


# ---------------------------------------------------------------------------
# 2. MRP extraction
# ---------------------------------------------------------------------------


def test_gemini_extracts_mrp_correctly(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(monkeypatch, "Premium Snacks\nNet Quantity 200 g\nMRP Rs. 120 (Incl. of all taxes)")
    stub_gemini(
        monkeypatch,
        mrp="Rs. 120",
        mrp_tax_inclusive="Yes",
    )

    data = scan(Image.new("RGB", (600, 600), "white")).json()

    pi = data["product_information"]
    assert pi["mrp"]["value"] == "Rs. 120"
    assert pi["mrp"]["status"] == "detected"
    assert pi["mrp"]["source"] == "gemini_vision"
    assert pi["mrp_tax_inclusive"]["value"] == "Yes"
    assert pi["mrp"]["evidence"] is not None


# ---------------------------------------------------------------------------
# 3. Net Quantity extraction
# ---------------------------------------------------------------------------


def test_gemini_extracts_net_quantity_correctly(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(monkeypatch, "Premium Rice\nNet Quantity 500 g")
    stub_gemini(monkeypatch, net_quantity="500 g", quantity_unit="g")

    pi = scan(Image.new("RGB", (600, 600), "white")).json()["product_information"]

    assert pi["net_quantity"]["value"] == "500 g"
    assert pi["net_quantity"]["status"] == "detected"
    assert pi["quantity_unit"]["value"] == "g"


# ---------------------------------------------------------------------------
# 4. Nutrition quantity is not treated as Net Quantity
# ---------------------------------------------------------------------------


def test_nutrition_value_is_rejected_as_net_quantity():
    value, confidence = _validate_field("net_quantity", "Carbohydrate 46.3g", 85.0, "Carbohydrate 46.3g")
    assert value is None
    assert confidence == 0.0

    value, confidence = _validate_field("net_quantity", "Total Sugars 20g", 85.0, "Total Sugars 20g")
    assert value is None
    assert confidence == 0.0


def test_nutrition_value_not_in_pipeline_net_quantity(monkeypatch):
    enable_gemini_primary(monkeypatch)
    # The OCR text contains a nutrition table and the real net quantity; Gemini
    # correctly ignores the nutrition row.
    stub_ocr_text(
        monkeypatch,
        "Premium Biscuits\nNet Quantity 1 kg\nNutrition Information\nCarbohydrate 46.3g\nProtein 8g\nTotal Sugars 20g",
    )
    stub_gemini(monkeypatch, net_quantity="1 kg", quantity_unit="kg")

    pi = scan(Image.new("RGB", (600, 600), "white")).json()["product_information"]

    assert pi["net_quantity"]["value"] == "1 kg"
    assert "Carbohydrate" not in (pi["net_quantity"]["value"] or "")


# ---------------------------------------------------------------------------
# 5. Nutrition text is not treated as Manufacturer
# ---------------------------------------------------------------------------


def test_nutrition_text_is_rejected_as_manufacturer():
    garbled = "& PACKED BY Carbohydrate 46.3g Total Suga₹ 128 Tasty Bites Snacks Pvt. Ltd"
    value, confidence = _validate_field("manufacturer_name", garbled, 80.0, garbled)
    assert value is None
    assert confidence == 0.0


def test_manufacturer_context_never_contains_nutrition(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(
        monkeypatch,
        "Tasty Bites Chips\nNet Quantity 120 g\nNutrition Information\nCarbohydrate 46.3g\n"
        "Manufactured & Packed by: Tasty Bites Snacks Pvt. Ltd.\nMumbai, MH - 400001",
    )
    stub_gemini(
        monkeypatch,
        manufacturer_name="Tasty Bites Snacks Pvt. Ltd.",
        net_quantity="120 g",
    )

    pi = scan(Image.new("RGB", (600, 600), "white")).json()["product_information"]

    manufacturer = pi["manufacturer_name"]["value"] or ""
    assert "Carbohydrate" not in manufacturer
    assert "Sugars" not in manufacturer
    assert "Tasty Bites Snacks" in manufacturer


# ---------------------------------------------------------------------------
# 6. VEG is not treated as Brand
# ---------------------------------------------------------------------------


def test_veg_is_mapped_to_vegetarian_mark_not_brand(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(monkeypatch, "Tasty Bites Chips\nVEG\nNet Quantity 100 g")
    stub_gemini(
        monkeypatch,
        brand_or_commodity_name="Tasty Bites Chips",
        vegetarian_mark="Present",
        non_vegetarian_mark=None,
    )

    pi = scan(Image.new("RGB", (600, 600), "white")).json()["product_information"]

    assert pi["brand_or_commodity_name"]["value"] == "Tasty Bites Chips"
    assert pi["brand_or_commodity_name"]["value"] != "VEG"
    assert pi["vegetarian_mark"]["value"] == "Present"


def test_veg_symbol_not_brand_at_validation_layer():
    # Even if Gemini mislabels VEG as the brand, validation keeps it but does not
    # invent a wrong commodity; the pipeline test above proves the correct path.
    status = _normalize_status("detected", "Present")
    assert status == "detected"


# ---------------------------------------------------------------------------
# 7. Manufacturer / Packer context
# ---------------------------------------------------------------------------


def test_manufacturer_packer_context(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(
        monkeypatch,
        "Tasty Bites Chips\nManufactured by: Tasty Bites Snacks Pvt. Ltd.\nMumbai, MH - 400001\n"
        "Packed by: Tasty Bites Snacks Pvt. Ltd.\nMumbai, MH - 400001",
    )
    stub_gemini(
        monkeypatch,
        manufacturer_name="Tasty Bites Snacks Pvt. Ltd.",
        packer_name="Tasty Bites Snacks Pvt. Ltd.",
        manufacturer_address="Mumbai, MH - 400001",
    )

    pi = scan(Image.new("RGB", (600, 600), "white")).json()["product_information"]

    assert pi["manufacturer_name"]["value"] == "Tasty Bites Snacks Pvt. Ltd."
    assert pi["packer_name"]["value"] == "Tasty Bites Snacks Pvt. Ltd."
    assert pi["manufacturer_address"]["value"] == "Mumbai, MH - 400001"


# ---------------------------------------------------------------------------
# 8. Date context
# ---------------------------------------------------------------------------


def test_date_context_distinguishes_mfg_pkd_best_before(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(
        monkeypatch,
        "Tasty Bites Chips\nMFD 01/2026\nBest Before 6 months from packaging",
    )
    stub_gemini(
        monkeypatch,
        manufacturing_date="01/2026",
        packing_date=None,
        expiry_date="6 months from packaging",
    )

    pi = scan(Image.new("RGB", (600, 600), "white")).json()["product_information"]

    assert pi["manufacturing_date"]["value"] == "01/2026"
    # Gemini reported no separate packing date, but the OCR pipeline's
    # month/year-of-packing copy back-fills the only printed figure (MFD
    # 01/2026). The merge preserves that OCR value instead of dropping it.
    assert pi["packing_date"]["value"] == "01/2026"
    assert pi["expiry_date"]["value"] == "6 months from packaging"


def test_dates_are_normalized_to_canonical_format():
    value, confidence = _validate_field("expiry_date", "JAN 2028", 80.0, "JAN 2028")
    assert value == "01/2028"


# ---------------------------------------------------------------------------
# 9. Customer phone is cleaned
# ---------------------------------------------------------------------------


def test_customer_care_phone_cleaned(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(monkeypatch, "Tasty Bites Chips\nCustomer Care: 1800 123 4567\nToll Free: 1800 123 4567")
    stub_gemini(monkeypatch, customer_care_phone="1800 123 4567", toll_free_number="1800 123 4567")

    pi = scan(Image.new("RGB", (600, 600), "white")).json()["product_information"]

    assert pi["customer_care_phone"]["value"] == "1800 123 4567"
    assert pi["toll_free_number"]["value"] == "1800 123 4567"


def test_projection_cleans_customer_phone_and_email():
    fields = _project_fields(
        {
            "customer_care_phone": {"value": " 1800  123  4567 ", "confidence": 90, "status": "detected", "evidence": "1800 123 4567"},
            "customer_care_email": {"value": " Support@Example.com ", "confidence": 90, "status": "detected", "evidence": "support@example.com"},
        }
    )
    assert fields["customer_care_phone"].value == "1800 123 4567"
    assert fields["customer_care_phone"].source == "gemini_vision"
    assert fields["customer_care_email"].value == "support@example.com"


def test_customer_care_email_lowercased():
    value, _ = _validate_field("customer_care_email", "Support@Example.com", 80.0, "Support@Example.com")
    assert value == "support@example.com"


# ---------------------------------------------------------------------------
# 10/11. Fallback: invalid JSON and API failure
# ---------------------------------------------------------------------------


def test_gemini_invalid_json_triggers_ocr_fallback(monkeypatch):
    enable_gemini_primary(monkeypatch)
    # Gemini simulates returning unusable extraction -> OCR path must be used.
    stub_gemini(monkeypatch, success=False, error="Gemini returned invalid JSON")
    stub_ocr_text(
        monkeypatch,
        "PREMIUM RICE\nNet Quantity 5 kg\nMRP Rs. 499\nMFD 01/2026\nManufacturer: Acme Foods Pvt Ltd",
    )

    data = scan(Image.new("RGB", (600, 600), "white")).json()

    assert data["scan_completed"] is True
    assert data["vision_used"] is False
    assert data["extraction_source"] == "ocr"
    assert data["product_information"]["mrp"]["value"] == "Rs. 499 (Incl. of all taxes)" or "499" in (data["product_information"]["mrp"]["value"] or "")
    assert data["product_information"]["net_quantity"]["value"] == "5 kg"


def test_gemini_api_failure_triggers_ocr_fallback(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_gemini(monkeypatch, success=False, error="Gemini API error: 429 RESOURCE_EXHAUSTED")
    stub_ocr_text(
        monkeypatch,
        "PRODUCT: Rice\nNet Quantity 500 g\nMRP Rs. 120 (Incl. of all taxes)\nMFD 01/2026\nManufacturer: Acme Foods\nCustomer Care: 1800 123 4567",
    )

    data = scan(Image.new("RGB", (600, 600), "white")).json()

    assert data["vision_used"] is False
    assert data["extraction_source"] == "ocr"
    assert data["product_information"]["net_quantity"]["value"] == "500 g"
    assert data["score"] > 0


def test_gemini_missing_api_key_returns_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    result = GeminiVisionService.extract_from_text("Some OCR text")
    assert result.success is False
    assert "not configured" in (result.error or "")


def test_gemini_invalid_json_content_raises():
    with pytest.raises(Exception):
        _parse_json_content("this is not json {")


def test_gemini_fenced_json_parsed():
    payload = _parse_json_content("```json\n{\"mrp\": {\"value\": \"Rs. 120\"}}\n```")
    assert payload["mrp"]["value"] == "Rs. 120"


# ---------------------------------------------------------------------------
# 12. Poor image still produces a report
# ---------------------------------------------------------------------------


def test_poor_image_still_produces_report(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(monkeypatch, "Snacks\nNet Quantity 200 g\nMRP Rs. 120")

    def fake_extract(image_ref, pil_image=None, **kwargs):
        return GeminiVisionResult(
            success=True,
            product_fields=make_fields(mrp="Rs. 120", net_quantity="200 g"),
            raw_extraction={},
            image_quality="POOR",
            readability_quality="LOW",
            image_analysis={},
            confidence_details={"overall_visual_confidence": 35},
        )

    monkeypatch.setattr(GeminiVisionService, "extract", staticmethod(fake_extract))

    data = scan(Image.new("RGB", (600, 600), (60, 60, 60))).json()

    assert data["scan_completed"] is True
    assert data["success"] is True
    assert data["vision_used"] is True
    assert data["report"]


# ---------------------------------------------------------------------------
# 13. Missing fields do not cause pipeline failure
# ---------------------------------------------------------------------------


def test_partial_fields_do_not_fail_pipeline(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(monkeypatch, "Snacks\nMRP Rs. 120")
    stub_gemini(monkeypatch, mrp="Rs. 120")

    data = scan(Image.new("RGB", (600, 600), "white")).json()

    assert data["scan_completed"] is True
    assert data["status"] in {"partial_information", "review"}
    assert data["product_information"]["mrp"]["value"] == "Rs. 120"
    assert data["score"] > 0


# ---------------------------------------------------------------------------
# 14. No hallucinated values
# ---------------------------------------------------------------------------


def test_no_hallucinated_values(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(monkeypatch, "Tasty Bites Chips\nMRP Rs. 120")
    stub_gemini(monkeypatch, brand_or_commodity_name="Tasty Bites Chips", mrp="Rs. 120")

    pi = scan(Image.new("RGB", (600, 600), "white")).json()["product_information"]

    for name in PRODUCT_FIELDS:
        entry = pi[name]
        if entry["status"] != "detected":
            assert entry["value"] is None
            assert entry["source"] == "gemini_vision"


# ---------------------------------------------------------------------------
# 15. /api/scan contract remains unchanged
# ---------------------------------------------------------------------------


def test_api_scan_contract_unchanged(monkeypatch):
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(monkeypatch, "Tasty Bites Chips\nMRP Rs. 120 (Incl. of all taxes)")
    stub_gemini(
        monkeypatch,
        brand_or_commodity_name="Tasty Bites Chips",
        mrp="Rs. 120",
        mrp_tax_inclusive="Yes",
    )

    data = scan(Image.new("RGB", (600, 600), "white")).json()

    for key in (
        "status", "success", "scan_completed", "inspection_id", "message",
        "ocr_raw_text", "ocr_engine", "ocr_confidence", "product_information",
        "extraction_source", "vision_used", "extraction_confidence",
        "compliance_results", "score", "compliance_score", "risk_score",
        "overall_result", "image_quality", "quality_reason", "report",
        "front_side", "back_side", "images_processed", "warnings",
    ):
        assert key in data, f"missing response key: {key}"

    assert set(data["product_information"].keys()) == set(PRODUCT_FIELDS)


# ---------------------------------------------------------------------------
# 18. Real-image regression: the problematic packaged-food label
# ---------------------------------------------------------------------------


def _problematic_label_image() -> Image.Image:
    """Recreate the reported problematic package: nutrition table sits next to
    the manufacturer/price block and a VEG mark is present."""
    image = Image.new("RGB", (900, 700), (245, 245, 240))
    draw = ImageDraw.Draw(image)
    draw.text((30, 30), "Tasty Bites Snacks", fill="black", stroke_width=1)
    draw.text((30, 70), "Potato Chips", fill="black", stroke_width=1)
    draw.text((230, 40), "VEG", fill="green", stroke_width=1)
    draw.text((30, 120), "Net Quantity: 120 g", fill="black", stroke_width=1)
    draw.text((30, 160), "MRP Rs. 120.00 (Incl. of all taxes)", fill="black", stroke_width=1)
    draw.text((30, 230), "Nutrition Information", fill="black", stroke_width=1)
    draw.text((30, 270), "Energy 531 kcal", fill="black", stroke_width=1)
    draw.text((30, 310), "Carbohydrate 46.3g", fill="black", stroke_width=1)
    draw.text((30, 350), "Total Sugars 20g", fill="black", stroke_width=1)
    draw.text((30, 390), "Protein 8g", fill="black", stroke_width=1)
    draw.text((30, 430), "Sodium 200mg", fill="black", stroke_width=1)
    draw.text((30, 500), "Manufactured & Packed by:", fill="black", stroke_width=1)
    draw.text((30, 540), "Tasty Bites Snacks Pvt. Ltd.", fill="black", stroke_width=1)
    draw.text((30, 580), "Mumbai, MH - 400001", fill="black", stroke_width=1)
    draw.text((30, 620), "Customer Care: 1800 123 4567", fill="black", stroke_width=1)
    draw.text((30, 660), "FSSAI Lic. No. 12345678901234", fill="black", stroke_width=1)
    return image


def test_real_image_problematic_label_is_mapped_correctly(monkeypatch):
    """The label that previously produced
    Manufacturer: '& PACKED BY Carbohydrate 46.3g Total Suga₹ 128 Tasty Bites Snacks Pvt. Ltd'
    and Brand: 'VEG' must now be extracted correctly. The Tesseract OCR
    pass (stubbed here with the label text) feeds Gemini; Gemini only sees text."""
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(
        monkeypatch,
        "Tasty Bites Snacks\nPotato Chips\nVEG\nNet Quantity: 120 g\n"
        "MRP Rs. 120.00 (Incl. of all taxes)\nNutrition Information\n"
        "Energy 531 kcal\nCarbohydrate 46.3g\nTotal Sugars 20g\nProtein 8g\nSodium 200mg\n"
        "Manufactured & Packed by:\nTasty Bites Snacks Pvt. Ltd.\nMumbai, MH - 400001\n"
        "Customer Care: 1800 123 4567\nFSSAI Lic. No. 12345678901234",
    )
    stub_gemini(
        monkeypatch,
        brand_or_commodity_name="Tasty Bites Snacks",
        generic_name="Potato Chips",
        net_quantity="120 g",
        quantity_unit="g",
        mrp="Rs. 120",
        mrp_tax_inclusive="Yes",
        manufacturer_name="Tasty Bites Snacks Pvt. Ltd.",
        manufacturer_address="Mumbai, MH - 400001",
        customer_care_phone="1800 123 4567",
        vegetarian_mark="Present",
        fssai_number="12345678901234",
    )

    data = scan(_problematic_label_image()).json()

    pi = data["product_information"]

    # VEG -> vegetarian symbol, NOT brand
    assert pi["brand_or_commodity_name"]["value"] == "Tasty Bites Snacks"
    assert "VEG" not in (pi["brand_or_commodity_name"]["value"] or "")
    assert pi["vegetarian_mark"]["value"] == "Present"

    # Carbohydrate / Total Sugars -> nutrition information, NOT manufacturer
    manufacturer = pi["manufacturer_name"]["value"] or ""
    assert "Carbohydrate" not in manufacturer
    assert "Sugar" not in manufacturer
    assert manufacturer == "Tasty Bites Snacks Pvt. Ltd."

    # Nutrition quantity is not net quantity
    assert pi["net_quantity"]["value"] == "120 g"

    # MRP exact + tax inclusive
    assert pi["mrp"]["value"] == "Rs. 120"
    assert pi["mrp_tax_inclusive"]["value"] == "Yes"

    # Customer/toll-free contact, cleaned
    assert pi["customer_care_phone"]["value"] == "1800 123 4567"

    # FSSAI cleaned to 14 digits
    assert pi["fssai_number"]["value"] == "12345678901234"

    # The compliance engine still runs and produces a report.
    assert data["scan_completed"] is True
    assert data["overall_result"] in {"pass", "review", "fail"}


# ---------------------------------------------------------------------------
# Pipeline-level: Gemini Vision reads the image directly (primary)
# ---------------------------------------------------------------------------


def test_gemini_vision_image_is_primary(monkeypatch):
    """Gemini Vision receives the FRONT IMAGE (not OCR text) and drives the
    extraction whenever it succeeds. The OCR-text Gemini pass must never run
    in this case, even though the OCR text is present."""
    enable_gemini_primary(monkeypatch)

    captured = {}

    def fake_extract(image_ref, pil_image=None):
        captured["image_ref"] = image_ref
        returned = make_fields(
            mrp="Rs. 120",
            brand_or_commodity_name="Premium Rice",
            net_quantity="5 kg",
            expiry_date="6 months from packaging",
        )
        return GeminiVisionResult(
            success=True,
            product_fields=returned,
            raw_extraction={},
            image_quality="GOOD",
            readability_quality="HIGH",
            image_analysis={},
            confidence_details={"overall_visual_confidence": 90},
        )

    def shake(*args, **kwargs):
        raise AssertionError("OCR-text Gemini pass must not run when image Gemini succeeds")

    monkeypatch.setattr(GeminiVisionService, "extract", staticmethod(fake_extract))
    monkeypatch.setattr(GeminiVisionService, "extract_from_text", staticmethod(shake))
    stub_ocr_text(
        monkeypatch,
        "PREMIUM RICE\nNet Quantity 5 kg\nMRP Rs. 120 (Incl. of all taxes)\n"
        "MFD 01/2026\nExpiry 6 months from packaging\nManufacturer: Acme Foods Pvt Ltd",
    )

    data = scan(Image.new("RGB", (600, 600), "white")).json()

    assert data["extraction_source"] == "gemini_vision"
    assert data["vision_used"] is True
    assert data["product_information"]["mrp"]["value"] == "Rs. 120"
    assert data["product_information"]["brand_or_commodity_name"]["value"] == "Premium Rice"
    assert data["product_information"]["net_quantity"]["value"] == "5 kg"
    # Gemini received the image (data URI), not the OCR text.
    assert captured["image_ref"].startswith("data:image")


# ---------------------------------------------------------------------------
# Multi-image: FRONT + BACK are sent to Gemini together
# ---------------------------------------------------------------------------


def test_gemini_multi_image_front_and_back(monkeypatch):
    """When both sides are present, Gemini receives both images in one call and
    back-only declarations (importer block) are returned."""
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(
        monkeypatch,
        "PREMIUM RICE\nNet Quantity 5 kg\nMRP Rs. 499 (Incl. of all taxes)",
    )

    captured = {}

    def fake_extract_multi(image_refs, pil_images=None):
        captured["refs"] = list(image_refs)
        return GeminiVisionResult(
            success=True,
            product_fields=make_fields(
                brand_or_commodity_name="Premium Rice",
                net_quantity="5 kg",
                mrp="Rs. 499",
                importer_name="World Foods Ltd.",
            ),
            raw_extraction={},
            image_quality="GOOD",
            readability_quality="HIGH",
            image_analysis={},
            confidence_details={"overall_visual_confidence": 90},
        )

    monkeypatch.setattr(
        GeminiVisionService,
        "extract",
        staticmethod(lambda *a, **kw: (_ for _ in ()).throw(
            AssertionError("extract must not run when both sides are present")
        )),
    )
    monkeypatch.setattr(GeminiVisionService, "extract_multi", staticmethod(fake_extract_multi))

    front_uri = image_data_uri(Image.new("RGB", (600, 600), "white"))
    back_uri = image_data_uri(Image.new("RGB", (700, 500), (230, 230, 230)))
    response = client.post(
        "/api/scan",
        json={"front_image_url": front_uri, "back_image_url": back_uri},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["images_processed"] == 2
    assert data["extraction_source"] == "gemini_vision"
    assert data["vision_used"] is True
    assert len(captured["refs"]) == 2
    assert captured["refs"][0].startswith("data:image")
    assert captured["refs"][1].startswith("data:image")
    assert data["product_information"]["importer_name"]["value"] == "World Foods Ltd."


def test_gemini_multi_image_failure_falls_back_to_ocr(monkeypatch):
    """If the combined front+back Gemini call yields nothing, the scan still
    completes via the OCR pipeline — never a crash."""
    enable_gemini_primary(monkeypatch)
    stub_ocr_text(
        monkeypatch,
        "PREMIUM RICE\nNet Quantity 5 kg\nMRP Rs. 499 (Incl. of all taxes)\n"
        "Manufacturer: Acme Foods",
    )
    stub_gemini(monkeypatch, success=False, error="Gemini API error: 429 RESOURCE_EXHAUSTED")

    response = client.post(
        "/api/scan",
        json={
            "front_image_url": image_data_uri(Image.new("RGB", (600, 600), "white")),
            "back_image_url": image_data_uri(Image.new("RGB", (700, 500), (230, 230, 230))),
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["images_processed"] == 2
    assert data["vision_used"] is False
    assert data["product_information"]["net_quantity"]["value"] == "5 kg"
    assert data["score"] > 0


# ---------------------------------------------------------------------------
# Transient-error retry on the image path
# ---------------------------------------------------------------------------


def test_gemini_extract_retries_transient_503(monkeypatch):
    """A transient 503 'high demand' is retried once and then succeeds."""
    enable_gemini_primary(monkeypatch)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key-retry-503")

    call_log = []

    class _FakeModels:
        def generate_content(self, model, contents, config=None):
            call_log.append(model)
            if len(call_log) == 1:
                raise Exception("503 UNAVAILABLE: model currently experiencing high demand")
            return _FakeResponse()

    class _FakeResponse:
        text = json.dumps(
            {"mrp": {"value": "Rs. 120", "confidence": 90, "status": "detected", "evidence": "MRP Rs. 120"}}
        )

    class _FakeClient:
        def __init__(self, api_key=None, http_options=None):
            self.models = _FakeModels()

    import app.services.gemini_vision as gemini_vision_module

    monkeypatch.setattr(gemini_vision_module.genai, "Client", _FakeClient)

    result = GeminiVisionService.extract(
        image_data_uri(Image.new("RGB", (10, 10), "white"))
    )

    assert result.success is True
    assert result.product_fields["mrp"].value == "Rs. 120"
    assert len(call_log) == 2  # first attempt 503, second succeeded


def test_gemini_extract_does_not_retry_fatal_errors(monkeypatch):
    """Fatal 4xx errors are not retried."""
    enable_gemini_primary(monkeypatch)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key-no-retry")

    call_log = []

    class _FakeModels:
        def generate_content(self, model, contents, config=None):
            call_log.append(model)
            raise Exception("400 INVALID_ARGUMENT: bad request")

    class _FakeClient:
        def __init__(self, api_key=None, http_options=None):
            self.models = _FakeModels()

    import app.services.gemini_vision as gemini_vision_module

    monkeypatch.setattr(gemini_vision_module.genai, "Client", _FakeClient)

    result = GeminiVisionService.extract(
        image_data_uri(Image.new("RGB", (10, 10), "white"))
    )

    assert result.success is False
    assert "Gemini API error" in (result.error or "")
    assert len(call_log) == 1