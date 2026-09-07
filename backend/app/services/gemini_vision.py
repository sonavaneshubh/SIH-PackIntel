"""Gemini Vision: primary image understanding + product-field extraction.

The service sends the actual package image to Gemini (via google-genai),
requests structured JSON per the 26-field canonical schema, validates and
normalizes every value, and returns a ``GeminiVisionResult`` that can be fed
directly into the compliance engine.

If the Gemini call fails, times out, returns unusable JSON, or cannot extract
any meaningful field, the caller should fall back to the existing
Google Cloud Vision → text_normalizer → product_extractor path.

Design
------
* ``response_mime_type`` is set to ``application/json`` so the model returns
  valid JSON only.
* Each extracted field carries: value, confidence (0-100), status, evidence
  (the exact text from the image justifying the extraction), and
  ``source="gemini_vision"``.
* Nutrition values (Carbohydrate, Sugars, Protein …) are explicitly excluded
  from manufacturer/packer/net-quantity/MRP fields via prompt + validation.
* VEG / vegetarian symbol is mapped only to ``vegetarian_mark``.
* ``image_quality`` (GOOD/FAIR/POOR) and ``readability_quality``
  (HIGH/MEDIUM/LOW) are returned by the model so the pipeline can adapt.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field as dc_field
from typing import Any, Dict, Optional, Tuple

from PIL import Image

from app.core.config import settings
from app.schemas.product import PRODUCT_FIELDS, ProductField, field as make_field
from app.services.normalization import (
    normalize_date,
    normalize_email,
    normalize_fssai,
    normalize_mrp,
    normalize_phone,
    normalize_quantity,
)

logger = logging.getLogger(__name__)

try:
    import httpx
    from google import genai
    from google.genai import types

    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

# ---------------------------------------------------------------------------
# Extraction prompt
# ---------------------------------------------------------------------------

_EXTRACT_PROMPT = """\
You are an expert Indian food-packaging label extractor for Legal Metrology compliance.

You will be given an image of a packaged food product (front, back, barcode side).
Extract ONLY the fields listed below using ONLY text visibly printed on the label.
Do NOT guess, infer, or autocomplete. If a field is not clearly visible, output null.

## FIELD RULES

### Brand / Commodity Name (brand_or_commodity_name)
The product title, brand name, or main product name visible on the package heading.
Do NOT assume the first visible text is the brand — use title positioning and context.
If uncertain, return null.

### Generic Name (generic_name)
Common/commodity name describing the product (e.g. "Biscuits", "Rice", "Cooking Oil").
Distinguish from the brand name.

### Net Quantity (net_quantity)
ONLY identify when the image has explicit quantity labels: NET WT, NET WEIGHT, NET QTY,
NET QUANTITY, NET CONTENT, or a clearly labeled quantity.
Examples: "500 g", "1 kg", "250 ml", "1 L", "10 pieces".
NEVER treat nutrition values as net quantity:
  - Carbohydrate 46.3g  → NOT net quantity
  - Protein 8g          → NOT net quantity
  - Total Sugars 20g    → NOT net quantity
  - Sodium 200mg        → NOT net quantity

### Quantity Unit (quantity_unit)
The unit from the net quantity (g, kg, ml, l, pcs).

### Manufacturer Name (manufacturer_name)
Use contextual labels: "Manufactured by", "Manufactured & Packed by", "Mfd. by", "Mfg. by".
Assign a company name ONLY when the label clearly indicates it.
NEVER include: "Carbohydrate", "Sugars", "Energy", "kcal", "Protein", "Fat", "mg",
"%", "MRP", "Nutrition Information" in a company name.

### Manufacturer Address (manufacturer_address)
Full address associated with the manufacturer (city, state, pincode).

### Packer Name (packer_name)
"Packed by" / "Packed for" context.

### Packer Address (packer_address)
Address of the packer.

### Marketer Name (marketer_name)
"Marketed by" / "Marketed and distributed by" / "Marketing company".

### Marketer Address (marketer_address)
Address of the marketer.

### MRP (mrp)
Recognize: MRP ₹120, MRP Rs. 120, Maximum Retail Price ₹120, ₹120 (Incl. of all taxes).
Extract the price string, e.g. "Rs. 120" or "₹120".

### MRP Tax Inclusive (mrp_tax_inclusive)
"Yes" if the image clearly states "Incl. of all taxes" or "Inclusive of all taxes".
Otherwise null.

### Unit Sale Price (unit_sale_price)
If unit pricing is visible (e.g. "Rs. 12 per 100g"), extract it.

### Packing Date (packing_date)
PKD, Packed, Packing Date, or the date next to MFG context.
Do NOT copy the same date into packing_date and manufacturing_date without evidence.

### Manufacturing Date (manufacturing_date)
MFD, MFG, Manufactured date.

### Expiry Date (expiry_date)
Best Before, Use By, Expiry.
"BEST BEFORE 6 MONTHS FROM PACKAGING" → "6 months from packaging".

### Batch Number (batch_number)
Batch No., Lot No.

### Customer Care Name (customer_care_name)
Named entity listed for customer care, if present.

### Customer Care Phone (customer_care_phone)
Phone number for customer care. Clean OCR artifacts.

### Toll Free Number (toll_free_number)
1800-xxx-xxxx type numbers.

### Customer Care Email (customer_care_email)

### Country of Origin (country_of_origin)
"Country of Origin: India" etc.

### Vegetarian Mark (vegetarian_mark)
Detect if a vegetarian symbol (green dot in green square) or "VEG" text indicating
vegetarian is visible. Return "Present" or null.
DO NOT map VEG to brand_or_commodity_name.

### Non-Vegetarian Mark (non_vegetarian_mark)
Detect non-vegetarian symbol (brown/red dot) or "NON-VEG".

### FSSAI Number (fssai_number)
14-digit FSSAI license number.

### Certifications (certifications)
ISO, organic, or other certification marks visible on the label.

## CRITICAL WARNINGS
- VEG / vegetarian symbol → vegetarian_mark ONLY, never brand_or_commodity_name.
- Nutrition panel values (Carbohydrate, Sugars, Protein, Fat, Sodium, Energy, kcal,
  calories) must NEVER appear in: manufacturer_name, packer_name, marketer_name,
  net_quantity, mrp.
- Numbers from the nutrition table must never be treated as MRP.
- Correctly distinguish MFD (manufacturing) vs PKD (packing) vs Best Before (expiry).
  Do not copy the same date to multiple fields without contextual evidence.
- Only extract MRP when the image context clearly shows a price label, not random digits.
- Only extract customer-care data when the image context clearly indicates a contact block.

## OUTPUT FORMAT
Return ONLY a single valid JSON object (no markdown, no explanation).

{
  "brand_or_commodity_name": {"value": <string|null>, "confidence": <int 0-100>, "status": "detected"|"not_visible"|"not_printed"|"uncertain", "evidence": <string|null>},
  "generic_name": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "net_quantity": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "quantity_unit": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "manufacturer_name": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "manufacturer_address": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "packer_name": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "packer_address": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "marketer_name": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "marketer_address": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "mrp": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "mrp_tax_inclusive": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "unit_sale_price": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "packing_date": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "manufacturing_date": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "expiry_date": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "batch_number": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "customer_care_name": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "customer_care_phone": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "toll_free_number": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "customer_care_email": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "country_of_origin": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "vegetarian_mark": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "non_vegetarian_mark": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "fssai_number": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "certifications": {"value": ..., "confidence": ..., "status": ..., "evidence": ...},
  "image_quality": "GOOD"|"FAIR"|"POOR",
  "readability_quality": "HIGH"|"MEDIUM"|"LOW",
  "image_analysis": {
    "vegetarian_symbol_detected": <bool>,
    "non_vegetarian_symbol_detected": <bool>,
    "country_of_origin_visible": <bool>,
    "notes": <string|null>
  },
  "confidence_details": {
    "overall_visual_confidence": <int 0-100>,
    "label_region_clarity": "clear"|"partial"|"obscured"
  }
}
"""


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class GeminiVisionResult:
    """Outcome of a Gemini Vision extraction attempt."""

    success: bool
    product_fields: Dict[str, ProductField] = dc_field(default_factory=dict)
    raw_extraction: Dict[str, Any] = dc_field(default_factory=dict)
    image_quality: str = "FAIR"
    readability_quality: str = "MEDIUM"
    image_analysis: Dict[str, Any] = dc_field(default_factory=dict)
    confidence_details: Dict[str, Any] = dc_field(default_factory=dict)
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

_STATUS_MAP = {
    "detected": "detected",
    "visible": "detected",
    "present": "detected",
    "printed": "detected",
    "found": "detected",
    "read": "detected",
    "not_visible": "not_visible",
    "not visible": "not_visible",
    "missing": "not_visible",
    "unreadable": "not_visible",
    "not readable": "not_visible",
    "blurred": "not_visible",
    "not_printed": "not_printed",
    "not printed": "not_printed",
    "absent": "not_printed",
    "uncertain": "uncertain",
    "maybe": "uncertain",
}

_EMPTY = {"", "none", "n/a", "na", "null", "not applicable", "unknown", "-"}

# Nutrition keywords that must never appear in manufacturer/packer fields.
_NUTRITION_KEYWORDS = re.compile(
    r"(?:carbohydrate|sugar|sugars|protein|fat|sodium|energy|kcal|calories|"
    r"cholesterol| fibre|fiber|vitamin|mineral|serving|portion|daily.value)",
    re.IGNORECASE,
)

# Known units for quantity_unit validation.
_VALID_UNITS = {"g", "kg", "ml", "l", "pcs", "unit", "units"}


def _normalize_status(raw: Any, value: Any) -> str:
    status = str(raw or "").strip().lower()
    status = _STATUS_MAP.get(status, status)
    if status not in {"detected", "not_visible", "not_printed", "uncertain"}:
        status = "detected" if value else "not_visible"
    if status == "detected" and not value:
        status = "not_visible"
    if status == "not_visible" and value:
        status = "detected"
    return status


def _clean_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _validate_field(name: str, value: Any, confidence: float, evidence: Optional[str]) -> Tuple[Any, float]:
    """Validate and normalize a single field value; return (value, confidence)."""
    if value is None:
        return None, 0.0

    value_str = str(value).strip()
    if not value_str or value_str.lower() in _EMPTY:
        return None, 0.0

    value_str = _clean_whitespace(value_str)

    # --- Numeric / format-specific fields ---

    if name == "mrp":
        numeric = normalize_mrp(value_str)
        if numeric is not None:
            formatted = f"Rs. {numeric:g}"
            return formatted, max(confidence, 70)
        # Value present but not standard format — keep with lower confidence.
        capped = min(confidence, 40) if confidence > 40 else confidence
        return value_str, capped

    if name == "mrp_tax_inclusive":
        low = value_str.lower()
        if low in {"yes", "true", "1", "inclusive", "yes."}:
            return "Yes", max(confidence, 60)
        if low in {"no", "false", "0", "exclusive", "no."}:
            return "No", max(confidence, 60)
        return value_str, min(confidence, 40) if confidence > 40 else confidence

    if name == "net_quantity":
        # Nutrition rows are never net quantity, even when a bare number+unit
        # is extractable ("Carbohydrate 46.3g" must be rejected upfront).
        if _NUTRITION_KEYWORDS.search(value_str):
            return None, 0.0
        num, unit = normalize_quantity(value_str)
        if num is not None and unit:
            return f"{num} {unit}", max(confidence, 60)
        capped = min(confidence, 50) if confidence > 50 else confidence
        return value_str, capped

    if name == "quantity_unit":
        norm = value_str.lower().strip(".")
        if norm in _VALID_UNITS:
            return norm, confidence
        return value_str, min(confidence, 40) if confidence > 40 else confidence

    # --- Date fields ---

    if name in {"packing_date", "manufacturing_date", "expiry_date"}:
        normalized = normalize_date(value_str)
        if normalized:
            return normalized, confidence
        # Keep original for relative dates ("6 months from packaging") or month-year.
        return value_str, min(confidence, 60) if confidence > 60 else confidence

    # --- Contact fields ---

    if name in {"customer_care_phone", "toll_free_number"}:
        cleaned = normalize_phone(value_str)
        return (cleaned or value_str), confidence

    if name == "customer_care_email":
        cleaned = normalize_email(value_str)
        return (cleaned or value_str), confidence

    # --- FSSAI ---

    if name == "fssai_number":
        cleaned = normalize_fssai(value_str)
        if cleaned:
            return cleaned, max(confidence, 70)
        return value_str, min(confidence, 30) if confidence > 30 else confidence

    # --- Identity fields (manufacturer / packer / marketer) ---

    if name in {"manufacturer_name", "packer_name", "marketer_name"}:
        if _NUTRITION_KEYWORDS.search(value_str):
            return None, 0.0
        return value_str, confidence

    # --- All other fields: just clean whitespace ---

    return value_str, confidence


def _parse_json_content(content: str) -> Dict[str, Any]:
    """Parse raw LLM text into a Python dict, handling markdown fences."""
    content = content.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", content, re.DOTALL)
    if fence:
        content = fence.group(1).strip()
    if not content:
        raise ValueError("Empty content")
    payload = json.loads(content)
    if not isinstance(payload, dict):
        raise ValueError("Non-object payload")
    return payload


def _average_detected_confidence(fields: Dict[str, ProductField]) -> float:
    confs = [
        f.confidence
        for f in fields.values()
        if f.status == "detected" and f.confidence > 0
    ]
    return round(sum(confs) / len(confs), 2) if confs else 0.0


def _pop_metadata(payload: Dict[str, Any]) -> Tuple[str, str, Dict[str, Any], Dict[str, Any]]:
    """Extract the top-level quality/analysis metadata and return the rest."""
    image_quality = str(payload.pop("image_quality", "FAIR") or "FAIR").upper()
    if image_quality not in {"GOOD", "FAIR", "POOR"}:
        image_quality = "FAIR"

    readability_quality = str(payload.pop("readability_quality", "MEDIUM") or "MEDIUM").upper()
    if readability_quality not in {"HIGH", "MEDIUM", "LOW"}:
        readability_quality = "MEDIUM"

    image_analysis = payload.pop("image_analysis", {})
    if not isinstance(image_analysis, dict):
        image_analysis = {}

    confidence_details = payload.pop("confidence_details", {})
    if not isinstance(confidence_details, dict):
        confidence_details = {}

    return image_quality, readability_quality, image_analysis, confidence_details


def _project_fields(payload: Dict[str, Any]) -> Dict[str, ProductField]:
    """Map a parsed Gemini JSON payload onto the canonical field map.

    Every value goes through ``_validate_field`` (normalization + nutrition
    guard) and is stamped with ``source='gemini_vision'`` and its evidence.
    """
    product_fields: Dict[str, ProductField] = {}
    for name in PRODUCT_FIELDS:
        entry = payload.get(name)
        value = None
        confidence = 0.0
        status = "not_visible"
        evidence = None

        if isinstance(entry, dict):
            value = entry.get("value")
            confidence = float(entry.get("confidence") or 0.0)
            raw_status = entry.get("status") or ""
            evidence = entry.get("evidence")
            if isinstance(evidence, str):
                evidence = evidence.strip() or None
            status = _normalize_status(raw_status, value)
        elif entry is None:
            status = "not_visible"
        # Ignore unexpected shapes — treat as not_visible.

        # Validate and normalize value.
        value, confidence = _validate_field(name, value, confidence, evidence)
        confidence = max(0.0, min(100.0, confidence))

        # Re-evaluate status after validation (validation may null the value).
        status = _normalize_status(status, value)

        product_fields[name] = make_field(
            value=value,
            status=status,
            confidence=confidence,
            source="gemini_vision",
            evidence=evidence,
        )
    return product_fields


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class GeminiVisionService:
    """Primary extraction via Gemini multimodal vision.

    ``extract()`` returns a ``GeminiVisionResult``. When ``success`` is False
    the caller should fall back to the existing OCR pipeline.
    """

    @classmethod
    def is_configured(cls) -> bool:
        """True when the SDK is installed and the API key is set."""
        return HAS_GENAI and bool(settings.GEMINI_API_KEY.strip()) and bool(settings.VISION_MODEL.strip())

    @classmethod
    def extract(cls, image_ref: str, pil_image: Optional[Image.Image] = None) -> GeminiVisionResult:
        """Send the actual image to Gemini and return structured product data.

        Parameters
        ----------
        image_ref : str
            URL, data URI, or local path to the image.
        pil_image : PIL.Image.Image, optional
            Pre-loaded image. When provided, ``image_ref`` is only used for
            error messages; no additional network fetch occurs.
        """
        if not cls.is_configured():
            return GeminiVisionResult(
                success=False,
                error="Gemini Vision is not configured (set GEMINI_API_KEY and VISION_MODEL).",
            )

        # ---- Load image ----
        if pil_image is None:
            try:
                pil_image = cls._fetch_image(image_ref)
            except Exception as exc:
                logger.warning("Gemini primary: could not load image: %s", exc)
                return GeminiVisionResult(success=False, error=f"Could not load image: {exc}")

        if pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")

        api_key = settings.GEMINI_API_KEY.strip()
        model_name = settings.VISION_MODEL.strip()

        # ---- Call Gemini ----
        try:
            with httpx.Client(timeout=settings.VISION_TIMEOUT_SECONDS) as http_client:
                client = genai.Client(
                    api_key=api_key,
                    http_options=types.HttpOptions(httpx_client=http_client),
                )
                response = client.models.generate_content(
                    model=model_name,
                    contents=[
                        pil_image,
                        "Extract the packaged commodity label fields as JSON per the schema above.",
                    ],
                    config=types.GenerateContentConfig(
                        system_instruction=_EXTRACT_PROMPT,
                        temperature=0,
                        response_mime_type="application/json",
                    ),
                )
        except Exception as exc:
            logger.warning("Gemini primary request failed: %s", exc)
            return GeminiVisionResult(success=False, error=f"Gemini API error: {exc}")

        # ---- Parse response ----
        try:
            text = str(response.text or "")
        except (ValueError, AttributeError) as exc:
            logger.warning("Gemini primary returned no text: %s", exc)
            return GeminiVisionResult(success=False, error=f"Gemini returned no text: {exc}")

        try:
            raw = _parse_json_content(text)
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("Gemini primary returned invalid JSON: %s", exc)
            return GeminiVisionResult(success=False, error=f"Gemini returned invalid JSON: {exc}")

        # ---- Extract metadata ----
        image_quality, readability_quality, image_analysis, confidence_details = (
            _pop_metadata(raw)
        )

        # ---- Map canonical fields ----
        product_fields = _project_fields(raw)

        # ---- Usability check ----
        any_detected = any(
            f.status == "detected" and f.value for f in product_fields.values()
        )
        if not any_detected:
            return GeminiVisionResult(
                success=False,
                error="Gemini returned no usable field extractions.",
            )

        return GeminiVisionResult(
            success=True,
            product_fields=product_fields,
            raw_extraction=raw,
            image_quality=image_quality,
            readability_quality=readability_quality,
            image_analysis=image_analysis,
            confidence_details=confidence_details,
        )

    @staticmethod
    def _fetch_image(image_ref: str) -> Image.Image:
        """Delegate to the existing OCR image loader."""
        from app.services.ocr_service import OCRService
        return OCRService._fetch_image(image_ref)
