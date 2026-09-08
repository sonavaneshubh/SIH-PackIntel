import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.schemas.compliance import ReportGenerationRequest, ReportGenerationResponse
from app.services.report_service import ReportService
from app.api.dependencies import get_current_user

router = APIRouter()


@router.post("/reports/generate", response_model=ReportGenerationResponse)
async def generate_report(
    request: ReportGenerationRequest, current_user: dict = Depends(get_current_user)
):
    """
    POST /api/reports/generate
    Returns download metadata for a generated compliance PDF/JSON report.
    """
    return ReportService.generate_inspection_report(
        inspection_id=request.inspection_id, format_type=request.format or "pdf"
    )


@router.get("/reports/download/{file_name}")
async def download_report(
    file_name: str, current_user: dict = Depends(get_current_user)
):
    """
    GET /api/reports/download/{inspection_id}.{pdf|json|txt}
    Streams the inspection report as a real downloadable file attachment.
    """
    match = re.fullmatch(r"([^/?#]+)\.(pdf|json|txt|text)", file_name, re.IGNORECASE)
    if not match:
        raise HTTPException(status_code=404, detail="Report not found")

    inspection_id, fmt = match.groups()
    content, media_type, filename = ReportService.build_file(inspection_id, fmt.lower())

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )