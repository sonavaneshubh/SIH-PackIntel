"""Image preprocessing helpers for the scanning pipeline.

Replaces the ad-hoc preprocessing previously embedded in the OCR service with
a dedicated stage. All transformations are conservative: the output is only
produced when the input genuinely benefits, and it never mutates the caller's
image.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from PIL import Image, ImageEnhance, ImageFilter, ImageStat

logger = logging.getLogger(__name__)

TARGET_MIN_SIDE = 600
UPSCALE_CAP = 2000


def _convert_rgb(image: Image.Image) -> Image.Image:
    if image.mode != "RGB":
        return image.convert("RGB")
    return image.copy()


def _resize_to_min_side(image: Image.Image, min_side: int = TARGET_MIN_SIDE) -> Image.Image:
    """Upscale small images so OCR text is not starved; downscale huge ones."""
    w, h = image.size
    largest = max(w, h)
    if largest > UPSCALE_CAP:
        scale = UPSCALE_CAP / largest
        return image.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    if min(w, h) < min_side and largest < UPSCALE_CAP:
        scale = min_side / min(w, h)
        if scale > 1.0:
            new_w, new_h = int(w * scale), int(h * scale)
            return image.resize((new_w, new_h), Image.Resampling.LANCZOS)
    return image


def _enhanced_grayscale(image: Image.Image) -> Image.Image:
    enhanced = ImageEnhance.Contrast(image).enhance(1.5)
    return enhanced.convert("L")


def _binarize_if_low_contrast(gray: Image.Image) -> Optional[Image.Image]:
    """Return a binary variant when contrast is poor; None otherwise."""
    stats = ImageStat.Stat(gray)
    if stats.stddev[0] < 40.0:
        binary = gray.point(lambda p: 255 if p > 128 else 0, mode="1")
        return binary.convert("L")
    return None


def preprocess_image(image: Image.Image) -> List[Image.Image]:
    """Produce OCR-ready grayscale variants of *image*.

    The enhanced-grayscale variant is always primary; a binarized variant is
    appended only when contrast is poor. Never mutates the input.
    """
    rgb = _convert_rgb(image)
    resized = _resize_to_min_side(rgb)
    primary = _enhanced_grayscale(resized)
    secondary = _binarize_if_low_contrast(primary)
    variants = [primary]
    if secondary is not None:
        variants.append(secondary)
    return variants


def post_process_text(text: str) -> str:
    """Normalize OCR output whitespace without altering content."""
    if not text:
        return ""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n".join(lines)