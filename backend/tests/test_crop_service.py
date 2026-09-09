from unittest.mock import patch

from PIL import Image, ImageDraw

import app.services.crop_service as crop_module
from app.services.crop_service import auto_crop_label_area, crop_to_bytes


def _label_image(width: int = 1200, height: int = 900):
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((100, 300, 1100, 850), outline="black", width=3)
    draw.text((150, 350), "Product Name, Brand", fill="black")
    draw.text((150, 400), "MRP: Rs. 99.00", fill="black")
    draw.text((150, 430), "Net Quantity: 250 g", fill="black")
    draw.text((150, 460), "Manufactured by: ABC Foods Pvt Ltd", fill="black")
    draw.text((150, 490), "FSSAI License No: 123456789", fill="black")
    draw.text((150, 520), "Best Before: 12/2027", fill="black")
    draw.text((150, 600), "Made in India", fill="black")
    return image


def test_auto_crop_uses_declaration_roi():
    image = _label_image()
    rois = [
        {
            "region_id": "roi_0",
            "label": "label_block",
            "bbox": {"x": 100, "y": 300, "width": 1000, "height": 550},
            "text": "MRP Net Quantity Manufactured by FSSAI Best Before Customer Care",
        }
    ]
    crop, meta = auto_crop_label_area(image, rois)

    assert meta["strategy"] == "roi"
    assert meta["confidence"] > 0.5
    assert crop.width <= 1200
    assert crop.height <= 900
    assert crop.width >= 500
    assert crop.height >= 300
    bbox = meta["bbox"]
    assert bbox["x"] >= 0 and bbox["y"] >= 0
    assert bbox["x"] + bbox["width"] <= 1200
    assert bbox["y"] + bbox["height"] <= 900


def test_auto_crop_projection_fallback_without_rois():
    image = _label_image()
    crop, meta = auto_crop_label_area(image, None)

    assert meta["strategy"] == "projection"
    assert meta["bbox"]["width"] > 0
    assert meta["bbox"]["height"] > 0
    assert crop.size[0] > 0 and crop.size[1] > 0


def test_auto_crop_projection_fallback_without_opencv():
    from unittest.mock import MagicMock

    image = _label_image()

    with patch.object(crop_module, "cv2", None), patch.object(crop_module, "np", None):
        crop, meta = auto_crop_label_area(image, None)

    assert meta["strategy"] == "projection"
    assert crop.size[0] > 0 and crop.size[1] > 0


def test_crop_to_bytes_encodes_jpeg():
    image = _label_image()
    data, meta = crop_to_bytes(image, None, fmt="JPEG")

    assert data
    assert data[:2] == b"\xff\xd8"  # JPEG SOI marker
    assert meta["bbox"]["width"] > 0


def test_auto_crop_empty_regions_returns_valid_crop():
    image = _label_image()
    crop, meta = auto_crop_label_area(image, [])

    assert crop.size[0] > 0 and crop.size[1] > 0
    assert meta["region_count"] == 0