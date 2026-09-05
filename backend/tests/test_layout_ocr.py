from unittest.mock import patch

from PIL import Image, ImageDraw

import app.services.layout_ocr as layout_ocr_module
from app.services.layout_ocr import extract_layout_ocr, detect_rois


def test_layout_ocr_accepts_pil_and_keeps_regions_isolated():
    image = Image.new("RGB", (900, 500), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 420, 470), outline="black", width=4)
    draw.rectangle((480, 20, 880, 470), outline="black", width=4)
    draw.text((45, 60), "NUTRITIONAL INFORMATION", fill="black")
    draw.text((505, 60), "MANUFACTURED BY", fill="black")

    calls = []

    def fake_ocr(crop):
        calls.append(crop.size)
        return "NUTRITIONAL INFORMATION" if len(calls) == 1 else "MANUFACTURED BY Acme Foods"

    result = extract_layout_ocr(image, ocr_function=fake_ocr)

    assert result["region_count"] >= 1
    assert len(calls) == result["region_count"]
    assert "NUTRITIONAL INFORMATION" in result["text"]
    assert "MANUFACTURED BY" in result["text"]
    assert all("bbox" in region and "label" in region for region in result["regions"])


def test_layout_ocr_vision_hook_receives_empty_roi():
    image = Image.new("RGB", (500, 300), "white")
    seen = []

    def fake_ocr(_crop):
        return ""

    def fake_vision(crop, metadata):
        seen.append((crop.size, metadata["region_id"]))
        return {"field": "manufacturer_name", "value": "Acme Foods"}

    result = extract_layout_ocr(image, ocr_function=fake_ocr, vision_fallback=fake_vision)

    assert result["regions"]
    assert len(seen) == result["region_count"]
    assert result["regions"][0]["vision"]["value"] == "Acme Foods"


def test_detect_rois_has_full_image_fallback():
    image = Image.new("RGB", (120, 80), "white")
    rois = detect_rois(image)
    assert rois
    assert rois[0].width == 120
    assert rois[0].height == 80


def test_detect_rois_uses_projection_fallback_without_opencv():
    image = Image.new("RGB", (900, 500), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 420, 120), outline="black", width=2)
    draw.text((45, 60), "NUTRITIONAL INFORMATION", fill="black")

    with patch.object(layout_ocr_module, "cv2", None):
        rois = detect_rois(image)

    assert rois
    for roi in rois:
        assert roi.x >= 0
        assert roi.y >= 0
        assert roi.x + roi.width <= 900
        assert roi.y + roi.height <= 500
    assert all(roi.x == 0 and roi.width == 900 for roi in rois)
