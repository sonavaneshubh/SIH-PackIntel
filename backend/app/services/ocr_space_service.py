"""
OCR.Space service for the PackIntel scanning pipeline.

The scanned image is never uploaded as-is: it is opened with Pillow, converted
to RGB, downscaled only when its largest side exceeds 2000 px, and stored as a
quality-80 JPEG in memory before being sent as multipart form data to
https://api.ocr.space/parse/image.

The API key is read from the backend .env and is NEVER logged or returned to
the frontend. ``OCRSpaceService.process_image`` returns a structured dict that
mirrors ``OCRService.process_image`` so the scan endpoint is engine-agnostic;
OCR failures are converted into a structured warning instead of raising, so a
blurry/unreadable label or an API outage never crashes the scanning pipeline.
"""

import base64
import io
import logging
import os
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

import requests
from dotenv import load_dotenv
from PIL import Image

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(_BACKEND_DIR / ".env")

OCR_SPACE_API_KEY = os.getenv("OCR_SPACE_API_KEY")
OCR_SPACE_URL = "https://api.ocr.space/parse/image"
OCR_SPACE_TIMEOUT_SECONDS = 60

MAX_DIMENSION_PX = 2000
JPEG_QUALITY = 80


class OCRSpaceError(RuntimeError):
    """Raised when OCR.Space cannot produce a usable OCR result."""


def ocr_space_enabled() -> bool:
    """Return True when OCR.Space has a configured API key.

    Reads the live environment (populated from the backend .env by
    ``load_dotenv``) so tests can enable/disable the engine without restarting.
    """
    return bool(str(os.getenv("OCR_SPACE_API_KEY") or "").strip())


def _fetch_image_bytes(image_input: str) -> bytes:
    """Download original bytes from a local path, HTTPS/HTTP URL, or data URI."""
    if not image_input or not isinstance(image_input, str):
        raise ValueError("No image URL or path provided")

    image_input = image_input.strip()

    if image_input.startswith("data:image"):
        _, base64_data = image_input.split(",", 1)
        return base64.b64decode(base64_data)

    if image_input.startswith(("http://", "https://")):
        req = urllib.request.Request(
            image_input,
            headers={"User-Agent": "PackIntel-OCR-Scanner/1.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                return response.read()
        except Exception as exc:
            # Map every download failure (expired signed URL, HTTP 400/403,
            # DNS, timeout) to ValueError so scan.py returns a clean HTTP 400
            # instead of leaking an unhandled urllib traceback / signed token.
            raise ValueError(
                "Could not download the image from the provided URL "
                f"({type(exc).__name__}). The signed URL may have expired or "
                "the file may no longer exist. Please upload the image again "
                "to generate a fresh URL."
            ) from exc

    if os.path.isfile(image_input):
        with open(image_input, "rb") as image_file:
            return image_file.read()

    raise ValueError(f"Could not load image from input: {image_input[:80]}")


def _compress_to_jpeg(image_bytes: bytes) -> io.BytesIO:
    """Validate that the bytes are an image and return a compressed JPEG stream."""
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image.load()
    except Exception as exc:
        raise ValueError(
            f"Uploaded file is not a supported image format: {exc}. "
            "Use JPEG, PNG, or WebP (iPhone HEIC images are not supported)."
        ) from exc

    if image.mode != "RGB":
        image = image.convert("RGB")

    if max(image.size) > MAX_DIMENSION_PX:
        image.thumbnail((MAX_DIMENSION_PX, MAX_DIMENSION_PX))

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    buffer.seek(0)
    logger.info(
        "Preprocessing completed: %s -> JPEG %dx%d, %d bytes",
        image.mode,
        image.size[0],
        image.size[1],
        buffer.getbuffer().nbytes,
    )
    return buffer


def _post_to_ocr_space(jpeg_buffer: io.BytesIO) -> Dict[str, Any]:
    """POST the compressed JPEG to OCR.Space and return the JSON result."""
    logger.info("OCR request started (endpoint=%s)", OCR_SPACE_URL)
    try:
        response = requests.post(
            OCR_SPACE_URL,
            headers={"apikey": os.getenv("OCR_SPACE_API_KEY")},
            files={
                "file": ("label.jpg", jpeg_buffer, "image/jpeg"),
            },
            data={
                "language": "eng",
                "OCREngine": "2",
                "scale": "true",
                "detectOrientation": "true",
                "isOverlayRequired": "false",
            },
            timeout=OCR_SPACE_TIMEOUT_SECONDS,
        )
    except requests.exceptions.RequestException as exc:
        raise OCRSpaceError(f"OCR.Space request failed: {exc}") from exc

    logger.info("OCR response received (HTTP %s)", response.status_code)

    if response.status_code != 200:
        logger.error("OCR.Space HTTP %s: %s", response.status_code, response.text[:500])
        raise OCRSpaceError(f"OCR.Space HTTP {response.status_code}: {response.text[:500]}")

    try:
        result = response.json()
    except ValueError as exc:
        raise OCRSpaceError(
            "OCR.Space returned invalid JSON "
            f"(HTTP {response.status_code}): {response.text[:500]}"
        ) from exc

    if result.get("IsErroredOnProcessing"):
        raise OCRSpaceError(
            "OCR.Space processing error: "
            f"{result.get('ErrorMessage', 'unknown error')}"
        )
    return result


def _extract_result_text(result: Dict[str, Any]) -> str:
    """Safely join ParsedResults ParsedText values (missing keys -> empty)."""
    text_parts: List[str] = []
    for item in result.get("ParsedResults") or []:
        if not isinstance(item, dict):
            continue
        parsed_text = item.get("ParsedText")
        if parsed_text:
            text_parts.append(str(parsed_text).strip())
    return "\n".join(text_parts)


def extract_text_with_ocr_space(image_input: str) -> dict:
    """
    OCR an image through OCR.Space.

    Returns ``{"text": ..., "raw_response": result}``. Raises
    :class:`OCRSpaceError` when OCR.Space fails or returns no readable text and
    :class:`ValueError` when the input is not a loadable image.
    """
    image_bytes = _fetch_image_bytes(image_input)
    logger.info("Image received (%d input bytes)", len(image_bytes))

    jpeg_buffer = _compress_to_jpeg(image_bytes)
    logger.info("Preprocessing completed")

    if not ocr_space_enabled():
        raise OCRSpaceError("OCR_SPACE_API_KEY is not configured")

    result = _post_to_ocr_space(jpeg_buffer)

    text = _extract_result_text(result)
    logger.info("Extracted text length: %d characters", len(text))
    if not text:
        raise OCRSpaceError("OCR.Space returned no readable text for this image.")

    return {"text": text, "raw_response": result}


class OCRSpaceService:
    """
    Production OCR adapter used by the scan endpoint.

    ``process_image`` mirrors the return dict of ``OCRService.process_image``
    so extraction/compliance in ``scan.py`` work unchanged. All OCR.Space
    failures are converted to a structured ``completed_with_warning`` result;
    only a genuinely invalid image raises ``ValueError`` (-> HTTP 400).
    """

    FAILURE_TEMPLATE: Dict[str, Any] = {
        "status": "completed_with_warning",
        "text": "",
        "raw_text": "",
        "confidence": 0.0,
        "engine": "ocr_space",
        "lines": [],
        "regions": [],
        "layout_regions": [],
        "layout_text": "",
        "layout_region_count": 0,
        "image_quality": "unusable",
        "quality_reason": "OCR could not read the label image.",
        "quality": {},
    }

    @classmethod
    def process_image(cls, image_input: str) -> Dict[str, Any]:
        try:
            result = extract_text_with_ocr_space(image_input)
        except ValueError:
            raise
        except Exception as exc:
            logger.error("OCR failed (%s): %s", type(exc).__name__, exc)
            failure = dict(cls.FAILURE_TEMPLATE)
            failure["quality_reason"] = str(exc)
            return failure

        text = (result.get("text") or "").strip()
        lines = [line.strip() for line in text.splitlines() if line.strip()]

        if not lines:
            failure = dict(cls.FAILURE_TEMPLATE)
            failure["quality_reason"] = "OCR could not read the label image."
            return failure

        return {
            "status": "success",
            "text": text,
            "raw_text": text,
            "confidence": cls._extract_confidence(result.get("raw_response") or {}),
            "engine": "ocr_space",
            "lines": lines,
            "regions": [],
            "layout_regions": [],
            "layout_text": "",
            "layout_region_count": 0,
            "image_quality": "usable",
            "quality_reason": None,
            "quality": {},
        }

    @staticmethod
    def _extract_confidence(raw_response: Dict[str, Any]) -> float:
        """Best-effort confidence from OCR.Space's per-page ConfidenceScore.

        OCR.Space omits ``ConfidenceScore`` unless word-level overlays are
        requested, so its absence means "no signal": a successful (non-empty)
        OCR pass reports neutral-high confidence and the pipeline gates vision
        fallback on field completion rather than on a fabricated number.
        """
        try:
            parsed = raw_response.get("ParsedResults") or []
            score = float(parsed[0].get("ConfidenceScore") or 0.0)
            if score > 0:
                return round(max(0.0, min(100.0, score)), 2)
        except (TypeError, ValueError, IndexError, AttributeError):
            pass
        return 100.0