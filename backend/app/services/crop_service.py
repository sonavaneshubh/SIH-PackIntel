"""Auto-crop service for scanned package images.

Identifies the declaration / label area on a packaged-product image using
OCR bounding-box regions and returns a cropped copy that contains only the
relevant text panel.  The crop is purely visual — it never mutates the
original OCR results — and is stored alongside the original so the report
PDF and the frontend can display a focused image.

Crop strategy
-------------
1.  Use ROI bounding boxes produced by ``layout_ocr.detect_rois()`` to find
    the region with the densest declaration-related text.
2.  Score each region by keyword density (MRP, manufacturer, FSSAI, …)
    and text-area ratio.
3.  Expand the winning bounding box by a configurable padding fraction and
    clamp to image bounds.
4.  Fallback: projection-profile heuristic picks the densest horizontal band.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image, ImageOps, ImageEnhance

logger = logging.getLogger(__name__)

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None

# Keywords that strongly indicate a legal-metrology declaration panel.
_DECLARATION_KEYWORDS: Tuple[str, ...] = (
    "mrp", "max retail", "retail sale", "net quantity", "net wt", "net weight",
    "manufacturer", "manufactured", "packed by", "packed for", "marketed by",
    "mfd", "mfg", "best before", "expiry", "use by",
    "fssai", "food safety", "registration no",
    "batch", "lot", "serial no",
    "customer care", "helpline", "toll free", "consumer",
    "country of origin", "made in", "imported by",
    "commodity", "product name", "brand",
    "ingredients", "contains",
    "storage", "handling",
    "veg", "non-veg", "vegetarian",
    "gst", "hsn",
)

# Monetary pattern — MRP always lives in the declaration panel.
_MRP_KEYWORDS: Tuple[str, ...] = (
    "mrp", "max retail", "retail sale price", "rs.", "rs", "inr", "₹",
)


# --------------------------------------------------------------------------- #
# Public API                                                                  #
# --------------------------------------------------------------------------- #

def auto_crop_label_area(
    image: Image.Image,
    ocr_regions: Optional[List[Dict[str, Any]]] = None,
    *,
    padding_fraction: float = 0.06,
    min_area_ratio: float = 0.08,
) -> Tuple[Image.Image, Dict[str, Any]]:
    """Crop the image to the declaration / label area.

    Parameters
    ----------
    image:
        Original scanned package image (PIL RGB).
    ocr_regions:
        List of ROI dicts from the OCR pipeline.  Each dict must contain a
        ``bbox`` key (``{"x": …, "y": …, "width": …, "height": …}``).
        When *None* or empty, a projection-profile fallback is used.
    padding_fraction:
        Extra padding around the detected bounding box as a fraction of the
        image dimension (0.0–0.10).
    min_area_ratio:
        Minimum fraction of total image area for a region to be considered.

    Returns
    -------
    (cropped_image, metadata)
        *cropped_image* is a new PIL RGB image.  *metadata* is a dict with
        keys ``strategy``, ``bbox`` (pixel coords), ``region_count``, and
        ``confidence`` (0.0–1.0).
    """
    if image.mode != "RGB":
        image = image.convert("RGB")

    width, height = image.size
    padding_fraction = max(0.0, min(0.10, padding_fraction))

    # ── 1. Try ROI-based crop ──────────────────────────────────────────────
    if ocr_regions:
        rois = _normalize_regions(ocr_regions)
        bbox, confidence = _best_declaration_bbox(rois, width, height, min_area_ratio)
    else:
        bbox, confidence = None, 0.0

    # ── 2. Projection-profile fallback ─────────────────────────────────────
    if bbox is None:
        bbox = _projection_fallback_bbox(image)
        confidence = 0.4  # heuristic, not OCR-backed

    # ── 3. Clamp and crop ──────────────────────────────────────────────────
    x1, y1, x2, y2 = _apply_padding(bbox, width, height, padding_fraction)
    cropped = image.crop((x1, y1, x2, y2))

    meta: Dict[str, Any] = {
        "strategy": "roi" if ocr_regions and confidence >= 0.5 else "projection",
        "bbox": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
        "original_size": {"width": width, "height": height},
        "region_count": len(ocr_regions or []),
        "confidence": round(confidence, 3),
    }
    logger.info(
        "Auto-crop: strategy=%s, bbox=(%d,%d,%d,%d), confidence=%.3f",
        meta["strategy"], x1, y1, x2, y2, confidence,
    )
    return cropped, meta


def crop_to_bytes(
    image: Image.Image,
    ocr_regions: Optional[List[Dict[str, Any]]] = None,
    *,
    fmt: str = "JPEG",
    quality: int = 92,
    **kwargs,
) -> Tuple[bytes, Dict[str, Any]]:
    """Convenience wrapper: crop then encode to bytes."""
    cropped, meta = auto_crop_label_area(image, ocr_regions, **kwargs)
    buf = __import__("io").BytesIO()
    save_kwargs: Dict[str, Any] = {}
    if fmt.upper() == "JPEG":
        if cropped.mode != "RGB":
            cropped = cropped.convert("RGB")
        save_kwargs["quality"] = quality
        save_kwargs["optimize"] = True
    cropped.save(buf, format=fmt, **save_kwargs)
    return buf.getvalue(), meta


# --------------------------------------------------------------------------- #
# ROI normalisation                                                           #
# --------------------------------------------------------------------------- #

def _normalize_regions(
    regions: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Ensure every region has a flat ``_x/_y/_w/_h`` bounding box."""
    out: List[Dict[str, Any]] = []
    for r in regions:
        bbox = r.get("bbox") or {}
        x = bbox.get("x", 0)
        y = bbox.get("y", 0)
        w = bbox.get("width", 0)
        h = bbox.get("height", 0)
        text = (r.get("text") or "").strip()
        out.append({**r, "_x": int(x), "_y": int(y), "_w": int(w), "_h": int(h), "_text": text})
    return out


# --------------------------------------------------------------------------- #
# Declaration-bbox scoring                                                    #
# --------------------------------------------------------------------------- #

def _best_declaration_bbox(
    rois: List[Dict[str, Any]],
    img_w: int,
    img_h: int,
    min_area_ratio: float,
) -> Tuple[Optional[Tuple[int, int, int, int]], float]:
    """Return the bounding box (x1,y1,x2,y2) and confidence of the best ROI."""
    min_area = img_w * img_h * min_area_ratio
    best_score = -1.0
    best_bbox: Optional[Tuple[int, int, int, int]] = None

    for roi in rois:
        x, y, w, h = roi["_x"], roi["_y"], roi["_w"], roi["_h"]
        area = w * h
        if area < min_area:
            continue
        score = _declaration_score(roi["_text"], w, h, img_w, img_h)
        if score > best_score:
            best_score = score
            best_bbox = (x, y, x + w, y + h)

    if best_bbox is None or best_score <= 0:
        return None, 0.0

    # Confidence: score 0–15 maps to 0.0–1.0
    confidence = min(1.0, best_score / 15.0)
    return best_bbox, confidence


def _declaration_score(text: str, w: int, h: int, img_w: int, img_h: int) -> float:
    """Score an ROI by how likely it is to be the declaration panel."""
    if not text:
        return 0.0

    lowered = text.lower()
    score = 0.0

    # Keyword matches
    for kw in _DECLARATION_KEYWORDS:
        if kw in lowered:
            score += 1.5
    # MRP keywords are strongest signal
    for kw in _MRP_KEYWORDS:
        if kw in lowered:
            score += 2.5

    # Text density (chars per pixel area)
    char_density = len(text) / max(w * h, 1)
    score += min(3.0, char_density * 800)

    # Position: prefer lower half (where declarations live)
    if h > 0:
        centre_y_ratio = (0 + h / 2) / img_h
        if centre_y_ratio > 0.5:
            score += 0.5
        if centre_y_ratio > 0.7:
            score += 0.5

    return score


# --------------------------------------------------------------------------- #
# Projection-profile fallback                                                 #
# --------------------------------------------------------------------------- #

def _projection_fallback_bbox(
    image: Image.Image,
) -> Tuple[int, int, int, int]:
    """Find the densest horizontal text band using a projection profile."""
    width, height = image.size

    if cv2 is not None and np is not None:
        return _cv2_projection_bbox(image, width, height)

    return _pil_projection_bbox(image, width, height)


def _cv2_projection_bbox(
    image: Image.Image, width: int, height: int,
) -> Tuple[int, int, int, int]:
    """OpenCV-backed projection profile crop."""
    gray = np.asarray(ImageOps.grayscale(image))
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    row_ink = binary.sum(axis=1) / 255
    col_ink = binary.sum(axis=0) / 255

    row_thresh = max(2, width * 0.005)
    col_thresh = max(2, height * 0.005)

    active_rows = np.where(row_ink >= row_thresh)[0]
    active_cols = np.where(col_ink >= col_thresh)[0]

    if len(active_rows) == 0 or len(active_cols) == 0:
        # No text found — centre 70% crop
        pad_x, pad_y = int(width * 0.15), int(height * 0.15)
        return pad_x, pad_y, width - pad_x, height - pad_y

    # Vertical extent: merge close runs
    row_groups = _merge_runs(active_rows.tolist(), gap=max(8, height // 60))
    best_group = max(row_groups, key=lambda g: g[1] - g[0])
    y1 = max(0, best_group[0] - int(height * 0.03))
    y2 = min(height, best_group[1] + int(height * 0.03))

    # Horizontal extent
    x1 = max(0, int(active_cols[0]) - int(width * 0.02))
    x2 = min(width, int(active_cols[-1]) + int(width * 0.02))

    return x1, y1, x2, y2


def _pil_projection_bbox(
    image: Image.Image, width: int, height: int,
) -> Tuple[int, int, int, int]:
    """Pure-PIL projection profile crop (no OpenCV)."""
    gray = ImageOps.grayscale(image)
    enhanced = ImageEnhance.Contrast(gray).enhance(1.5)
    if hasattr(enhanced, "get_flattened_data"):  # Pillow >= 14
        pixels = list(enhanced.get_flattened_data())
    else:
        pixels = list(enhanced.getdata())

    row_counts = [
        sum(1 for c in range(width) if pixels[row * width + c] < 160)
        for row in range(height)
    ]
    col_counts = [
        sum(1 for r in range(height) if pixels[r * width + col] < 160)
        for col in range(width)
    ]

    row_thresh = max(2, width // 100)
    col_thresh = max(2, height // 100)

    active_rows = [i for i, c in enumerate(row_counts) if c >= row_thresh]
    active_cols = [i for i, c in enumerate(col_counts) if c >= col_thresh]

    if not active_rows or not active_cols:
        pad_x, pad_y = int(width * 0.15), int(height * 0.15)
        return pad_x, pad_y, width - pad_x, height - pad_y

    row_groups = _merge_runs(active_rows, gap=max(8, height // 60))
    best_group = max(row_groups, key=lambda g: g[1] - g[0])
    y1 = max(0, best_group[0] - int(height * 0.03))
    y2 = min(height, best_group[1] + int(height * 0.03))
    x1 = max(0, active_cols[0] - int(width * 0.02))
    x2 = min(width, active_cols[-1] + int(width * 0.02))

    return x1, y1, x2, y2


def _merge_runs(indices: List[int], gap: int = 8) -> List[Tuple[int, int]]:
    """Merge nearby indices into continuous runs."""
    if not indices:
        return []
    runs: List[Tuple[int, int]] = []
    start = prev = indices[0]
    for idx in indices[1:]:
        if idx > prev + gap:
            runs.append((start, prev + 1))
            start = idx
        prev = idx
    runs.append((start, prev + 1))
    return runs


# --------------------------------------------------------------------------- #
# Padding & clamping                                                          #
# --------------------------------------------------------------------------- #

def _apply_padding(
    bbox: Tuple[int, int, int, int],
    img_w: int,
    img_h: int,
    fraction: float,
) -> Tuple[int, int, int, int]:
    """Expand *bbox* by *fraction* of the image size, clamped to bounds."""
    x1, y1, x2, y2 = bbox
    pad_x = int(img_w * fraction)
    pad_y = int(img_h * fraction)
    return (
        max(0, x1 - pad_x),
        max(0, y1 - pad_y),
        min(img_w, x2 + pad_x),
        min(img_h, y2 + pad_y),
    )
