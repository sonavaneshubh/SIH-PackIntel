"""OCR text normalization for the PackIntel scan pipeline.

The normalizer turns raw Tesseract OCR output into a form
that the regex extraction layer can parse more reliably, while NEVER altering
the characters of brand or product names.

What it does
------------
* Collapses runs of whitespace but joins fragmented OCR lines back together
  where a line was wrongly split (e.g. "NET\\nWT 79" -> "NET WT 79").
* Removes excessive punctuation/artifacts OCR injects around numbers.
* Normalizes common declaration spellings (MRP / M.R.P / M R P, NET WT /
  NET WEIGHT / NET QTY, MFD / MFG / MANUFACTURED, EXP / EXPIRY /
  BEST BEFORE, BATCH / LOT, FSSAI LIC NO, etc.) to canonical tokens.
* Normalizes currency symbols (₹, Rs, INR) to a single '₹' token.
* Does NOT reorder words or change letters, so brand/product names are
  preserved verbatim.

The original raw OCR text is always returned alongside the normalized copy for
debugging.
"""

import re
from typing import Tuple

# currency / MRP prefix that may appear fragmented: "M R P", "M.R.P", "MRP:"
_CURRENCY_SYMBOL = re.compile(r"(?:Rs\.?|rupees?|INR)\s*", re.IGNORECASE)
_MRP_FRAG = re.compile(
    r"\bM\s*[.\s]*R\s*[.\s]*P\s*[:.]?\b", re.IGNORECASE
)

# quantity epithets OCR may fragment or garble
_NET_WT = re.compile(
    r"\bN\s*\.?\s*E\s*\.?\s*T\s*\.?\s*[.\s]*(?:W\s*\.?\s*T|W\s*E\s*I\s*G\s*H\s*T|"
    r"Q\s*U\s*A\s*N\s*T\s*I\s*T\s*Y|Q\s*T\s*Y)?\b",
    re.IGNORECASE,
)
_MFG = re.compile(
    r"\b(?:M\s*F\s*G|M\s*F\s*D)\b",
    re.IGNORECASE,
)

# Compact spaces OCR inserts around date separators: "23 / 04 / 2026" -> "23/04/2026".
_COMPACT_DATE_SEPS = re.compile(r"(?<=\d)\s*([/-])\s*(?=\d)")
_EXP = re.compile(
    r"\bE\s*X\s*P\s*(?:I\s*R\s*Y)?\b|"
    r"\b(?:B\s*E\s*S\s*T\s*[.\s-]+B\s*E\s*F\s*O\s*R\s*E|U\s*S\s*E\s*[.\s-]+B\s*Y)\b",
    re.IGNORECASE,
)
_BATCH = re.compile(
    r"\bB\s*A\s*T\s*C\s*H\s*(?:N\s*O|N\s*U\s*M\s*B\s*E\s*R)?\b|\bL\s*O\s*T\s*[.\s-]+N\s*O\b",
    re.IGNORECASE,
)
_FSSAI = re.compile(
    r"\bF\s*S\s*S\s*A\s*I\s*[.\s]+(?:L\s*I\s*C\s*E\s*N\s*C\s*E|L\s*I\s*C\s*\.?\s*N\s*O\s*\.?)?\b",
    re.IGNORECASE,
)
_MANUFACTURER_LABEL = re.compile(
    r"\bM\s*A\s*N\s*U\s*F\s*A\s*C\s*T\s*U\s*R\s*E\s*D\s*(?:B\s*Y)?\s*:?\b",
    re.IGNORECASE,
)

_SPACE_PAD_DECL = re.compile(
    r"\b(MRP|NET\s*WT|NET\s*QTY|NET\s*QUANTITY|NET\s*WEIGHT|MFD|MFG|EXP|EXPIRY|"
    r"BATCH\s*NO|LOT\s*NO|FSSAI|LIC\s*NO|REG\s*NO|BEST\s*BEFORE|USE\s*BY|PKD|"
    r"MANUFACTURED\s*BY|PACKED\s*BY)\s*:\s*(?=\S)",
    re.IGNORECASE,
)


def normalize_text(raw_text: str) -> str:
    """Return a normalized copy of ``raw_text`` safe for the extraction layer.

    The original text is never modified in place; the caller keeps the raw copy
    for debugging. Brand/product names are preserved verbatim.
    """
    text = raw_text or ""

    # Unicode equivalents -> plain ASCII the regex layer understands
    text = text.replace("\u20b9", "₹").replace("\u2013", "-").replace("\u2014", "-")
    text = text.replace("\u00a0", " ")
    text = text.replace("\u2022", " ").replace("\u00b7", ".").replace("\uff1a", ":")
    text = _fullwidth_to_ascii(text)

    # Join lines that were split right around a declaration label so that the
    # value following the label stays on one logical line.
    text = _join_labelled_lines(text)

    # Normalize canonical tokens AFTER joining.
    text = _currency_to_token(text)
    text = _canonical_tokens(text)

    # Normalize the label/value spacing (e.g. "MRP : 10" -> "MRP 10").
    text = _SPACE_PAD_DECL.sub(lambda m: m.group(1) + " ", text)

    # Compact spaces OCR inserts around date separators ("23 / 04 / 2026").
    text = _COMPACT_DATE_SEPS.sub(lambda m: m.group(1), text)

    # Collapse whitespace and drop dangling punctuation OCR adds around
    # values without collapsing meaningful inner spaces of product names.
    lines = []
    for line in text.splitlines():
        line = re.sub(r"[ \t]+", " ", line.strip())
        line = line.rstrip(";,:")
        if line:
            lines.append(line)
    return "\n".join(lines)


def _fullwidth_to_ascii(text: str) -> str:
    digits = "".join(chr(code) for code in range(0xFF10, 0xFF1A))
    upper = "".join(chr(code) for code in range(0xFF21, 0xFF3B))
    lower = "".join(chr(code) for code in range(0xFF41, 0xFF5B))
    table = str.maketrans(digits + upper + lower, "0123456789" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + "abcdefghijklmnopqrstuvwxyz")
    return text.translate(table)


def _join_labelled_lines(text: str) -> str:
    """Join a line whose trailing token is a declaration label with the
    following line, and join fragmented labels ('NET' + 'WT', 'M' + 'R P')."""
    lines = text.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""

        if not line:
            i += 1
            continue

        # Join "NET" / "WT 79" and "M R" / "P 10" fragments
        if _is_label_fragment(line) and nxt:
            combined = f"{line} {nxt}"
            # Only actually join when the combined form reads as a known label.
            if _NET_WT.search(combined) or _MRP_FRAG.search(combined) or _BATCH.search(combined) or _FSSAI.search(combined):
                out.append(_join_labelled_lines(combined))
                i += 2
                continue

        # Join a line ending in a bare label with the value on the next line
        if _ends_in_label(line) and nxt:
            out.append(f"{line} {nxt}")
            i += 2
            continue

        out.append(line)
        i += 1
    return "\n".join(out)


_END_LABEL = re.compile(
    r"(?:MFD|MFG|MFR|MANUFACTURED|MANUFACTURER|PKD|PACKED|PACKER|BATCH|LOT|"
    r"FSSAI|EXP|EXPIRY|NET|REGD|REG|LIC(?:ENCE)?|MRP|BEST|USE)$",
    re.IGNORECASE,
)


def _ends_in_label(line: str) -> bool:
    tokens = line.split()
    if not tokens:
        return False
    return bool(_END_LABEL.search(tokens[-1])) or bool(_MRP_FRAG.fullmatch(tokens[-1]))


def _is_label_fragment(line: str) -> bool:
    tokens = line.split()
    if not tokens:
        return False
    last = tokens[-1].lower()
    return last in {
        "m", "m.r", "m.r.p", "mr", "mrp", "net", "mfg", "mfd", "mfgr",
        "manuf", "pack", "batch", "fssai", "exp", "lot", "wt", "weight",
        "qty", "quantity", "lic", "reg",
    }


def _currency_to_token(text: str) -> str:
    """Normalise 'Rs. 650', 'INR 650', '₹650' to '₹ 650'."""
    return _CURRENCY_SYMBOL.sub("₹ ", text)


def _canonical_tokens(text: str) -> str:
    """Map fragmented OCR declaration spellings to canonical tokens."""
    text = _NET_WT.sub("NET WT", text)
    text = _MFG.sub("MFD", text)
    text = _EXP.sub("EXPIRY", text)
    text = _BATCH.sub("BATCH NO", text)
    text = _FSSAI.sub("FSSAI LIC NO", text)
    text = _MANUFACTURER_LABEL.sub("MANUFACTURED", text)
    return text


def normalize_and_report(raw_text: str) -> Tuple[str, str]:
    """Return ``(normalized, raw)``. The raw copy is returned verbatim so
    callers can keep the original text for debugging."""
    return normalize_text(raw_text), raw_text
