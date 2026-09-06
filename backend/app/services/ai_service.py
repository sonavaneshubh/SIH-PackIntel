import re
from typing import Any, Dict, Optional, Tuple

from app.schemas.product import ProductInformation, field
from app.services.normalization import (
    normalize_email,
    normalize_phone,
    normalize_quantity,
)
from app.services.text_normalizer import normalize_text

_DECL_FIELDS = (
    "manufacturer_name",
    "marketer_name",
    "packer_name",
    "importer_name",
    "commodity_name",
    "common_generic_name",
    "net_quantity",
    "mrp",
    "mfg_date",
    "month_year_packed",
    "consumer_care",
    "customer_care_details",
    "country_of_origin",
    "other_declarations",
)

# A line that starts with one of these tokens is treated as the beginning of
# another declaration, i.e. a hard stop for the current field's value.
_STOP_LINE = re.compile(
    r"^\s*(?:mrp|net\s*(?:qty|q\b|quantity|wt|weight|contents)|manufactur(?:er|ed|ing)?\b"
    r"|pack(?:ed|er|ing)?\b|importer|import(?:ed)?\s*by|country\s*of\s*origin|made\s*in"
    r"|consumer\s*care|customer\s*c(?:are)?|email\s*[:.]?|tel(?:ephone)?\s*[:.]?|contact\s*[:.]?"
    r"|market(?:ed|ing)|distributed|vegetarian|non-?vegetarian|batch|lot\s*(?:no|number)?"
    r"|fssai|lic(?:ence)?\s*no|reg(?:istration)?\s*no"
    r"|best\s*before|use\s*by|expiry|mfg(?:\.|d)?\s*:?|mfd\s*:?"
    r"|date\s*of\s*(?:manufacture|pack(?:ing|ed)?)"
    r"|product|commodity|generic|max\s*retail|batch\s*(?:no|number)"
    r"|veg|non-?veg|e%\s*&?\s*145)"
    r"\b",
    re.IGNORECASE,
)

# A line that reads like a postage address (street number/name, PIN, area
# marker). When it follows an entity-name line it terminates that field, so a
# name never absorbs the following address block.
_ADDRESS_STOP_LINE = re.compile(
    r"^\s*(?:"
    r"\d{1,4}\s+(?:[A-Za-z]+\.?\s+)+"  # 12 MG Road ...
    r"|(?:village|town|city|dist\.?|district|taluk(?:a)?|tehsil|colony|layout|"
    r"nagar|road|street|st\b|lane|phase|sector|block|plot|gali|post|po\b|"
    r"gpo|pin|tal|behind|opp\.?)\b"
    r"|\w+(?:\s*[.,;]?)\s+\w+\s*[-–]\s*\d{5,6}"  # Bhuj, Gujarat-370220 / Anand, Gujarat-388001
    r"|\d{6})",
    re.IGNORECASE,
)

# Inline labels (value follows on the same line or the next lines).
_MFG_INLINE = re.compile(
    r"(?:manufactur(?:er|ed|ing)?\s*(?:by|:|at)|mfg\.?\s*by|manufactured)", re.IGNORECASE
)
_PACK_INLINE = re.compile(
    r"(?:pack(?:ed|er|ing)?\s*(?:by|:|at)|packer\s*(?:by)?\s*[:)]?)", re.IGNORECASE
)
_IMPORT_LEAD = re.compile(
    r"(?:importer(?:s)?\s*(?:by|:)|import(?:ed)?\s*(?:by|at))", re.IGNORECASE
)
_MARKETER_LEAD = re.compile(
    r"(?:marketed\s*(?:and|&)\s*distributed\s*by|marketed\s*by|marketing\s*by|distributed\s*by|marketing\s*company)\s*[:.]?",
    re.IGNORECASE,
)
_CARE_LEAD = re.compile(
    r"(?:consumer\s*c(?:are)?\s*[:.]?|customer\s*c(?:are)?\s*[:.]?)", re.IGNORECASE
)
_NAME_LEAD = re.compile(
    r"(?:product\b\s*(?:name)?\s*[:.]?|commodity(?:y|\s*name)?\s*[:.]?|generic\s*(?:designation|name)?\s*[:.]?)",
    re.IGNORECASE,
)
_BRAND_LEAD = re.compile(r"brand\s*(?:name)?\s*[:.]?", re.IGNORECASE)
_QTY_LEAD = re.compile(r"(?:net\s*(?:qty|quantity|wt|weight|contents?)|quantity)\s*[:.]?", re.IGNORECASE)
_MRP_LEAD = re.compile(
    r"(?:mrp\s*[:.]?|max\s*retail\s*price\s*[:.]?|maximum\s*retail\s*price\s*[:.]?|retail\s*price\s*[:.]?)",
    re.IGNORECASE,
)
_DATE_LEAD = re.compile(
    r"(?:mfg(?:\.|d)?\b\s*[:.]?|mfd\b\s*[:.]?"
    r"|manufactur(?:e|ed|ing)?\b(?:\s*(?:date|on)\b)?(?!\s*by\b)\s*[:.]?"
    r"|pack(?:ed|ing)?\b\s*(?:date)?\s*[:.]?|pkd\b\s*[:.]?"
    r"|date\s*of\s*(?:manufacture|pack(?:ing|ed)?)\s*[:.]?)",
    re.IGNORECASE,
)
_ORIGIN_LEAD = re.compile(
    r"(?:country\s*of\s*origin\s*[:.]?|made\s*in\s*[:.]?|origin\s*[:.]?)", re.IGNORECASE
)

# Line-start labels where the value follows a bare heading (e.g. "MANUFACTURER X").
_MFG_LINE = re.compile(r"^\s*manufactur(?:er|ed)?(?:\s*by)?[ \t]*[:.]?[ \t]+", re.IGNORECASE | re.MULTILINE)
_PACK_LINE = re.compile(
    r"^\s*(?:pack(?:ed|ing)\s*(?:by|at)|packer(?:\s*by)?)\s*[:.]?[ \t]+",
    re.IGNORECASE | re.MULTILINE,
)

_QUANTITY_VALUE = re.compile(
    r"(?P<num>\d+(?:[.,]\d+)?)(?:\s*x\s*\d+)?\s*"
    r"(?P<unit>kilograms?|kgs?|grams?|gms?|g\b|lit(?:re|res|er|ers)|ltrs?|ml|millil(?:itres|iters)|pcs|pieces|units?|n\b)",
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

_PRICE_VALUE = re.compile(r"(?P<price>\d+(?:[.,]\d{1,2})?)")
_DATE_VALUE = re.compile(
    r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}[/-]\d{4}|"
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|"
    r"aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*(?:19|20)\d{2})",
    re.IGNORECASE,
)
_TAX_NOTE = re.compile(r"\b(?:incl(?:usive)?\.?\s*of\s*all\s*taxes?|incl\.?)\b", re.IGNORECASE)

_EXPIRY_VALUE = re.compile(
    r"(?:best\s*(?:before|used|by)\s*[:.]?|use\s*by\s*[:.]?|\bexp(?:iry|rs?)\s*[:.]?)"
    r"\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}[/-]\d{4}|[A-Za-z]{3,9}\s*\d{2,4})",
    re.IGNORECASE,
)

_DECL_NOTES = re.compile(
    r"(?:fssai|lic(?:ence)?\s*no\.?|reg(?:istration)?\s*no\.?|batch(?:-|\s)?(?:no|number)?\.?"
    r"|best\s*before|use\s*by|storage|shelf\s*life|contains|allergen|veg|non-?veg|e%\s*&?\s*145)"
    r".*",
    re.IGNORECASE,
)

_TITLE_NOISE = re.compile(
    r"(?:mrp|rs\.?\s*\d|net\s*(?:qty|quantity|wt)|manufactur|pack(?:ed|er)?\s*by|import(?:ed)?\s*by"
    r"|consumer|customer|country|made\s*in|fssai|tel|phone|www|@|e%\s*&|max\s*retail"
    r"|fitness|consumption|registration|design|without\s+affecting|license|licence|printed"
    r"|marketed|distributed|vegetarian|non-?vegetarian|batch|lot)",
    re.IGNORECASE,
)

_EMAIL_VALUE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_VALUE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
_BATCH_VALUE = re.compile(
    r"\b(?:batch|lot)\s*(?:no|number)?\.?\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9/\-_.]*)\b", re.IGNORECASE
)
_VEG_MARK = re.compile(
    r"(?<!non)(?<!non[\- ])\bveg(?:etarian)?\s*(?:mark|symbol)?|pure\s+veg",
    re.IGNORECASE,
)
_NONVEG_MARK = re.compile(r"non-?veg(?:etarian)?\s*(?:mark|symbol)?", re.IGNORECASE)
_FSSAI_LINE = re.compile(
    r"fssai\s*(?:lic(?:ence)?\.?\s*(?:no\.?)?)?\s*[:.]?\s*"
    r"([A-Za-z0-9][A-Za-z0-9./\-]*(?:\s+\d[A-Za-z0-9./\-]*)?)",
    re.IGNORECASE,
)

# Country of origin is almost always a short alpha phrase on one line. OCR
# frequently garbles the vegetarian/non-vegetarian mark that follows it (e.g.
# "Ve ek"), and that noise must never bleed into the extracted country value.
_COUNTRY_PREFIX = re.compile(
    r"^(?:made\s+in|product\s+of|imported\s+(?:from|by)|packed\s+in|manufactured\s+in)\s+",
    re.IGNORECASE,
)
_COUNTRY_STOP = re.compile(
    r"\s+(?=ve\b|vy\b|wy\b|oe\b|mark\b|symbol\b|veg(?:etarian)?\b|non-?veg(?:etarian)?\b|"
    r"fssai\b|lic(?:ence)?\b|batch\b|lot\b|mfg\b|mfd\b|packed\b|best\b|use\s+by\b)",
    re.IGNORECASE,
)
_CERTS = {
    "iso": re.compile(r"ISO\s*\s*9001|ISO\s*22000|ISO\s*14001", re.IGNORECASE),
    "agmark": re.compile(r"AGMARK", re.IGNORECASE),
    "bis": re.compile(r"\bBIS\b|\bISI\b"),
    "fpo": re.compile(r"\bFPO\b"),
}


def _normalize(text: str) -> str:
    text = text or ""
    text = text.replace("\u20b9", "₹").replace("\u2013", "-").replace("\u2014", "-")
    text = text.replace("\u00a0", " ")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def _normalize_quantity(value: str) -> str:
    m = _QUANTITY_VALUE.fullmatch(value.strip())
    if m:
        num = m.group("num").rstrip(".")
        unit = _UNIT_NORM.get(m.group("unit").lower())
        if unit:
            return f"{num} {unit}"
    return value.strip()


def _title_candidate(value: str) -> bool:
    if not value or len(value) < 4 or len(value) > 60:
        return False
    if _TITLE_NOISE.search(value):
        return False
    letters = sum(c.isalpha() for c in value)
    if letters < 0.7 * len(value):
        return False
    if sum(c.isdigit() for c in value) > 2:
        return False
    if len(value.split()) > 6:
        return False
    return True


def _grab_value(text: str, label: re.Pattern, max_lines: int = 3, max_chars: int = 90) -> Optional[str]:
    """Return the value following `label`, bounded by the next declaration label."""
    for m in label.finditer(text):
        rest = text[m.end():]
        chunks = []
        for line in rest.splitlines()[: max_lines + 1]:
            line = re.sub(r"[ \t]+", " ", line.strip())
            if not chunks and not line:
                continue
            if chunks and (not line or _STOP_LINE.match(line) or _ADDRESS_STOP_LINE.match(line)):
                break
            chunks.append(line)
            if len(" ".join(chunks)) >= max_chars:
                break
        value = re.sub(r"\s+", " ", " ".join(chunks)).strip(" ,;:-")
        if value and len(value) < 2:
            continue
        if value:
            return value
    return None


def _country_from_origin(value: Optional[str]) -> Optional[str]:
    """Return a clean country name from an origin line, ignoring OCR noise.

    Only the first line is considered and any trailing OCR garbage (typically
    a garbled vegetarian/non-vegetarian mark on the following/garbled line) is
    cut off. Non-alpha or overly long residues are rejected outright."""
    if not value:
        return None
    first = value.splitlines()[0].strip(" \t.,;:-")
    if not first:
        return None
    first = re.sub(r"[.,;:]+$", "", first)
    first = _COUNTRY_PREFIX.sub("", first).strip()
    first = _COUNTRY_STOP.split(first, maxsplit=1)[0].strip(" \t.,;:-")
    if not first or len(first) > 40:
        return None
    words = first.split()
    if not words or len(words) > 6 or any(len(w) < 2 or not w.isalpha() for w in words):
        return None
    return " ".join(words)


def _extract_fssai(value: Optional[str]) -> Optional[str]:
    """Return the 14-digit FSSAI licence number from a noisy OCR token run.

    Tesseract commonly renders 0 as O inside FSSAI numbers; the substitution
    is only accepted when the result is exactly 14 digits, so it can never
    pad or invent digits."""
    candidate = (value or "").strip()
    digits = re.sub(r"[^\d]", "", candidate)
    if len(digits) == 14:
        return digits
    digits_o = re.sub(r"[^\d]", "", re.sub(r"[Oo]", "0", candidate))
    return digits_o if len(digits_o) == 14 else None


class AIService:
    @staticmethod
    def extract_with_confidence(
        raw_text: str, ocr_confidence: Optional[float] = None
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """Extract declarations with bounded, label-anchored rules plus confidence."""
        text = _normalize(raw_text)
        fields: Dict[str, Any] = {key: None for key in _DECL_FIELDS}
        conf: Dict[str, float] = {key: 0.0 for key in _DECL_FIELDS}

        def _set(key, value, confidence):
            if value:
                fields[key] = value
                conf[key] = min(95.0, max(0.0, confidence))

        raw_mfg = _grab_value(text, _MFG_INLINE) or _grab_value(text, _MFG_LINE)
        if raw_mfg and _DATE_VALUE.fullmatch(raw_mfg.strip()):
            raw_mfg = None
        if raw_mfg:
            _set("manufacturer_name", raw_mfg, 78.0 if len(raw_mfg) >= 6 else 70.0)

        raw_pkr = _grab_value(text, _PACK_INLINE) or _grab_value(text, _PACK_LINE)
        if raw_pkr:
            _set("packer_name", raw_pkr, 74.0 if len(raw_pkr) >= 6 else 66.0)

        raw_imp = _grab_value(text, _IMPORT_LEAD)
        if raw_imp:
            _set("importer_name", raw_imp, 72.0 if len(raw_imp) >= 4 else 64.0)

        raw_marketer = _grab_value(text, _MARKETER_LEAD)
        if raw_marketer:
            raw_marketer = re.split(
                r"\s+(?=[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|"
                r"\s+(?=(?:vegetarian|non-?vegetarian|batch|lot)\b)",
                raw_marketer,
                maxsplit=1,
                flags=re.IGNORECASE,
            )[0].strip()
            _set("marketer_name", raw_marketer, 80.0 if len(raw_marketer) >= 6 else 70.0)

        raw_care = _grab_value(text, _CARE_LEAD)
        if raw_care:
            _set("consumer_care", raw_care, 70.0 if len(raw_care) >= 6 else 62.0)
            _set("customer_care_details", raw_care, conf["consumer_care"])

        quantity_match = re.search(
            r"(?:net\s*(?:qty|quantity|weight|wt|contents?)|quantity)\s*[:.]?\s*"
            r"(?P<quantity>\d+(?:[.,]\d+)?\s*(?:kilograms?|kgs?|grams?|gms?|g\b|lit(?:re|res|er|ers)|ltrs?|ml|millil(?:itres|iters)|pcs|pieces|units?|n\b))",
            text,
            re.IGNORECASE,
        )
        if quantity_match:
            _set("net_quantity", _normalize_quantity(quantity_match.group("quantity")), 82.0)

        mrp = None
        mrp_conf = 80.0
        rm = _MRP_LEAD.search(text)
        if rm:
            pm = _PRICE_VALUE.search(text[rm.end():])
            if pm:
                mrp = f"Rs. {pm.group('price')}"
        if not mrp:
            currency = re.search(
                r"(?<![A-Za-z])(?:rs\.?|rupees?|₹)\s*(?P<price>\d+(?:[.,]\d{1,2})?)",
                text,
                re.IGNORECASE,
            )
            if currency:
                mrp = f"Rs. {currency.group('price')}"
                mrp_conf = 70.0
        if mrp:
            if _TAX_NOTE.search(text):
                mrp += " (Incl. of all taxes)"
            _set("mrp", mrp, mrp_conf)

        raw_date = _grab_value(text, _DATE_LEAD)
        if raw_date:
            dm = _DATE_VALUE.search(raw_date)
            if dm:
                _set("mfg_date", dm.group("date"), 84.0)
                _set("month_year_packed", dm.group("date"), 84.0)

        raw_brand = _grab_value(text, _BRAND_LEAD, max_lines=1)
        raw_name = _grab_value(text, _NAME_LEAD)
        first_line = next((ln for ln in text.splitlines() if ln.strip()), "")
        title = first_line.strip() if _title_candidate(first_line) else None
        # Brand/commodity name: the prominent first line when it is a real title,
        # otherwise an explicit product/commodity/generic name line.
        if raw_brand and _title_candidate(raw_brand):
            _set("commodity_name", raw_brand, 78.0)
        elif title:
            _set("commodity_name", title, 55.0)
        elif raw_name:
            _set("commodity_name", raw_name, 75.0 if len(raw_name) >= 5 else 66.0)
        # Generic/common designation: the explicit name line if present, else the title.
        if raw_name and _title_candidate(raw_name):
            _set("common_generic_name", raw_name, 75.0 if len(raw_name) >= 5 else 66.0)
        elif title and re.fullmatch(
            r"(?i)(?:biscuit|biscuits|cookie|cookies|rice|flour|atta|wheat|sugar|tea|salt|oil|juice|noodles|snack)s?",
            title,
        ):
            _set("common_generic_name", title, 60.0)

        raw_origin = _grab_value(text, _ORIGIN_LEAD, max_lines=0)
        co = _country_from_origin(raw_origin) if raw_origin else None
        if co:
            _set("country_of_origin", co, 78.0)

        notes = []
        seen = set()
        for line in text.splitlines():
            stripped = line.strip()
            if _DECL_NOTES.match(stripped) and stripped.lower() not in seen:
                notes.append(stripped)
                seen.add(stripped.lower())
            if len(notes) >= 8:
                break
        if notes:
            _set("other_declarations", "\n".join(notes), 65.0)

        found = [k for k in _DECL_FIELDS if fields[k]]
        if not found:
            return fields, {"overall": 0.0, "fields": conf}

        mean_present = sum(conf[k] for k in found) / len(found)
        coverage = len(found) / len(_DECL_FIELDS)
        overall = 0.6 * mean_present + 0.4 * (100.0 * coverage)
        if ocr_confidence is not None:
            overall = 0.7 * overall + 0.3 * ocr_confidence
        return fields, {"overall": round(overall, 1), "fields": conf}

    @staticmethod
    def extract_declarations(raw_text: str) -> Dict[str, Any]:
        fields, _ = AIService.extract_with_confidence(raw_text)
        return fields

    @classmethod
    def extract_product_information(
        cls, raw_text: str, ocr_confidence: Optional[float] = None
    ) -> Tuple[ProductInformation, Dict[str, Any]]:
        """Extract the canonical ProductInformation schema from OCR text.

        Every field carries value/status/confidence/source. Fields the OCR
        pipeline cannot read are marked 'not_visible' — never 'not_printed',
        because a text pass cannot prove absence from the artwork.

        The raw OCR text is normalized first (see text_normalizer) so that
        declaration labels (MRP, NET WT, MFD/EXP, FSSAI, currency) survive
        OCR fragmentation/spacing errors, while brand/product names are left
        untouched, then passed through the dedicated extraction layer.
        """
        normalized = normalize_text(raw_text)
        fields, conf = cls.extract_with_confidence(
            normalized, ocr_confidence=ocr_confidence
        )
        return build_product_information(fields, conf, normalized), conf


def build_product_information(
    fields: Dict[str, Any], conf: Dict[str, Any], raw_text: str
) -> ProductInformation:
    """Map the flat declaration extraction onto the canonical schema."""
    raw_text = raw_text or ""
    field_conf = conf.get("fields", {}) if isinstance(conf, dict) else {}

    def ocr_value(raw_value: Any, key: str, confidence: float, source: str = "ocr") -> Any:
        if raw_value:
            return field(
                value=str(raw_value).strip(),
                status="detected",
                confidence=min(95.0, max(0.0, confidence)),
                source=source,
            )
        return field(status="not_visible", confidence=0.0, source="none")

    def present(raw_value: Any) -> bool:
        return bool(raw_value and str(raw_value).strip())

    def mfg_name() -> Optional[str]:
        for key in ("manufacturer_name", "importer_name", "packer_name"):
            value = fields.get(key)
            if present(value):
                return str(value).strip()
        return None

    qty = ocr_value(
        fields.get("net_quantity"), "net_quantity", field_conf.get("net_quantity", 80.0)
    )
    quant_value, quant_unit = (None, None)
    if present(qty.value):
        quant_value, quant_unit = normalize_quantity(str(qty.value))

    mrp = ocr_value(fields.get("mrp"), "mrp", field_conf.get("mrp", 80.0))
    tax_note = "incl" in str(mrp.value or "").lower() if present(mrp.value) else False

    care = str(
        fields.get("customer_care_details") or fields.get("consumer_care") or ""
    ).strip()
    care_conf = max(
        float(field_conf.get("consumer_care", 0.0)),
        float(field_conf.get("customer_care_details", 0.0)),
    )
    phone_match = _PHONE_VALUE.search(care)
    phone = normalize_phone(phone_match.group(0)) if phone_match else None
    toll_free = phone if phone and re.fullmatch(r"\+?1?800[\d\s().-]{6,18}", phone) else None

    batch_match = _BATCH_VALUE.search(raw_text)
    batch_value = batch_match.group(1).strip() if batch_match else None
    if batch_value and (
        not any(character.isdigit() for character in batch_value)
        or batch_value.lower() in {"printed", "print", "label", "package", "product"}
    ):
        batch_value = None
    email_match = _EMAIL_VALUE.search(raw_text)
    expiry_match = _EXPIRY_VALUE.search(raw_text)
    expiry = expiry_match.group(1) if expiry_match else None

    veg_mark = bool(_VEG_MARK.search(raw_text))
    nonveg_mark = bool(_NONVEG_MARK.search(raw_text))

    fssai_match = _FSSAI_LINE.search(raw_text)
    fssai_number = _extract_fssai(fssai_match.group(1)) if fssai_match else None

    certs = []
    for name, pattern in _CERTS.items():
        match = pattern.search(raw_text)
        if not match:
            continue
        nearby = raw_text[match.start(): match.end() + 45].lower()
        if name == "bis" and re.search(r"design\s+registration|registration\s+(?:no|number)", nearby):
            continue
        if name == "bis" and not re.search(r"\b(?:certified|certification|mark|conforms\s+to)\b", nearby):
            continue
        certs.append(name.upper())

    commodity = fields.get("commodity_name")
    generic = fields.get("common_generic_name")
    packed = fields.get("month_year_packed")
    manufactured = fields.get("mfg_date")

    pi = ProductInformation(
        brand_or_commodity_name=ocr_value(
            commodity, "commodity_name", field_conf.get("commodity_name", 70.0)
        ),
        generic_name=ocr_value(
            generic, "common_generic_name", field_conf.get("common_generic_name", 70.0)
        ),
        net_quantity=qty,
        quantity_unit=field(
            value=quant_unit,
            status="detected" if quant_unit else "not_visible",
            confidence=max(0.0, qty.confidence - 8.0) if quant_unit else 0.0,
            source="ocr" if quant_unit else "none",
        ),
        manufacturer_name=ocr_value(
            mfg_name(), "manufacturer_name", field_conf.get("manufacturer_name", 74.0)
        ),
        manufacturer_address=field(status="not_visible", source="none"),
        packer_name=ocr_value(
            fields.get("packer_name"), "packer_name", field_conf.get("packer_name", 70.0)
        ),
        packer_address=field(status="not_visible", source="none"),
        marketer_name=ocr_value(
            fields.get("marketer_name"), "marketer_name", field_conf.get("marketer_name", 80.0)
        ),
        marketer_address=field(status="not_visible", source="none"),
        mrp=mrp,
        mrp_tax_inclusive=(
            field(value="Yes", status="detected", confidence=max(0.0, mrp.confidence - 5.0), source="ocr")
            if tax_note
            else field(status="not_visible", source="none")
        ),
        unit_sale_price=field(status="not_visible", source="none"),
        packing_date=ocr_value(
            packed, "month_year_packed", field_conf.get("month_year_packed", 82.0)
        ),
        manufacturing_date=ocr_value(
            manufactured, "mfg_date", field_conf.get("mfg_date", 82.0)
        ),
        expiry_date=(
            field(value=expiry, status="detected", confidence=80.0, source="ocr")
            if expiry
            else field(status="not_visible", source="none")
        ),
        batch_number=(
            field(
                value=batch_value,
                status="detected",
                confidence=70.0,
                source="ocr",
            )
            if batch_value
            else field(status="not_visible", source="none")
        ),
        customer_care_name=field(status="not_visible", source="none"),
        customer_care_phone=(
            field(value=phone, status="detected", confidence=max(0.0, care_conf), source="ocr")
            if phone
            else field(status="not_visible", source="none")
        ),
        toll_free_number=(
            field(value=toll_free, status="detected", confidence=max(0.0, care_conf), source="ocr")
            if toll_free
            else field(status="not_visible", source="none")
        ),
        customer_care_email=(
            field(
                value=normalize_email(email_match.group(0)) or "",
                status="detected",
                confidence=80.0,
                source="ocr",
            )
            if email_match
            else field(status="not_visible", source="none")
        ),
        country_of_origin=ocr_value(
            fields.get("country_of_origin"), "country_of_origin", field_conf.get("country_of_origin", 76.0)
        ),
        vegetarian_mark=(
            field(value="Present", status="detected", confidence=68.0, source="ocr")
            if veg_mark
            else field(status="not_visible", source="none")
        ),
        non_vegetarian_mark=(
            field(value="Present", status="detected", confidence=68.0, source="ocr")
            if nonveg_mark
            else field(status="not_visible", source="none")
        ),
        fssai_number=(
            field(value=fssai_number, status="detected", confidence=78.0, source="ocr")
            if fssai_number
            else field(status="not_visible", source="none")
        ),
        certifications=(
            field(value=", ".join(certs), status="detected", confidence=72.0, source="ocr")
            if certs
            else field(status="not_visible", source="none")
        ),
    )
    return pi


def get_ai_service() -> AIService:
    """Factory function to get configured AI service."""
    return AIService()