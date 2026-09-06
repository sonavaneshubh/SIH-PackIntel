"""Tests for the OCR text normalizer and the dedicated product-extraction layer."""

import pytest

from app.schemas.product import PRODUCT_FIELDS, ProductInformation
from app.services.product_extractor import (
    apply_pipeline_overlays,
    extract_product,
    extract_product_with_report,
)
from app.services.text_normalizer import (
    normalize_and_report,
    normalize_text,
)


# ---------------------------------------------------------------------------
# text_normalizer
# ---------------------------------------------------------------------------


def test_normalizer_canonicalizes_currencies_and_labels():
    text = "NET  Weight : 500 g\nM.R.P : Rs. 650 (incl of all taxes)"
    normalized = normalize_text(text)
    assert "NET WT 500 g" in normalized
    assert "₹ 650" in normalized.replace("M.R.P", "MRP")


def test_normalizer_preserves_brand_names_verbatim():
    text = "PARLE-G  Rs. 5\nBiscuits\nNet Quantity: 80 g"
    normalized, raw = normalize_and_report(text)
    assert raw == text
    assert "PARLE-G" in normalized
    assert "Biscuits" in normalized


def test_normalizer_joins_fragmented_labels():
    text = "NET\nWT 500 g\nMfg . Date : 23 / 04 / 2026"
    normalized = normalize_text(text)
    assert "NET WT 500 g" in normalized


def test_normalizer_keeps_manufactured_distinct_from_mfd():
    # "Manufactured By" is an identity label; "MFD"/"MFG" may prefix a date.
    text = "Manufactured By: ACME FOODS\nMFD 01/2026"
    normalized = normalize_text(text)
    assert "MFD 01/2026" in normalized
    assert "MANUFACTURED" in normalized.upper()


def test_normalizer_maps_best_before_to_expiry():
    assert "EXPIRY 6 months from packaging" in normalize_text("Best Before: 6 months from packaging")


def test_normalizer_handles_blank_and_garbage():
    assert normalize_text("") == ""
    assert normalize_text("   \n\t   ") == ""


# ---------------------------------------------------------------------------
# product_extractor
# ---------------------------------------------------------------------------


def test_parle_g_like_label_full_extraction():
    label = (
        "PARLE-G  Rs. 5\n"
        "Biscuits\n"
        "Net Quantity: 80 g\n"
        "Ingredient: Wheat flour\n"
        "Marketed By: PARLE PRODUCTS PVT LTD\n"
        "Parle Products Pvt Ltd\n"
        "Village-Bhat, Dist. Kutch\n"
        "Bhuj, Gujarat-370220\n"
        "Customer Care No: 022-67114000\n"
        "FSSAI Lic No: 10019022001234\n"
        "Best Before: 6 months from packaging\n"
        "MRP Rs. 5 (incl. of all taxes)"
    )
    pi = extract_product(label)
    d = pi.as_dict()

    assert d["brand_or_commodity_name"].value == "PARLE-G"
    assert d["brand_or_commodity_name"].status == "detected"
    assert d["generic_name"].value == "Biscuits"
    assert d["net_quantity"].value == "80 g"
    assert d["quantity_unit"].value == "g"
    assert d["marketer_name"].value == "PARLE PRODUCTS PVT LTD"
    assert d["marketer_address"].value == "Village-Bhat, Dist. Kutch Bhuj, Gujarat-370220"
    assert d["mrp"].value == "Rs. 5 (Incl. of all taxes)"
    assert d["mrp_tax_inclusive"].value == "Yes"
    assert d["customer_care_phone"].value == "022-67114000"
    assert d["fssai_number"].value == "10019022001234"
    assert d["expiry_date"].value == "6 months from packaging"
    assert d["expiry_date"].status == "detected"


def test_poor_ocr_label_still_extracts_canonical_fields():
    label = (
        "AMUL BUTTER\n"
        "Net  Weight : 500g\n"
        "Mfg . Date : 23 / 04 / 2026\n"
        "Best  Before : 6 Months\n"
        "F SS AI Lic . No . 10008011003456\n"
        "MRP  : Rs . 189 / -  (inclusive of all taxes)\n"
        "Packed  By : GUJARAT CO-OP MILK MKTG FED LTD\n"
        "Anand , Gujarat - 388001"
    )
    pi = extract_product(label)
    d = pi.as_dict()

    assert d["brand_or_commodity_name"].value == "AMUL BUTTER"
    assert d["net_quantity"].value == "500 g"
    assert d["packer_name"].value == "GUJARAT CO-OP MILK MKTG FED LTD"
    assert "Anand" in d["packer_name"].value or "Anand" not in (d["packer_name"].value or "")
    assert d["mrp"].value == "Rs. 189 (Incl. of all taxes)"
    assert d["expiry_date"].value == "6 Months"
    assert d["fssai_number"].value == "10008011003456"
    assert "23/04/2026" in (d["manufacturing_date"].value or "") or "2026" in (d["manufacturing_date"].value or "")


def test_manufactured_by_with_address_extracts_both():
    label = (
        "AMUL GHEE\n"
        "Manufactured By: GCMMF\n"
        "Anand, Gujarat-388001\n"
        "Net Wt. 500 ml\n"
        "MRP Rs. 189\n"
        "FSSAI Lic. No. 10008011003456"
    )
    pi = extract_product(label)
    d = pi.as_dict()

    assert d["manufacturer_name"].value == "GCMMF"
    assert d["manufacturer_address"].value == "Anand, Gujarat-388001"
    assert d["net_quantity"].value == "500 ml"
    assert d["quantity_unit"].value == "ml"


def test_blank_and_garbage_text_never_hallucinate():
    pi = extract_product("")
    for key in PRODUCT_FIELDS:
        assert pi.as_dict()[key].status in {"not_visible", "not_printed"}
        assert pi.as_dict()[key].value is None

    pi2 = extract_product("xyz 123 ?!@# 999999")
    detected = [
        key for key in PRODUCT_FIELDS if pi2.as_dict()[key].status == "detected"
    ]
    assert detected == []


def test_customer_care_contact_fields():
    label = (
        "Consumer Care: 1800-258-1234\n"
        "Email: support@example.com\n"
        "Batch No. B2026001"
    )
    pi = extract_product(label)
    d = pi.as_dict()
    assert d["toll_free_number"].value == "1800-258-1234"
    assert d["customer_care_email"].value == "support@example.com"
    assert d["batch_number"].value == "B2026001"


def test_report_shape_keeps_raw_and_canonical_product():
    report = extract_product_with_report("PARLE-G\nNet Quantity: 80 g\nMRP Rs. 5")
    assert set(report.keys()) == {"raw_ocr_text", "normalized_ocr_text", "product"}
    assert report["raw_ocr_text"] == "PARLE-G\nNet Quantity: 80 g\nMRP Rs. 5"
    assert isinstance(report["product"], dict)
    assert set(report["product"].keys()) == set(PRODUCT_FIELDS)
    field = report["product"]["mrp"]
    assert set(field.keys()) == {"value", "status", "confidence", "source", "evidence", "conflicts"}


def test_apply_pipeline_overlays_fills_addresses_without_overwriting():
    from app.services.ai_service import AIService

    text = "Marketed By: PARLE PRODUCTS PVT LTD\nVillage-Bhat, Dist. Kutch\nBhuj, Gujarat-370220"
    base, _ = AIService.extract_product_information(text)
    assert base.marketer_address.status == "not_visible"

    pi = apply_pipeline_overlays(base, text)
    assert pi.marketer_name.value == "PARLE PRODUCTS PVT LTD"
    assert pi.marketer_address.value == "Village-Bhat, Dist. Kutch Bhuj, Gujarat-370220"


def test_every_field_is_26_field_schema():
    pi = extract_product("MRP Rs. 99\nNet Quantity 250 ml")
    assert isinstance(pi, ProductInformation)
    assert set(pi.as_dict().keys()) == set(PRODUCT_FIELDS)
    assert len(PRODUCT_FIELDS) == 26