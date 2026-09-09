"""Dedicated product-field extraction layer for PackIntel.

This module sits between the OCR text normalizer and the compliance engine.
It consumes normalized OCR text and produces the canonical 26-field
``ProductInformation`` schema, using regex/pattern rules that tolerate Indian
packaging variations and OCR spacing errors.

The module builds on the existing ``AIService`` extraction (which already
handles MRP, net quantity, manufacturer/name, dates, batch, veg/non-veg, FSSAI,
customer care and certifications) and adds deterministic improvements for the
fields the base extractor leaves as ``not_visible``:
  * manufacturer / packer / marketer *addresses*
  * better brand vs. generic-name disambiguation
  * packaging date / expiry / best-before date handling
  * unit sale price and MRP tax-inclusive detection

Every extracted field keeps the canonical ``{value, status, confidence, source}``
shape. Fields that cannot be found are ``not_visible`` (never labelled
"not visible" text, and never "not_printed" unless a regex actually proves the
absence is printed).
"""

import logging
import re
from typing import Dict, Optional, Tuple

from app.schemas.product import ProductInformation, field
from app.services.ai_service import AIService, build_product_information
from app.services.normalization import (
    normalize_mrp,
)
from app.services.text_normalizer import normalize_text

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Address extraction
# ---------------------------------------------------------------------------

# A declaration label that begins an identity block whose value spans one or
# more following lines (until the next declaration label).
_ADDRESS_BLOCK_LABEL = re.compile(
    r"^\s*(?:manufactur(?:ed|er|ing)?\s*(?:by|:|at)|mfd\s*by|mfg\s*\.?\s*by|"
    r"pack(?:ed|er|ing)?\s*(?:by|:|at)|marketed\s*(?:and|&)\s*distributed\s*by|"
    r"marketed\s*by|distributed\s*by|import(?:ed)?\s*(?:by|at))\b",
    re.IGNORECASE,
)

# Tokens that terminate a running identity/address block (next declaration).
_ADDRESS_STOP_TOKENS = re.compile(
    r"^\s*(?:mrp|net\b|manufactur|pack\b|packed|packer|marketed|distributed|"
    r"imported|importer|country\s*of\s*origin|made\s*in|consumer|customer|"
    r"tel(?:ephone)?|email|www\b|batch|lot|fssai|lic(?:ence)?\s*no|reg(?:istration)?\s*no|"
    r"best\s*before|use\s*by|expiry|mfg|mfd|date\s*of\s*(?:manufacture|packing)|"
    r"product|commodity|generic|veg(?:etarian)?|non-?veg(?:etarian)?|"
    r"storage|shelf|contains)\b",
    re.IGNORECASE,
)

# A name line ends with an entity suffix; an address follows on later lines.
_ENTITY_SUFFIX = re.compile(
    r"(?:ltd|limited|pvt|ltd\.|p\.ltd|llp|inc|corporation|corp|co\b|company|"
    r"private\s*limited|industries|enterprises|foods|products|mills|group|"
    r"bakers|manufacturer|pvt\s*ltd)$",
    re.IGNORECASE,
)

_CITY_LINE = re.compile(
    r"^\s*([A-Za-z][A-Za-z\s'.-]{2,})(?:[,;]?\s*[-–]\s*\d{5,6}|\s+\d{5,6})?\s*$"
)

# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------

_DATE_VALUE = re.compile(
    r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}[/-]\d{4}|"
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|"
    r"dec(?:ember)?)\.?\s*(?:19|20)?\d{2})",
    re.IGNORECASE,
)


def _extract_address_block(text: str) -> Tuple[Optional[str], Optional[str]]:
    """Return ``(name, address)`` from the first identity block in ``text``.

    The block runs from the first ``Manufactured/Packed/Marketed By`` heading up
    to the next declaration label. The first non-empty line(s) are treated as
    the entity name; the trailing address lines are joined into the address.
    """
    match = _ADDRESS_BLOCK_LABEL.search(text)
    if not match:
        return None, None

    block_lines = []
    start = match.start()
    rest = text[match.end():]
    for line in rest.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if _ADDRESS_STOP_TOKENS.search(stripped):
            break
        block_lines.append(stripped)
        if len(block_lines) >= 6:
            break

    if not block_lines:
        return None, None

    # The name occupies the first 1–2 lines; the trailing lines are the address.
    name_lines = []
    addr_lines = []
    for line in block_lines:
        if _ENTITY_SUFFIX.search(line) or (not addr_lines and len(name_lines) < 2):
            if not name_lines or _ENTITY_SUFFIX.search(line):
                name_lines.append(line)
                continue
        addr_lines.append(line)

    if not name_lines:
        name_lines = block_lines[:1]
        addr_lines = block_lines[1:]

    name = " ".join(name_lines).strip(" ,;:-")
    address = " ".join(addr_lines).strip(" ,;:-")
    return name or None, address or None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def extract_product(raw_text: str, ocr_confidence: Optional[float] = None) -> ProductInformation:
    """Extract the canonical ProductInformation from raw OCR text.

    ``raw_text`` is normalized first, then fed to the existing AIService
    extraction, then overlaid with deterministic improvements for the fields
    the base extractor misses. The returned object always follows the
    26-field schema.
    """
    normalized = normalize_text(raw_text)

    # Base extraction (already handles MRP, quantity, dates, batch, veg/non-veg,
    # FSSAI, care, certifications, country, brand/generic).
    fields, conf = AIService.extract_with_confidence(normalized, ocr_confidence=ocr_confidence)
    pi = build_product_information(fields, conf, normalized)

    # --- improvements ---
    pi = _overlay_addresses(pi, normalized)
    pi = _overlay_dates(pi, normalized)
    pi = _overlay_unit_sale_price(pi, normalized)
    pi = _overlay_brand_and_generic(pi, normalized)
    pi = _overlay_relative_expiry(pi, normalized)

    return pi


def _overlay_addresses(pi: ProductInformation, normalized: str) -> ProductInformation:
    """Fill manufacturer/packer/marketer addresses from their identity blocks.

    The block's name/address pair is also used to trim any over-wide name that
    the base extractor grabbed (e.g. a name that absorbed the address lines).
    """
    for attr, pattern in (
        ("manufacturer", r"manufactur(?:ed|er|ing)?\s*(?:by|:|at)"),
        ("packer", r"pack(?:ed|er|ing)?\s*(?:by|:|at)"),
        (
            "marketer",
            r"marketed\s*(?:and|&)?\s*distributed\s*by|marketed\s*by|"
            r"marketing\s*(?:by|company)|distributed\s*by",
        ),
        ("importer", r"import(?:ed)?\s*(?:by|at)"),
    ):
        name_attr = f"{attr}_name"
        addr_attr = f"{attr}_address"
        addr_field = getattr(pi, addr_attr)
        if addr_field.status == "detected":
            continue
        block = _find_block_after(normalized, pattern)
        if not block:
            continue
        name, address = _split_name_address(block)
        if name:
            cur = getattr(pi, name_attr)
            if (
                cur.status == "detected"
                and cur.value
                and name.lower() in cur.value.lower()
                and cur.value.strip().lower() != name.lower()
            ):
                # The base name absorbed extra lines (often the address); trim it.
                setattr(
                    pi,
                    name_attr,
                    field(value=name, status="detected", confidence=cur.confidence, source=cur.source),
                )
        if address:
            confidence = 66.0 if attr == "packer" else 68.0
            setattr(
                pi,
                addr_attr,
                field(value=address, status="detected", confidence=confidence, source="ocr"),
            )
    return pi


def _find_block_after(text: str, label_pattern: str) -> Optional[str]:
    label = re.compile(label_pattern, re.IGNORECASE)
    match = label.search(text)
    if not match:
        return None
    block_lines = []
    for line in text[match.end():].splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if _ADDRESS_STOP_TOKENS.search(stripped):
            break
        block_lines.append(stripped)
        if len(block_lines) >= 6:
            break
    return "\n".join(block_lines) if block_lines else None


def _split_name_address(block: str) -> Tuple[Optional[str], Optional[str]]:
    lines = [ln for ln in block.splitlines() if ln.strip()]
    if not lines:
        return None, None
    # Contact lines (email / phone / www) are never part of a name or address.
    kept = [ln for ln in lines if not _CONTACT_LINE.match(ln.strip())]
    if not kept:
        return None, None
    lines = kept

    name_lines = []
    addr_lines = []
    for line in lines:
        if _ENTITY_SUFFIX.search(line) or (
            not addr_lines
            and len(name_lines) < 2
            and not _CITY_LINE.search(line)
            and not _GEO_LINE.match(line)
        ):
            name_lines.append(line)
        else:
            addr_lines.append(line)
    if not name_lines:
        name_lines = lines[:1]
        addr_lines = lines[1:]

    # Collapse repeated entity lines ("PARLE PRODUCTS PVT LTD\nParle Products Pvt Ltd").
    if len(name_lines) >= 2 and (
        name_lines[0].strip().lower() == name_lines[1].strip().lower()
        or name_lines[0].strip().lower() in name_lines[1].strip().lower()
        or name_lines[1].strip().lower() in name_lines[0].strip().lower()
    ):
        name_lines = name_lines[:1]

    address = " ".join(addr_lines).strip(" ,;:-")
    if not _is_plausible_address(address):
        address = None
    return (
        " ".join(name_lines).strip(" ,;:-") or None,
        address,
    )


_CONTACT_LINE = re.compile(
    r"^(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|"
    r"(?![0-9]*$)[0-9+() -]{7,}|www\.[^\s]+|1800[\d\s().-]{6,12})$",
    re.IGNORECASE,
)

# A line that begins a geographic place marker is an address line, never a name.
_GEO_LINE = re.compile(
    r"^\s*(?:village|vill|town|city|dist(?:rict)?\.?|ward|nagar|colony|layout|"
    r"road|street|st\.?\b|lane|phase|sector|block|vpo|post|p\.?o\.?|gali|chowk|"
    r"chauk|mahal|society|behind|opp\.?|near)\b",
    re.IGNORECASE,
)


def _is_plausible_address(value: Optional[str]) -> bool:
    """A real postal address contains a place marker (street/area/pin), a comma
    separated locality, or a pincode — an email/phone alone is not an address."""
    if not value:
        return False
    if "@" in value or value.strip().lower().startswith("www."):
        return False
    if re.search(r"\b\d{6}\b", value):
        return True
    if re.search(
        r"\b(?:road|street|lane|nagar|colony|layout|phase|sector|block|village|"
        r"town|city|dist(?:rict)?\.?|taluk|tehsil|post|po\b|area|industrial"
        r"|estate|complex|gali|chowk|chauk|mahal|society)\b",
        value,
        re.IGNORECASE,
    ):
        return True
    return False


def _overlay_dates(pi: ProductInformation, normalized: str) -> ProductInformation:
    """Split packing/manufacturing dates and fill expiry/best-before dates.

    The base extractor maps a single detected date to both packing_date and
    manufacturing_date. When a label prints both, this overlays the correct one
    onto the matching field and leaves the other intact.
    """
    # best before / expiry
    expiry = _EXPIRY_VALUE.search(normalized)
    if expiry and not (pi.expiry_date.value and pi.expiry_date.status == "detected"):
        pi.expiry_date = field(
            value=expiry.group(1),
            status="detected",
            confidence=78.0,
            source="ocr",
        )

    # Packing date: a "PKD"/"PACK DATE"/"PACKED" heading carries the packing date
    match = re.search(
        r"(?:pack(?:ed|ing)?\s*(?:date)?\s*[:.]?|pkd\b\s*[:.]?)\s*"
        r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}[/-]\d{4}|[A-Za-z]{3,9}\s*[-\s]?\d{2,4})",
        normalized,
        re.IGNORECASE,
    )
    if match:
        pi.packing_date = field(
            value=match.group("date"),
            status="detected",
            confidence=80.0,
            source="ocr",
        )

    # Manufacturing date: an explicit MFD/MFG heading
    mfd = re.search(
        r"(?:mfg(?:\.|d)?\b\s*[:.]?|mfd\b\s*[:.]?)\s*"
        r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}[/-]\d{4}|[A-Za-z]{3,9}\s*[-\s]?\d{2,4})",
        normalized,
        re.IGNORECASE,
    )
    if mfd:
        pi.manufacturing_date = field(
            value=mfd.group("date"),
            status="detected",
            confidence=82.0,
            source="ocr",
        )

    return pi


def _overlay_relative_expiry(pi: ProductInformation, normalized: str) -> ProductInformation:
    """Handle relative best-before statements such as 'BEST BEFORE 6 MONTHS'.

    No absolute date is printed, so the relative period itself is recorded as
    the expiry value (never invented) with a mid confidence.
    """
    if pi.expiry_date.status == "detected":
        return pi
    match = _RELATIVE_EXPIRY.search(normalized)
    if not match:
        return pi
    period = match.group("period").strip(" \t.:;")
    pi.expiry_date = field(
        value=period,
        status="detected",
        confidence=70.0,
        source="ocr",
    )
    return pi


_RELATIVE_EXPIRY = re.compile(
    r"(?:^(?:expiry|use\s*by|best\s*before)[ \t:.]*)?"
    r"(?P<period>\d+\s*(?:months?|weeks?|days?|years?)"
    r"(?:\s+from\s+(?:(?:date\s+)?(?:of\s+)?(?:packing|packaging|"
    r"manufacture|manufacturing|production|mfg|mfd)|printing))?)",
    re.IGNORECASE | re.MULTILINE,
)


# ---------------------------------------------------------------------------
# Brand / generic-name overlay
# ---------------------------------------------------------------------------

_GENERIC_TERM = re.compile(
    r"^(?:biscuit|biscuits|cookie|cookies|rice|flour|atta|wheat|sugar|tea|"
    r"salt|oil|cooking\s*oil|juice|noodles|snack|snacks|chocolate|chocolates|"
    r"cake|cakes|bread|namkeen|wafers|chips|soup|sauce|ketchup|spice|spices|"
    r"masala|paneer|butter|milk|ghee|honey|jam|pickle|papad|soap|shampoo|"
    r"detergent|handwash|cream|powder|coffee|drink|chip)$",
    re.IGNORECASE,
)

_DECL_START = re.compile(
    r"^(?:mrp|net\s*(?:wt|weight|qty|quantity)?|manufactur|mfd\b|mfg\b|"
    r"pack(?:ed|ing)?\b|packed|marketed|marketing|distributed|imported|"
    r"importer|ingredient|ingredients|contains?|customer\s*c(?:are)?|"
    r"consumer\s*c(?:are)?|tel(?:ephone)?|email|www|fssai|lic(?:ence)?|"
    r"reg(?:istration)?|best\s*before|use\s*by|expiry|\bexp\b|date\s*of|"
    r"batch|lot\s*no|country\s*of\s*origin|made\s*in|vegetarian|non-?veg|"
    r"brand\s*:|product\s*:|generic\s*:|storage|shelf|contains)"
    r"\b",
    re.IGNORECASE,
)

_TRAILING_PRICE = re.compile(
    r"(?:[₹\u20b9rs.]+[- ]?\d+(?:[.,]\d{1,2})?\s*|(?:^|\s)\d+(?:[.,]\d{1,2})?\s*)$",
    re.IGNORECASE,
)


def _title_candidate_like(value: str) -> bool:
    value = value.strip(" \t.,;:-")
    if not value or len(value) < 3 or len(value) > 50:
        return False
    if len(value.split()) > 7:
        return False
    if _DECL_START.match(value) or _is_plausible_address(value):
        return False
    letters = sum(ch.isalpha() for ch in value)
    if letters < 0.6 * len(value):
        return False
    return True


def _overlay_brand_and_generic(pi: ProductInformation, normalized: str) -> ProductInformation:
    """Best-effort brand/generic from the leading title lines.

    The base extractor only sets the commodity name from an explicit
    'Brand/Product Name' label or a clean first line. When it does not, this
    overlay tries the first few printable lines, rejecting declarations,
    addresses and contact lines, and never inventing a name.
    """
    if pi.brand_or_commodity_name.status == "detected":
        return pi

    candidates = []
    for line in normalized.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if _DECL_START.match(stripped) or _CONTACT_LINE.match(stripped):
            continue
        cleaned = _TRAILING_PRICE.sub("", stripped).strip(" \t-–,;:")
        if not cleaned:
            continue
        candidates.append(cleaned)
        if len(candidates) >= 3:
            break

    brand = None
    generic = None
    for cand in candidates:
        if not _title_candidate_like(cand):
            continue
        if _GENERIC_TERM.fullmatch(cand.strip(" .")):
            if generic is None and pi.generic_name.status != "detected":
                generic = cand
            continue
        if brand is None:
            brand = cand

    if brand:
        pi.brand_or_commodity_name = field(
            value=brand, status="detected", confidence=55.0, source="ocr"
        )
    if generic and pi.generic_name.status == "not_visible":
        pi.generic_name = field(
            value=generic, status="detected", confidence=60.0, source="ocr"
        )
    return pi


_EXPIRY_VALUE = re.compile(
    r"(?:best\s*(?:before|used|by)\s*[:.]?|use\s*by\s*[:.]?|\bexp(?:iry|rs?)\s*[:.]?)\s*"
    r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}[/-]\d{4}|[A-Za-z]{3,9}\s*\d{2,4})",
    re.IGNORECASE,
)


def _overlay_unit_sale_price(pi: ProductInformation, normalized: str) -> ProductInformation:
    """Detect a unit sale price when a price is printed separately from MRP."""
    if pi.unit_sale_price.status == "detected" and pi.unit_sale_price.value:
        return pi
    match = re.search(
        r"(?:unit\s*sale\s*price|usp|sale\s*price|unit\s*price)\s*[:.]?\s*"
        r"(?P<price>\d+(?:[.,]\d{1,2})?)",
        normalized,
        re.IGNORECASE,
    )
    if match:
        price = normalize_mrp(match.group("price"))
        if price is not None:
            pi.unit_sale_price = field(
                value=f"Rs. {match.group('price')}",
                status="detected",
                confidence=72.0,
                source="ocr",
            )
    return pi


def extract_product_with_report(raw_text: str) -> Dict[str, any]:
    """Return ``{raw, normalized, product}`` for diagnostics/testing."""
    normalized = normalize_text(raw_text)
    pi = extract_product(raw_text)
    return {
        "raw_ocr_text": raw_text,
        "normalized_ocr_text": normalized,
        "product": {k: v.model_dump() for k, v in pi.as_dict().items()},
    }


def apply_pipeline_overlays(
    base: ProductInformation, raw_text: str
) -> ProductInformation:
    """Apply the deterministic improvements onto an already-extracted
    ``ProductInformation`` (e.g. from AIService within the scan pipeline).

    Only fields that are still ``not_visible`` are filled, so detected values
    already produced by the base extractor are never overwritten.
    """
    normalized = normalize_text(raw_text)
    pi = base

    pi = _overlay_addresses(pi, normalized)
    pi = _overlay_dates(pi, normalized)
    pi = _overlay_unit_sale_price(pi, normalized)
    pi = _overlay_brand_and_generic(pi, normalized)
    pi = _overlay_relative_expiry(pi, normalized)
    return pi
