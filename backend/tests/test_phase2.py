"""Phase 2: vision fallback gating, merging, normalization and pipeline behavior."""

import json

import pytest
from PIL import Image

from app.api.routes import scan as scan_route
from app.schemas.product import ProductInformation, field as make_field
from app.services.ai_service import AIService, build_product_information
from app.services.merge_service import merge_sources
from app.services.normalization import (
    normalize_date,
    normalize_fssai,
    normalize_mrp,
    normalize_phone,
    normalize_quantity,
    values_differ,
)
from app.services.vision_service import (
    VisionExtractionError,
    VisionService,
    _parse_json,
    should_use_vision_fallback,
)
from tests.test_main import scan


# ---------------------------------------------------------------------------
# should_use_vision_fallback gating
# ---------------------------------------------------------------------------

GOOD_PI = ProductInformation(
    **{
        name: make_field(value="x", status="detected", confidence=90.0, source="ocr")
        for name in (
            "brand_or_commodity_name", "generic_name", "net_quantity",
            "manufacturer_name", "mrp", "packing_date", "manufacturing_date",
        )
    }
)


def test_fallback_not_needed_for_good_ocr():
    assert should_use_vision_fallback(85.0, ocr_failed=False, product_information=GOOD_PI) is False


def test_fallback_needed_below_50_confidence():
    assert should_use_vision_fallback(25.0, ocr_failed=False, product_information=GOOD_PI) is True


def test_fallback_needed_when_ocr_failed():
    assert should_use_vision_fallback(0.0, ocr_failed=True, product_information=GOOD_PI) is True


def test_fallback_needed_when_critical_field_missing():
    partial = GOOD_PI.model_copy(deep=True)
    partial.mrp = make_field(status="not_visible", source="none")
    assert should_use_vision_fallback(85.0, ocr_failed=False, product_information=partial) is True


def test_fallback_not_needed_when_only_optional_field_missing():
    partial = GOOD_PI.model_copy(deep=True)
    partial.expiry_date = make_field(status="not_visible", source="none")
    partial.certifications = make_field(status="not_visible", source="none")
    assert should_use_vision_fallback(85.0, ocr_failed=False, product_information=partial) is False


def test_fallback_not_needed_when_one_pack_date_present():
    # Labels print either a manufacturing or a packing date, never both. A
    # single detected date satisfies the mandatory date group.
    partial = GOOD_PI.model_copy(deep=True)
    partial.manufacturing_date = make_field(status="not_visible", source="none")
    assert should_use_vision_fallback(85.0, ocr_failed=False, product_information=partial) is False


def test_fallback_needed_when_no_pack_date_detected():
    partial = GOOD_PI.model_copy(deep=True)
    partial.packing_date = make_field(status="not_visible", source="none")
    partial.manufacturing_date = make_field(status="not_visible", source="none")
    assert should_use_vision_fallback(85.0, ocr_failed=False, product_information=partial) is True


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

def test_normalize_quantity_formats():
    assert normalize_quantity("5 kg") == ("5", "kg")
    assert normalize_quantity("5KG") == ("5", "kg")
    assert normalize_quantity("Net Qty: 5 kg") == ("5", "kg")
    assert normalize_quantity("5000 g") == ("5", "kg")
    assert normalize_quantity("250 g") == ("250", "g")
    assert normalize_quantity("1000 ml") == ("1", "l")
    assert normalize_quantity("no quantity here") == (None, None)


def test_normalize_mrp_currencies():
    assert normalize_mrp("MRP ₹650.00") == 650.0
    assert normalize_mrp("Rs. 650") == 650.0
    assert normalize_mrp("MRP: 1,299.50") == 1299.5
    assert normalize_mrp("not a price") is None


def test_normalize_dates():
    assert normalize_date("01/2026") == "01/2026"
    assert normalize_date("01-2026") == "01/2026"
    assert normalize_date("JAN 2026") == "01/2026"
    assert normalize_date("01/01/2026") == "2026-01-01"
    assert normalize_date("MFG 01/2026") is None
    assert normalize_date("hello") is None


def test_normalize_phone_and_fssai():
    assert normalize_phone(" 1800- 123 - 456 ") == "1800- 123 - 456"
    assert normalize_fssai("FSSAI Lic. No. 12345678901234") == "12345678901234"
    assert normalize_fssai("FSSAI Lic. No. 1234") is None


def test_values_differ_after_normalization():
    assert values_differ("₹650", "Rs. 650") is False
    assert values_differ("5 kg", "5KG") is False
    assert values_differ("5000 g", "5 kg") is False
    assert values_differ("₹650", "₹699") is True
    assert values_differ("01/2026", "01/01/2026") is True


# ---------------------------------------------------------------------------
# No-hallucination canonical extraction
# ---------------------------------------------------------------------------

def test_ocr_extraction_never_hallucinates_missing_fields():
    fields, conf = AIService.extract_with_confidence("MRP Rs. 99\nNet Quantity 250 ml")
    pi = build_product_information(fields, conf, "MRP Rs. 99\nNet Quantity 250 ml")

    assert pi.mrp.status == "detected"
    assert pi.mrp.value == "Rs. 99"
    assert pi.fssai_number.status == "not_visible"
    assert pi.fssai_number.value is None
    assert pi.manufacturer_address.status == "not_visible"
    assert pi.manufacturer_address.value is None
    assert pi.certifications.status == "not_visible"
    assert pi.expiry_date.status == "not_visible"


def test_ocr_toll_free_and_email_detection():
    text = (
        "Consumer Care: 1800-258-1234\n"
        "Email: support@example.com\n"
        "Batch No. B2026001"
    )
    pi, _ = AIService.extract_product_information(text)
    assert pi.toll_free_number.value == "1800-258-1234"
    assert pi.customer_care_email.value == "support@example.com"  # type: ignore[union-attr]
    assert pi.batch_number.value == "B2026001"


def test_label_aware_britannia_fields_and_false_positive_rejection():
    text = (
        "Marketed By: BRITANNIA INDUSTRIES LTD.\n"
        "feedback@britindia.com\n"
        "Vegetarian mark\n"
        "Batch printed\n"
        "WITHOUT AFFECTING ITS FITNESS FOR CONSUMPTION. "
        "BISCUIT DESIGN REGISTRATION NO. 270172."
    )

    product_information, _ = AIService.extract_product_information(text)

    assert product_information.marketer_name.value == "BRITANNIA INDUSTRIES LTD."
    assert product_information.customer_care_email.value == "feedback@britindia.com"
    assert product_information.batch_number.value is None
    assert product_information.generic_name.value is None
    assert product_information.vegetarian_mark.value == "Present"


def test_label_anchors_map_brand_generic_quantity_and_fssai():
    text = (
        "Brand: NUTRIDITE\n"
        "Generic Name: Biscuit\n"
        "Net Quantity: 200 g\n"
        "FSSAI Lic. No. 10012034000123"
    )

    product_information, _ = AIService.extract_product_information(text)

    assert product_information.brand_or_commodity_name.value == "NUTRIDITE"
    assert product_information.generic_name.value == "Biscuit"
    assert product_information.net_quantity.value == "200 g"
    assert product_information.quantity_unit.value == "g"
    assert product_information.fssai_number.value == "10012034000123"


def test_design_registration_is_not_a_certification():
    product_information, _ = AIService.extract_product_information(
        "BISCUIT DESIGN REGISTRATION NO. 270172"
    )

    assert product_information.generic_name.value is None
    assert product_information.certifications.value is None


def test_label_aware_business_and_contact_mapping():
    pi, _ = AIService.extract_product_information(
        "Marketed By: BRITANNIA INDUSTRIES LTD.\nfeedback@britindia.com"
    )

    assert pi.marketer_name.value == "BRITANNIA INDUSTRIES LTD."
    assert pi.customer_care_email.value == "feedback@britindia.com"
    assert pi.generic_name.status == "not_visible"


def test_invalid_batch_and_legal_text_are_not_classified_as_fields():
    pi, _ = AIService.extract_product_information(
        "Batch printed\nWITHOUT AFFECTING ITS FITNESS FOR CONSUMPTION. "
        "BISCUIT DESIGN REGISTRATION NO. 270172\nVegetarian mark"
    )

    assert pi.batch_number.status == "not_visible"
    assert pi.batch_number.value is None
    assert pi.generic_name.status == "not_visible"
    assert pi.generic_name.value is None
    assert pi.vegetarian_mark.value == "Present"


def test_label_aware_quantity_and_fssai_mapping():
    pi, _ = AIService.extract_product_information(
        "Net Quantity: 200 g\nFSSAI Lic. No. 10012034000123"
    )

    assert pi.net_quantity.value == "200 g"
    assert pi.quantity_unit.value == "g"
    assert pi.fssai_number.value == "10012034000123"


def test_fssai_tolerates_ocr_zero_o_confusion():
    pi, _ = AIService.extract_product_information(
        "FSSAI Lic. No. 100210O4000345"
    )
    assert pi.fssai_number.value == "10021004000345"


def test_fssai_not_polluted_by_following_declaration():
    text = (
        "FSSAI Lic. No. 10021004000345\n"
        "Certified ISO 22000"
    )
    pi, _ = AIService.extract_product_information(text)
    assert pi.fssai_number.value == "10021004000345"


def test_fssai_wrong_length_not_detected():
    pi, _ = AIService.extract_product_information("FSSAI Lic. No. 1234567890123")
    assert pi.fssai_number.status == "not_visible"
    assert pi.fssai_number.value is None


def test_country_of_origin_ignores_garbled_veg_mark_line():
    pi, _ = AIService.extract_product_information(
        "Country of Origin: India\nVe ek\nNet Quantity: 5 kg"
    )
    assert pi.country_of_origin.value == "India"


def test_country_of_origin_clean_when_noise_on_same_line():
    pi, _ = AIService.extract_product_information(
        "Made in India Vegetarian\nNet Quantity: 5 kg"
    )
    assert pi.country_of_origin.value == "India"


def test_brand_title_not_rejected_by_rs_substring():
    # "SARSON" contains the substring "rs"; it must not be dropped because the
    # title-noise guard matches only real prices (Rs <digits>).
    fields, _ = AIService.extract_with_confidence(
        "Sarson Gold\nKachi Ghani Mustard Oil\nMRP Rs. 215"
    )
    assert fields["commodity_name"] == "Sarson Gold"


def test_combine_ocr_text_merges_layout_lines_once():
    from app.api.routes.scan import _combine_ocr_text

    full = "PREMIUM BASMATI RICE\nMRP Rs. 1099\nNet Quantity 5 kg"
    layout = "PREMIUM BASMATI RICE\nVegetarian Mark\nNet Quantity 5 kg"
    combined = _combine_ocr_text(full, layout)
    assert combined.splitlines() == [
        "PREMIUM BASMATI RICE",
        "MRP Rs. 1099",
        "Net Quantity 5 kg",
        "Vegetarian Mark",
    ]


# ---------------------------------------------------------------------------
# Vision model JSON parsing
# ---------------------------------------------------------------------------

def test_vision_strict_json_parsing():
    raw = json.dumps({
        "brand_or_commodity_name": {"value": "Basmati Rice", "status": "detected", "confidence": 98},
        "net_quantity": {"value": "5 kg", "status": "detected", "confidence": 95},
        "batch_number": {"value": None, "status": "not_printed", "confidence": 80},
        "expiry_date": {"value": None, "status": "not_visible", "confidence": 0},
    })
    result = _parse_json(raw)
    assert result["brand_or_commodity_name"].status == "detected"
    assert result["brand_or_commodity_name"].source == "vision"
    assert result["batch_number"].status == "not_printed"
    assert result["expiry_date"].status == "not_visible"
    assert result["fssai_number"].status == "not_visible"


def test_vision_parses_fenced_json():
    result = _parse_json(
        "```json\n{\"mrp\": {\"value\": \"Rs. 499\", \"status\": \"detected\", \"confidence\": 90}}\n```"
    )
    assert result["mrp"].value == "Rs. 499"


def test_vision_rejects_invalid_json():
    with pytest.raises(VisionExtractionError):
        _parse_json("this is not json {")


def test_vision_downgrades_detected_without_value():
    result = _parse_json(
        json.dumps({"mrp": {"value": None, "status": "detected", "confidence": 90}})
    )
    assert result["mrp"].status == "not_visible"
    assert result["mrp"].value is None


def test_vision_not_configured_raises(monkeypatch):
    import app.services.vision_service as vision_service_module

    monkeypatch.setattr(vision_service_module, "get_vision_service", lambda: None)
    with pytest.raises(VisionExtractionError):
        VisionService.extract("data:image/png;base64,AAAA")


# ---------------------------------------------------------------------------
# Merge behavior
# ---------------------------------------------------------------------------

def test_merge_high_confidence_ocr_wins_when_agree():
    ocr = {
        "mrp": make_field(value="Rs. 499", status="detected", confidence=88.0, source="ocr"),
    }
    vision = {
        "mrp": make_field(value="Rs. 499", status="detected", confidence=95.0, source="vision"),
    }
    merged = merge_sources(ocr, vision)
    assert merged["mrp"].status == "detected"
    assert merged["mrp"].value == "Rs. 499"
    assert merged["mrp"].source in {"ocr", "vision"}


def test_merge_conflict_flags_uncertain():
    ocr = {
        "mrp": make_field(value="Rs. 499", status="detected", confidence=70.0, source="ocr"),
    }
    vision = {
        "mrp": make_field(value="Rs. 399", status="detected", confidence=95.0, source="vision"),
    }
    merged = merge_sources(ocr, vision)
    assert merged["mrp"].status == "uncertain"
    assert merged["mrp"].conflicts is not None
    assert len(merged["mrp"].conflicts) == 2


def test_merge_low_confidence_ocr_prefers_vision():
    ocr = {
        "mrp": make_field(value="Rs. 499", status="detected", confidence=30.0, source="ocr"),
    }
    vision = {
        "mrp": make_field(value="Rs. 499", status="detected", confidence=92.0, source="vision"),
    }
    merged = merge_sources(ocr, vision)
    assert merged["mrp"].status == "detected"
    assert merged["mrp"].confidence == 92.0
    assert merged["mrp"].source == "vision"


def test_merge_vision_fills_missing_field():
    ocr = {"expiry_date": make_field(status="not_visible", source="none")}
    vision = {
        "expiry_date": make_field(value="01/2028", status="detected", confidence=90.0, source="vision"),
    }
    merged = merge_sources(ocr, vision)
    assert merged["expiry_date"].status == "detected"
    assert merged["expiry_date"].value == "01/2028"


def test_merge_vision_not_printed_resolves_not_visible():
    ocr = {"batch_number": make_field(status="not_visible", source="none")}
    vision = {
        "batch_number": make_field(value=None, status="not_printed", confidence=85.0, source="vision"),
    }
    merged = merge_sources(ocr, vision)
    assert merged["batch_number"].status == "not_printed"


# ---------------------------------------------------------------------------
# Pipeline behavior
# ---------------------------------------------------------------------------

class StubOCR:
    def __init__(self, text: str, confidence: float, quality: str = "usable"):
        self.text = text
        self.confidence = confidence
        self.quality = quality

    def process_image(self, image_url):
        return {
            "raw_text": self.text,
            "confidence": self.confidence,
            "engine": "tesseract",
            "regions": [],
            "image_quality": self.quality,
            "quality_reason": None,
        }


def _stub_vision(monkeypatch, **values):
    monkeypatch.setattr(
        scan_route.VisionService,
        "extract",
        lambda _: {
            key: make_field(value=val, status="detected", confidence=95.0, source="vision")
            for key, val in values.items()
        },
    )


def test_ocr_good_image_no_fallback(monkeypatch):
    monkeypatch.setattr(
        scan_route,
        "get_ocr_service",
        lambda: StubOCR("Rice\nNet Quantity 5 kg\nMRP Rs. 499\nMFD 01/2026\nManufacturer: Acme Foods", 88.0),
    )
    monkeypatch.setattr(scan_route, "get_current_user", lambda: {"sub": "test-user"})

    response = scan(Image.new("RGB", (600, 600), "white"))
    assert response.status_code == 200
    data = response.json()
    assert data["vision_used"] is False
    assert data["extraction_source"] == "ocr"
    assert data["product_information"]["net_quantity"]["status"] == "detected"


def test_ocr_low_confidence_triggers_vision(monkeypatch):
    monkeypatch.setattr(
        scan_route,
        "get_ocr_service",
        lambda: StubOCR("Rice\nMRP Rs. 149", 20.0),
    )
    _stub_vision(monkeypatch, brand_or_commodity_name="Golden Rice", mrp="Rs. 149")
    monkeypatch.setattr(scan_route, "get_current_user", lambda: {"sub": "test-user"})

    response = scan(Image.new("RGB", (600, 600), "white"))
    assert response.status_code == 200
    data = response.json()
    assert data["vision_used"] is True
    assert data["product_information"]["brand_or_commodity_name"]["value"] == "Golden Rice"


def test_vision_failure_keeps_ocr_results(monkeypatch):
    monkeypatch.setattr(scan_route, "get_ocr_service", lambda: StubOCR("Rice\nNet Quantity 5 kg\nMRP Rs. 499", 30.0))
    monkeypatch.setattr(
        scan_route.VisionService,
        "extract",
        lambda _: (_ for _ in ()).throw(VisionExtractionError("no API key")),
    )
    monkeypatch.setattr(scan_route, "get_current_user", lambda: {"sub": "test-user"})

    response = scan(Image.new("RGB", (600, 600), "white"))
    assert response.status_code == 200
    data = response.json()
    assert data["vision_used"] is False
    assert "no API key" in (data["vision_error"] or "")
    assert data["product_information"]["net_quantity"]["value"] == "5 kg"
    assert data["compliance_results"]  # OCR results were retained


def test_missing_critical_field_triggers_vision(monkeypatch):
    monkeypatch.setattr(
        scan_route,
        "get_ocr_service",
        lambda: StubOCR("Rice\nNet Quantity 5 kg\nMRP Rs. 499\nManufacturer: Acme Foods", 90.0),
    )
    _stub_vision(monkeypatch, packing_date="01/2026")
    monkeypatch.setattr(scan_route, "get_current_user", lambda: {"sub": "test-user"})

    response = scan(Image.new("RGB", (600, 600), "white"))
    assert response.status_code == 200
    data = response.json()
    assert data["vision_used"] is True
    assert data["product_information"]["packing_date"]["value"] == "01/2026"


def test_vision_conflict_surfaces_uncertain(monkeypatch):
    monkeypatch.setattr(
        scan_route,
        "get_ocr_service",
        lambda: StubOCR("Rice\nNet Quantity 5 kg\nMRP Rs. 499\nManufacturer: Acme Foods", 45.0),
    )
    _stub_vision(monkeypatch, mrp="Rs. 399")
    monkeypatch.setattr(scan_route, "get_current_user", lambda: {"sub": "test-user"})

    response = scan(Image.new("RGB", (600, 600), "white"))
    assert response.status_code == 200
    data = response.json()
    assert data["vision_used"] is True
    mrp = data["product_information"]["mrp"]
    assert mrp["status"] == "uncertain"
    assert mrp["conflicts"]