import pytest
from app.services.ai_service import AIService
from app.services.compliance_service import ComplianceService
from app.services.rules_service import RulesService
from app.schemas.product import ProductInformation


def test_rules_database_contains_15_codified_rules():
    """Verify Rules Database is the source of truth with 15 active Legal Metrology rules."""
    rules = RulesService.get_active_rules()
    assert len(rules) >= 15
    rule_ids = {r.rule_id for r in rules}
    assert "RULE-PC-01" in rule_ids
    assert "RULE-PC-02" in rule_ids
    assert "RULE-PC-03" in rule_ids
    assert "RULE-PC-04" in rule_ids
    assert "RULE-PC-05" in rule_ids
    assert "RULE-PC-06" in rule_ids
    assert "RULE-PC-07" in rule_ids
    assert "RULE-PC-08" in rule_ids
    assert "RULE-PC-09" in rule_ids
    assert "RULE-PC-10" in rule_ids
    assert "RULE-PC-11" in rule_ids
    assert "RULE-PC-12" in rule_ids
    assert "RULE-PC-13" in rule_ids
    assert "RULE-PC-14" in rule_ids
    assert "RULE-PC-15" in rule_ids


def test_scenario_1_good_package():
    """Test 1: Complete valid package label."""
    ocr_text = """
    PREMIUM BASMATI RICE
    Generic Name: Basmati Rice
    Net Qty: 1 kg
    Mfg By: Himalayan Agro Foods Ltd, Plot 45, Industrial Area, Solan, HP - 173212
    MRP ₹140.00 (Incl. of all taxes)
    MFD: 04/2026
    Consumer Care: Call 1800-111-222 or email customercare@himalayanagro.in
    Made in India
    """
    pi, conf = AIService.extract_product_information(ocr_text, ocr_confidence=92.0)
    assert pi.brand_or_commodity_name.value is not None
    assert pi.net_quantity.value == "1 kg"
    assert pi.manufacturer_name.value is not None
    assert "140" in str(pi.mrp.value)
    assert pi.manufacturing_date.value is not None

    compliance = ComplianceService.evaluate_compliance(product_information=pi, is_imported=False)
    assert compliance.overall_result == "pass"
    assert compliance.compliance_score >= 80

    mfg_rule = next(r for r in compliance.results if r.rule_id == "RULE-PC-01")
    assert mfg_rule.status == "PASS"

    qty_rule = next(r for r in compliance.results if r.rule_id == "RULE-PC-03")
    assert qty_rule.status == "PASS"

    mrp_rule = next(r for r in compliance.results if r.rule_id == "RULE-PC-05")
    assert mrp_rule.status == "PASS"


def test_scenario_2_missing_mrp():
    """Test 2: Package with missing MRP."""
    ocr_text = """
    ORGANIC WHOLE WHEAT ATTA
    Generic Name: Wheat Flour
    Net Quantity: 5 kg
    Manufactured By: Organic Mills India, Jaipur, Rajasthan
    MFD: 03/2026
    Consumer Care: care@organicmills.in
    """
    pi, conf = AIService.extract_product_information(ocr_text, ocr_confidence=88.0)
    assert pi.mrp.status == "not_visible"

    compliance = ComplianceService.evaluate_compliance(product_information=pi, is_imported=False)
    mrp_rule = next(r for r in compliance.results if r.rule_id == "RULE-PC-05")
    assert mrp_rule.status == "FAIL"
    assert compliance.overall_result == "fail"


def test_scenario_3_blurry_image():
    """Test 3: Blurry/degraded image returns UNCERTAIN rather than crashing."""
    ocr_text = """
    prem... ric...
    net q... 5..
    """
    pi, conf = AIService.extract_product_information(ocr_text, ocr_confidence=30.0)
    compliance = ComplianceService.evaluate_compliance(
        product_information=pi, is_imported=False, image_quality="poor"
    )
    assert compliance.overall_status in ["INCONCLUSIVE", "REVIEW_REQUIRED"]
    # Check that it evaluates without raising any exception
    assert len(compliance.results) >= 10


def test_scenario_4_nutrition_heavy_package():
    """Test 4: Nutrition numbers must NEVER pollute Net Quantity or Manufacturer."""
    ocr_text = """
    CHOCO CRUNCH COOKIES
    Generic Name: Biscuits
    Net Weight: 250 g
    Manufactured by: Bakers Delight Pvt Ltd, Mumbai
    MRP: Rs. 50 (Incl. of all taxes)
    MFD: 02/2026
    Consumer Care: 022-28471199

    NUTRITIONAL INFORMATION per 100g:
    Energy: 480 kcal
    Carbohydrate: 68.5 g
    Total Sugars: 32.0 g
    Protein: 6.8 g
    Total Fat: 20.4 g
    Sodium: 180 mg
    """
    fields, conf = AIService.extract_with_confidence(ocr_text, ocr_confidence=90.0)
    pi, _ = AIService.extract_product_information(ocr_text, ocr_confidence=90.0)
    other_info = pi.other_detected_information
    
    # Net Quantity must be 250 g, NOT Carbohydrate or Protein
    assert fields["net_quantity"] == "250 g"
    assert "Carbohydrate" not in str(fields.get("manufacturer_name", ""))
    assert "Protein" not in str(fields.get("manufacturer_name", ""))

    # Nutrition info captured separately in other_info
    assert "Carbohydrate" in str(other_info.nutrition_info) or "Energy" in str(other_info.nutrition_info)

    compliance = ComplianceService.evaluate_compliance(product_information=pi, is_imported=False)
    qty_rule = next(r for r in compliance.results if r.rule_id == "RULE-PC-03")
    assert qty_rule.status == "PASS"
    assert "250" in str(qty_rule.detected_value)


def test_scenario_5_imported_product():
    """Test 5: Imported product requires Country of Origin."""
    ocr_text = """
    SWISS CHOCOLATE
    Generic Name: Milk Chocolate
    Net Qty: 100 g
    Imported By: Global Treats Import Ltd, New Delhi
    Country of Origin: Switzerland
    MRP: Rs. 250.00 (Incl. of all taxes)
    MFD: 01/2026
    Consumer Care: imports@globaltreats.in
    """
    pi, _ = AIService.extract_product_information(ocr_text, ocr_confidence=90.0)
    compliance = ComplianceService.evaluate_compliance(product_information=pi, is_imported=True)
    
    origin_rule = next(r for r in compliance.results if r.rule_id == "RULE-PC-09")
    assert origin_rule.applicable is True
    assert origin_rule.status == "PASS"
    assert "Switzerland" in str(origin_rule.detected_value)


def test_scenario_6_domestic_product_country_of_origin():
    """Test 6: Domestic product does not fail when Country of Origin is missing."""
    ocr_text = """
    SUNFLOWER OIL
    Generic Name: Refined Sunflower Oil
    Net Quantity: 1 l
    Manufactured By: Bharat Oils Ltd, Gujarat
    MRP: Rs. 165 (Incl. of all taxes)
    MFD: 03/2026
    Consumer Care: contact@bharatoils.com
    """
    pi, _ = AIService.extract_product_information(ocr_text, ocr_confidence=90.0)
    compliance = ComplianceService.evaluate_compliance(product_information=pi, is_imported=False)
    
    origin_rule = next(r for r in compliance.results if r.rule_id == "RULE-PC-09")
    # For domestic without explicit origin, it is NOT_APPLICABLE, NOT a failure
    assert origin_rule.status == "NOT_APPLICABLE" or origin_rule.status == "PASS"
    assert compliance.overall_result != "fail"


def test_scenario_7_missing_manufacturer():
    """Test 7: Missing manufacturer details triggers FAIL."""
    ocr_text = """
    Generic Name: Roasted Peanuts
    Net Qty: 200 g
    MRP: Rs. 60
    MFD: 05/2026
    """
    pi, _ = AIService.extract_product_information(ocr_text, ocr_confidence=85.0)
    compliance = ComplianceService.evaluate_compliance(product_information=pi, is_imported=False)
    
    mfg_rule = next(r for r in compliance.results if r.rule_id == "RULE-PC-01")
    assert mfg_rule.status == "FAIL"
    assert compliance.overall_result == "fail"


def test_scenario_8_mrp_with_tax_statement():
    """Test 8: MRP inclusive of all taxes affirmation."""
    ocr_text = """
    Generic Name: Green Tea
    Net Qty: 100 g
    Manufactured By: Assam Tea Co, Guwahati
    MRP ₹220.00 (Inclusive of all taxes)
    MFD: 04/2026
    Customer Care: 1800-456-789
    """
    pi, _ = AIService.extract_product_information(ocr_text, ocr_confidence=90.0)
    compliance = ComplianceService.evaluate_compliance(product_information=pi, is_imported=False)
    
    mrp_tax_rule = next(r for r in compliance.results if r.rule_id == "RULE-PC-06")
    assert mrp_tax_rule.status == "PASS"
    assert "taxes" in str(mrp_tax_rule.detected_value).lower()


def test_scenario_9_mfg_date_vs_packing_date():
    """Test 9: Distinguish manufacturing date and packing date."""
    ocr_text = """
    Generic Name: Roasted Cashews
    Net Qty: 250 g
    Mfg Date: 12/2025
    Packed Date: 01/2026
    Best Before: 6 Months from packaging
    Manufactured By: NutriNuts Ltd, Kerala
    MRP: Rs. 350 (Incl. of all taxes)
    Consumer Care: care@nutrinuts.in
    """
    dates = AIService.extract_product_information(ocr_text)[0]
    assert dates.manufacturing_date.value == "12/2025"
    assert dates.packing_date.value == "01/2026"
    assert dates.expiry_date.value is not None


def test_scenario_10_completely_unusable_image():
    """Test 10: Completely unreadable image returns completed report with INCONCLUSIVE without crashing."""
    ocr_text = ""
    pi, _ = AIService.extract_product_information(ocr_text, ocr_confidence=0.0)
    compliance = ComplianceService.evaluate_compliance(
        product_information=pi, is_imported=False, image_quality="unusable"
    )
    assert compliance.overall_status == "INCONCLUSIVE"
    assert compliance.compliance_score == 0
    assert len(compliance.results) >= 10
