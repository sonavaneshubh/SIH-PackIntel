import base64
import io

from PIL import Image, ImageDraw
from fastapi.testclient import TestClient
from app.main import app
from app.services import ocr_service
from app.api.routes import scan as scan_route
from app.services.ai_service import AIService
from app.services.compliance_service import ComplianceService
from app.services.ocr_service import OCRService
from tests.conftest import stub_ocr_space

client = TestClient(app)


def image_data_uri(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{encoded}"


def scan(image: Image.Image):
    return client.post("/api/scan", json={"image_url": image_data_uri(image)})


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_preflight_allows_local_frontend():
    response = client.options(
        "/api/scan",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
    assert "content-type" in response.headers["access-control-allow-headers"].lower()


def test_low_confidence_scan_does_not_invoke_gemini(monkeypatch):
    image = Image.new("RGB", (600, 600), "white")

    class FakeOCRSpace:
        def process_image(self, image_url):
            return {
                "raw_text": "Rice",
                "confidence": 25.0,
                "engine": "ocr_space",
                "regions": [],
                "image_quality": "usable",
                "quality_reason": None,
            }

    # Gemini must never execute, even for low-confidence OCR text.
    def _forbidden_vision_call(_):
        raise AssertionError("Gemini vision was called during the OCR.Space-only scan")

    monkeypatch.setattr(scan_route, "get_ocr_service", lambda: FakeOCRSpace())
    monkeypatch.setattr(scan_route.VisionService, "extract", _forbidden_vision_call)
    monkeypatch.setattr(scan_route, "get_current_user", lambda: {"sub": "test-user"})

    response = client.post("/api/scan", json={"image_url": image_data_uri(image)})

    assert response.status_code == 200
    data = response.json()
    assert data["vision_used"] is False
    assert data["vision_error"] is None
    assert data["extraction_source"] == "ocr"


def test_scan_endpoint():
    response = client.post("/api/scan", json={"product_name": "Test Rice"})
    assert response.status_code == 400
    assert response.json()["detail"] == "image_url is required for OCR scanning"


def test_compliance_check_endpoint():
    response = client.post("/api/compliance/check", json={"inspection_id": "test-123"})
    assert response.status_code == 200
    data = response.json()
    assert data["overall_result"] in ["pass", "review", "fail"]


def test_ocr_diagnostics_distinguish_missing_binary(monkeypatch):
    monkeypatch.setattr(ocr_service, "HAS_PYTESSERACT", True)
    monkeypatch.setattr(ocr_service, "_resolve_tesseract_command", lambda: None)

    diagnostics = ocr_service.get_tesseract_diagnostics()

    assert diagnostics == {
        "available": False,
        "reason": "tesseract_missing",
        "message": (
            "Tesseract OCR is not installed or not available in PATH. "
            "Install Tesseract or set TESSERACT_CMD to its executable."
        ),
    }


def test_ocr_diagnostics_distinguish_invalid_configured_binary(monkeypatch):
    monkeypatch.setenv("TESSERACT_CMD", "C:\\missing\\tesseract.exe")
    monkeypatch.setattr(ocr_service, "HAS_PYTESSERACT", True)
    monkeypatch.setattr(ocr_service, "_resolve_tesseract_command", lambda: None)

    diagnostics = ocr_service.get_tesseract_diagnostics()

    assert diagnostics == {
        "available": False,
        "reason": "tesseract_inaccessible",
        "message": "TESSERACT_CMD is configured but the executable cannot be found.",
    }


def test_clear_text_image_completes_with_extracted_information(monkeypatch):
    stub_ocr_space(monkeypatch, "PRODUCT Rice MRP Rs. 149 Net Quantity 500 g")
    image = Image.new("RGB", (1000, 500), (220, 220, 220))
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 980, 480), outline="black", width=5)
    draw.text((50, 180), "PRODUCT Rice MRP Rs. 149 Net Quantity 500 g", fill="black", stroke_width=1)

    response = scan(image)

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["success"] is True
    assert data["ocr_engine"] == "ocr_space"
    assert data["ocr_raw_text"]
    assert data["score"] > 0


def test_partial_text_completes_with_partial_status(monkeypatch):
    stub_ocr_space(monkeypatch, "MRP Rs. 149")

    response = scan(Image.new("RGB", (1000, 500), (220, 220, 220)))

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["status"] == "partial_information"
    assert data["ocr_engine"] == "ocr_space"
    assert data["score"] > 0
    assert data["report"]


def test_blank_image_completes_with_zero_score():
    response = scan(Image.new("RGB", (600, 600), "white"))

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["score"] == 0
    assert data["status"] == "insufficient_information"
    assert data["ocr_engine"] == "ocr_space"
    assert "readable" in data["report"].lower()


def test_blurry_image_completes_as_unusable():
    response = scan(Image.new("RGB", (600, 600), (128, 128, 128)))

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["score"] == 0
    assert data["image_quality"] == "unusable"
    assert data["report"]


def test_random_object_image_completes_without_scan_error():
    image = Image.new("RGB", (600, 600), "#4f7f58")
    response = scan(image)

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["score"] == 0
    assert data["status"] == "insufficient_information"


def test_empty_ocr_completes_without_ocr_failure():
    response = scan(Image.new("RGB", (600, 600), "white"))

    assert response.status_code == 200
    assert response.json()["scan_completed"] is True
    assert response.json()["ocr_raw_text"] == ""
    assert response.json()["score"] == 0
    assert "OCR returned no text" not in response.text


def test_expected_ocr_space_exception_completes_without_crash(monkeypatch):
    from app.services.ocr_space_service import OCRSpaceError

    stub_ocr_space(
        monkeypatch,
        exc=OCRSpaceError("OCR.Space HTTP 500: service unavailable"),
    )

    response = scan(Image.new("RGB", (600, 600), "white"))

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["score"] == 0
    assert data["ocr_engine"] == "ocr_space"
    assert "HTTP 500" in (data["quality_reason"] or "")
    assert "unable to verify" in data["report"]


def test_normal_compliance_scan_keeps_success_response(monkeypatch):
    stub_ocr_space(
        monkeypatch,
        "MANUFACTURER Acme Foods, Delhi\nPRODUCT Rice\nNet Quantity 5 kg\nMRP Rs. 499\nMFD 01/2026",
    )
    image = Image.new("RGB", (1000, 500), (220, 220, 220))
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 980, 480), outline="black", width=5)
    draw.text(
        (40, 120),
        "MANUFACTURER Acme Foods, Delhi\nPRODUCT Rice\nNet Quantity 5 kg\nMRP Rs. 499\nMFD 01/2026",
        fill="black",
        stroke_width=1,
    )

    response = client.post(
        "/api/scan",
        json={"image_url": image_data_uri(image), "product_name": "Rice", "manufacturer_name": "Acme Foods"},
    )

    assert response.status_code == 200
    assert response.json()["scan_completed"] is True
    assert response.json()["success"] is True
    assert response.json()["ocr_engine"] == "ocr_space"


# ---------------------------------------------------------------------------
# OCR.Space-only pipeline guarantees
# ---------------------------------------------------------------------------

def test_ocr_space_successful_scan(monkeypatch):
    stub_ocr_space(
        monkeypatch,
        "PREMIUM RICE\nNet Quantity 5 kg\nMRP Rs. 499\nMFD 01/2026\n"
        "Manufacturer: Acme Foods Pvt Ltd\nCustomer Care: 1800-123-456",
    )

    response = scan(Image.new("RGB", (600, 600), "white"))

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["ocr_engine"] == "ocr_space"
    assert data["vision_used"] is False
    assert data["extraction_source"] == "ocr"
    assert data["score"] > 0
    assert "MRP Rs. 499" in data["ocr_raw_text"]
    assert data["product_information"]["net_quantity"]["value"] == "5 kg"


def test_ocr_space_empty_response_is_structured_insufficient(monkeypatch):
    stub_ocr_space(monkeypatch, "")

    response = scan(Image.new("RGB", (600, 600), "white"))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "insufficient_information"
    assert data["scan_completed"] is True
    assert data["score"] == 0
    assert data["compliance_score"] == 0
    assert data["ocr_engine"] == "ocr_space"
    assert data["vision_used"] is False
    assert "clearer image" in data["report"].lower()


def test_ocr_space_api_failure_is_structured_ocr_failed(monkeypatch):
    from app.services.ocr_space_service import OCRSpaceError

    stub_ocr_space(monkeypatch, exc=OCRSpaceError("OCR.Space services are down (500)"))

    response = scan(Image.new("RGB", (600, 600), "white"))

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["status"] == "insufficient_information"
    assert data["score"] == 0
    assert data["ocr_engine"] == "ocr_space"
    assert data["image_quality"] == "unusable"
    assert "500" in (data["quality_reason"] or "")
    assert "OCR status: failed" in data["report"]


def test_gemini_is_never_called_during_scan(monkeypatch):
    stub_ocr_space(
        monkeypatch,
        "PRODUCT Rice\nNet Quantity 5 kg\nMRP Rs. 499\nMFD 01/2026\nManufacturer: Acme Foods",
    )

    def _forbidden_vision_call(_):
        raise AssertionError("Gemini vision executed during the scan pipeline")

    monkeypatch.setattr(scan_route.VisionService, "extract", _forbidden_vision_call)
    monkeypatch.setattr(scan_route, "get_current_user", lambda: {"sub": "test-user"})

    response = scan(Image.new("RGB", (600, 600), "white"))

    assert response.status_code == 200
    data = response.json()
    assert data["vision_used"] is False
    assert data["vision_error"] is None
    assert data["extraction_source"] == "ocr"


def test_ai_extraction_sample_label():
    text = (
        "PREMIUM BASMATI RICE\n"
        "Net Quantity 5 kg\n"
        "MRP Rs. 499 (Incl. of all taxes)\n"
        "MFD 01/2026\n"
        "Manufacturer: Acme Foods Pvt Ltd\n"
        "12 MG Road, Mumbai - 400001\n"
        "Customer Care: 1800-123-456\n"
        "Country of Origin: India\n"
        "FSSAI Lic No. 12345678901234"
    )
    fields, conf = AIService.extract_with_confidence(text)

    assert fields["commodity_name"] == "PREMIUM BASMATI RICE"
    assert fields["net_quantity"] == "5 kg"
    assert fields["mrp"] == "Rs. 499 (Incl. of all taxes)"
    assert fields["month_year_packed"] == "01/2026"
    assert "Acme Foods" in fields["manufacturer_name"]
    assert fields["country_of_origin"] == "India"
    assert "1800" in fields["consumer_care"]
    assert conf["overall"] > 0


def test_ai_extraction_ignores_unrelated_numbers():
    fields, conf = AIService.extract_with_confidence(
        "Some random package with numbers 149, 500 and 2026 but no label."
    )
    assert fields["mrp"] is None
    assert fields["net_quantity"] is None
    assert fields["month_year_packed"] is None
    assert conf["overall"] == 0


def test_ai_extraction_does_not_fallback_to_request_metadata():
    text = "MRP Rs. 99\nNet Quantity 250 ml"
    fields, _ = AIService.extract_with_confidence(text)
    assert fields["commodity_name"] is None
    assert fields["manufacturer_name"] is None


def test_compliance_weighted_score_and_overall():
    declarations = {
        "manufacturer_name": "Acme Foods",
        "net_quantity": "5 kg",
        "mrp": "Rs. 499",
        "month_year_packed": "01/2026",
        "commodity_name": "Rice",
        "customer_care": "1800-123-456",
    }
    response = ComplianceService.evaluate_compliance("INS-X", declarations, is_imported=False)
    assert response.compliance_score == 100
    assert response.risk_score == 0
    assert response.overall_result == "pass"
    assert any(r.result == "not_applicable" for r in response.results)

    empty = ComplianceService.evaluate_compliance("INS-Y", {}, is_imported=False)
    assert empty.compliance_score == 0
    assert empty.risk_score == 100
    assert empty.overall_result == "review"


def test_compliance_imported_package_requires_origin():
    response = ComplianceService.evaluate_compliance("INS-Z", {"net_quantity": "250 g"}, is_imported=True)
    assert response.overall_result == "review"
    pc07 = next(r for r in response.results if r.rule_code == "PC-07")
    assert pc07.result == "warning"


def test_ocr_confidence_and_regions_from_data_layer(monkeypatch):
    data = {
        "level": [5, 5],
        "conf": [88.0, 75.0],
        "text": ["MRP", "Rs."],
        "left": [10, 120],
        "top": [30, 30],
        "width": [90, 40],
        "height": [20, 20],
    }
    image = Image.new("RGB", (400, 200), (255, 255, 255))
    monkeypatch.setattr(
        OCRService,
        "_run_tesseract_string",
        lambda img, psm: "MRP Rs. 149" if psm == 3 else "",
    )
    monkeypatch.setattr(OCRService, "_run_tesseract_data", lambda img, psm: data)

    result = OCRService.process_image(image_data_uri(image))

    assert result["text"] == "MRP Rs. 149"
    assert result["confidence"] == 81.5
    assert result["regions"]
    assert result["regions"][0]["text"] == "MRP"
    assert 0 <= result["regions"][0]["left"] <= 1
    assert 0 <= result["regions"][0]["top"] <= 1