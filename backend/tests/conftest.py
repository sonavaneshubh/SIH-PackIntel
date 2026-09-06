import pytest

from app.core.config import settings
from app.services import ocr_space_service
from app.api.routes import scan as scan_route


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text or str(payload)

    def json(self):
        return self._payload


def stub_ocr_space(
    monkeypatch,
    text: str = "",
    *,
    status_code: int = 200,
    error_message: str | None = None,
    exc: Exception | None = None,
) -> None:
    """Point OCR.Space's HTTP POST at a canned response (no network).

    Defaults to an empty OCR result. ``exc`` makes the HTTP layer raise
    (network/timeout-style failure); ``status_code``/``error_message``
    simulate an API-level failure response.
    """
    if exc is not None:

        def fake_post(url, **kwargs):
            raise exc
    elif error_message is not None or status_code != 200:

        def fake_post(url, **kwargs):
            return _FakeResponse(
                status_code,
                {
                    "IsErroredOnProcessing": True,
                    "ErrorMessage": error_message or "processing failed",
                },
            )
    else:

        def fake_post(url, **kwargs):
            return _FakeResponse(
                200,
                {"IsErroredOnProcessing": False, "ParsedResults": [{"ParsedText": text}]},
            )

    monkeypatch.setattr(ocr_space_service.requests, "post", fake_post)


def stub_ocr(
    monkeypatch,
    text: str = "",
    *,
    engine: str = "google_vision",
    confidence: float = 0.0,
    image_quality: str | None = None,
    quality_reason: str | None = None,
    raise_exc: Exception | None = None,
) -> None:
    """Make the scan pipeline's OCR engine return canned output (no network).

    Replaces ``get_ocr_service`` in the scan route so no test touches the real
    Google Cloud Vision API or local Tesseract. ``raise_exc`` makes the OCR
    engine raise (simulating an API outage).
    """
    if raise_exc is not None:

        class _RaisingOCR:
            def process_image(self, image_url):
                raise raise_exc

        monkeypatch.setattr(scan_route, "get_ocr_service", lambda: _RaisingOCR())
        return

    if text:
        image_quality = image_quality if image_quality is not None else "usable"
    else:
        image_quality = image_quality if image_quality is not None else "unusable"

    result = {
        "status": "success" if text else "completed_with_warning",
        "raw_text": text,
        "text": text,
        "confidence": confidence,
        "engine": engine,
        "regions": [],
        "layout_regions": [],
        "layout_text": "",
        "layout_region_count": 0,
        "image_quality": image_quality,
        "quality_reason": quality_reason,
    }

    class _StubOCR:
        def process_image(self, image_url):
            return dict(result)

    monkeypatch.setattr(scan_route, "get_ocr_service", lambda: _StubOCR())


@pytest.fixture(autouse=True)
def _hermetic_scan_tests(monkeypatch):
    """Offline, vision-disabled defaults for the test suite.

    Every test runs with:
    * Gemini vision fallback disabled by configuration,
    * the OCR path stubbed to a canned (default empty) result so no test
      touches the real Google Cloud Vision API or local Tesseract.

    Tests override the stub via ``stub_ocr`` for specific responses.
    ``stub_ocr_space`` remains available for the OCR.Space unit tests, which
    exercise that adapter directly.
    """
    monkeypatch.setenv("ENABLE_VISION_FALLBACK", "false")
    monkeypatch.delenv("OCR_ENGINE", raising=False)
    monkeypatch.setenv("OCR_SPACE_API_KEY", "test-only-key")
    # settings is a cached singleton instantiated at import time from the dev
    # .env (ocr_space_service.load_dotenv runs first), so env-var monkeypatching
    # alone cannot force a hermetic default. Patch the singleton directly so no
    # test ever hits the real Gemini vision API.
    monkeypatch.setattr(settings, "ENABLE_VISION_FALLBACK", False)
    monkeypatch.setattr(settings, "GEMINI_PRIMARY_ENABLED", False)
    stub_ocr(monkeypatch)