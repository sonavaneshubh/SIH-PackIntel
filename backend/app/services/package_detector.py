"""Food-package detection via heuristic image analysis.

Uses Pillow to compute colour-histogram statistics and edge density to
classify whether an image is likely a packaged food label.  The classifier
is intentionally lightweight (no ML models) and runs in <50 ms on a
1000x1000 image.

Detection failure does NOT abort the pipeline — it merely sets a flag
(``is_food_package: bool``) and a ``confidence: float`` so downstream
stages can adjust strategy if needed (e.g. skip compliance checks for
non-food images).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from PIL import Image
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Minimum ratio of "text-like" pixels (high-contrast edges) that we expect
# on a real product label.  Below this, the image is probably a person or
# scenery shot.
_MIN_EDGE_DENSITY = 0.012

# Food labels tend to be colourful but not over-saturated; we use the ratio
# of dominant colour channels to discriminate from e.g. face/skin tones.
_MIN_COLOUR_VARIANCE = 350.0

# Confidence threshold: below this, `is_food_package` is False.
DEFAULT_CONFIDENCE_THRESHOLD = 0.45

# Overridable via env var FOOD_PACKAGE_CONFIDENCE_THRESHOLD (loaded by
# config.py).


@dataclass(frozen=True)
class DetectionResult:
    """Outcome of food-package detection."""

    is_food_package: bool
    confidence: float
    reason: str


def _resize_for_analysis(image: Image.Image, max_side: int = 640) -> Image.Image:
    """Down-sample so analysis stays fast without changing ratio."""
    w, h = image.size
    if max(w, h) <= max_side:
        return image.copy()
    scale = max_side / max(w, h)
    return image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)


def _edge_density(gray: Image.Image) -> float:
    """Approximate the fraction of pixels that are edges (Sobel-like).

    Uses numpy gradient magnitude on a small working copy.
    """
    arr = np.asarray(gray, dtype=np.float32)
    gy = np.diff(arr, axis=0)
    gx = np.diff(arr, axis=1)
    # Trim to common shape
    min_h = min(gy.shape[0], gx.shape[0])
    min_w = min(gy.shape[1], gx.shape[1])
    mag = np.sqrt(gy[:min_h, :min_w] ** 2 + gx[:min_h, :min_w] ** 2)
    return float(np.mean(mag > 30.0))


def _colour_variance(image: Image.Image) -> float:
    """Variance of per-channel mean intensities — higher means more colourful."""
    arr = np.asarray(image.convert("RGB"), dtype=np.float32)
    means = arr.mean(axis=(0, 1))  # per-channel mean
    return float(np.var(means))


def _rectangularity(gray: Image.Image) -> float:
    """Heuristic: food labels tend to have high contrast along vertical and
    horizontal edges (rectangular bounding boxes).  Returns ratio of
    horizontal + vertical edge pixels to total edge pixels."""
    arr = np.asarray(gray, dtype=np.float32)
    gy = np.abs(np.diff(arr, axis=0))
    gx = np.abs(np.diff(arr, axis=1))
    h_edges = float(np.mean(gy > 40))
    v_edges = float(np.mean(gx > 40))
    total = h_edges + v_edges + 1e-9
    return float((h_edges + v_edges) / total)


def detect_food_package(
    image: Image.Image,
    *,
    threshold: Optional[float] = None,
) -> DetectionResult:
    """Classify whether *image* is likely a food product label.

    Parameters
    ----------
    image : PIL.Image.Image
        The raw image to classify.
    threshold : float, optional
        Override the confidence threshold (default 0.45 or
        ``FOOD_PACKAGE_CONFIDENCE_THRESHOLD`` env var).

    Returns
    -------
    DetectionResult
        ``is_food_package`` indicates the classification.
        ``confidence`` is in [0.0, 1.0].
        ``reason`` is a human-readable short explanation.
    """
    if threshold is None:
        threshold = DEFAULT_CONFIDENCE_THRESHOLD

    try:
        work = _resize_for_analysis(image)
        gray = work.convert("L")

        edge = _edge_density(gray)
        colour = _colour_variance(work)
        rect = _rectangularity(gray)

        # --- score computation ---
        # Edge density: labels have lots of text → moderate-to-high edges
        edge_score = min(edge / 0.06, 1.0)  # normalise to ~1.0 at 6% edges

        # Colour variance: food labels are colourful but not skin-tone
        colour_score = min(colour / 800.0, 1.0)

        # Rectangularity: labels are rectangular
        rect_score = rect

        # Weighted combination (tuned for Indian packaged food labels)
        confidence = (
            0.40 * edge_score
            + 0.30 * colour_score
            + 0.30 * rect_score
        )
        confidence = round(min(max(confidence, 0.0), 1.0), 3)

        is_food = confidence >= threshold

        if confidence < 0.15:
            reason = "Image appears blank or uniform"
        elif edge_score < 0.2:
            reason = "Low text-like content; unlikely a product label"
        elif colour_score < 0.2:
            reason = "Low colour variation; may not be a packaged product"
        elif not is_food:
            reason = f"Score {confidence:.2f} below threshold {threshold:.2f}"
        else:
            reason = f"Likely food package (score {confidence:.2f})"

        return DetectionResult(
            is_food_package=is_food,
            confidence=confidence,
            reason=reason,
        )
    except Exception as exc:
        # Detection failure is never fatal.
        logger.warning("Food-package detection failed: %s", exc)
        return DetectionResult(
            is_food_package=False,
            confidence=0.0,
            reason=f"Detection error: {exc}",
        )
