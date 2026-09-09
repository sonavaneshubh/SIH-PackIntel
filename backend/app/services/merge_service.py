"""Merge OCR and vision extractions without silently preferring either source.

Strategy (per field, using the canonical ProductField entries):
* OCR confidence >= 80 and the vision value agrees          -> OCR
* OCR confidence >= 80 but OCR and vision disagree          -> value from OCR,
  status 'uncertain' + conflict metadata (never a silent choice)
* OCR confidence 50-79 and vision agrees                    -> higher-confidence entry
* OCR confidence 50-79 and vision disagrees                 -> 'uncertain' + metadata
* OCR confidence < 50                                       -> prefer vision
* OCR field missing (not_visible/uncertain)                 -> vision fills gaps;
  vision 'not_printed' resolves an OCR 'not_visible' to 'not_printed'

Conflicts on important fields (MRP, net quantity, dates, FSSAI) are always
surfaced as 'uncertain' with the raw OCR/vision values preserved for debugging.
"""

from typing import Any, Dict, List, Optional, Tuple

from app.schemas.product import (
    CONFLICT_SENSITIVE_FIELDS,
    PRODUCT_FIELDS,
    ProductField,
    field as make_field,
)
from app.services.normalization import values_differ


def _entry(value: Optional[ProductField]) -> ProductField:
    if value is None:
        return make_field(status="not_visible", source="none")
    if isinstance(value, ProductField):
        return value
    if isinstance(value, dict):
        return ProductField.model_validate(value)
    return make_field(status="not_visible", source="none")


def _conflict_meta(source: str, entry: ProductField) -> Dict[str, Any]:
    return {
        "source": source,
        "status": entry.status,
        "value": entry.value,
        "confidence": entry.confidence,
    }


def _pick_better(o: ProductField, v: ProductField) -> ProductField:
    if o.confidence >= v.confidence:
        return o
    return v


def merge_sources(
    ocr: Any, vision: Dict[str, ProductField]
) -> Dict[str, ProductField]:
    """Return a canonical field map merging OCR with vision extractions."""
    if hasattr(ocr, "as_dict"):
        ocr_fields: Dict[str, ProductField] = ocr.as_dict()
    else:
        ocr_fields = ocr or {}

    merged: Dict[str, ProductField] = {}

    for key in PRODUCT_FIELDS:
        o = _entry(ocr_fields.get(key))
        v = _entry(vision.get(key))

        conflicts: List[Dict[str, Any]] = []

        if o.status == "detected":
            if v.status == "detected":
                if values_differ(o.value, v.value):
                    if o.confidence >= 80.0:
                        preferred = o
                    elif v.confidence >= 50.0:
                        preferred = _pick_better(o, v)
                    else:
                        preferred = o
                    conflicts = [
                        _conflict_meta("ocr", o),
                        _conflict_meta("vision", v),
                    ]
                    merged[key] = make_field(
                        value=preferred.value,
                        status="uncertain",
                        confidence=max(o.confidence, v.confidence),
                        source=preferred.source,
                        conflicts=conflicts if conflicts else None,
                    )
                else:
                    chosen = _pick_better(o, v)
                    merged[key] = make_field(
                        value=chosen.value,
                        status="detected",
                        confidence=chosen.confidence,
                        source=chosen.source,
                    )
            else:
                merged[key] = o if o.confidence >= 50.0 else v
        elif o.status == "not_visible":
            if v.status == "detected":
                merged[key] = v
            elif v.status == "not_printed":
                merged[key] = make_field(
                    value=None,
                    status="not_printed",
                    confidence=v.confidence,
                    source="vision",
                )
            else:
                merged[key] = o
        elif o.status == "uncertain":
            if v.status == "detected":
                merged[key] = make_field(
                    value=v.value,
                    status="uncertain",
                    confidence=v.confidence,
                    source="vision",
                    conflicts=[_conflict_meta("ocr", o), _conflict_meta("vision", v)],
                )
            else:
                merged[key] = o
        else:  # not_printed from OCR (rare) or fallback
            merged[key] = v if v.status != "not_visible" else o
    return merged


def merge_gemini_with_ocr(
    ocr: Any,
    gemini: Dict[str, ProductField],
) -> Tuple[Dict[str, ProductField], Dict[str, int]]:
    """Fuse Gemini-image extraction with the OCR-pipeline extraction.

    Gemini is the image-primary source and is kept for every field it
    detected. OCR fills exactly the fields Gemini missed (``not_visible``),
    which is how back-side-only declarations (importer blocks, batch, FSSAI,
    expiry, veg marks) survive: the OCR pass reads the combined front+back
    text, whereas Gemini currently sees only the front image.

    A field that both sources report with different values is never silently
    resolved: on the conflict-sensitive fields (MRP, net quantity, dates,
    FSSAI) it is surfaced as ``uncertain`` with both raw values preserved; on
    all other fields Gemini (the image source) wins.
    """
    if ocr is None:
        ocr_fields: Dict[str, ProductField] = {}
    elif hasattr(ocr, "as_dict"):
        ocr_fields = ocr.as_dict()
    else:
        ocr_fields = ocr or {}

    merged: Dict[str, ProductField] = {}
    gemini_detected = 0
    ocr_gap_filled = 0
    conflicts = 0

    for key in PRODUCT_FIELDS:
        o = _entry(ocr_fields.get(key))
        v = _entry(gemini.get(key))

        if v.status == "detected" and v.value:
            gemini_detected += 1
            if o.status == "detected" and o.value and values_differ(o.value, v.value):
                if key in CONFLICT_SENSITIVE_FIELDS:
                    conflicts += 1
                    merged[key] = make_field(
                        value=v.value,
                        status="uncertain",
                        confidence=max(o.confidence, v.confidence),
                        source="gemini_vision",
                        conflicts=[
                            _conflict_meta("ocr", o),
                            _conflict_meta("gemini_vision", v),
                        ],
                    )
                else:
                    merged[key] = v
            else:
                merged[key] = v
        elif o.status == "detected" and o.value:
            ocr_gap_filled += 1
            merged[key] = o
        else:
            # Keep the Gemini entry so a missing field keeps its own source.
            merged[key] = v

    stats = {
        "gemini_detected": gemini_detected,
        "ocr_gap_filled": ocr_gap_filled,
        "conflicts_surfaced": conflicts,
        "merged_detected": sum(
            1
            for f in merged.values()
            if f.status == "detected" and f.value
        ),
        "merged_uncertain": sum(
            1 for f in merged.values() if f.status == "uncertain"
        ),
    }
    return merged, stats


def _diagnostic_entry(entry: Optional[ProductField]) -> Dict[str, Any]:
    safe = _entry(entry)
    value = safe.value
    if value and len(str(value)) > 80:
        value = f"{str(value)[:77]}..."
    return {
        "status": safe.status,
        "source": safe.source,
        "confidence": safe.confidence,
        "value": value,
    }


def build_field_diagnostic(
    ocr: Any,
    gemini: Dict[str, ProductField],
    merged: Dict[str, ProductField],
    **context: Any,
) -> Dict[str, Any]:
    """Return a per-field diagnostic (OCR vs Gemini vs final) for a scan.

    Intended for structured ``[PACKINTEL][DIAGNOSTIC]`` log lines so every
    field can be traced from each extractor through to the value used for
    compliance, without leaking the raw OCR text.
    """
    if ocr is None:
        ocr_fields: Dict[str, ProductField] = {}
    elif hasattr(ocr, "as_dict"):
        ocr_fields = ocr.as_dict()
    else:
        ocr_fields = ocr or {}

    fields: Dict[str, Any] = {}
    for key in PRODUCT_FIELDS:
        fields[key] = {
            "ocr": _diagnostic_entry(ocr_fields.get(key)),
            "gemini": _diagnostic_entry(gemini.get(key)),
            "merged": _diagnostic_entry(merged.get(key)),
        }

    return {"context": context, "fields": fields}