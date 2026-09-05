"""Multimodal label extraction via Gemini 2.5 Flash, with OCR fallback.

Design notes
------------
* Primary provider: Gemini 2.5 Flash through the ``google-genai`` SDK,
  authenticated with ``settings.GEMINI_API_KEY`` (app/core/config.py).
* The model's JSON output is parsed into the ``ProductExtraction`` schema
  (app/schemas/product.py), then projected onto the canonical ``ProductField``
  map consumed by the rest of the pipeline.
* If the Gemini call fails or times out, extraction degrades to
  ``OCRService``'s raw text output wrapped into ``ProductExtraction`` with all
  confidence scores set to 0 and ``image_quality_flag`` set to true.
* Extraction never invents values: a field is only 'detected' when the model
  actually reported a value; otherwise it is 'not_visible'.
* Hard failures that prevent any extraction (unreadable image, missing SDK)
  raise ``VisionExtractionError`` so the caller can keep usable OCR results.
"""

import json
import logging
import re
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings
from app.schemas.product import (
    PRODUCT_FIELDS,
    ProductExtraction,
    ProductField,
    field as make_field,
)
from app.services.ocr_service import OCRService

logger = logging.getLogger(__name__)

try:
    from google import genai
    from google.genai import types

    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

CRITICAL_FIELDS = (
    "brand_or_commodity_name",
    "generic_name",
    "net_quantity",
    # "manufacturer/packer information" is a group: at least one identity
    # declaration must be present (checked separately via _IDENTITY_FIELDS).
    "mrp",
    "packing_date",
    "manufacturing_date",
)

_IDENTITY_FIELDS = ("manufacturer_name", "packer_name", "marketer_name")

# Exact system prompt for India's Legal Metrology (Packaged Commodities) Rules,
# 2011 label extraction. The schema section is appended so the model knows the
# exact JSON shape to return (per the ProductExtraction schema).
SYSTEM_PROMPT = """You are a food packaging compliance data extractor for India's Legal Metrology (Packaged Commodities) Rules, 2011.
You will be given one or more images of a single product's label (front, back, and/or barcode side).

Extract ONLY the fields listed in the schema below, using ONLY text visible in the image(s).
Do not guess, infer, or autocomplete. Do not pull text from the wrong section of the label.

## CRITICAL RULES
1. Each field must come from its own semantically correct region: ingredients list, nutrition table,
   manufacturer/packer/marketer block, MRP/pricing area, and barcode/license area are DIFFERENT regions.
   Never cross-contaminate them.
2. If a field is not clearly visible, output null and set confidence to 0. NEVER fabricate a value.
3. Type-check every value before returning it:
   - manufacturer_name / packer_name / marketer_name must be a company/entity name. If the candidate text
     contains "Carbohydrate", "Sugars", "Energy", "kcal", "Protein", "Fat", "mg", "%", it is WRONG —
     set to null instead.
   - net_quantity must be a quantity + unit (e.g. "200 g"), never a price or nutrient value.
   - mrp must be a currency value (Rs./₹), never a nutrient value.
   - packing_date / expiry_date must be a date or month-year, never a batch/lot number.
4. Confidence (0-100) must reflect ACTUAL visual clarity of that specific text region in the image —
   blur, glare, low resolution, or partial occlusion must lower confidence accordingly.
5. If the image itself is low quality, still attempt extraction but cap ALL confidence scores at 40 
   and set "image_quality_flag": true.
6. Return valid JSON only — no prose, no markdown fences.

## Schema
Return a single JSON object with exactly the keys below. Every field value is
an object shaped {{"value": <string|null>, "confidence": <integer 0-100>}}
plus the top-level boolean "image_quality_flag" (see rule 5):
{fields}"""


class VisionExtractionError(RuntimeError):
    """Raised when the configured vision provider cannot return structured data."""


class VisionProvider:
    name: str = "base"

    def is_configured(self) -> bool:
        raise NotImplementedError

    def extract(self, image_url: str) -> Dict[str, ProductField]:
        raise NotImplementedError


def should_use_vision_fallback(
    ocr_confidence: float,
    ocr_failed: bool,
    product_information: Any,
) -> bool:
    """Decide whether the vision model should be invoked as a fallback.

    Condition A: OCR confidence < 50
    Condition B: OCR failed (no readable text)
    Condition C: one or more critical fields were not reliably extracted
    """
    if ocr_failed:
        return True
    # Below 50% is the hard fallback requirement. Medium-confidence OCR is
    # also sent to vision so disagreements can be detected before persistence.
    if (ocr_confidence or 0.0) < 70.0:
        return True

    if isinstance(product_information, dict):
        fields: Dict[str, Any] = product_information
    else:
        fields = product_information.as_dict() if hasattr(product_information, "as_dict") else {}

    def detected(key: str) -> bool:
        entry = fields.get(key)
        if entry is None:
            return False
        if isinstance(entry, ProductField):
            return bool(entry.value) and entry.status == "detected"
        if isinstance(entry, dict):
            return bool(entry.get("value")) and entry.get("status") == "detected"
        return bool(entry)

    for key in CRITICAL_FIELDS:
        if not detected(key):
            return True

    # Identity is satisfied when any manufacturer/packer/marketer is detected.
    if not any(detected(key) for key in _IDENTITY_FIELDS):
        return True
    return False


# ---------------------------------------------------------------------------
# Value / status normalization helpers
# ---------------------------------------------------------------------------

_TRUE_STATUS = "detected"
_STATUS_SYNONYMS = {
    "detected": "detected",
    "visible": "detected",
    "present": "detected",
    "read": "detected",
    "printed": "detected",
    "found": "detected",
    "not_printed": "not_printed",
    "not printed": "not_printed",
    "notprinted": "not_printed",
    "absent": "not_printed",
    "not_visible": "not_visible",
    "not visible": "not_visible",
    "notvisible": "not_visible",
    "unreadable": "not_visible",
    "not readable": "not_visible",
    "blurred": "not_visible",
    "missing": "not_visible",
    "uncertain": "uncertain",
    "maybe": "uncertain",
    "conflict": "uncertain",
    "review": "uncertain",
}

_EMPTY_TOKENS = {"", "none", "n/a", "na", "null", "not applicable", "unknown", "-"}


def _clean_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, bool):
        return "Yes" if value else None
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        return ", ".join(cleaned) if cleaned else None
    text = str(value).strip()
    if text.lower() in _EMPTY_TOKENS:
        return None
    return text


def _clean_status(raw: Any, value: Optional[str]) -> str:
    status = str(raw or "").strip().lower()
    status = _STATUS_SYNONYMS.get(status, status)
    if status not in {"detected", "not_printed", "not_visible", "uncertain"}:
        status = "detected" if value else "not_visible"
    if status == "detected" and not value:
        # A model claiming detection without a value is a hallucination hazard.
        status = "not_visible"
    if status == "not_visible" and value:
        # Inference path: the model omitted status (schema only requires
        # value + confidence), so an extracted value implies detection.
        status = "detected"
    return status


def _norm_field(raw: Any) -> ProductField:
    value = None
    status = None
    confidence: Any = 0.0
    if isinstance(raw, dict):
        value = _clean_text(raw.get("value"))
        status = _clean_status(raw.get("status"), value)
        confidence = raw.get("confidence", 0.0)
    else:
        value = _clean_text(raw)
        status = "detected" if value else "not_visible"
    try:
        confidence = max(0.0, min(100.0, float(confidence)))
    except (TypeError, ValueError):
        confidence = 0.0
    return make_field(value=value, status=status, confidence=confidence, source="vision")


# ---------------------------------------------------------------------------
# ProductExtraction parsing and projection
# ---------------------------------------------------------------------------


def _payload_root(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Unwrap common nested envelopes (product_information / fields)."""
    root: Dict[str, Any] = payload
    if isinstance(payload.get("product_information"), dict):
        root = payload["product_information"]
    if isinstance(payload.get("fields"), dict):
        root = payload["fields"]
    return root


def _extraction_to_fields(extraction: ProductExtraction) -> Dict[str, ProductField]:
    """Project a ProductExtraction onto the canonical ProductField map.

    When ``image_quality_flag`` is set, every confidence is capped at 40 per
    rule 5 of the extraction prompt.
    """
    cap = 40.0 if bool(extraction.image_quality_flag) else 100.0
    result: Dict[str, ProductField] = {}
    for name in PRODUCT_FIELDS:
        entry = getattr(extraction, name)
        converted = _norm_field(entry.model_dump())
        converted.confidence = min(converted.confidence, cap)
        result[name] = converted
    return result


def _parse_extraction_content(content: str) -> ProductExtraction:
    """Parse raw LLM text into the ProductExtraction Pydantic model."""
    content = (content or "").strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", content, re.DOTALL)
    if fence:
        content = fence.group(1).strip()
    if not content:
        raise VisionExtractionError("Vision provider returned empty content.")
    try:
        payload = json.loads(content)
    except json.JSONDecodeError as exc:
        raise VisionExtractionError("Vision provider returned invalid structured JSON.") from exc
    if not isinstance(payload, dict):
        raise VisionExtractionError("Vision provider returned a non-object payload.")
    try:
        return ProductExtraction.model_validate(_payload_root(payload))
    except Exception as exc:
        raise VisionExtractionError(
            "Vision provider output did not match the ProductExtraction schema."
        ) from exc


def _parse_json(content: str) -> Dict[str, ProductField]:
    """Parse vision JSON into the canonical ProductField map."""
    return _extraction_to_fields(_parse_extraction_content(content))


# ---------------------------------------------------------------------------
# OCR fallback
# ---------------------------------------------------------------------------


def _ocr_fallback_extraction(image_url: str) -> Dict[str, ProductField]:
    """Wrap OCRService's raw text output into the same ProductExtraction schema.

    On model failure the pipeline must not invent values: every field is
    reported as not_visible with confidence 0 and ``image_quality_flag`` true.
    """
    raw_text = ""
    try:
        ocr_result = OCRService.process_image(image_url)
        if isinstance(ocr_result, dict):
            raw_text = ocr_result.get("raw_text") or ocr_result.get("text") or ""
    except Exception as exc:  # OCR must never break the degradation path
        logger.warning("OCR fallback failed during vision degradation: %s", exc)

    extraction = ProductExtraction(image_quality_flag=True, raw_text=raw_text or None)
    return _extraction_to_fields(extraction)


# ---------------------------------------------------------------------------
# Gemini provider
# ---------------------------------------------------------------------------


def _fields_schema() -> str:
    shape = '{"value": <string | null>, "confidence": <integer 0-100>}'
    return "\n".join(f'  "{name}": {shape}' for name in PRODUCT_FIELDS)


class GeminiProvider(VisionProvider):
    name = "gemini"

    @property
    def _api_key(self) -> str:
        return (settings.GEMINI_API_KEY or "").strip()

    @property
    def _model_name(self) -> str:
        return (settings.VISION_MODEL or "gemini-2.5-flash").strip()

    def is_configured(self) -> bool:
        return HAS_GENAI and bool(self._api_key and self._model_name)

    def extract(self, image_url: str) -> Dict[str, ProductField]:
        if not image_url:
            raise VisionExtractionError("No image URL was provided to the vision provider.")
        if not HAS_GENAI:
            raise VisionExtractionError(
                "google-genai is not installed; cannot call Gemini."
            )

        try:
            image = OCRService._fetch_image(image_url)
        except (OSError, ValueError) as exc:
            raise VisionExtractionError(
                f"Could not load the label image for vision extraction: {exc}"
            ) from exc
        if image.mode != "RGB":
            image = image.convert("RGB")

        prompt = SYSTEM_PROMPT.format(fields=_fields_schema())
        with httpx.Client(timeout=settings.VISION_TIMEOUT_SECONDS) as http_client:
            client = genai.Client(
                api_key=self._api_key,
                http_options=types.HttpOptions(httpx_client=http_client),
            )
            try:
                response = client.models.generate_content(
                    model=self._model_name,
                    contents=[
                        image,
                        "Extract the packaged commodity label fields as JSON matching the schema above.",
                    ],
                    config=types.GenerateContentConfig(
                        system_instruction=prompt,
                        temperature=0,
                        response_mime_type="application/json",
                    ),
                )
            except Exception as exc:
                logger.warning(
                    "Gemini vision request failed; wrapping OCR output instead: %s", exc
                )
                return _ocr_fallback_extraction(image_url)

        try:
            text = str(response.text or "")
        except (ValueError, AttributeError) as exc:
            logger.warning(
                "Gemini returned no usable text; wrapping OCR output instead: %s", exc
            )
            return _ocr_fallback_extraction(image_url)

        try:
            extraction = _parse_extraction_content(text)
        except VisionExtractionError as exc:
            logger.warning(
                "Gemini output was not parseable; wrapping OCR output instead: %s", exc
            )
            return _ocr_fallback_extraction(image_url)

        return _extraction_to_fields(extraction)


_PROVIDERS: Dict[str, VisionProvider] = {
    "gemini": GeminiProvider(),
}


def get_vision_service() -> Optional[VisionProvider]:
    """Return the provider selected by VISION_PROVIDER (default: gemini)."""
    provider_name = (settings.VISION_PROVIDER or "gemini").strip().lower()
    if provider_name == "none":
        return None
    provider = _PROVIDERS.get(provider_name)
    if provider is None:
        logger.warning(
            "Unknown VISION_PROVIDER '%s'; treating vision as disabled.", provider_name
        )
        return None
    if not provider.is_configured():
        return None
    return provider


class VisionService:
    """Facade mirroring the Phase 1 call surface (scan.py + tests)."""

    @staticmethod
    def is_configured() -> bool:
        return get_vision_service() is not None

    @staticmethod
    def extract(image_url: str) -> Dict[str, ProductField]:
        provider = get_vision_service()
        if provider is None:
            raise VisionExtractionError(
                "No vision provider is configured (set VISION_PROVIDER/GEMINI_API_KEY/VISION_MODEL)."
            )
        return provider.extract(image_url)