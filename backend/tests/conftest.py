import pytest

from app.core.config import settings
from app.services import ocr_space_service


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


@pytest.fixture(autouse=True)
def _ocr_space_only_hermetic_tests(monkeypatch):
    """OCR.Space-only, offline, vision-disabled defaults for the test suite.

    Every test runs with:
    * Gemini vision fallback disabled by configuration,
    * OCR.Space as the only engine, with its HTTP layer stubbed to fail closed
      so no test touches the real OCR.Space API.

    Tests override the stub via ``stub_ocr_space`` for specific responses.
    """
    monkeypatch.setenv("ENABLE_VISION_FALLBACK", "false")
    monkeypatch.delenv("OCR_ENGINE", raising=False)
    monkeypatch.setenv("OCR_SPACE_API_KEY", "test-only-key")
    # settings is a cached singleton instantiated at import time from the dev
    # .env (ocr_space_service.load_dotenv runs first), so env-var monkeypatching
    # alone cannot force a hermetic default. Patch the singleton directly so no
    # test ever hits the real Gemini vision API.
    monkeypatch.setattr(settings, "ENABLE_VISION_FALLBACK", False)
    stub_ocr_space(monkeypatch)