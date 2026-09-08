"""Safe upload validation for the scanning pipeline.

Covers the three checks that gate a multipart scan upload before any OCR money
is spent:

* MIME type is a supported image (JPEG/PNG/WEBP)
* Payload size is within ``MAX_IMAGE_SIZE_MB``
* Pillow can actually decode the bytes (dimensions / format)

Validation failures raise ``ImageValidationError`` which the scan route maps to
an HTTP 400. Nothing here reads secrets or logs payload contents.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import Optional

from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)

_SUPPORTED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_SUPPORTED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


class ImageValidationError(ValueError):
    """Raised when an uploaded scan image fails safe validation."""


@dataclass(frozen=True)
class ValidatedImage:
    """Decoded image plus metadata safe for logging."""

    image: Image.Image
    width: int
    height: int
    format: Optional[str]
    byte_size: int
    content_type: Optional[str]


def limit_image_dimensions(image: Image.Image) -> Image.Image:
    """Downscale *image* so its longest side never exceeds MAX_IMAGE_DIMENSION.

    Returns the input unchanged when it already fits; never mutates the input.
    This single choke point bounds every decoded copy downstream (the base64
    data URI, OCR/vision re-fetches, PNG re-encodes), which keeps the scan
    pipeline's memory footprint small regardless of the uploaded resolution.
    """
    max_side = max(1, int(getattr(settings, "MAX_IMAGE_DIMENSION", 1600)))
    width, height = image.size
    largest = max(width, height)
    if largest <= max_side:
        return image
    scale = max_side / largest
    return image.resize(
        (max(1, int(width * scale)), max(1, int(height * scale))),
        Image.Resampling.LANCZOS,
    )


def validate_upload(
    data: bytes,
    *,
    filename: Optional[str] = None,
    content_type: Optional[str] = None,
) -> ValidatedImage:
    """Validate raw upload bytes and return a decoded :class:`ValidatedImage`.

    Raises :class:`ImageValidationError` with a user-safe message when any
    check fails. ``content_type``/``filename`` come from the client and are
    advisory only — Pillow remains the authority for whether the bytes are an
    image. Decoded images are downscaled to ``MAX_IMAGE_DIMENSION`` so the
    rest of the pipeline never holds a full-resolution pixel buffer.
    """
    max_bytes = max(1, int(getattr(settings, "MAX_IMAGE_SIZE_MB", 10))) * 1024 * 1024

    if not data:
        raise ImageValidationError("Uploaded image is empty.")

    if len(data) > max_bytes:
        limit_mb = max_bytes / (1024 * 1024)
        raise ImageValidationError(
            f"Image is too large ({(len(data) / (1024 * 1024)):.1f} MB). "
            f"Maximum allowed size is {limit_mb:.0f} MB."
        )

    # Advisory MIME check (client-declared) — rejected outright only when it is
    # clearly not an image; Pillow is the final authority below.
    if content_type and content_type not in _SUPPORTED_CONTENT_TYPES:
        raise ImageValidationError(
            f"Unsupported file type '{content_type}'. "
            "Use JPEG, PNG, or WebP."
        )

    if filename:
        lower_name = (filename or "").lower()
        suffix = _suffix_of(lower_name)
        if suffix and suffix not in _SUPPORTED_SUFFIXES:
            raise ImageValidationError(
                f"Unsupported file extension '{suffix}'. Use .jpg, .jpeg, .png, or .webp."
            )

    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception as exc:
        raise ImageValidationError(
            f"Uploaded file is not a supported image format: {exc}. "
            "Use JPEG, PNG, or WebP."
        ) from exc

    image = limit_image_dimensions(image)

    return ValidatedImage(
        image=image,
        width=image.width,
        height=image.height,
        format=image.format,
        byte_size=len(data),
        content_type=content_type,
    )


def _suffix_of(filename: str) -> str:
    try:
        for candidate in _SUPPORTED_SUFFIXES:
            if filename.endswith(candidate):
                return candidate
    except Exception:
        pass
    return ""


def to_public_url(validated: ValidatedImage, label: str) -> str:
    """Wrap a validated image as a data URI for downstream OCR/vision stages.

    PNG round-trips losslessly; JPEG/WebP payloads are re-encoded as PNG only
    when necessary so OCR.Space receives a stable image. WebP is converted to
    PNG because OCR.Space historically rejects WebP.
    """
    import base64

    format_name = (validated.format or "").upper()
    if format_name not in {"PNG", "JPEG"}:
        format_name = "PNG"
    buffer = io.BytesIO()
    if format_name == "JPEG":
        validated.image.convert("RGB").save(buffer, format="JPEG", quality=90)
    else:
        validated.image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode()
    mime = "image/jpeg" if format_name == "JPEG" else "image/png"
    logger.info("Image %s validated: %dx%d, %s", label, validated.width, validated.height, format_name)
    return f"data:{mime};base64,{encoded}"