"""Deterministic normalization helpers for the canonical extraction schema.

Only deterministic conversions are performed (e.g. 5000 g -> 5 kg, 1000 ml -> 1 l).
Anything ambiguous is left untouched; the caller must never invent digits.
"""

import re
from typing import Dict, Optional, Tuple

from app.schemas.product import PRODUCT_FIELDS, ProductField, ProductInformation, field

_QUANTITY = re.compile(
    r"(?<![A-Za-z0-9/.])"
    r"(?P<num>\d+(?:[.,]\d+)?)\s*(?:x\s*\d+\s*)?\s*"
    r"(?P<unit>kilograms?|kgs?|gms?|grams?|g\b|lit(?:re|res|er|ers)?|ltrs?|millil(?:itres|iters)|ml|l\b|"
    r"pcs|pieces?|units?|n\b)"
    r"(?![A-Za-z])",
    re.IGNORECASE,
)

_UNIT_NORM = {
    "kg": "kg", "kgs": "kg", "kilogram": "kg", "kilograms": "kg",
    "g": "g", "gm": "g", "gms": "g", "gram": "g", "grams": "g",
    "ml": "ml", "millilitre": "ml", "millilitres": "ml", "milliliter": "ml", "milliliters": "ml",
    "l": "l", "ltr": "l", "ltrs": "l", "liter": "l", "liters": "l", "litre": "l", "litres": "l",
    "pcs": "pcs", "pc": "pcs", "piece": "pcs", "pieces": "pcs",
    "unit": "unit", "units": "unit", "n": "unit",
}


def normalize_quantity(value: str) -> Tuple[Optional[str], Optional[str]]:
    """Return (value, unit) from strings like '5 kg', '5KG', 'Net Qty: 5 kg'.

    Deterministic conversions only: 5000 g -> 5 kg, 1000 ml -> 1 l.
    Returns (None, None) when the value cannot be parsed safely."""
    text = (value or "").strip()
    match = _QUANTITY.search(text)
    if not match:
        return None, None

    raw_num = match.group("num").replace(",", "")
    raw_unit = (match.group("unit") or "").lower()
    unit = _UNIT_NORM.get(raw_unit)
    if not unit:
        return None, None

    try:
        number = float(raw_num)
    except ValueError:
        return None, None

    if unit == "g" and number >= 1000 and number % 1000 == 0:
        number = number / 1000
        unit = "kg"
    elif unit == "ml" and number >= 1000 and number % 1000 == 0:
        number = number / 1000
        unit = "l"

    if number == int(number):
        num_text = str(int(number))
    else:
        num_text = f"{number:g}"
    return num_text, unit


_PRICE = re.compile(r"(?P<price>\d+(?:[.,]\d{1,2})?)")
_CURRENCY = re.compile(r"^(?:rs\.?|rupees?|inr|₹|\$|€|£)\s*", re.IGNORECASE)


def normalize_mrp(value: str) -> Optional[float]:
    """Return a numeric MRP, stripping currency symbols/commas without touching
    the digits that are actually printed."""
    text = (value or "").strip()
    text = _CURRENCY.sub("", text).replace(",", "").strip()
    match = _PRICE.search(text)
    if not match:
        return None
    try:
        return float(match.group("price").replace(",", ""))
    except ValueError:
        return None


_DATE_FULL = re.compile(r"^\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\s*$")
_DATE_MONTH_YEAR = re.compile(
    r"^\s*(\d{1,2})[/\-.](\d{2,4})\s*$|^\s*([A-Za-z]{3,9})[/\-.\s](\d{2,4})\s*$"
)
_MONTHS = {
    "jan": "01", "feb": "02", "mar": "03", "apr": "04", "may": "05",
    "jun": "06", "jul": "07", "aug": "08", "sep": "09", "oct": "10",
    "nov": "11", "dec": "12",
}


def normalize_date(value: str) -> Optional[str]:
    """Canonicalize package date formats.

    01/2026 | 01-2026 | JAN 2026  -> 01/2026
    01/01/2026 | 01-01-26        -> 2026-01-01
    Returns None for values that do not look like a date.
    """
    text = (value or "").strip().upper()
    full = _DATE_FULL.match(text)
    if full:
        day, month, year = full.group(1), full.group(2), full.group(3)
        year = f"20{year}" if len(year) == 2 else year
        try:
            day_i, month_i = int(day), int(month)
            if not (1 <= day_i <= 31 and 1 <= month_i <= 12):
                return None
        except ValueError:
            return None
        return f"{year}-{int(month):02d}-{int(day):02d}"

    month_year = _DATE_MONTH_YEAR.match(text)
    if month_year:
        if month_year.group(1) is not None:
            month, year = month_year.group(1), month_year.group(2)
        else:
            month_name, year = month_year.group(3).lower(), month_year.group(4)
            month = _MONTHS.get(month_name[:3])
            if not month:
                return None
        year = f"20{year}" if len(year) == 2 else year
        try:
            if not (1 <= int(month) <= 12):
                return None
        except ValueError:
            return None
        return f"{int(month):02d}/{year}"

    return None


def normalize_phone(value: str) -> Optional[str]:
    """Collapse whitespace but preserve the printed value exactly otherwise."""
    text = (value or "").strip()
    if not text:
        return None
    return re.sub(r"\s+", " ", text)


def normalize_email(value: str) -> Optional[str]:
    """Normalize an email to lowercase without altering its content."""
    text = (value or "").strip()
    if not text:
        return None
    return text.lower().strip()


_FSSAI = re.compile(r"\b\d{14}\b")


def normalize_fssai(value: str) -> Optional[str]:
    """Return a 14-digit FSSAI number if the value contains exactly one.

    Never pads or guesses digits."""
    text = (value or "").strip()
    matches = _FSSAI.findall(text)
    return matches[0] if len(matches) == 1 else None


def values_differ(a: Optional[str], b: Optional[str]) -> bool:
    """Normalized disagreement check used by the OCR/vision merge.
    Checks in deterministic-specificity order so a date is never compared as
    a price (e.g. '01/2026' vs '01/01/2026')."""
    normalized_a, normalized_b = (a or "").strip(), (b or "").strip()

    qty_a = normalize_quantity(a) if a else (None, None)
    qty_b = normalize_quantity(b) if b else (None, None)
    if qty_a != (None, None) and qty_b != (None, None):
        return qty_a != qty_b

    date_a = normalize_date(a) if a else None
    date_b = normalize_date(b) if b else None
    if date_a and date_b:
        return date_a != date_b

    fssai_a = normalize_fssai(a) if a else None
    fssai_b = normalize_fssai(b) if b else None
    if fssai_a and fssai_b:
        return fssai_a != fssai_b

    mrp_a = normalize_mrp(a) if a else None
    mrp_b = normalize_mrp(b) if b else None
    if mrp_a is not None and mrp_b is not None:
        return abs(mrp_a - mrp_b) > 0.01

    return normalized_a.replace(" ", "").casefold() != normalized_b.replace(" ", "").casefold()


def compact(s: Optional[str]) -> str:
    return (s or "").replace(" ", "").casefold()


def merge_product_information(
    ocr: ProductInformation,
    vision: Optional[Dict[str, ProductField]] = None,
) -> ProductInformation:
    """Merge OCR and vision fields without silently hiding disagreements."""
    vision = vision or {}
    merged: Dict[str, ProductField] = {}

    for key in PRODUCT_FIELDS:
        ocr_field = getattr(ocr, key)
        vision_field = vision.get(key)
        if not vision_field or vision_field.source == "none":
            merged[key] = ocr_field
            continue
        if ocr_field.status == "detected" and vision_field.status == "detected":
            if values_differ(ocr_field.value, vision_field.value):
                merged[key] = field(
                    value=ocr_field.value,
                    status="uncertain",
                    confidence=min(ocr_field.confidence, vision_field.confidence),
                    source="merged",
                    conflicts=[
                        {"source": "ocr", "value": ocr_field.value},
                        {"source": "vision", "value": vision_field.value},
                    ],
                )
            else:
                merged[key] = field(
                    value=ocr_field.value,
                    status="detected",
                    confidence=max(ocr_field.confidence, vision_field.confidence),
                    source="merged",
                )
            continue
        if ocr_field.status == "detected":
            merged[key] = ocr_field
        else:
            merged[key] = vision_field

    return ProductInformation(**merged)