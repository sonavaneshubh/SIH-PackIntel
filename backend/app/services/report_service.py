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
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

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
    from reportlab.platypus import (
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
    def _build_pdf(
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

        # Violations
        story.append(Paragraph("VIOLATIONS", section_style))
        if violations:
            for v in violations:
                story.append(
                    Paragraph(
                        "- " + cls._wrap(v.get("rule_name"), 120)
                        + "  <font size=7.5 color='#6b7280'>["
                        + cls._wrap(v.get("rule_code"), 16)
                        + "]</font>",
                        body_style,
                    )
                )
                story.append(
                    Paragraph(
                        "<font size=8 color='#6b7280'>Detected: "
                        + cls._wrap(v.get("extracted_value"), 90)
                        + " | Rule: "
                        + cls._wrap(v.get("requirement"), 90)
                        + " | "
                        + cls._wrap(v.get("explanation") or v.get("evidence"), 90)
                        + "</font>",
                        small_style,
                    )
                )
                story.append(Spacer(1, 1.5 * mm))
        else:
            story.append(Paragraph("No violations detected.", body_style))

        # Applicable rules
        story.append(Paragraph("APPLICABLE RULES", section_style))
        if results:
            rule_rows = [
                [
                    "<b>" + cls._wrap(r.get("rule_code"), 20) + "</b>",
                    "<b>" + cls._wrap(r.get("rule_name"), 44) + "</b>",
                    (r.get("result") or "not_applicable").upper(),
                    cls._wrap(r.get("extracted_value"), 40),
                ]
                for r in results
            ]
            rule_table = Table(
                rule_rows,
                colWidths=[doc.width * 0.14, doc.width * 0.34, doc.width * 0.14, doc.width * 0.38],
            )
            rule_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                        ("PADDING", (0, 0), (-1, -1), 4),
                        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                        ("FONTSIZE", (0, 0), (0, 0), 7.5),
                    ]
                )
            )
            story.append(rule_table)
        else:
            story.append(Paragraph("No rule evaluations were recorded for this inspection.", body_style))

        # Warnings
        story.append(Paragraph("WARNINGS", section_style))
        if warnings:
            for w in warnings:
                story.append(
                    Paragraph(
                        "- " + cls._wrap(w.get("rule_name"), 120) + "  <font size=7.5 color='#6b7280'>[" + cls._wrap(w.get("rule_code"), 16) + "]</font>",
                        body_style,
                    )
                )
                story.append(
                    Paragraph(
                        "<font size=8 color='#6b7280'>Detected: "
                        + cls._wrap(w.get("extracted_value"), 90)
                        + " | "
                        + cls._wrap(w.get("explanation"), 90)
                        + "</font>",
                        small_style,
                    )
                )
                story.append(Spacer(1, 1.5 * mm))
        else:
            story.append(Paragraph("No warnings returned.", body_style))

        # Scanned images
        story.append(Paragraph("SCANNED IMAGES", section_style))
        front_url = image_urls.get("label_front") or image_urls.get("product_full")
        back_url = image_urls.get("label_back")
        story.append(
            Paragraph(
                "<b>Front:</b> "
                + (cls._wrap(front_url, 80) if front_url else NOT_DETECTED)
                + "<br/><b>Back:</b> "
                + (cls._wrap(back_url, 80) if back_url else NOT_DETECTED),
                small_style,
            )
        )

        # Associated scans
        story.append(Paragraph("ASSOCIATED SCANS", section_style))
        for (side, url) in (("Front", front_url), ("Back", back_url)):
            story.append(
                Paragraph(
                    f"{side}: {url if url else NOT_DETECTED}",
                    small_style,
                )
            )

        # OCR text
        ocr_text = label.get("raw_ocr_text") or ""
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
                "Generated by PackIntel Legal Metrology Compliance System at "
                + datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                small_style,
            )
        )

        doc.build(story)
        return box.getvalue()

    # ------------------------------------------------------------------ #
    # Public entry point                                                 #
    # ------------------------------------------------------------------ #

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
            content = cls._build_pdf(inspection, label, results, image_urls)
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