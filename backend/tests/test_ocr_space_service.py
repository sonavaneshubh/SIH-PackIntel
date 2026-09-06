"""Hermetic tests for the OCR.Space integration (HTTP layer is stubbed)."""

import base64
import io

import pytest
from PIL import Image, ImageDraw
from urllib.error import HTTPError

from app.services import ocr_service, ocr_space_service
from app.services.ocr_space_service import (
    OCRSpaceError,
    OCRSpaceService,
    extract_text_with_ocr_space,
)


class _FakeResponse:
    def __init__(self, status_code: int, payload, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text or str(payload)

    def json(self):
        return self._payload


def _make_image(tmp_path, width=800, height=600, color=(255, 255, 255), text=None):
    image = Image.new("RGB", (width, height), color)
    if text:
        ImageDraw.Draw(image).text((30, 30), text, fill="black")
    path = tmp_path / "label.png"
    image.save(path, format="PNG")
    return str(path)


def _ok_payload(parsed_text: str, confidence: float = 94.66) -> dict:
    return {
        "IsErroredOnProcessing": False,
        "ParsedResults": [
            {"ParsedText": parsed_text, "ConfidenceScore": confidence}
        ],
    }


# ── Engine selection ──────────────────────────────────────────────────────────

def test_get_ocr_service_always_returns_ocr_space(monkeypatch):
    monkeypatch.setenv("OCR_SPACE_API_KEY", "K-test-key")
    monkeypatch.delenv("OCR_ENGINE", raising=False)

    assert isinstance(ocr_service.get_ocr_service(), OCRSpaceService)


def test_get_ocr_service_returns_ocr_space_without_key(monkeypatch):
    monkeypatch.delenv("OCR_SPACE_API_KEY", raising=False)
    monkeypatch.setenv("OCR_ENGINE", "tesseract")

    # The scan pipeline must not silently fall back to another OCR engine.
    assert isinstance(ocr_service.get_ocr_service(), OCRSpaceService)


# ── Happy path ────────────────────────────────────────────────────────────────

def test_extract_text_with_ocr_space_happy_path(monkeypatch, tmp_path):
    monkeypatch.setenv("OCR_SPACE_API_KEY", "K-test-key")
    image_path = _make_image(tmp_path, text="NET WEIGHT 250 g")

    def fake_post(url, **kwargs):
        assert url == ocr_space_service.OCR_SPACE_URL
        assert kwargs["headers"]["apikey"] == "K-test-key"
        files = kwargs["files"]["file"]
        assert files[0] == "label.jpg"
        assert files[2] == "image/jpeg"
        assert kwargs["data"]["language"] == "eng"
        assert kwargs["data"]["OCREngine"] == "2"
        assert kwargs["data"]["detectOrientation"] == "true"
        return _FakeResponse(200, _ok_payload("NET WEIGHT 250 g\nMRP Rs. 99"))

    monkeypatch.setattr(ocr_space_service.requests, "post", fake_post)

    result = extract_text_with_ocr_space(image_path)
    assert "NET WEIGHT" in result["text"]
    assert result["raw_response"]["ParsedResults"]


def test_process_image_maps_to_pipeline_shape(monkeypatch, tmp_path):
    monkeypatch.setenv("OCR_SPACE_API_KEY", "K-test-key")
    image_path = _make_image(tmp_path, text="MRP Rs. 99")

    def fake_post(url, **kwargs):
        return _FakeResponse(200, _ok_payload("MRP Rs. 99\nNet Quantity 5 kg", 92.5))

    monkeypatch.setattr(ocr_space_service.requests, "post", fake_post)

    result = OCRSpaceService.process_image(image_path)
    assert result["status"] == "success"
    assert result["engine"] == "ocr_space"
    assert result["raw_text"] == "MRP Rs. 99\nNet Quantity 5 kg"
    assert result["confidence"] == 92.5
    assert result["image_quality"] == "usable"
    assert result["lines"]


# ── Structured failure paths ──────────────────────────────────────────────────

def test_http_error_is_structured_failure(monkeypatch, tmp_path):
    monkeypatch.setenv("OCR_SPACE_API_KEY", "K-test-key")
    image_path = _make_image(tmp_path)

    def fake_post(url, **kwargs):
        return _FakeResponse(500, {"error": "boom"}, text="server boom")

    monkeypatch.setattr(ocr_space_service.requests, "post", fake_post)

    with pytest.raises(OCRSpaceError, match="500"):
        extract_text_with_ocr_space(image_path)

    result = OCRSpaceService.process_image(image_path)
    assert result["status"] == "completed_with_warning"
    assert result["raw_text"] == ""
    assert "500" in result["quality_reason"]
    assert result["image_quality"] == "unusable"


def test_processing_error_is_structured_failure(monkeypatch, tmp_path):
    monkeypatch.setenv("OCR_SPACE_API_KEY", "K-test-key")
    image_path = _make_image(tmp_path)

    def fake_post(url, **kwargs):
        return _FakeResponse(200, {
            "IsErroredOnProcessing": True,
            "ErrorMessage": "invalid image format",
        })

    monkeypatch.setattr(ocr_space_service.requests, "post", fake_post)

    with pytest.raises(OCRSpaceError, match="invalid image format"):
        extract_text_with_ocr_space(image_path)

    result = OCRSpaceService.process_image(image_path)
    assert result["status"] == "completed_with_warning"
    assert result["raw_text"] == ""


def test_empty_ocr_result_is_structured_failure(monkeypatch, tmp_path):
    monkeypatch.setenv("OCR_SPACE_API_KEY", "K-test-key")
    image_path = _make_image(tmp_path)

    def fake_post(url, **kwargs):
        return _FakeResponse(200, {"IsErroredOnProcessing": False, "ParsedResults": []})

    monkeypatch.setattr(ocr_space_service.requests, "post", fake_post)

    with pytest.raises(OCRSpaceError, match="no readable text"):
        extract_text_with_ocr_space(image_path)

    result = OCRSpaceService.process_image(image_path)
    assert result["raw_text"] == ""
    assert "no readable" in result["quality_reason"]


def test_request_exception_is_structured_failure(monkeypatch, tmp_path):
    monkeypatch.setenv("OCR_SPACE_API_KEY", "K-test-key")
    image_path = _make_image(tmp_path)

    def fake_post(url, **kwargs):
        raise ocr_space_service.requests.exceptions.Timeout("timed out")

    monkeypatch.setattr(ocr_space_service.requests, "post", fake_post)

    result = OCRSpaceService.process_image(image_path)
    assert result["status"] == "completed_with_warning"
    assert "timed out" in result["quality_reason"]


def test_missing_api_key_is_structured_failure(monkeypatch, tmp_path):
    monkeypatch.delenv("OCR_SPACE_API_KEY", raising=False)
    image_path = _make_image(tmp_path)

    result = OCRSpaceService.process_image(image_path)
    assert result["status"] == "completed_with_warning"
    assert "OCR_SPACE_API_KEY" in result["quality_reason"]


# ── Input validation & preprocessing ──────────────────────────────────────────

def test_non_image_input_raises_value_error(tmp_path):
    not_image = tmp_path / "not_an_image.txt"
    not_image.write_bytes(b"this is definitely not an image file")

    with pytest.raises(ValueError, match="not a supported image format"):
        OCRSpaceService.process_image(str(not_image))


def test_missing_file_raises_value_error():
    with pytest.raises(ValueError, match="Could not load image"):
        OCRSpaceService.process_image(r"C:\does\not\exist\label.png")


def test_unreachable_url_is_clean_client_error(monkeypatch):
    monkeypatch.setenv("OCR_SPACE_API_KEY", "K-test-key")

    def boom(url, **kwargs):
        raise HTTPError("https://cdn.example.invalid/label.png", 403, "Forbidden", None, None)

    monkeypatch.setattr(ocr_space_service.urllib.request, "urlopen", boom)

    with pytest.raises(ValueError, match="expired"):
        extract_text_with_ocr_space("https://cdn.example.invalid/label.png")

    with pytest.raises(ValueError, match="expired"):
        OCRSpaceService.process_image("https://cdn.example.invalid/label.png")


def test_large_png_is_downscaled_to_jpeg(monkeypatch, tmp_path):
    monkeypatch.setenv("OCR_SPACE_API_KEY", "K-test-key")
    image = Image.new("RGB", (4000, 2000), "white")
    path = tmp_path / "huge.png"
    image.save(path, format="PNG")

    captured = {}

    def fake_post(url, **kwargs):
        captured["file"] = kwargs["files"]["file"][1]
        return _FakeResponse(200, _ok_payload("PRODUCT"))

    monkeypatch.setattr(ocr_space_service.requests, "post", fake_post)

    result = extract_text_with_ocr_space(str(path))
    assert "PRODUCT" in result["text"]

    sent = captured["file"]
    sent.seek(0)
    reopened = Image.open(io.BytesIO(sent.read()))
    assert reopened.format == "JPEG"
    assert max(reopened.size) <= ocr_space_service.MAX_DIMENSION_PX


def test_data_uri_input_accepted(monkeypatch, tmp_path):
    monkeypatch.setenv("OCR_SPACE_API_KEY", "K-test-key")
    image_path = _make_image(tmp_path, text="BAUM")
    with open(image_path, "rb") as fh:
        data_uri = "data:image/png;base64," + base64.b64encode(fh.read()).decode()

    def fake_post(url, **kwargs):
        return _FakeResponse(200, _ok_payload("BAUM"))

    monkeypatch.setattr(ocr_space_service.requests, "post", fake_post)

    result = extract_text_with_ocr_space(data_uri)
    assert result["text"] == "BAUM"