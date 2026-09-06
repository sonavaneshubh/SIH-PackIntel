"""Standalone image-quality analysis for the scanning pipeline.

This is the explicit Image-Quality stage: it classifies a raw image as
``usable`` / ``poor`` / ``unusable`` before OCR is attempted, using only
Pillow image statistics (no external models). A poor/unusable verdict never
aborts the pipeline — it only adjusts strategy and is surfaced as a warning.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field as dataclass_field
from typing import Any, Dict, Optional

from PIL import Image, ImageFilter, ImageStat

logger = logging.getLogger(__name__)

# An image is unusable (never worth OCR) only when it is so degraded that a
# text pass cannot possibly succeed. Everything else prompts but does not fail.
_UNUSABLE_BRIGHTNESS_LOW = 8.0
_UNUSABLE_BRIGHTNESS_HIGH = 250.0
_UNUSABLE_MIN_SIDE = 80
_POOR_MIN_SIDE = 200
_POOR_CONTRAST = 8.0
_POOR_SHARPNESS = 4.0


@dataclass(frozen=True)
class QualityResult:
    """Outcome of the image-quality stage."""

    overall: str  # usable | poor | unusable
    score: int  # 0-100 quality score
    reasons: tuple[str, ...] = dataclass_field(default_factory=tuple)
    metrics: Dict[str, Any] = dataclass_field(default_factory=dict)

    @property
    def reason_text(self) -> str:
        return "; ".join(self.reasons)


def analyze_image_quality(image: Image.Image) -> QualityResult:
    """Classify *image* quality using Pillow statistics.

    Returns a frozen :class:`QualityResult`. Pure detection — it never raises
    for degraded input; only a non-image object would raise (from Pillow).
    """
    try:
        grayscale = image.convert("L")
    except Exception as exc:
        logger.warning("Quality analysis could not convert image: %s", exc)
        return QualityResult(
            overall="unusable",
            score=0,
            reasons=(f"Image could not be decoded for quality analysis: {exc}",),
        )

    width, height = image.size
    stats = ImageStat.Stat(grayscale)
    brightness = float(stats.mean[0])
    contrast = float(stats.stddev[0])
    edge_stats = ImageStat.Stat(grayscale.filter(ImageFilter.FIND_EDGES))
    sharpness = float(edge_stats.stddev[0])

    reasons: list[str] = []

    if width < _UNUSABLE_MIN_SIDE or height < _UNUSABLE_MIN_SIDE:
        reasons.append(
            "image resolution is too low for any label inspection"
        )
    elif width < _POOR_MIN_SIDE or height < _POOR_MIN_SIDE:
        reasons.append("image resolution is low")

    if brightness < _UNUSABLE_BRIGHTNESS_LOW:
        reasons.append("image is effectively black")
    elif brightness < 20:
        reasons.append("image is too dark")
    elif brightness > _UNUSABLE_BRIGHTNESS_HIGH:
        reasons.append("image is effectively overexposed/white")
    elif brightness > 240:
        reasons.append("image is overexposed")

    if contrast < _POOR_CONTRAST:
        reasons.append("image has insufficient contrast")

    if sharpness < _POOR_SHARPNESS and width >= _POOR_MIN_SIDE and height >= _POOR_MIN_SIDE:
        reasons.append("image is too blurry for reliable inspection")

    # Hard-fail classification (unusable) only for genuinely hopeless input.
    hopeless = (
        width < _UNUSABLE_MIN_SIDE
        or height < _UNUSABLE_MIN_SIDE
        or brightness < _UNUSABLE_BRIGHTNESS_LOW
        or brightness > _UNUSABLE_BRIGHTNESS_HIGH
    )

    if hopeless:
        overall = "unusable"
    elif reasons:
        overall = "poor"
    else:
        overall = "usable"

    # Score: deterministic blend of sharpness/contrast/resolution.
    score = _quality_score(overall, brightness, contrast, sharpness, width, height)

    return QualityResult(
        overall=overall,
        score=score,
        reasons=tuple(reasons),
        metrics={
            "width": width,
            "height": height,
            "brightness": round(brightness, 2),
            "contrast": round(contrast, 2),
            "sharpness": round(sharpness, 2),
        },
    )


def _quality_score(
    overall: str,
    brightness: float,
    contrast: float,
    sharpness: float,
    width: int,
    height: int,
) -> int:
    """0-100 score: usable >= 60, poor 30-59, unusable < 30."""
    if overall == "unusable":
        return 0
    contrast_score = min(100, max(0, int(contrast * 4)))
    sharpness_score = min(100, max(0, int(sharpness * 6)))
    resolution_score = min(100, max(0, int(min(width, height) / 8) - 5))
    brightness_penalty = 0
    if brightness < 30 or brightness > 220:
        brightness_penalty = 10
    score = int(0.4 * contrast_score + 0.35 * sharpness_score + 0.25 * resolution_score)
    score = max(0, score - brightness_penalty)
    return min(100, score) if overall != "poor" else min(59, score)


def get_image_quality(image: Image.Image) -> Dict[str, Any]:
    """Compatibility wrapper that returns the classic dict shape."""
    result = analyze_image_quality(image)
    return {
        "quality": result.overall,
        "score": result.score,
        "reason": result.reason_text or None,
        "metrics": result.metrics,
    }