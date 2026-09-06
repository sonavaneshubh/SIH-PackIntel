"""Phase 2 benchmark harness.

Renders 10 synthetic Indian packaged-commodity labels (PIL), runs the real
OCR -> canonical extraction -> (vision) -> merge -> compliance pipeline, and
writes a field-level accuracy report comparing extracted values against a known
ground truth.

Usage (from backend/):  python scripts/benchmark_phase2.py

Vision is invoked automatically when VISION_API_KEY/OPENAI_API_KEY is set;
otherwise the report records OCR-only results and notes the gap.
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
sys.path.insert(0, str(BACKEND))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from app.services.ai_service import AIService  # noqa: E402
from app.services.compliance_service import ComplianceService  # noqa: E402
from app.services.merge_service import merge_sources  # noqa: E402
from app.services.normalization import values_differ  # noqa: E402
from app.services.ocr_service import get_ocr_service  # noqa: E402
from app.services.vision_service import VisionExtractionError, VisionService  # noqa: E402
from app.core.config import settings  # noqa: E402

OUT_DIR = HERE / "benchmark_images"
REPORT = HERE / "benchmark_report_phase2.md"

FONT_DIR = Path(r"C:\Windows\Fonts")
_FONT = str(FONT_DIR / "arial.ttf")
_FONT_BOLD = str(FONT_DIR / "arialbd.ttf")

# Canonical fields this pipeline is expected to extract from OCR (rest requires vision).
EXPECTED_KEYS = (
    "brand_or_commodity_name",
    "generic_name",
    "net_quantity",
    "quantity_unit",
    "manufacturer_name",
    "packer_name",
    "mrp",
    "packing_date",
    "manufacturing_date",
    "expiry_date",
    "batch_number",
    "customer_care_phone",
    "toll_free_number",
    "customer_care_email",
    "country_of_origin",
    "vegetarian_mark",
    "non_vegetarian_mark",
    "fssai_number",
    "certifications",
)

BaseCase = Tuple[str, str, List[str], Dict[str, str]]

CASES: List[BaseCase] = [
    (
        "basmati-rice",
        "Harvest Gold",
        [
            "HARVEST GOLD",
            "BIRYANI BASMATI RICE",
            "Generic Name: Basmati Rice",
            "Net Quantity: 5 kg",
            "MRP : Rs. 1099",
            "Batch No. B2026001",
            "Packed: 01/2026",
            "Best Before: 01/2028",
            "Manufactured by: Kohinoor Rice Co. Ltd",
            "Customer Care: 1800-258-7410",
            "Country of Origin: India",
            "Vegetarian Mark",
            "FSSAI Lic. No. 10012034000123",
        ],
        {
            "brand_or_commodity_name": "HARVEST GOLD",
            "generic_name": "Basmati Rice",
            "net_quantity": "5 kg",
            "quantity_unit": "kg",
            "manufacturer_name": "Kohinoor Rice Co. Ltd",
            "mrp": "Rs. 1099",
            "packing_date": "01/2026",
            "expiry_date": "01/2028",
            "batch_number": "B2026001",
            "customer_care_phone": "1800-258-7410",
            "toll_free_number": "1800-258-7410",
            "country_of_origin": "India",
            "vegetarian_mark": "Present",
            "fssai_number": "10012034000123",
        },
    ),
    (
        "whole-wheat-atta",
        "Annapurna",
        [
            "ANNAPURNA",
            "Whole Wheat Atta",
            "Generic Name: Wheat Flour",
            "Net Quantity: 500 g",
            "MRP : Rs. 95",
            "Batch No. A2205184",
            "MFD: 12/2025",
            "Best Before: 03/2028",
            "Manufactured by: Annapurna Mills Pvt Ltd",
            "Packed by: Annapurna Mills Pvt Ltd",
            "Customer Care: 1800-425-8890",
            "Country of Origin: India",
            "Vegetarian Mark",
            "FSSAI Lic. No. 10014002000234",
        ],
        {
            "brand_or_commodity_name": "ANNAPURNA",
            "generic_name": "Wheat Flour",
            "net_quantity": "500 g",
            "quantity_unit": "g",
            "manufacturer_name": "Annapurna Mills Pvt Ltd",
            "packer_name": "Annapurna Mills Pvt Ltd",
            "mrp": "Rs. 95",
            "manufacturing_date": "12/2025",
            "expiry_date": "03/2028",
            "batch_number": "A2205184",
            "customer_care_phone": "1800-425-8890",
            "toll_free_number": "1800-425-8890",
            "country_of_origin": "India",
            "vegetarian_mark": "Present",
            "fssai_number": "10014002000234",
        },
    ),
    (
        "sweet-biscuits",
        "NutriBite",
        [
            "NUTRIDITE",
            "Sweet Biscuits",
            "Generic Name: Biscuit",
            "Net Quantity: 150 g",
            "MRP : Rs. 25",
            "Batch No. B2411-882",
            "MFD: 11/2025",
            "Best Before: 09/2026",
            "Manufactured by: Bisquick Foods Industries",
            "Customer Care: 1800-103-4555",
            "Country of Origin: India",
            "Vegetarian Mark",
            "FSSAI Lic. No. 10021004000345",
            "Certified ISO 22000",
        ],
        {
            "brand_or_commodity_name": "NUTRIDITE",
            "generic_name": "Biscuit",
            "net_quantity": "150 g",
            "quantity_unit": "g",
            "manufacturer_name": "Bisquick Foods Industries",
            "mrp": "Rs. 25",
            "manufacturing_date": "11/2025",
            "expiry_date": "09/2026",
            "batch_number": "B2411-882",
            "customer_care_phone": "1800-103-4555",
            "toll_free_number": "1800-103-4555",
            "country_of_origin": "India",
            "vegetarian_mark": "Present",
            "fssai_number": "10021004000345",
            "certifications": "iso",
        },
    ),
    (
        "cola-bottle",
        "CoolFizz",
        [
            "COOLFIZZ",
            "Carbonated Soft Drink",
            "Generic Name: Soft Drink",
            "Net Quantity: 750 ml",
            "MRP : Rs. 40 (Incl. of all taxes)",
            "Batch No. F250104",
            "Packed: 05/2026",
            "Best Before: 05/2027",
            "Manufactured by: Fizzino Beverages Ltd",
            "Customer Care: 1800-266-1901",
            "Email: care@coolfizz.in",
            "Country of Origin: India",
            "Vegetarian Mark",
            "FSSAI Lic. No. 10032005000456",
        ],
        {
            "brand_or_commodity_name": "COOLFIZZ",
            "generic_name": "Soft Drink",
            "net_quantity": "750 ml",
            "quantity_unit": "ml",
            "manufacturer_name": "Fizzino Beverages Ltd",
            "mrp": "Rs. 40",
            "mrp_tax_inclusive": "Yes",
            "packing_date": "05/2026",
            "expiry_date": "05/2027",
            "batch_number": "F250104",
            "customer_care_phone": "1800-266-1901",
            "toll_free_number": "1800-266-1901",
            "customer_care_email": "care@coolfizz.in",
            "country_of_origin": "India",
            "vegetarian_mark": "Present",
            "fssai_number": "10032005000456",
        },
    ),
    (
        "mustard-oil",
        "Sarson Gold",
        [
            "SARSON GOLD",
            "Kachi Ghani Mustard Oil",
            "Generic Name: Mustard Oil",
            "Net Quantity: 1 Litre",
            "MRP : Rs. 215",
            "Batch No. O20251209",
            "Packed: 02/2026",
            "Best Before: 01/2027",
            "Manufactured by: Shudh Oil Mills",
            "Customer Care: 1800-180-1010",
            "Country of Origin: India",
            "Vegetarian Mark",
            "FSSAI Lic. No. 10041006000567",
            "AGMARK Certified",
        ],
        {
            "brand_or_commodity_name": "SARSON GOLD",
            "generic_name": "Mustard Oil",
            "net_quantity": "1 Litre",
            "quantity_unit": "l",
            "manufacturer_name": "Shudh Oil Mills",
            "mrp": "Rs. 215",
            "packing_date": "02/2026",
            "expiry_date": "01/2027",
            "batch_number": "O20251209",
            "customer_care_phone": "1800-180-1010",
            "toll_free_number": "1800-180-1010",
            "country_of_origin": "India",
            "vegetarian_mark": "Present",
            "fssai_number": "10041006000567",
            "certifications": "agmark",
        },
    ),
    (
        "potato-chips",
        "Crunch",
        [
            "CRUNCH",
            "Potato Chips",
            "Generic Name: Savory Snacks",
            "Net Quantity: 250 g",
            "MRP : Rs. 40",
            "Batch No. C552-1018",
            "Packed: 03/2026",
            "Best Before: 09/2026",
            "Manufactured by: Crispo Snack Foods",
            "Customer Care: 1800-120-3030",
            "Country of Origin: India",
            "Non-Vegetarian Mark",
            "FSSAI Lic. No. 10036007000678",
            "Certified FPO",
        ],
        {
            "brand_or_commodity_name": "CRUNCH",
            "generic_name": "Savory Snacks",
            "net_quantity": "250 g",
            "quantity_unit": "g",
            "manufacturer_name": "Crispo Snack Foods",
            "mrp": "Rs. 40",
            "packing_date": "03/2026",
            "expiry_date": "09/2026",
            "batch_number": "C552-1018",
            "customer_care_phone": "1800-120-3030",
            "toll_free_number": "1800-120-3030",
            "country_of_origin": "India",
            "non_vegetarian_mark": "Present",
            "fssai_number": "10036007000678",
            "certifications": "fpo",
        },
    ),
    (
        "tur-dal",
        "Dhara",
        [
            "DHARA",
            "Tur Dal",
            "Generic Name: Pulses",
            "Net Quantity: 1 kg",
            "MRP : Rs. 160",
            "Batch No. PD22031",
            "Packed: 01/2026",
            "Best Before: 01/2027",
            "Manufactured by: Agro Foods India Ltd",
            "Customer Care: 1800-209-1155",
            "Country of Origin: India",
            "Vegetarian Mark",
            "FSSAI Lic. No. 10049008000789",
        ],
        {
            "brand_or_commodity_name": "DHARA",
            "generic_name": "Pulses",
            "net_quantity": "1 kg",
            "quantity_unit": "kg",
            "manufacturer_name": "Agro Foods India Ltd",
            "mrp": "Rs. 160",
            "packing_date": "01/2026",
            "expiry_date": "01/2027",
            "batch_number": "PD22031",
            "customer_care_phone": "1800-209-1155",
            "toll_free_number": "1800-209-1155",
            "country_of_origin": "India",
            "vegetarian_mark": "Present",
            "fssai_number": "10049008000789",
        },
    ),
    (
        "tomato-ketchup",
        "RedPepper",
        [
            "REDPEPPER",
            "Tomato Ketchup",
            "Generic Name: Tomato Ketchup",
            "Net Quantity: 500 ml",
            "MRP : Rs. 105",
            "Batch No. TK801000",
            "MFD: 08/2025",
            "Best Before: 08/2026",
            "Manufactured by: Saucy Foods Industries",
            "Customer Care: 1800-229-0800",
            "Country of Origin: India",
            "Vegetarian Mark",
            "FSSAI Lic. No. 10057303000901",
        ],
        {
            "brand_or_commodity_name": "REDPEPPER",
            "generic_name": "Tomato Ketchup",
            "net_quantity": "500 ml",
            "quantity_unit": "ml",
            "manufacturer_name": "Saucy Foods Industries",
            "mrp": "Rs. 105",
            "manufacturing_date": "08/2025",
            "expiry_date": "08/2026",
            "batch_number": "TK801000",
            "customer_care_phone": "1800-229-0800",
            "toll_free_number": "1800-229-0800",
            "country_of_origin": "India",
            "vegetarian_mark": "Present",
            "fssai_number": "10057303000901",
        },
    ),
    (
        "tea-masala",
        "Taj Masala",
        [
            "TAJ MASALA",
            "Chai Masala",
            "Generic Name: Tea Masala",
            "Net Quantity: 100 g",
            "MRP : Rs. 60",
            "Batch No. TM-2601",
            "Packed: 03/2026",
            "Best Before: 03/2028",
            "Manufactured by: Spice India Pvt Ltd",
            "Customer Care: 1800-315-2526",
            "Country of Origin: India",
            "Vegetarian Mark",
            "FSSAI Lic. No. 10010222000112",
        ],
        {
            "brand_or_commodity_name": "TAJ MASALA",
            "generic_name": "Tea Masala",
            "net_quantity": "100 g",
            "quantity_unit": "g",
            "manufacturer_name": "Spice India Pvt Ltd",
            "mrp": "Rs. 60",
            "packing_date": "03/2026",
            "expiry_date": "03/2028",
            "batch_number": "TM-2601",
            "customer_care_phone": "1800-315-2526",
            "toll_free_number": "1800-315-2526",
            "country_of_origin": "India",
            "vegetarian_mark": "Present",
            "fssai_number": "10010222000112",
        },
    ),
    (
        "atta-flour-low-contrast",
        "Janata",
        [
            "JANATA",
            "Plain Flour",
            "Generic Name: Wheat Flour",
            "Net Quantity: 2 kg",
            "MRP : Rs. 145",
            "Batch No. JF9007",
            "Packed: 12/2025",
            "Best Before: 12/2026",
            "Manufactured by: Janata Flour Mills",
            "Customer Care: 1800-233-4114",
            "Country of Origin: India",
            "Vegetarian Mark",
            "FSSAI Lic. No. 10009876543210",
        ],
        {
            "brand_or_commodity_name": "JANATA",
            "generic_name": "Wheat Flour",
            "net_quantity": "2 kg",
            "quantity_unit": "kg",
            "manufacturer_name": "Janata Flour Mills",
            "mrp": "Rs. 145",
            "packing_date": "12/2025",
            "expiry_date": "12/2026",
            "batch_number": "JF9007",
            "customer_care_phone": "1800-233-4114",
            "toll_free_number": "1800-233-4114",
            "country_of_origin": "India",
            "vegetarian_mark": "Present",
            "fssai_number": "10009876543210",
        },
        # Case 10 is rendered low-contrast to exercise the quality fallback path.
    ),
]

CASE_10_LOW_CONTRAST = True


def _font(bold: bool, size: int) -> ImageFont.FreeTypeFont:
    candidates = [FONT_DIR / ("arialbd.ttf" if bold else "arial.ttf")]
    for c in candidates:
        try:
            return ImageFont.truetype(str(c), size)
        except (OSError, ImageFont.ImportError):
            continue
    return ImageFont.load_default()


def render_label(case_id: str, brand: str, lines: List[str], low_contrast: bool = False) -> Image.Image:
    width, height = 1000, 206 + len(lines) * 52 + 60
    img = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    if low_contrast:
        draw.rectangle([0, 0, width, height], fill=(228, 228, 228))
    ink = (150, 150, 150) if low_contrast else (30, 30, 30)
    muted = (150, 150, 150) if low_contrast else (90, 90, 90)

    brand_font = _font(True, 40)
    head_font = _font(True, 26)
    text_font = _font(False, 24)

    y = 40
    bb = draw.textbbox((0, 0), brand, font=brand_font)
    draw.text(((width - (bb[2] - bb[0])) / 2, y), brand, font=brand_font, fill=ink)
    y += 78
    line = lines[0]
    bb = draw.textbbox((0, 0), line, font=head_font)
    draw.text(((width - (bb[2] - bb[0])) / 2, y), line, font=head_font, fill=ink)
    y += 58
    draw.line([(60, y), (width - 60, y)], fill=muted, width=3)
    y += 30

    label_font = _font(True, 22)
    for text in lines[1:]:
        draw.text((70, y), text, font=text_font, fill=ink)
        bb = draw.textbbox((0, 0), text, font=text_font)
        draw.line([(70, y + bb[3] - bb[1] + 8), (width - 70, y + bb[3] - bb[1] + 8)], fill=(235, 235, 235), width=1)
        y += 52
    return img


def data_uri(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def evaluate_case(ocr_value: Optional[str], truth: str) -> Tuple[bool, str]:
    if not ocr_value:
        return False, "missing"
    try:
        differ = values_differ(ocr_value, truth)
    except Exception:
        differ = ocr_value.strip().casefold() != truth.strip().casefold()
    if differ:
        return False, f"wrong ({ocr_value!r})"
    return True, f"ok ({ocr_value!r})"


def main() -> int:
    # This benchmark measures the extraction/compliance pipeline against
    # synthetic labels. Keep it local and deterministic: force Tesseract so it
    # never depends on network OCR (OCR.Space is exercised end-to-end by the
    # scan endpoint and tests instead).
    os.environ["OCR_ENGINE"] = "tesseract"

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ocr_svc = get_ocr_service()
    vision_configured = bool(settings.VISION_API_KEY or settings.OPENAI_API_KEY)

    rows: List[Dict[str, Any]] = []
    for idx, case in enumerate(CASES):
        case_id, brand, lines, truth = case
        low_contrast = case_id == "atta-flour-low-contrast"
        img = render_label(case_id, brand, lines, low_contrast=low_contrast)
        img_path = OUT_DIR / f"{case_id}.png"
        img.save(img_path)

        uri = data_uri(img)
        ocr_result = ocr_svc.process_image(uri)
        text = ocr_result.get("raw_text", "") or ""
        ocr_conf = float(ocr_result.get("confidence", 0.0) or 0.0)
        ocr_pi, _ = AIService.extract_product_information(text, ocr_confidence=ocr_conf)
        ocr_fields = ocr_pi.as_dict()

        vision_used = False
        vision_err: Optional[str] = None
        if vision_configured:
            try:
                vision_fields = VisionService.extract(uri)
                ocr_fields = merge_sources(ocr_fields, vision_fields)
                vision_used = True
            except VisionExtractionError as exc:
                vision_err = str(exc)

        compliance = ComplianceService.evaluate_compliance(
            inspection_id=f"BENCH-{idx + 1}",
            product_information=ocr_fields,
            is_imported=False,
        )

        correct = 0
        total = len(truth)
        per_field: Dict[str, Tuple[bool, str]] = {}
        for key, expected in truth.items():
            entry = ocr_fields.get(key)
            value = entry.value if entry and entry.status in ("detected", "uncertain") else None
            ok, note = evaluate_case(value, expected)
            per_field[key] = (ok, note)
            correct += int(ok)
        rows.append(
            {
                "case": case_id,
                "brand": brand,
                "low_contrast": low_contrast,
                "ocr_confidence": ocr_conf,
                "vision_used": vision_used,
                "vision_error": vision_err,
                "overall_result": compliance.overall_result,
                "compliance_score": compliance.compliance_score,
                "risk_score": compliance.risk_score,
                "correct": correct,
                "total": total,
                "per_field": per_field,
                "ocr_raw_text": text,
            }
        )
        print(f"[{idx + 1:02d}] {case_id:<22} recall {correct}/{total}  conf {ocr_conf:5.1f}  {compliance.overall_result} ({compliance.compliance_score})")

    # Aggregate per-field across cases.
    agg: Dict[str, Dict[str, int]] = {}
    for row in rows:
        for key, (ok, _) in row["per_field"].items():
            bucket = agg.setdefault(key, {"ok": 0, "total": 0, "notes": []})
            bucket["total"] += 1
            bucket["ok"] += int(ok)
            bucket["notes"].append(f"{row['case']}:{'ok' if ok else (row['per_field'][key][1])}")

    overall_ok = sum(r["correct"] for r in rows)
    overall_total = sum(r["total"] for r in rows)

    lines_out: List[str] = [
        "# PackIntel · Phase 2 Benchmark Report",
        "",
        f"- Date: {os.path.basename(str(REPORT))} run  (`{__file__}`)",
        f"- Labels: {len(rows)} synthetic packaged-commodity labels (PIL-rendered)",
        f"- Vision model configured: {'yes' if vision_configured else 'NO (OCR-only results; merged = OCR)'}",
        f"- Field-level recall (all sources): **{overall_ok} / {overall_total} = {overall_ok / overall_total:.1%}**",
        "",
        "| # | Case | Brand | OCR conf | Vision | Result | Compliance | Recall |",
        "|---|------|-------|----------|--------|--------|-----------|--------|",
    ]
    for i, row in enumerate(rows, start=1):
        lines_out.append(
            f"| {i} | {row['case']} | {row['brand']} | {row['ocr_confidence']:.0f}% | "
            f"{row['vision_used'] or row['vision_error'] or '-'} | {row['overall_result']} | "
            f"{row['compliance_score']}/100 (risk {row['risk_score']}) | {row['correct']}/{row['total']} |"
        )

    lines_out += ["", "## Field-level accuracy", "", "| Field | Correct | Total | Recall | Notes |", "|---|---|---|---|---|"]
    for key in EXPECTED_KEYS:
        bucket = agg.get(key)
        if not bucket:
            continue
        lines_out.append(
            f"| {key} | {bucket['ok']} | {bucket['total']} | {bucket['ok'] / bucket['total']:.0%} | "
            f"{', '.join(n for n in bucket['notes'] if not n.endswith(':ok'))[:120]} |"
        )

    lines_out += ["", "## Confidence and quality", "", "| Case | OCR confidence | image quality |", "|---|---|---|"]
    for row in rows:
        lines_out.append(f"| {row['case']} | {row['ocr_confidence']:.1f}% | {'low contrast' if row['low_contrast'] else 'normal'} |")

    REPORT.write_text("\n".join(lines_out) + "\n", encoding="utf-8")
    print(f"\nReport written: {REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())