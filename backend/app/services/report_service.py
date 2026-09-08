"""Real, data-driven compliance inspection report generation.

This service builds a compliance inspection report artifact from the actual scan
data already persisted by the pipeline (inspections, extracted_labels,
compliance_results, inspection_images), uploads it to the `inspection-reports`
storage bucket and returns a working signed download URL.

It never invents values: any field that was not detected during scanning is
rendered as "Not detected". Compliance calculations continue to live in the
compliance engine; this module only assembles persisted data into a document.
"""

import json
import logging
import re
import urllib.request
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from app.core.config import settings
from app.schemas.compliance import ReportGenerationResponse

try:
    from supabase import create_client, Client

    HAS_SUPABASE = True
except ImportError:  # pragma: no cover
    HAS_SUPABASE = False

try:
    from io import BytesIO
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import (
        Image,
        Paragraph,
        Preformatted,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    HAS_PDF = True
except ImportError:  # pragma: no cover
    HAS_PDF = False

REPORT_BUCKET = settings.REPORT_STORAGE_BUCKET or "inspection-reports"
NOT_DETECTED = "Not detected"

logger = logging.getLogger("report_service")


def _normalize_url() -> str:
    url = settings.SUPABASE_URL or ""
    url = re.sub(r"/rest/v1/?$", "", url)
    return url.rstrip("/")


def _value(entry: Any) -> Optional[str]:
    """Extract a plain-text value from a ProductField dict/object or raw scalar."""
    if entry is None:
        return None
    if isinstance(entry, dict):
        val = entry.get("value")
    else:
        val = getattr(entry, "value", entry)
    if isinstance(val, bool):
        return "Yes" if val else None
    if val is None:
        return None
    text = str(val).strip()
    return text or None


def _first(source: Optional[Dict[str, Any]], *keys: str) -> Optional[str]:
    if not isinstance(source, dict):
        return None
    for key in keys:
        val = _value(source.get(key))
        if val:
            return val
    return None


def _as_list(value: Any) -> List[Dict[str, Any]]:
    if isinstance(value, list):
        return [r for r in value if isinstance(r, dict)]
    return []


def _clean(value: Optional[str]) -> str:
    """Collapse to a printable single-line Latin-1 string (PDF-safe)."""
    if value is None:
        return ""
    text = str(value).replace("\n", " ").replace("\r", " ").strip()
    return text.encode("latin-1", "replace").decode("latin-1")


def _clean_multi(value: Optional[str]) -> str:
    """Multi-line variant for PDF paragraphs (line breaks preserved)."""
    if value is None:
        return ""
    text = str(value).strip()
    return text.encode("latin-1", "replace").decode("latin-1")


def _xml(value: Any) -> str:
    """PDF-safe single-line string with XML markup entities escaped."""
    if value is None:
        return ""
    text = str(value).replace("\n", " ").replace("\r", " ").strip()
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .encode("latin-1", "replace")
        .decode("latin-1")
    )


def _fetch_image_bytes(url: Optional[str], timeout: float = 10.0) -> Optional[bytes]:
    """Fetch an image (e.g. a signed storage URL) for embedding in a report PDF."""
    if not url or not url.startswith(("http://", "https://")):
        return None
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.read()
    except Exception:
        return None


class ReportService:
    """Generates compliance inspection reports from real scan/inspection data."""

    # ------------------------------------------------------------------ #
    # Infrastructure                                                      #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _client() -> Optional[Client]:
        if HAS_SUPABASE and settings.SUPABASE_SERVICE_ROLE_KEY and _normalize_url():
            try:
                return create_client(_normalize_url(), settings.SUPABASE_SERVICE_ROLE_KEY)
            except Exception:
                return None
        return None

    @staticmethod
    def _ensure_bucket(client: Client) -> bool:
        """Return True if the configured report bucket exists in supabase storage.

        Only the bucket name is checked/logged — never secrets.
        """
        try:
            existing = client.storage.list_buckets()
            names = {
                (b.get("name") if isinstance(b, dict) else getattr(b, "name", ""))
                for b in (existing or [])
            }
            return REPORT_BUCKET in names
        except Exception:
            logger.exception(
                "Failed to verify report storage bucket '%s' existence", REPORT_BUCKET
            )
            return False

    @staticmethod
    def _product_information(label: Dict[str, Any]) -> Dict[str, Any]:
        raw = label.get("product_information")
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
                return parsed if isinstance(parsed, dict) else {}
            except Exception:
                return {}
        return raw if isinstance(raw, dict) else {}

    # ------------------------------------------------------------------ #
    # Field resolution (real values only, no invention)                  #
    # ------------------------------------------------------------------ #

    @classmethod
    def _company_name(
        cls,
        inspection: Dict[str, Any],
        label: Dict[str, Any],
        pi: Dict[str, Any],
    ) -> Optional[str]:
        """Best available company/manufacturer identity from the scanned product."""
        return (
            _first(pi, "manufacturer_name", "packer_name", "importer_name", "brand_or_commodity_name")
            or label.get("manufacturer_name")
            or label.get("packer_name")
            or label.get("importer_name")
            or inspection.get("manufacturer_name")
            or inspection.get("brand_name")
        )

    @classmethod
    def _product_name(
        cls,
        inspection: Dict[str, Any],
        label: Dict[str, Any],
        pi: Dict[str, Any],
    ) -> Optional[str]:
        return (
            inspection.get("product_name")
            or label.get("commodity_name")
            or _first(pi, "brand_or_commodity_name", "generic_name", "commodity_name")
        )

    @classmethod
    def _brand_name(
        cls,
        inspection: Dict[str, Any],
        label: Dict[str, Any],
        pi: Dict[str, Any],
    ) -> Optional[str]:
        return (
            inspection.get("brand_name")
            or _first(pi, "brand_or_commodity_name")
            or label.get("commodity_name")
        )

    @staticmethod
    def _display(value: Optional[str]) -> str:
        return value if value else NOT_DETECTED

    # ------------------------------------------------------------------ #
    # Document assembly                                                  #
    # ------------------------------------------------------------------ #

    @classmethod
    def _build_document(
        cls,
        inspection: Dict[str, Any],
        label: Dict[str, Any],
        results: List[Dict[str, Any]],
        image_urls: Dict[str, Optional[str]],
    ) -> str:
        pi = cls._product_information(label)

        company = cls._company_name(inspection, label, pi)
        product = cls._product_name(inspection, label, pi)
        product_id = inspection.get("inspection_number") or inspection.get("id") or NOT_DETECTED
        brand = cls._brand_name(inspection, label, pi)

        mrp = label.get("mrp") or _first(pi, "mrp")
        net_qty = label.get("net_quantity") or _first(pi, "net_quantity")
        batch = _first(pi, "batch_number")
        mfg_date = (
            label.get("month_year_packed")
            or _first(pi, "manufacturing_date", "packing_date")
        )
        expiry = _first(pi, "expiry_date", "best_before_date")
        origin = label.get("country_of_origin") or _first(pi, "country_of_origin")

        overall = (inspection.get("overall_result") or "").lower()
        status = (
            "PASS"
            if overall == "pass"
            else "FAIL"
            if overall == "fail"
            else "REVIEW"
            if overall == "review"
            else "INCONCLUSIVE"
        )
        score = inspection.get("compliance_score")
        risk = inspection.get("risk_score")
        conf_vals = [
            label.get("ocr_confidence"),
            label.get("extraction_confidence"),
        ]
        confidence = None
        for val in conf_vals:
            if val is not None:
                num = float(val)
                confidence = round(num if num <= 100 else num / 100)
                break

        violations = [r for r in results if (r.get("result") or "").lower() == "fail"]
        warnings = [
            r
            for r in results
            if (r.get("result") or "").lower() in {"warning", "uncertain"}
        ]

        front_url = image_urls.get("label_front") or image_urls.get("product_full")
        back_url = image_urls.get("label_back")

        ocr_text = label.get("raw_ocr_text") or ""
        inspection_number = inspection.get("inspection_number")

        lines: List[str] = []
        add = lines.append

        add("=" * 60)
        add("PACKINTEL - LEGAL METROLOGY COMPLIANCE INSPECTION REPORT")
        add("=" * 60)
        add("")
        add("Company / Manufacturer: " + cls._display(company))
        add("Product: " + cls._display(product))
        add("Product ID: " + cls._display(product_id))
        add("Brand: " + cls._display(brand))
        add("Scan / Inspection ID: " + cls._display(inspection.get("id")))
        add("Inspection Number: " + cls._display(inspection_number))
        add("Inspection Date: " + cls._display((inspection.get("inspected_at") or inspection.get("created_at"))))
        add("")

        add("=" * 60)
        add("PRODUCT INFORMATION")
        add("-" * 60)
        add("MRP: " + cls._display(mrp))
        add("Net Quantity: " + cls._display(net_qty))
        add("Batch / Lot: " + cls._display(batch))
        add("Manufacturing Date: " + cls._display(mfg_date))
        add("Expiry / Best Before: " + cls._display(expiry))
        add("Country of Origin: " + cls._display(origin))
        add("")

        add("=" * 60)
        add("COMPLIANCE STATUS")
        add("-" * 60)
        add("Status: " + status)
        add("Compliance Score: " + cls._display(str(score) if score is not None else None))
        add("Risk Score: " + cls._display(str(risk) if risk is not None else None))
        add("Confidence: " + cls._display(f"{confidence}%" if confidence is not None else None))
        add("")

        add("=" * 60)
        add("VIOLATIONS")
        add("-" * 60)
        if violations:
            for v in violations:
                add("• " + cls._display(v.get("rule_name")))
                add("    Rule: " + cls._display(v.get("rule_code")))
                add("    Detected Value: " + cls._display(v.get("extracted_value")))
                add("    Applicable Rule: " + cls._display(v.get("requirement")))
                add("    Explanation / Evidence: " + cls._display(v.get("explanation") or v.get("evidence")))
                add("    Result: FAIL")
                add("")
        else:
            add("No violations detected.")
            add("")

        add("=" * 60)
        add("APPLICABLE RULES")
        add("-" * 60)
        if results:
            for r in results:
                add(
                    "[{code}] {name} -> {result}".format(
                        code=cls._display(r.get("rule_code")),
                        name=cls._display(r.get("rule_name")),
                        result=(r.get("result") or "").upper() or "NOT_APPLICABLE",
                    )
                )
                if r.get("requirement"):
                    add("    Requirement: " + str(r.get("requirement")))
                if r.get("extracted_value"):
                    add("    Detected: " + str(r.get("extracted_value")))
                add("")
        else:
            add("No rule evaluations were recorded for this inspection.")
            add("")

        add("=" * 60)
        add("WARNINGS")
        add("-" * 60)
        if warnings:
            for w in warnings:
                add("• " + cls._display(w.get("rule_name")))
                add("    Rule: " + cls._display(w.get("rule_code")))
                add("    Detected Value: " + cls._display(w.get("extracted_value")))
                add("    Explanation: " + cls._display(w.get("explanation")))
                add("")
        else:
            add("No warnings returned.")
            add("")

        add("=" * 60)
        add("SCANNED IMAGES")
        add("-" * 60)
        add("Front: " + cls._display(front_url))
        add("Back: " + cls._display(back_url))
        add("")

        add("=" * 60)
        add("ORIGINAL OCR TEXT")
        add("-" * 60)
        if ocr_text:
            add(ocr_text)
        else:
            add("No readable OCR text was detected.")
        add("")

        add("=" * 60)
        add("Generated by PackIntel Legal Metrology Compliance System")
        add("Generated at: " + datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"))
        add("=" * 60)

        return "\n".join(lines)

    # ------------------------------------------------------------------ #
    # PDF assembly                                                       #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _wrap(text: Optional[str], max_len: int = 96) -> str:
        text = str(text) if text else NOT_DETECTED
        if len(text) <= max_len:
            return text
        return text[: max_len - 1].rstrip() + "..."


    @classmethod
    def _build_pdf_reportlab(
        cls,
        inspection: Dict[str, Any],
        label: Dict[str, Any],
        results: List[Dict[str, Any]],
        image_urls: Dict[str, Optional[str]],
    ) -> bytes:
        """Assemble the same real data into a clean, downloadable PDF."""
        if not HAS_PDF:
            # Fall back to the plain-text document when reportlab is missing.
            return cls._build_document(inspection, label, results, image_urls).encode("utf-8")

        pi = cls._product_information(label)
        company = cls._company_name(inspection, label, pi)
        product = cls._product_name(inspection, label, pi)
        product_id = inspection.get("inspection_number") or inspection.get("id") or NOT_DETECTED
        brand = cls._brand_name(inspection, label, pi)
        inspected = (inspection.get("inspected_at") or inspection.get("created_at")) or NOT_DETECTED
        inspection_number = inspection.get("inspection_number")
        overall = (inspection.get("overall_result") or "").lower()
        status = (
            "PASS"
            if overall == "pass"
            else "FAIL"
            if overall == "fail"
            else "REVIEW"
            if overall == "review"
            else "INCONCLUSIVE"
        )

        mrp = label.get("mrp") or _first(pi, "mrp")
        net_qty = label.get("net_quantity") or _first(pi, "net_quantity")
        batch = _first(pi, "batch_number")
        mfg_date = label.get("month_year_packed") or _first(pi, "manufacturing_date", "packing_date")
        expiry = _first(pi, "expiry_date", "best_before_date")
        origin = label.get("country_of_origin") or _first(pi, "country_of_origin")

        violations = [r for r in results if (r.get("result") or "").lower() == "fail"]
        warnings = [
            r
            for r in results
            if (r.get("result") or "").lower() in {"warning", "uncertain"}
        ]

        summary_counts = {
            "pass": sum(1 for r in results if str(r.get("result") or "").lower() == "pass"),
            "uncertain": sum(
                1 for r in results if str(r.get("result") or "").lower() in {"warning", "uncertain"}
            ),
            "fail": sum(1 for r in results if str(r.get("result") or "").lower() == "fail"),
        }
        summary_counts["not_applicable"] = max(
            0, len(results) - sum(summary_counts.values())
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "ReportTitle",
            parent=styles["Title"],
            fontSize=18,
            leading=22,
            textColor=colors.HexColor("#0b0f12"),
            spaceAfter=2 * mm,
        )
        eyebrow_style = ParagraphStyle(
            "Eyebrow",
            parent=styles["Normal"],
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#1a73e8"),
            spaceAfter=3 * mm,
        )
        section_style = ParagraphStyle(
            "Section",
            parent=styles["Heading2"],
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#0b0f12"),
            spaceBefore=6 * mm,
            spaceAfter=3 * mm,
        )
        body_style = ParagraphStyle(
            "Body",
            parent=styles["BodyText"],
            fontSize=9.5,
            leading=13,
            textColor=colors.HexColor("#1f2937"),
        )
        small_style = ParagraphStyle(
            "Small",
            parent=styles["BodyText"],
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#6b7280"),
        )

        box = BytesIO()
        doc = SimpleDocTemplate(
            box,
            pagesize=A4,
            title=f"PackIntel Compliance Report - {product_id}",
            author="PackIntel Legal Metrology Compliance System",
            subject="Legal Metrology (Packaged Commodities) Rules, 2011 - Compliance Inspection Report",
        )
        story: List[Any] = []

        story.append(Paragraph("PACKINTEL · SIH034", eyebrow_style))
        story.append(
            Paragraph(
                cls._wrap(
                    f"{company or NOT_DETECTED} – {product or NOT_DETECTED} – {product_id}",
                    120,
                ),
                title_style,
            )
        )
        if brand:
            story.append(Paragraph(cls._wrap(brand, 120), small_style))

        meta_rows = [
            [
                "<b>Product ID:</b> " + cls._wrap(product_id, 40),
                "<b>Inspection ID:</b> " + cls._wrap(inspection_number or inspection.get("id"), 40),
            ],
            [
                "<b>Inspected On:</b> " + cls._wrap(inspected, 40),
                "<b>Source:</b> Rules Database",
            ],
        ]
        meta_table = Table(meta_rows, colWidths=[doc.width / 2.0, doc.width / 2.0])
        meta_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("PADDING", (0, 0), (-1, -1), 5),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.append(meta_table)
        story.append(Spacer(1, 4 * mm))

        # Product information
        story.append(Paragraph("PRODUCT INFORMATION", section_style))
        info_rows = [
            [cls._wrap(mrp, 60), cls._wrap(net_qty, 60)],
            [cls._wrap(batch, 60), cls._wrap(mfg_date, 60)],
            [cls._wrap(expiry, 60), cls._wrap(origin, 60)],
        ]
        info_table = Table(info_rows, colWidths=[doc.width / 2.0, doc.width / 2.0])
        info_table.setStyle(
            TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("PADDING", (0, 0), (-1, -1), 5),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(info_table)
        story.append(Spacer(1, 3 * mm))

        # Compliance status
        story.append(Paragraph("COMPLIANCE STATUS", section_style))
        score = inspection.get("compliance_score")
        risk = inspection.get("risk_score")
        conf_vals = [label.get("ocr_confidence"), label.get("extraction_confidence")]
        confidence = None
        for val in conf_vals:
            if val is not None:
                num = float(val)
                confidence = round(num if num <= 100 else num / 100)
                break
        overall_label = (
            "High"
            if (confidence or 0) >= 75
            else "Medium"
            if (confidence or 0) >= 50
            else "Low"
        )
        status_rows = [
            [
                "<b>Status:</b> " + status,
                "<b>Compliance Score:</b> " + (str(score) if score is not None else NOT_DETECTED),
            ],
            [
                "<b>Risk Score:</b> " + (str(risk) if risk is not None else NOT_DETECTED),
                "<b>Confidence:</b> " + (f"{confidence}%" if confidence is not None else NOT_DETECTED),
            ],
        ]
        status_table = Table(status_rows, colWidths=[doc.width / 2.0, doc.width / 2.0])
        status_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("PADDING", (0, 0), (-1, -1), 5),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(status_table)
        story.append(Spacer(1, 3 * mm))

        # Compliance summary (matches the on-screen PASS / REVIEW / FAIL / N-A strip)
        story.append(Paragraph("SUMMARY", section_style))
        summary_headers = (
            "PASS (Compliant)",
            "UNCERTAIN (Review Required)",
            "FAIL (Violation)",
            "NOT APPLICABLE",
        )
        summary_vals = (
            str(summary_counts["pass"]),
            str(summary_counts["uncertain"]),
            str(summary_counts["fail"]),
            str(summary_counts["not_applicable"]),
        )
        summary_table = Table(
            [
                [Paragraph("<b>" + h + "</b>", small_style) for h in summary_headers],
                [Paragraph("<b>" + v + "</b>", small_style) for v in summary_vals],
            ],
            colWidths=[doc.width / 4.0] * 4,
        )
        summary_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("PADDING", (0, 0), (-1, -1), 5),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.append(summary_table)
        story.append(Spacer(1, 3 * mm))

        # Image & OCR assessment (matches the on-screen confidence card)
        story.append(Paragraph("IMAGE & OCR ASSESSMENT", section_style))
        assessment_reason = (
            "Optical character recognition returned high-confidence text; "
            "statutory declarations were assessed with strong reliability."
            if overall_label == "High"
            else "Some of the scanned text was returned at lower confidence; "
            "affected declarations may need manual review."
            if overall_label == "Medium"
            else "Low OCR confidence was recorded; verify the declarations "
            "against the physical package label."
        )
        assessment_table = Table(
            [
                [Paragraph("<b>Overall Assessment</b>", small_style), Paragraph(overall_label, small_style)],
                [
                    Paragraph("<b>OCR Confidence</b>", small_style),
                    Paragraph(f"{confidence}%" if confidence is not None else NOT_DETECTED, small_style),
                ],
                [Paragraph("<b>Assessment</b>", small_style), Paragraph(assessment_reason, small_style)],
            ],
            colWidths=[doc.width * 0.28, doc.width * 0.72],
        )
        assessment_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("PADDING", (0, 0), (-1, -1), 5),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.append(assessment_table)
        story.append(Spacer(1, 3 * mm))

        story.append(Paragraph("VIOLATIONS & ATTENTION REQUIRED", section_style))
        if violations:
            for v in violations:
                citation = _xml(v.get("legal_reference"))
                story.append(
                    Paragraph(
                        "- " + cls._wrap(v.get("rule_name"), 120)
                        + "  <font size=7.5 color='#6b7280'>["
                        + cls._wrap(v.get("rule_code"), 16)
                        + "]</font>",
                        body_style,
                    )
                )
                reason_text = _xml(v.get("explanation") or v.get("reason") or "Could not be verified from the image.")
                detected_text = _xml(v.get("extracted_value") or v.get("detected_value"))
                story.append(
                    Paragraph(
                        "<font size=8 color='#6b7280'>Detected: "
                        + (detected_text or "Not detected")
                        + (" | Requirement: " + _xml(v.get("requirement")) if v.get("requirement") else "")
                        + " | "
                        + reason_text
                        + (f"<br/><b>Citation:</b> {citation}" if citation else "")
                        + "</font>",
                        small_style,
                    )
                )
                story.append(Spacer(1, 1.5 * mm))
        else:
            story.append(
                Paragraph(
                    "No Legal Metrology violations detected in the provided image.", body_style
                )
            )

        # Compliance checklist — full Rule & Provision / Requirement / Detected / Status / Reason columns
        story.append(Paragraph("LEGAL METROLOGY RULES COMPLIANCE EVALUATION", section_style))
        if results:
            def _cell(text: str, bold: bool = False) -> Paragraph:
                inner = ("<b>" + text + "</b>") if bold else text
                return Paragraph(inner, small_style)

            header_row = [
                _cell("Rule & Provision", bold=True),
                _cell("Requirement", bold=True),
                _cell("Detected Declaration", bold=True),
                _cell("Status", bold=True),
                _cell("Reason & Evidence", bold=True),
            ]
            checklist_rows = [header_row]
            for r in results:
                rule_provision = (
                    "<b>" + _xml(r.get("rule_code") or r.get("rule_id")) + "</b><br/>"
                    + _xml(r.get("rule_name"))
                )
                requirement = _xml(r.get("requirement") or r.get("ruleDescription") or "")
                detected = _xml(
                    r.get("extracted_value") or r.get("detected_value")
                ) or "<i>Not detected</i>"
                result_status = (r.get("result") or r.get("status") or "not_applicable").upper()
                reason = _xml(r.get("explanation") or r.get("reason") or "")
                evidence = _xml(r.get("evidence"))
                reason_block = reason or "—"
                if evidence:
                    reason_block = (reason_block + "<br/>" if reason_block != "—" else "") + (
                        "<font color='#1a73e8'>" + evidence + "</font>"
                    )
                checklist_rows.append(
                    [
                        _cell(rule_provision),
                        _cell(requirement),
                        _cell(detected),
                        _cell(result_status, bold=True),
                        _cell(reason_block),
                    ]
                )
            checklist_table = Table(
                checklist_rows,
                colWidths=[
                    doc.width * 0.22,
                    doc.width * 0.24,
                    doc.width * 0.17,
                    doc.width * 0.13,
                    doc.width * 0.24,
                ],
                repeatRows=1,
            )
            checklist_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                        ("PADDING", (0, 0), (-1, -1), 4),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ]
                )
            )
            story.append(checklist_table)
            story.append(Spacer(1, 3 * mm))
        else:
            story.append(
                Paragraph("No rule evaluations were recorded for this inspection.", body_style)
            )

        # Extracted Legal Metrology declarations (matches the on-screen grid)
        story.append(Paragraph("EXTRACTED LEGAL METROLOGY DECLARATIONS", section_style))
        declaration_fields = [
            ("MRP", _first(pi, "mrp") or label.get("mrp")),
            ("Net Quantity", _first(pi, "net_quantity") or label.get("net_quantity")),
            (
                "Commodity / Product Name",
                _first(pi, "brand_or_commodity_name", "generic_name", "commodity_name"),
            ),
            ("Customer Care / Helpline", _first(pi, "customer_care", "customer_care_details", "helpline")),
            (
                "Company Address",
                _first(pi, "company_address", "packer_address", "manufacturer_address", "address"),
            ),
            (
                "FSSAI / License No.",
                _first(pi, "fssai_number", "fssai_license", "license_number", "registration_number")
                or label.get("fssai_license_number"),
            ),
            (
                "Manufacturer Name",
                _first(pi, "manufacturer_name", "packer_name", "importer_name")
                or label.get("manufacturer_name"),
            ),
            ("Country of Origin", _first(pi, "country_of_origin") or label.get("country_of_origin")),
            ("Batch / Lot Number", _first(pi, "batch_number")),
            (
                "Manufacturing / Packed Date",
                _first(pi, "manufacturing_date", "packing_date") or label.get("month_year_packed"),
            ),
            ("Best Before / Expiry Date", _first(pi, "expiry_date", "best_before_date")),
            ("Net Weight", _first(pi, "net_weight") or label.get("net_weight")),
            ("Ingredient List", _first(pi, "ingredient_list", "ingredients", "ingredient")),
            (
                "Storage / Handling Instructions",
                _first(pi, "storage_instructions", "storage", "handling_instructions", "instructions"),
            ),
            ("Website / Email / Contact", _first(pi, "website", "email", "contact_email", "contact")),
            ("Vegetarian / Non-Veg Mark", _first(pi, "veg_nonveg", "veg_nonveg_mark", "vegetarian_mark")),
        ]
        decl_rows = [
            [
                Paragraph("<b>" + _xml(label_txt) + "</b>", small_style),
                Paragraph(
                    _xml(value) if value else "<font color='#9ca3af'>Not detected</font>", small_style
                ),
            ]
            for label_txt, value in declaration_fields
        ]
        decl_table = Table(
            decl_rows,
            colWidths=[doc.width * 0.34, doc.width * 0.66],
        )
        decl_table.setStyle(
            TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("PADDING", (0, 0), (-1, -1), 4),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.append(decl_table)
        story.append(Spacer(1, 3 * mm))

        # Warnings
        story.append(Paragraph("WARNINGS (REVIEW REQUIRED)", section_style))
        if warnings:
            for w in warnings:
                story.append(
                    Paragraph(
                        "- " + cls._wrap(w.get("rule_name"), 120)
                        + "  <font size=7.5 color='#6b7280'>["
                        + cls._wrap(w.get("rule_code"), 16)
                        + "]</font>",
                        body_style,
                    )
                )
                story.append(
                    Paragraph(
                        "<font size=8 color='#6b7280'>Detected: "
                        + (_xml(w.get("extracted_value") or w.get("detected_value")) or "Not detected")
                        + " | "
                        + (_xml(w.get("explanation") or w.get("reason")) or "")
                        + "</font>",
                        small_style,
                    )
                )
                story.append(Spacer(1, 1.5 * mm))
        else:
            story.append(Paragraph("No warnings returned.", body_style))

        # Pipeline & image quality diagnostics
        story.append(Paragraph("PIPELINE & IMAGE QUALITY DIAGNOSTICS", section_style))
        front_url = image_urls.get("label_front") or image_urls.get("product_full")
        back_url = image_urls.get("label_back")
        ocr_text = label.get("raw_ocr_text") or ""
        raw_engine = (
            label.get("extraction_engine")
            or _first(pi, "extraction_engine")
            or NOT_DETECTED
        )
        diag_rows = [
            [
                Paragraph("<b>Image Quality</b>", small_style),
                Paragraph("Usable" if (front_url or back_url) else "Unavailable", small_style),
            ],
            [
                Paragraph("<b>OCR Status</b>", small_style),
                Paragraph(
                    "Readable text extracted" if ocr_text else "No readable text", small_style
                ),
            ],
            [
                Paragraph("<b>OCR Confidence</b>", small_style),
                Paragraph(f"{confidence}%" if confidence is not None else NOT_DETECTED, small_style),
            ],
            [Paragraph("<b>Extraction Engine</b>", small_style), Paragraph(_xml(raw_engine), small_style)],
            [
                Paragraph("<b>Overall Assessment</b>", small_style),
                Paragraph(overall_label, small_style),
            ],
        ]
        diag_table = Table(
            diag_rows,
            colWidths=[doc.width * 0.34, doc.width * 0.66],
        )
        diag_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("PADDING", (0, 0), (-1, -1), 4),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.append(diag_table)
        story.append(Spacer(1, 3 * mm))

        # Scanned label images (embedded copies of the front & back photographs)
        story.append(Paragraph("SCANNED LABEL IMAGES", section_style))
        max_img_w = doc.width / 2.0 - 6
        max_img_h = 90

        def _image_flowable(url: Optional[str], caption: str):
            img_data = _fetch_image_bytes(url)
            if img_data:
                buf = BytesIO(img_data)
                try:
                    iw, ih = ImageReader(buf).getSize()
                    scale = min(max_img_w / max(iw, 1), max_img_h / max(ih, 1), 1.0)
                    width = max(iw * scale, 1)
                    height = max(ih * scale, 1)
                    image = Image(buf, width=width, height=height)
                except Exception:
                    return [Paragraph("Image unavailable", small_style), Paragraph("", small_style)]
            else:
                image = None
            return [
                image,
                Paragraph(
                    "<b>" + _xml(caption) + ":</b> "
                    + (_xml(url) if url else NOT_DETECTED),
                    small_style,
                ),
            ]

        story.append(
            Table(
                [
                    [
                        _image_flowable(front_url, "Front")[0] or Paragraph("Image unavailable", small_style),
                        _image_flowable(back_url, "Back")[0] or Paragraph("Image unavailable", small_style),
                    ],
                    [
                        Paragraph(
                            "<b>Front:</b> " + (_xml(front_url) if front_url else NOT_DETECTED),
                            small_style,
                        ),
                        Paragraph(
                            "<b>Back:</b> " + (_xml(back_url) if back_url else NOT_DETECTED),
                            small_style,
                        ),
                    ],
                ],
                colWidths=[doc.width / 2.0, doc.width / 2.0],
            )
        )

        # OCR text
        story.append(Paragraph("ORIGINAL OCR TEXT", section_style))
        if ocr_text:
            story.append(
                Preformatted(
                    ocr_text[:4000],
                    ParagraphStyle("Ocr", parent=small_style, fontName="Courier"),
                )
            )
        else:
            story.append(Paragraph("No readable OCR text was detected.", body_style))

        story.append(Spacer(1, 6 * mm))
        story.append(
            Paragraph(
                "PackIntel · Legal Metrology Rule-Driven Automated Compliance System (SIH034) — "
                "Report generated "
                + datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                small_style,
            )
        )
        story.append(
            Paragraph(
                "Disclaimer: This report is generated automatically from scanned label data.",
                ParagraphStyle("Disclaimer", parent=small_style, textColor=colors.HexColor("#9ca3af")),
            )
        )

        doc.build(story)
        return box.getvalue()

    # ------------------------------------------------------------------ #
    # Public entry point                                                 #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _supabase():
        from supabase import create_client

        if not settings.SUPABASE_SERVICE_ROLE_KEY:
            return None
        try:
            return create_client(settings.clean_supabase_url, settings.SUPABASE_SERVICE_ROLE_KEY)
        except Exception:
            return None

    @classmethod
    def generate_inspection_report(
        cls,
        inspection_id: str,
        format_type: str = "pdf",
    ) -> ReportGenerationResponse:
        """Generate a real compliance report for the given inspection.

        Loads the actual scan records from Supabase, assembles a document that
        only contains detected values (undetected fields are rendered as
        "Not detected"), stores the artifact in the `inspection-reports` bucket
        and returns a working signed download URL.
        """
        try:
            uuid.UUID(str(inspection_id))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=404, detail="Inspection not found")

        client = cls._client()
        if not client:
            raise HTTPException(
                status_code=503,
                detail="Report generation unavailable: storage/database not configured",
            )

        logger.info(
            "Generating report for inspection %s using storage bucket '%s'",
            inspection_id,
            REPORT_BUCKET,
        )

        inspection_result = (
            client.table("inspections").select("*").eq("id", inspection_id).limit(1).execute()
        )
        inspection_rows = getattr(inspection_result, "data", None) or []
        if not inspection_rows:
            raise HTTPException(status_code=404, detail="Inspection not found")
        inspection = inspection_rows[0]

        label_rows = (
            client.table("extracted_labels")
            .select("*")
            .eq("inspection_id", inspection_id)
            .limit(1)
            .execute()
        )
        label_data = getattr(label_rows, "data", None) or []
        label = label_data[0] if label_data else {}

        result_rows = (
            client.table("compliance_results")
            .select("*")
            .eq("inspection_id", inspection_id)
            .order("created_at")
            .execute()
        )
        results = _as_list(getattr(result_rows, "data", None))

        image_rows = (
            client.table("inspection_images")
            .select("*")
            .eq("inspection_id", inspection_id)
            .order("created_at")
            .execute()
        )
        images = _as_list(getattr(image_rows, "data", None))

        image_urls: Dict[str, Optional[str]] = {}
        for img in images:
            storage_path = img.get("storage_path")
            image_type = img.get("image_type") or "label_front"
            if not storage_path:
                continue
            try:
                signed = client.storage.from_(REPORT_BUCKET).create_signed_url(storage_path, 3600)
                if isinstance(signed, dict):
                    url = (
                        signed.get("signedURL")
                        or signed.get("signedUrl")
                        or signed.get("url")
                    )
                else:
                    url = None
            except Exception:
                url = None
            image_urls.setdefault(image_type, url)

        document = cls._build_document(inspection, label, results, image_urls)

        report_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # PDF is used for downloadable reports; txt remains the plain-text fallback.
        if (format_type or "pdf").lower() == "pdf":
            content = cls._build_pdf_reportlab(inspection, label, results, image_urls)
            extension = "pdf"
            report_type = "pdf"
            content_type = "application/pdf"
        else:
            content = document.encode("utf-8")
            extension = "txt"
            report_type = "txt"
            content_type = "text/plain; charset=utf-8"

        storage_path = f"reports/{inspection_id}/{now.strftime('%Y%m%d%H%M%S')}-{report_id[:8]}.{extension}"

        # Verify the configured storage bucket exists before uploading the PDF.
        bucket_exists = cls._ensure_bucket(client)
        if not bucket_exists:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Report storage bucket '{REPORT_BUCKET}' does not exist in "
                    "Supabase Storage. Create the bucket or configure "
                    "REPORT_STORAGE_BUCKET."
                ),
            )

        try:
            client.storage.from_(REPORT_BUCKET).upload(
                storage_path,
                content,
                {"content-type": content_type, "x-upsert": "true"},
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to store report in bucket '{REPORT_BUCKET}': {exc}",
            ) from exc

        download_url: Optional[str] = None
        try:
            signed = client.storage.from_(REPORT_BUCKET).create_signed_url(storage_path, 3600)
            if isinstance(signed, dict):
                download_url = (
                    signed.get("signedURL")
                    or signed.get("signedUrl")
                    or signed.get("url")
                )
        except Exception:
            download_url = None
        if not download_url:
            # No signed/public URL could be produced; avoid returning a fake path.
            download_url = ""

        try:
            client.table("inspection_reports").insert(
                {
                    "id": report_id,
                    "inspection_id": inspection_id,
                    "storage_path": storage_path,
                    "public_url": download_url,
                    "report_type": report_type,
                    "file_size_bytes": len(content),
                    "generated_at": now.isoformat(),
                }
            ).execute()
        except Exception:
            # The artifact is still downloadable; a failed audit trail insert
            # must not fail the download request.
            pass

        return ReportGenerationResponse(
            report_id=report_id,
            inspection_id=inspection_id,
            download_url=download_url,
            generated_at=now.isoformat(),
        )

    @staticmethod
    def load_inspection(inspection_id: str) -> dict:
        """Fetches an inspection with its labels, results and images (service role)."""
        try:
            uuid.UUID(str(inspection_id))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=404, detail="Inspection not found")

        client = ReportService._supabase()
        if not client:
            raise HTTPException(status_code=503, detail="Database not configured")

        result = (
            client.table("inspections")
            .select("*, extracted_labels (*), compliance_results (*), inspection_images (*)")
            .eq("id", inspection_id)
            .maybe_single()
            .execute()
        )
        data = getattr(result, "data", None)
        if not data:
            raise HTTPException(status_code=404, detail="Inspection not found")
        return data

    @staticmethod
    def build_file(inspection_id: str, format_type: str = "pdf"):
        """
        Builds a downloadable report artifact for an inspection.

        Returns ``(file_bytes, media_type, filename)``.
        """
        data = ReportService.load_inspection(inspection_id)
        fmt = (format_type or "pdf").lower().lstrip(".")

        if fmt == "json":
            content = json.dumps(data, indent=2, default=str).encode("utf-8")
            return content, "application/json", f"{inspection_id}.json"

        if fmt in ("txt", "text"):
            content = ReportService._build_text(data).encode("utf-8")
            return content, "text/plain; charset=utf-8", f"{inspection_id}.txt"

        content = ReportService._build_pdf(data)
        return content, "application/pdf", f"{inspection_id}.pdf"

    # ---------------------------------------------------------------- text
    @staticmethod
    def _build_text(data: dict) -> str:
        results = data.get("compliance_results") or []
        lines = [
            "PACKINTEL - LEGAL METROLOGY INSPECTION REPORT",
            "=" * 64,
            "",
            f"Product ID     : {data.get('id') or 'N/A'}",
            f"Inspection No. : {data.get('inspection_number') or 'N/A'}",
            f"Product Name   : {data.get('product_name') or 'N/A'}",
            f"Brand          : {data.get('brand_name') or 'N/A'}",
            f"Manufacturer   : {data.get('manufacturer_name') or 'N/A'}",
            f"Inspected On   : {data.get('inspected_at') or data.get('created_at') or 'N/A'}",
            f"Compliance     : {data.get('compliance_score') or 0}/100 ({data.get('overall_result') or 'N/A'})",
            "",
            "COMPLIANCE EVALUATION",
            "-" * 64,
        ]
        for i, res in enumerate(results, 1):
            lines.append(
                f"{i}. [{_clean(res.get('result') or res.get('status'))}] "
                f"{_clean(res.get('rule_name'))}"
            )
            lines.append(f"   Rule: {_clean(res.get('rule_code') or res.get('rule_id'))}")
            lines.append(f"   Detected: {_clean(res.get('extracted_value') or res.get('detected_value'))}")
            lines.append(f"   Reason: {_clean(res.get('explanation') or res.get('reason'))}")
            lines.append("")
        lines.append("")
        lines.append(f"Report generated {datetime.now(timezone.utc).isoformat()}")
        return "\n".join(lines)

    # ---------------------------------------------------------------- pdf
    @staticmethod
    def _build_pdf(data: dict) -> bytes:
        from fpdf import FPDF

        pdf = FPDF(format="A4", unit="mm")
        pdf.set_auto_page_break(auto=True, margin=16)
        pdf.set_margins(14, 14, 14)
        pdf.add_page()

        # Header
        pdf.set_fill_color(21, 87, 153)
        pdf.rect(0, 0, 210, 26, "F")
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 15)
        pdf.set_xy(14, 6)
        pdf.cell(0, 9, "PackIntel - Legal Metrology Inspection Report")
        pdf.set_font("Helvetica", "", 9)
        pdf.set_xy(14, 16)
        pdf.cell(0, 6, "Rule-Driven Automated Compliance System (SIH034) - Official Inspection Record")

        pdf.set_text_color(0, 0, 0)
        pdf.set_y(32)

        # Metadata block
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, "Inspection Overview", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9.5)
        meta = [
            ("Product ID", data.get("id")),
            ("Inspection No.", data.get("inspection_number")),
            ("Product Name", data.get("product_name")),
            ("Brand", data.get("brand_name")),
            ("Manufacturer", data.get("manufacturer_name")),
            ("Inspected On", data.get("inspected_at") or data.get("created_at")),
        ]
        for label, value in meta:
            pdf.set_font("Helvetica", "B", 9.5)
            pdf.cell(42, 6, _clean(label) + ":", new_x="END")
            pdf.set_font("Helvetica", "", 9.5)
            pdf.multi_cell(0, 6, _clean(value) or "N/A", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        # Compliance score
        score = data.get("compliance_score") or 0
        overall = data.get("overall_result") or "N/A"
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, f"Compliance Score: {score}/100  -  Result: {_clean(overall)}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        # Results table
        results = data.get("compliance_results") or []
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, "Legal Metrology Compliance Evaluation", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

        col_widths = (30, 70, 40, 46)
        headers = ("Result", "Rule", "Detected", "Reason & Evidence")
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.set_fill_color(240, 244, 248)
        for i, header in enumerate(headers):
            pdf.cell(col_widths[i], 7, header, border=1, fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", "", 8)
        for res in results:
            result = _clean(res.get("result") or res.get("status"))
            rule = _clean(res.get("rule_name"))
            detected = _clean(res.get("extracted_value") or res.get("detected_value")) or "Not detected"
            reason = _clean(res.get("explanation") or res.get("reason")) or ""

            start_x = pdf.get_x()
            start_y = pdf.get_y()
            cell_h = 8

            pdf.cell(col_widths[0], cell_h, result, border=1)
            pdf.cell(col_widths[1], cell_h, rule, border=1)
            pdf.cell(col_widths[2], cell_h, detected, border=1)
            pdf.cell(col_widths[3], cell_h, reason, border=1)
            pdf.set_xy(start_x, start_y + cell_h)

        pdf.ln(6)

        # Issues / violations
        issues = [
            res
            for res in results
            if str(res.get("result") or res.get("status")).lower() in ("fail", "warning", "uncertain")
        ]
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, "Violations & Attention Required", new_x="LMARGIN", new_y="NEXT")
        if not issues:
            pdf.set_font("Helvetica", "", 9.5)
            pdf.cell(0, 6, "No Legal Metrology violations detected.", new_x="LMARGIN", new_y="NEXT")
        else:
            pdf.set_font("Helvetica", "", 9.5)
            for i, issue in enumerate(issues, 1):
                text = (
                    f"{i}. [{_clean(issue.get('result') or issue.get('status'))}] "
                    f"{_clean(issue.get('rule_name'))} - "
                    f"{_clean(issue.get('explanation') or issue.get('reason') or 'Could not be verified from the image.')}"
                )
                pdf.multi_cell(0, 5.5, text, new_x="LMARGIN", new_y="NEXT")
                pdf.ln(1)

        pdf.ln(4)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(0, 5, f"Report generated {datetime.now(timezone.utc).isoformat()}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 5, "Disclaimer: This report is generated automatically from scanned label data.", new_x="LMARGIN", new_y="NEXT")

        return bytes(pdf.output())
