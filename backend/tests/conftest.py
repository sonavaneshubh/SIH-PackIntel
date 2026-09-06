import pytest


@pytest.fixture(autouse=True)
def _force_local_tesseract_engine(monkeypatch):
    """Keep the default test suite hermetic and network-free.

    ``get_ocr_service()`` prefers OCR.Space whenever ``OCR_SPACE_API_KEY`` is
    configured (which it is in the repo's .env). Tests that call the real scan
    endpoint must therefore stay on the local Tesseract engine; OCR.Space is
    covered by dedicated tests in ``tests/test_ocr_space_service.py`` that
    stub the HTTP call.
    """
    monkeypatch.setenv("OCR_ENGINE", "tesseract")
    monkeypatch.delenv("OCR_SPACE_API_KEY", raising=False)