import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from app.core.config import settings
from app.schemas.compliance import ReportGenerationResponse


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


class ReportService:
    @staticmethod
    def _supabase():
        from supabase import create_client

        if not settings.SUPABASE_SERVICE_ROLE_KEY:
            return None
        try:
            return create_client(settings.clean_supabase_url, settings.SUPABASE_SERVICE_ROLE_KEY)
        except Exception:
            return None

    @staticmethod
    def generate_inspection_report(
        inspection_id: str, format_type: str = "pdf"
    ) -> ReportGenerationResponse:
        """
        Returns download metadata for a generated inspection report artifact.

        The download URL is keyed by the inspection id so the file can be
        rebuilt (and streamed as a real attachment) by the download endpoint.
        """
        report_id = f"RPT-{uuid.uuid4().hex[:8].upper()}"
        fmt = (format_type or "pdf").lower().lstrip(".")
        download_url = f"/api/reports/download/{inspection_id}.{fmt}"

        return ReportGenerationResponse(
            report_id=report_id,
            inspection_id=inspection_id,
            download_url=download_url,
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    @staticmethod
    def load_inspection(inspection_id: str) -> dict:
        """Fetches an inspection with its labels, results and images (service role)."""
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