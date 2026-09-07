"""Two-side (front/back) multipart scanning pipeline tests.

Covers the eight canonical scenarios:

1. valid food package
2. person (non-food photo)
3. laptop (non-food object)
4. blurry package
5. front-good / back-bad
6. no back image
7. empty image
8. non-food package

Detection, quality and per-side OCR failures must never abort a scan.
"""

import base64
import io

from PIL import Image, ImageDraw, ImageFilter
from fastapi.testclient import TestClient

from app.main import app
from app.api.routes import scan as scan_route
from tests.test_main import image_data_uri

client = TestClient(app)


# ---------------------------------------------------------------------------
# Test image builders
# ---------------------------------------------------------------------------


def _png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _label_image(text: str = "PRODUCT Rice\nMRP Rs. 149\nNet Quantity 500 g") -> Image.Image:
    image = Image.new("RGB", (1000, 500), (240, 240, 240))
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 980, 480), outline="black", width=5)
    draw.text((50, 160), text, fill="black", stroke_width=1)
    return image


def _blurry_label() -> Image.Image:
    # Low-contrast, blurred label-like image: the quality stage should flag it
    # as poor/unusable but the pipeline must keep going.
    image = Image.new("RGB", (600, 400), (200, 200, 200))
    draw = ImageDraw.Draw(image)
    draw.text((60, 180), "PRODUCT Rice MRP 149", fill=(210, 210, 210))
    return image.filter(ImageFilter.GaussianBlur(8))


def _person_photo() -> Image.Image:
    # Skin-tone dominant, low text-like edges.
    image = Image.new("RGB", (600, 800), (224, 178, 151))
    return image


def _laptop_photo() -> Image.Image:
    # High edge density but not a label: rows/columns of a keyboard.
    image = Image.new("RGB", (800, 500), (60, 60, 70))
    draw = ImageDraw.Draw(image)
    for y in range(40, 480, 30):
        draw.line((20, y, 780, y), fill=(220, 220, 220), width=2)
    for x in range(20, 780, 60):
        draw.line((x, 40, x, 480), fill=(150, 150, 150), width=2)
    return image


def _non_food_object() -> Image.Image:
    # A colorful bottle/can-like shape with a plain "cap".
    image = Image.new("RGB", (600, 900), (200, 200, 200))
    draw = ImageDraw.Draw(image)
    draw.rectangle((200, 300, 400, 850), fill=(40, 90, 160))
    draw.rectangle((250, 150, 350, 300), fill=(50, 50, 50))
    draw.rectangle((230, 100, 370, 150), fill=(30, 30, 30))
    return image


def _empty_image() -> Image.Image:
    return Image.new("RGB", (600, 600), "white")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def multipart_scan(front: Image.Image, back: Image.Image | None = None, **form):
    files = {"front_image": ("front.png", _png_bytes(front), "image/png")}
    if back is not None:
        files["back_image"] = ("back.png", _png_bytes(back), "image/png")
    return client.post("/api/scan", files=files, data=form)


# ---------------------------------------------------------------------------
# Scenario 1: valid food package (multipart, non-aborting detection)
# ---------------------------------------------------------------------------

def test_valid_food_package_multipart_completes(monkeypatch):
    from tests.conftest import stub_ocr

    stub_ocr(
        monkeypatch,
        "MANUFACTURER Acme Foods, Delhi\nPRODUCT Rice\nNet Quantity 5 kg\n"
        "MRP Rs. 499\nMFD 01/2026\nCustomer Care: 1800-123-456",
    )

    response = multipart_scan(
        _label_image(),
        product_name="Rice",
        manufacturer_name="Acme Foods",
        is_imported="false",
    )

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["success"] is True
    assert data["images_processed"] == 1
    assert data["front_side"]["label"] == "front"
    assert data["front_side"]["ocr_engine"] == "google_vision"
    assert data["product_information"]["net_quantity"]["value"] == "5 kg"
    assert data["detection"] is not None
    assert isinstance(data["detection"]["is_food_package"], bool)
    assert data["score"] > 0


# ---------------------------------------------------------------------------
# Scenario 2: person (non-food) — never aborts
# ---------------------------------------------------------------------------

def test_person_image_never_aborts(monkeypatch):
    from tests.conftest import stub_ocr

    stub_ocr(monkeypatch, "")

    response = multipart_scan(_person_photo())

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["images_processed"] == 1
    assert data["detection"] is not None
    assert any(
        "food package" in warning.lower()
        for warning in data["warnings"]
    )


# ---------------------------------------------------------------------------
# Scenario 3: laptop (non-food object) — never aborts
# ---------------------------------------------------------------------------

def test_laptop_image_never_aborts(monkeypatch):
    from tests.conftest import stub_ocr

    stub_ocr(monkeypatch, "")

    response = multipart_scan(_laptop_photo())

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["success"] is True
    assert data["score"] == 0  # nothing readable extracted
    assert data["detection"] is not None


# ---------------------------------------------------------------------------
# Scenario 4: blurry package — quality flags but never blocks
# ---------------------------------------------------------------------------

def test_blurry_package_continues_despite_quality_warning(monkeypatch):
    from tests.conftest import stub_ocr

    stub_ocr(
        monkeypatch,
        "PRODUCT Rice\nNet Quantity 5 kg\nMRP Rs. 499\nMFD 01/2026",
    )

    response = multipart_scan(_blurry_label())

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    # Quality stage ran and produced a verdict.
    assert data["front_side"]["image_quality"] is not None
    assert data["front_side"]["image_quality"]["overall"] in {
        "usable", "poor", "unusable",
    }
    # A blur warning is surfaced, but the pipeline still delivers.
    assert any("quality" in w.lower() for w in data["warnings"])
    assert data["score"] > 0


# ---------------------------------------------------------------------------
# Scenario 5: front-good / back-bad — combination still extracts
# ---------------------------------------------------------------------------

class _TwoSideOCRStub:
    """Returns label text for the front URI and fails for the back URI."""

    GOOD = {
        "raw_text": "PREMIUM RICE\nNet Quantity 5 kg\nMRP Rs. 499\nMFD 01/2026\n"
                    "Manufacturer: Acme Foods",
        "layout_text": "",
        "confidence": 92.0,
        "engine": "google_vision",
        "regions": [],
        "layout_regions": [],
        "layout_region_count": 0,
        "image_quality": "usable",
        "quality_reason": None,
    }
    BAD = {
        "raw_text": "",
        "layout_text": "",
        "confidence": 0.0,
        "engine": "google_vision",
        "regions": [],
        "layout_regions": [],
        "layout_region_count": 0,
        "image_quality": "unusable",
        "quality_reason": "Back image is unreadable (simulated).",
    }

    def __init__(self, front_uri: str):
        self.front_uri = front_uri

    def process_image(self, image_url):
        if image_url == self.front_uri:
            return dict(self.GOOD)
        return dict(self.BAD)


def test_front_good_back_bad_still_extracts(monkeypatch):
    front_uri = image_data_uri(_label_image())
    back_uri = image_data_uri(_blurry_label())

    monkeypatch.setattr(scan_route, "get_ocr_service", lambda: _TwoSideOCRStub(front_uri))

    response = client.post(
        "/api/scan",
        json={"front_image_url": front_uri, "back_image_url": back_uri},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["images_processed"] == 2
    assert data["front_side"]["ocr_raw_text"]
    assert data["back_side"]["ocr_raw_text"] == ""
    assert data["back_side"]["image_quality"]["overall"] == "unusable"
    # Front info still extracted despite the back side failing.
    assert data["product_information"]["net_quantity"]["value"] == "5 kg"
    assert data["score"] > 0


# ---------------------------------------------------------------------------
# Scenario 6: no back image
# ---------------------------------------------------------------------------

def test_no_back_image_single_side(monkeypatch):
    from tests.conftest import stub_ocr

    stub_ocr(
        monkeypatch,
        "PRODUCT Rice\nMRP Rs. 149\nNet Quantity 500 g",
    )

    response = multipart_scan(_label_image())

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["images_processed"] == 1
    assert data["front_side"] is not None
    assert data["back_side"] is None
    assert data["detection"] is not None


# ---------------------------------------------------------------------------
# Scenario 7: empty image — structured insufficient, never a crash
# ---------------------------------------------------------------------------

def test_empty_image_structured_response(monkeypatch):
    from tests.conftest import stub_ocr

    stub_ocr(monkeypatch, "")

    response = multipart_scan(_empty_image())

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["score"] == 0
    assert data["status"] == "insufficient_information"
    assert data["overall_result"] == "review"
    assert data["front_side"]["image_quality"] is not None


# ---------------------------------------------------------------------------
# Scenario 8: non-food package — detection flags it, scan continues
# ---------------------------------------------------------------------------

def test_non_food_package_flagged_but_scan_continues(monkeypatch):
    from tests.conftest import stub_ocr

    # Even when OCR hallucinates text-like output, a non-food classification
    # must not abort the pipeline.
    stub_ocr(monkeypatch, "COLA CO BOTTLE 1 L\nMRP Rs. 40")

    response = multipart_scan(_non_food_object())

    assert response.status_code == 200
    data = response.json()
    assert data["scan_completed"] is True
    assert data["detection"] is not None
    assert isinstance(data["detection"]["confidence"], float)
