"""Region-based OCR for multi-column packaged-product labels.

The detector intentionally stays dependency-light: OpenCV is used when present
for connected-component analysis, while PIL projection profiles provide a
fallback. OCR is run independently for each ROI so text from adjacent label
columns cannot bleed into one combined reading order.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from PIL import Image, ImageEnhance, ImageOps

try:
    import cv2
    import numpy as np
except ImportError:  # pragma: no cover - exercised only without optional OpenCV
    cv2 = None
    np = None

try:
    import pytesseract
except ImportError:  # pragma: no cover
    pytesseract = None


@dataclass(frozen=True)
class ROI:
    """Pixel-space region with a stable functional label."""

    region_id: str
    label: str
    x: int
    y: int
    width: int
    height: int

    def as_dict(self) -> Dict[str, Any]:
        return {
            "region_id": self.region_id,
            "label": self.label,
            "bbox": {"x": self.x, "y": self.y, "width": self.width, "height": self.height},
        }


_REGION_HINTS: Tuple[Tuple[str, Tuple[str, ...]], ...] = (
    ("nutrition", ("nutrition", "energy", "protein", "carbohydrate", "fat")),
    ("manufacturer", ("manufactured", "manufacturer", "mfd", "packer", "marketed", "address")),
    ("ingredients", ("ingredient", "contains", "allergen")),
    ("dates_barcode", ("batch", "lot", "expiry", "best before", "fssai", "barcode", "pkd", "mfg")),
    ("header_product", ("brand", "product", "commodity", "biscuit", "rice", "flour")),
)


def _as_pil(image: Any) -> Image.Image:
    if isinstance(image, Image.Image):
        return image.convert("RGB")
    if cv2 is not None and np is not None and isinstance(image, np.ndarray):
        if image.ndim == 2:
            return Image.fromarray(image).convert("RGB")
        return Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    raise TypeError("image must be a PIL.Image.Image or an OpenCV numpy frame")


def _ink_mask(image: Image.Image):
    gray = ImageOps.grayscale(image)
    gray = ImageEnhance.Contrast(gray).enhance(1.5)
    if cv2 is not None and np is not None:
        array = np.asarray(gray)
        _, mask = cv2.threshold(array, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, image.width // 120), 3))
        return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    return gray.point(lambda pixel: 255 if pixel < 180 else 0)


def _projection_runs(values: Iterable[int], threshold: int) -> List[Tuple[int, int]]:
    runs: List[Tuple[int, int]] = []
    start: Optional[int] = None
    for index, value in enumerate(values):
        if value >= threshold and start is None:
            start = index
        elif value < threshold and start is not None:
            runs.append((start, index))
            start = None
    if start is not None:
        runs.append((start, len(list(values))))
    return runs


def _merge_close_runs(runs: List[Tuple[int, int]], gap: int) -> List[Tuple[int, int]]:
    if not runs:
        return []
    merged = [runs[0]]
    for start, end in runs[1:]:
        previous_start, previous_end = merged[-1]
        if start - previous_end <= gap:
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))
    return merged


def detect_rois(image: Any, min_area_ratio: float = 0.01) -> List[ROI]:
    """Detect layout blocks and split wide blocks into independent columns.

    The result is ordered top-to-bottom, then left-to-right. Functional labels
    are assigned from nearby OCR only when an OCR callback is supplied later;
    the default labels remain deterministic and safe for downstream mapping.
    """
    pil_image = _as_pil(image)
    width, height = pil_image.size
    mask = _ink_mask(pil_image)
    candidates: List[Tuple[int, int, int, int]] = []

    if cv2 is not None and np is not None:
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w * h >= width * height * min_area_ratio and w >= width * 0.12 and h >= height * 0.04:
                candidates.append((x, y, w, h))

    # Projection-profile fallback and gap recovery for labels without boxed panels.
    if not candidates:
        array = np.asarray(mask) if np is not None else _pil_to_matrix(mask)
        row_counts = [sum(1 for pixel in row if pixel) for row in array]
        active_rows = [index for index, count in enumerate(row_counts) if count >= max(2, width // 100)]
        row_runs = _runs_from_indices(active_rows)
        for y1, y2 in row_runs:
            candidates.append((0, max(0, y1 - 8), width, min(height, y2 + 8) - max(0, y1 - 8)))

    candidates = _dedupe_nested(candidates)
    rois: List[ROI] = []
    for index, (x, y, w, h) in enumerate(sorted(candidates, key=lambda box: (box[1], box[0]))):
        # A wide panel often contains two reading columns. Split only when a
        # strong vertical whitespace valley exists, avoiding arbitrary halves.
        split = _find_column_split(mask, x, y, w, h)
        boxes = [(x, y, w, h)] if split is None else [
            (x, y, split - x, h), (split, y, x + w - split, h)
        ]
        for part_index, (part_x, part_y, part_w, part_h) in enumerate(boxes):
            if part_w < max(80, width // 10):
                continue
            rois.append(ROI(f"roi_{index}_{part_index}", _default_label(part_x, part_y, part_w, part_h, width, height), part_x, part_y, part_w, part_h))

    if not rois:
        rois = [ROI("roi_full", "full_label", 0, 0, width, height)]
    return rois


def _find_column_split(mask: Any, x: int, y: int, width: int, height: int) -> Optional[int]:
    if cv2 is None or np is None:
        return None
    crop = mask[y:y + height, x:x + width]
    if crop.size == 0 or width < 400:
        return None
    projection = (crop > 0).sum(axis=0)
    valley_width = max(8, width // 60)
    best = None
    for start in range(valley_width, width - valley_width):
        window = projection[start - valley_width:start + valley_width]
        if window.mean() <= projection.mean() * 0.18:
            best = x + start
            break
    return best if best and width * 0.2 < best - x < width * 0.8 else None


def _default_label(x: int, y: int, width: int, height: int, full_width: int, full_height: int) -> str:
    if y < full_height * 0.25:
        return "header_product"
    if x < full_width * 0.45:
        return "left_column"
    if x > full_width * 0.55:
        return "right_column"
    return "label_block"


def _dedupe_nested(boxes: List[Tuple[int, int, int, int]]) -> List[Tuple[int, int, int, int]]:
    result: List[Tuple[int, int, int, int]] = []
    for box in sorted(boxes, key=lambda item: item[2] * item[3], reverse=True):
        x, y, w, h = box
        if any(x >= ox and y >= oy and x + w <= ox + ow and y + h <= oy + oh for ox, oy, ow, oh in result):
            continue
        result.append(box)
    return result


def _runs_from_indices(indices: List[int]) -> List[Tuple[int, int]]:
    if not indices:
        return []
    runs = []
    start = previous = indices[0]
    for index in indices[1:]:
        if index > previous + 1:
            runs.append((start, previous + 1))
            start = index
        previous = index
    runs.append((start, previous + 1))
    return runs


def _pil_to_matrix(image: Image.Image) -> List[List[int]]:
    pixels = list(image.getdata())
    return [
        [1 if pixels[row * image.width + column] else 0 for column in range(image.width)]
        for row in range(image.height)
    ]  # pragma: no cover


def _label_from_text(text: str, fallback: str) -> str:
    lowered = text.lower()
    for label, hints in _REGION_HINTS:
        if any(re.search(rf"\b{re.escape(hint)}\b", lowered) for hint in hints):
            return label
    return fallback


def extract_layout_ocr(
    image: Any,
    ocr_function: Optional[Callable[[Image.Image], str]] = None,
    vision_fallback: Optional[Callable[[Image.Image, Dict[str, Any]], Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Segment an image, OCR every ROI independently, and return structured text.

    ``ocr_function`` receives one PIL crop at a time. If omitted, PyTesseract
    uses a single-block mode suited to isolated regions. ``vision_fallback`` is
    an extension point for a multimodal provider; it receives the crop and ROI
    metadata and should return a JSON-compatible dictionary.
    """
    pil_image = _as_pil(image)
    rois = detect_rois(pil_image)
    extract = ocr_function or _default_ocr
    regions: List[Dict[str, Any]] = []
    for roi in rois:
        crop = pil_image.crop((roi.x, roi.y, roi.x + roi.width, roi.y + roi.height))
        text = (extract(crop) or "").strip()
        label = _label_from_text(text, roi.label)
        item: Dict[str, Any] = {**roi.as_dict(), "label": label, "text": text}
        if vision_fallback and not text:
            item["vision"] = vision_fallback(crop, item)
        regions.append(item)
    return {
        "regions": regions,
        "text": "\n\n".join(region["text"] for region in regions if region["text"]),
        "region_count": len(regions),
        "engine": "tesseract-roi" if pytesseract is not None else "roi-segmentation",
    }


def _default_ocr(image: Image.Image) -> str:
    if pytesseract is None:
        return ""
    try:
        return pytesseract.image_to_string(image, config="--psm 6")
    except (pytesseract.TesseractError, OSError):
        return ""


# Public aliases make the module easy to adopt from scripts or other services.
segment_rois = detect_rois
process_layout_ocr = extract_layout_ocr
