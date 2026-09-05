import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from app.schemas.compliance import ComplianceResult
from app.schemas.inspection import ScanRequest, ScanResponse
from app.schemas.product import PRODUCT_FIELDS, ProductField
from app.services.ai_service import AIService
from app.services.compliance_service import ComplianceService
from app.services.merge_service import merge_sources
from app.services.ocr_service import get_ocr_service
from app.services.vision_service import (
    VisionExtractionError,
    VisionService,
    should_use_vision_fallback,
)
from app.api.dependencies import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/scan", response_model=ScanResponse)
async def create_scan(request: ScanRequest, current_user: dict = Depends(get_current_user)):
    """
    POST /api/scan
    OCR -> canonical extraction -> (optional) vision fallback -> merge ->
    compliance. The response contains one canonical ``product_information``
    object plus the compliance/scores. Request metadata is never substituted
    for label data.
    """
    image_url = request.image_url
    if not image_url:
        raise HTTPException(status_code=400, detail="image_url is required for OCR scanning")

    try:
        ocr_result = get_ocr_service().process_image(image_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ocr_text = ocr_result.get("raw_text", "") or ""
    ocr_confidence = float(ocr_result.get("confidence", 0.0) or 0.0)
    ocr_failed = not bool(ocr_text.strip())

    # Canonical OCR extraction (per-field value/status/confidence/source).
    ocr_info, extraction_conf = AIService.extract_product_information(
        ocr_text, ocr_confidence=ocr_confidence
    )

    vision_used = False
    vision_error: Optional[str] = None
    extraction_source = "ocr"
    if should_use_vision_fallback(ocr_confidence, ocr_failed, ocr_info):
        try:
            vision_fields = VisionService.extract(image_url)
            final_info = merge_sources(ocr_info, vision_fields)
            vision_used = True
            extraction_source = "ocr+vision" if ocr_text.strip() else "vision"
        except VisionExtractionError as exc:
            # Vision is an optional fallback: never destroy usable OCR results.
            vision_error = str(exc)
            logger.warning("Vision fallback unavailable: %s", exc)
            final_info = ocr_info.as_dict()
            extraction_source = "ocr"
    else:
        final_info = ocr_info.as_dict()

    product_information: Dict[str, ProductField] = {
        key: final_info[key] for key in PRODUCT_FIELDS
    }

    inspection_id = f"INS-{uuid.uuid4().hex[:8].upper()}"
    quality_reason = ocr_result.get("quality_reason")
    unusable_quality = ocr_result.get("image_quality") in {"poor", "unusable"}
    detected = [
        entry
        for entry in product_information.values()
        if entry.status == "detected" and entry.value
    ]
    has_information = bool(detected) and (not unusable_quality or vision_used)

    if not has_information:
        result_status = "insufficient_information"
        overall_result = "review"
        score = 0
        compliance_score = 0
        risk_score = 0
        compliance_results: List[ComplianceResult] = []
        report = (
            f"{quality_reason.rstrip('.')}. No readable package-label information was detected. "
            "Upload a clearer image."
            if quality_reason
            else "No readable package-label information was detected. Upload a clearer image."
        )
        message = f"Scan completed. {report}"
    else:
        compliance = ComplianceService.evaluate_compliance(
            inspection_id=inspection_id,
            product_information=product_information,
            is_imported=bool(request.is_imported),
        )
        overall_result = compliance.overall_result
        score = compliance.compliance_score
        compliance_score = compliance.compliance_score
        risk_score = compliance.risk_score
        compliance_results = compliance.results
        if compliance.overall_result == "pass":
            result_status = "success"
            report = quality_reason
            message = "Scan completed and declarations extracted successfully."
        else:
            result_status = "partial_information"
            report = (
                quality_reason
                or "Some package information could not be verified from the image."
            )
            message = f"Scan completed with partial information. {report}"

    return ScanResponse(
        status=result_status,
        success=True,
        scan_completed=True,
        inspection_id=inspection_id,
        message=message,
        ocr_raw_text=ocr_text,
        ocr_engine=ocr_result.get("engine", "tesseract"),
        ocr_confidence=ocr_confidence,
        ocr_regions=ocr_result.get("regions", []),
        layout_regions=ocr_result.get("layout_regions", []),
        layout_text=ocr_result.get("layout_text"),
        layout_region_count=ocr_result.get("layout_region_count", 0),
        extracted_declarations=_flat_extraction(product_information),
        product_information=product_information,
        extraction_source=extraction_source,
        vision_used=vision_used,
        vision_error=vision_error,
        extraction_confidence=extraction_conf.get("overall"),
        compliance_results=compliance_results,
        score=score,
        compliance_score=compliance_score,
        risk_score=risk_score,
        overall_result=overall_result,
        image_quality=ocr_result.get("image_quality", "unknown"),
        quality_reason=quality_reason,
        report=report,
    )


def _flat_extraction(product_information: Dict[str, ProductField]) -> Dict[str, Optional[str]]:
    """Derive the legacy flat declaration map from the canonical values.

    Kept for backward compatibility with existing clients and the database
    columns; the canonical ``product_information`` object is the source of truth.
    """
    def value(*keys: str) -> Optional[str]:
        for key in keys:
            entry = product_information.get(key)
            if entry and entry.status == "detected" and entry.value:
                return str(entry.value)
        return None

    return {
        "manufacturer_name": value("manufacturer_name"),
        "packer_name": value("packer_name"),
        "importer_name": None,
        "commodity_name": value("brand_or_commodity_name"),
        "common_generic_name": value("generic_name", "brand_or_commodity_name"),
        "net_quantity": value("net_quantity"),
        "mrp": value("mrp"),
        "mfg_date": value("manufacturing_date"),
        "month_year_packed": value("packing_date", "manufacturing_date"),
        "consumer_care": value("customer_care_phone", "toll_free_number", "customer_care_email"),
        "customer_care_details": value("customer_care_phone", "toll_free_number", "customer_care_email"),
        "country_of_origin": value("country_of_origin"),
        "other_declarations": None,
    }