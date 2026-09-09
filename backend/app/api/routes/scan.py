import json
import logging
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from PIL import Image
from starlette.requests import Request

from app.schemas.compliance import ComplianceResult
from app.schemas.inspection import (
    ImageDetection,
    ImageQuality,
    ScanRequest,
    ScanResponse,
    ScanSide,
)
from app.schemas.product import PRODUCT_FIELDS, ProductField
from app.core.config import settings
from app.core.memory import log_memory
from app.services.ai_service import AIService
from app.services.compliance_service import ComplianceService
from app.services.image_quality import analyze_image_quality
from app.services.image_validation import (
    ImageValidationError,
    to_public_url,
    validate_upload,
)
from app.services.merge_service import merge_sources, merge_gemini_with_ocr, build_field_diagnostic
from app.services.ocr_service import OCRService, get_ocr_service
from app.services.package_detector import detect_food_package, DetectionResult
from app.services.vision_service import (
    VisionExtractionError,
    VisionService,
    should_use_vision_fallback,
)
from app.services.gemini_vision import GeminiVisionService, _average_detected_confidence
from app.services.product_extractor import apply_pipeline_overlays
from app.api.dependencies import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

_OCR_FAILURE_TEMPLATE: Dict[str, Any] = {
    "status": "completed_with_warning",
    "text": "",
    "raw_text": "",
    "confidence": 0.0,
    "engine": "google_vision",
    "lines": [],
    "regions": [],
    "layout_regions": [],
    "layout_text": "",
    "layout_region_count": 0,
    "image_quality": "unusable",
    "quality_reason": "OCR could not read the label image.",
    "quality": {},
}


@router.get("/scan/status", tags=["scan"])
async def scan_status(current_user: dict = Depends(get_current_user)):
    """Report pipeline readiness without exposing any secrets.

    The frontend uses this to decide whether the two-image scanner path is
    available. API keys are never reflected here.
    """
    from app.services.ocr_service import (
        get_google_vision_diagnostics,
        get_tesseract_diagnostics,
    )
    from app.services.gemini_vision import GeminiVisionService

    vision_status = get_google_vision_diagnostics()
    tesseract_status = get_tesseract_diagnostics()
    gemini_configured = GeminiVisionService.is_configured()

    # The scanner is usable when at least one OCR engine is available.
    ocr_ready = vision_status["available"] or tesseract_status["available"]

    return {
        "status": "ready" if ocr_ready else "degraded",
        "pipeline": "detection -> quality -> preprocessing -> ocr -> extraction -> compliance",
        "ocr_configured": ocr_ready,
        "ocr_engines": {
            "google_vision": vision_status["available"],
            "tesseract": tesseract_status["available"],
        },
        "primary_ocr": "google_vision" if vision_status["available"] else "tesseract",
        "vision_configured": gemini_configured,
        "multi_image": True,
        "food_package_confidence_threshold": settings.FOOD_PACKAGE_CONFIDENCE_THRESHOLD,
        "max_image_size_mb": settings.MAX_IMAGE_SIZE_MB,
        "ocr_timeout_seconds": settings.OCR_TIMEOUT_SECONDS,
    }


@router.post("/scan", response_model=ScanResponse)
async def create_scan(request: Request, current_user: dict = Depends(get_current_user)):
    """
    POST /api/scan

    Accepts either:
    * multipart/form-data with ``front_image`` (file) and optional ``back_image``
      (file) plus text fields matching ScanRequest; or
    * a JSON body with ``image_url``/``front_image_url`` and optional
      ``back_image_url`` (backward compatible).

    Pipeline: image validation -> food-package detection -> image-quality ->
    OCR (front & back) -> text combination -> canonical extraction ->
    (optional) vision fallback -> merge -> compliance.  Detection, quality and
    OCR failures are all non-aborting: they produce warnings, never a crash.
    """
    parsed = await _parse_scan_input(request)
    sides = parsed["sides"]
    meta = parsed["metadata"]
    is_upload = parsed["upload"]
    log_memory("scan:input_parsed")

    logger.info(
        "Scan request received: sides=%d, upload=%s, is_imported=%s",
        len(sides),
        is_upload,
        bool(meta.is_imported),
    )

    warnings: List[str] = []
    per_side: List[ScanSide] = []
    front_result: Dict[str, Any] = dict(_OCR_FAILURE_TEMPLATE)
    front_ocr_text = ""
    front_layout_text = ""
    front_detection: Optional[ImageDetection] = None

    # ---- PIPELINE: GEMINI VISION PRIMARY, OCR-TEXT SECONDARY ---------------
    # When GEMINI_PRIMARY_ENABLED, Gemini Vision reads the front image directly
    # and returns structured label fields. It does NOT depend on Google Cloud
    # Vision's OCR text, so garbled/empty OCR no longer blocks extraction. It
    # is submitted to the same worker pool as detection/quality/OCR so it adds
    # no serial latency while enabled.
    #
    # The OCR pass (Google Cloud Vision -> Tesseract) still runs for every
    # side: its text/regions feed the response contract and the report. If
    # Gemini Vision is disabled or yields nothing, the pipeline falls back to
    # the OCR-first flow (combined text -> Gemini-from-text -> regex
    # extraction -> optional multimodal vision fallback).
    gemini_product_fields: Optional[Dict[str, ProductField]] = None
    gemini_vision_result: Optional[Any] = None

    # Detection/quality/OCR for multiple sides is CPU- and I/O-bound, so the
    # sides are processed in parallel. Outcomes keep the input ordering and the
    # first side always supplies the "front" response fields (same contract as
    # a sequential loop).
    front_ref = sides[0]["image_ref"] if sides else None
    gemini_future = None
    with ThreadPoolExecutor(max_workers=max(2, len(sides))) as pool:
        if settings.GEMINI_PRIMARY_ENABLED and front_ref:
            gemini_future = pool.submit(GeminiVisionService.extract, front_ref)
        processed = list(pool.map(_process_one_side, sides))

    if gemini_future is not None:
        try:
            gemini_vision_result = gemini_future.result(
                timeout=settings.VISION_TIMEOUT_SECONDS + 30
            )
        except Exception as exc:
            logger.warning(
                "GEMINI: vision extraction task failed, using fallback: %s", exc
            )

    warnings.extend(
        warning
        for outcome in processed
        for warning in outcome["warnings"]
    )
    for index, outcome in enumerate(processed):
        per_side.append(outcome["scan_side"])
        if index == 0:
            front_result = outcome["ocr_result"]
            front_ocr_text = outcome["ocr_text"]
            front_layout_text = outcome["layout_text"]
            front_detection = outcome["detection"]

    # ---- Combine OCR text from every side (front then back), plus layout ----
    extraction_text = _combine_ocr_text(front_ocr_text, front_layout_text)
    for extra_side in per_side[1:]:
        extraction_text = _combine_ocr_text(
            extraction_text, extra_side.ocr_raw_text or "", extra_side.layout_text or ""
        )

    ocr_confidence = float(front_result.get("confidence") or 0.0)
    ocr_failed = not bool(extraction_text.strip())
    quality_reason = front_result.get("quality_reason")

    logger.info(
        "OCR completed: engine=%s, sides=%d, text_len=%d, confidence=%s, "
        "quality=%s, failed=%s",
        front_result.get("engine", "unknown"),
        len(per_side),
        len(extraction_text),
        ocr_confidence,
        front_result.get("image_quality", "unknown"),
        ocr_failed,
    )
    logger.info(
        "[PACKINTEL][OCR] engine=%s sides=%d text_len=%d confidence=%s "
        "failed=%s quality=%s",
        front_result.get("engine", "unknown"),
        len(per_side),
        len(extraction_text),
        ocr_confidence,
        ocr_failed,
        front_result.get("image_quality", "unknown"),
    )
    log_memory("scan:ocr_done")

    # ---- Gemini Vision (image) PRIMARY extraction ---------------------------
    vision_used = False
    vision_error: Optional[str] = None
    extraction_conf: Dict[str, Any] = {"overall": 0.0}

    gemini_image_used = (
        gemini_vision_result is not None
        and gemini_vision_result.success
        and gemini_vision_result.product_fields is not None
    )
    if gemini_image_used:
        gemini_product_fields = gemini_vision_result.product_fields
        gemini_detected = sum(
            1
            for f in gemini_product_fields.values()
            if f.status == "detected" and f.value
        )
        logger.info(
            "GEMINI: vision (image) extraction success, %d fields detected",
            gemini_detected,
        )
        logger.info(
            "[PACKINTEL][GEMINI][IMAGE] model=%s success=true detected=%d "
            "quality=%s readability=%s",
            settings.VISION_MODEL,
            gemini_detected,
            getattr(gemini_vision_result, "image_quality", "FAIR"),
            getattr(gemini_vision_result, "readability_quality", "MEDIUM"),
        )

        # The Gemini image pass only sees the FRONT side, so declarations
        # printed on the BACK (importer block, batch/FSSAI, expiry, veg marks)
        # can be missed by Gemini. The OCR-pipeline extraction therefore always
        # runs over the combined front+back OCR text, and OCR fills exactly the
        # fields Gemini left not_visible. Gemini stays the primary source and
        # only missing values are back-filled — never overwritten.
        try:
            ocr_info, _ocr_conf = AIService.extract_product_information(
                extraction_text, ocr_confidence=ocr_confidence
            )
            ocr_info = apply_pipeline_overlays(ocr_info, extraction_text)
        except Exception as exc:  # pragma: no cover - defense in depth
            logger.warning(
                "[PACKINTEL][OCR] regex extraction failed, ignoring: %s", exc
            )
            ocr_info = None

        final_info, merge_stats = merge_gemini_with_ocr(
            ocr_info, gemini_product_fields
        )
        if ocr_info is not None:
            logger.info(
                "[PACKINTEL][MERGE] primary=gemini_vision stats=%s",
                json.dumps(merge_stats, sort_keys=True),
            )
            logger.info(
                "[PACKINTEL][DIAGNOSTIC] %s",
                json.dumps(
                    build_field_diagnostic(
                        ocr_info,
                        gemini_product_fields,
                        final_info,
                        extraction_source="gemini_vision",
                    ),
                    sort_keys=True,
                    default=str,
                ),
            )
        extraction_source = "gemini_vision"
        vision_used = True
        extraction_conf = {"overall": _average_detected_confidence(final_info)}
        logger.info(
            "COMPLIANCE: using Gemini Vision (image) extraction merged with OCR gaps"
        )
    else:
        # ---- OCR-first fallback flow ----------------------------------------
        if settings.GEMINI_PRIMARY_ENABLED:
            logger.warning(
                "GEMINI: vision (image) unavailable (%s); using OCR-text flow",
                getattr(gemini_vision_result, "error", "not attempted"),
            )

        gemini_text_used = False
        if settings.GEMINI_PRIMARY_ENABLED and extraction_text:
            logger.info("GEMINI: extraction started from combined OCR text")
            back_text = per_side[1].ocr_raw_text if len(per_side) > 1 else ""
            try:
                _gemini_result = GeminiVisionService.extract_from_text(
                    extraction_text, front_text=front_ocr_text, back_text=back_text
                )
            except Exception as exc:
                logger.warning("GEMINI: request failed, using fallback: %s", exc)
                _gemini_result = None

            if _gemini_result is not None and _gemini_result.success:
                gemini_text_used = True
                gemini_product_fields = _gemini_result.product_fields
                logger.info("GEMINI: extraction success")
            else:
                logger.warning(
                    "GEMINI: extraction failed, using fallback: %s",
                    _gemini_result.error if _gemini_result else "unknown error",
                )

        if gemini_text_used and gemini_product_fields is not None:
            # Gemini extracted structured fields from the OCR text — feed them
            # straight into the compliance engine.
            final_info: Dict[str, ProductField] = {
                k: gemini_product_fields[k] for k in PRODUCT_FIELDS
            }
            extraction_source = "gemini_vision"
            vision_used = True
            extraction_conf = {"overall": _average_detected_confidence(gemini_product_fields)}
            logger.info("COMPLIANCE: using Gemini text extraction results")
        else:
            # ---- Canonical OCR extraction (regex) fallback ----------------------
            logger.info("Analysis started (field extraction)")
            ocr_info, extraction_conf = AIService.extract_product_information(
                extraction_text, ocr_confidence=ocr_confidence
            )

            # Apply deterministic extraction improvements (addresses, dates, unit sale
            # price) from the dedicated product extractor layer. These only fill fields
            # the regex extraction could not, so they never regress detected values.
            try:
                ocr_info = apply_pipeline_overlays(ocr_info, extraction_text)
            except Exception as exc:  # pragma: no cover - defense in depth
                logger.warning("Product-extractor overlay failed, keeping base output: %s", exc)

            extraction_source = "ocr"
            final_info = ocr_info.as_dict()
            front_image_ref = sides[0]["image_ref"] if sides else None
            if (
                settings.ENABLE_VISION_FALLBACK
                and front_image_ref
                and should_use_vision_fallback(ocr_confidence, ocr_failed, ocr_info)
            ):
                try:
                    vision_fields = VisionService.extract(front_image_ref)
                    final_info = merge_sources(ocr_info, vision_fields)
                    vision_used = True
                    extraction_source = "ocr+vision" if front_ocr_text.strip() else "vision"
                except VisionExtractionError as exc:
                    # Vision is an optional fallback: never destroy usable OCR results.
                    vision_error = str(exc)
                    logger.warning("Vision fallback unavailable: %s", exc)
                    final_info = ocr_info.as_dict()
                    extraction_source = "ocr"

    product_information: Dict[str, ProductField] = {
        key: final_info[key] for key in PRODUCT_FIELDS
    }

    inspection_id = f"INS-{uuid.uuid4().hex[:8].upper()}"
    unusable_quality = front_result.get("image_quality") in {"poor", "unusable"}
    detected = [
        entry
        for entry in product_information.values()
        if entry.status == "detected" and entry.value
    ]
    has_information = bool(detected) and (not unusable_quality or vision_used)

    logger.info("Compliance analysis started")
    compliance = ComplianceService.evaluate_compliance(
        inspection_id=inspection_id,
        product_information=product_information,
        is_imported=bool(meta.is_imported),
        image_quality=front_result.get("image_quality", "usable"),
    )
    logger.info("Compliance analysis completed: overall=%s, score=%d", compliance.overall_result, compliance.compliance_score)
    rule_state = Counter(r.status for r in compliance.results)
    logger.info(
        "[PACKINTEL][COMPLIANCE] overall=%s score=%d passed=%d failed=%d "
        "uncertain=%d not_applicable=%d",
        compliance.overall_result,
        compliance.compliance_score,
        rule_state.get("PASS", 0),
        rule_state.get("FAIL", 0),
        rule_state.get("UNCERTAIN", 0),
        rule_state.get("NOT_APPLICABLE", 0),
    )
    overall_result = compliance.overall_result
    score = compliance.compliance_score
    compliance_score = compliance.compliance_score
    risk_score = compliance.risk_score
    compliance_results = compliance.results

    if not has_information:
        result_status = "insufficient_information"
        if ocr_failed:
            reason = quality_reason or "OCR could not read the label image."
            report = (
                "OCR status: failed. Extracted information: unavailable. "
                "Compliance score: 0 / unable to verify. "
                f"Reason: {reason.rstrip('.')}. "
                "No readable package-label information was detected. "
                "Upload a clearer image."
            )
        else:
            report = (
                f"{quality_reason.rstrip('.')}. No readable package-label information was detected. "
                "Upload a clearer image."
                if quality_reason
                else "No readable package-label information was detected. Upload a clearer image."
            )
        message = f"Scan completed. {report}"
    else:
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

    logger.info(
        "Scan completed: id=%s, status=%s, score=%s, overall=%s, engine=%s, parts=%d",
        inspection_id,
        result_status,
        score,
        overall_result,
        front_result.get("engine", "unknown"),
        len(per_side),
    )
    logger.info(
        "[PACKINTEL][SCAN] id=%s status=%s score=%s overall=%s "
        "extraction_source=%s vision_used=%s engine=%s parts=%d",
        inspection_id,
        result_status,
        score,
        overall_result,
        extraction_source,
        vision_used,
        front_result.get("engine", "unknown"),
        len(per_side),
    )
    log_memory("scan:done")
    logger.info("SCAN: final extraction source = %s", extraction_source)

    front_side = per_side[0] if per_side else None
    back_side = per_side[1] if len(per_side) > 1 else None

    response = ScanResponse(
        status=result_status,
        success=True,
        scan_completed=True,
        inspection_id=inspection_id,
        message=message,
        ocr_raw_text=front_ocr_text,
        ocr_engine=front_result.get("engine", "tesseract"),
        ocr_confidence=ocr_confidence,
        ocr_regions=front_result.get("regions", []),
        layout_regions=front_result.get("layout_regions", []),
        layout_text=front_layout_text or None,
        layout_region_count=front_result.get("layout_region_count", 0),
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
        image_quality=front_result.get("image_quality", "unknown"),
        quality_reason=quality_reason,
        report=report,
        front_side=front_side,
        back_side=back_side,
        images_processed=len(per_side),
        detection=front_detection,
        warnings=warnings,
    )

    return response


# ---------------------------------------------------------------------------
# Input parsing (multipart upload OR legacy JSON body)
# ---------------------------------------------------------------------------


async def _parse_scan_input(request: Request) -> dict:
    content_type = (request.headers.get("content-type") or "").lower()
    if content_type.startswith("application/json"):
        return await _parse_json_body(request)
    if content_type.startswith("multipart/form-data"):
        return await _parse_multipart_body(request)
    raise HTTPException(
        status_code=400,
        detail="Content-Type must be application/json or multipart/form-data.",
    )


async def _parse_json_body(request: Request) -> dict:
    try:
        payload = json.loads((await request.body()).decode("utf-8") or "{}")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Request body is not valid JSON.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object.")

    try:
        req = ScanRequest.model_validate(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid scan request: {exc}") from exc

    front_ref = str(req.front_image_url or req.image_url or "").strip()
    back_ref = str(req.back_image_url or "").strip()

    if not front_ref:
        raise HTTPException(status_code=400, detail="image_url is required for OCR scanning")

    sides = [
        _make_side_input("front", "url", front_ref),
    ]
    if back_ref and back_ref != front_ref:
        sides.append(_make_side_input("back", "url", back_ref))
    return {"sides": sides, "metadata": req, "upload": False}


async def _parse_multipart_body(request: Request) -> dict:
    try:
        form = await request.form()
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Could not parse multipart form: {exc}"
        ) from exc

    front_file: Optional[UploadFile] = form.get("front_image")
    back_file: Optional[UploadFile] = form.get("back_image")

    sides = []
    if _has_file(front_file):
        sides.append(await _make_upload_side("front", front_file))
    if _has_file(back_file):
        sides.append(await _make_upload_side("back", back_file))

    if not sides:
        raise HTTPException(status_code=400, detail="front_image is required for OCR scanning")

    try:
        meta = ScanRequest(
            product_name=_form_str(form, "product_name"),
            brand_name=_form_str(form, "brand_name"),
            manufacturer=_form_str(form, "manufacturer"),
            manufacturer_name=_form_str(form, "manufacturer_name"),
            category=_form_str(form, "category"),
            product_category=_form_str(form, "product_category"),
            is_imported=_form_bool(form, "is_imported"),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid scan request metadata: {exc}"
        ) from exc
    return {"sides": sides, "metadata": meta, "upload": True}


def _has_file(file: Any) -> bool:
    return file is not None and bool(getattr(file, "filename", None))


async def _make_upload_side(label: str, upload: UploadFile) -> dict:
    try:
        data = await upload.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read uploaded image: {exc}") from exc
    try:
        validated = validate_upload(
            data,
            filename=getattr(upload, "filename", None),
            content_type=getattr(upload, "content_type", None),
        )
    except ImageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    image_ref = to_public_url(validated, label)
    return {
        "label": label,
        "source": "upload",
        "image_ref": image_ref,
        "pil_image": validated.image,
    }


def _form_str(form: Any, key: str) -> Optional[str]:
    value = form.get(key)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _form_bool(form: Any, key: str) -> bool:
    value = form.get(key)
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _make_side_input(label: str, source: str, image_ref: str) -> dict:
    return {
        "label": label,
        "source": source,
        "image_ref": image_ref,
        "pil_image": _load_pil(image_ref),
    }


def _load_pil(image_ref: str) -> Optional[Image.Image]:
    """Best-effort PIL load for detection/quality. Never raises."""
    try:
        return OCRService._fetch_image(image_ref)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Pipeline stages (detection + quality), all non-aborting
# ---------------------------------------------------------------------------


def _detect_and_qualify(side: dict, warnings: List[str]):
    """Run food-package detection and image-quality analysis for one side.

    Returns ``(detection, quality)``. Any failure degrades to None and adds a
    warning — it never aborts the scan.
    """
    label = side["label"]
    pil_image = side.get("pil_image")
    detection: Optional[ImageDetection] = None
    quality: Optional[ImageQuality] = None

    if pil_image is None:
        warnings.append(f"Image '{label}' could not be loaded for quality/detection analysis.")
        return detection, quality

    try:
        result = analyze_image_quality(pil_image)
        quality = ImageQuality(
            overall=result.overall, score=result.score, reason=result.reason_text or None
        )
        if result.overall == "unusable":
            warnings.append(
                f"Image '{label}' quality is unusable: {result.reason_text}. Continuing the scan."
            )
        elif result.overall == "poor":
            warnings.append(
                f"Image '{label}' quality is poor: {result.reason_text}."
            )
    except Exception as exc:
        logger.warning("Quality analysis failed for %s: %s", label, exc)
        warnings.append(f"Image '{label}' quality could not be analyzed.")

    try:
        det: DetectionResult = detect_food_package(
            pil_image, threshold=settings.FOOD_PACKAGE_CONFIDENCE_THRESHOLD
        )
        detection = ImageDetection(
            is_food_package=det.is_food_package,
            confidence=det.confidence,
            reason=det.reason,
        )
        if label == "front" and not det.is_food_package:
            warnings.append(
                f"Front image did not look like a food package ({det.reason})."
            )
        else:
            logger.info(
                "Package detection (%s): is_food=%s confidence=%.2f",
                label,
                det.is_food_package,
                det.confidence,
            )
    except Exception as exc:
        logger.warning("Package detection failed for %s: %s", label, exc)
        warnings.append(f"Food-package detection failed for '{label}'.")

    return detection, quality


def _process_one_side(side: dict) -> Dict[str, Any]:
    """Run detection, quality and OCR for one side.

    Worker for the parallel side loop. Returns everything create_scan needs to
    assemble the response, including the warnings raised while handling this
    side so ordering of the final warnings list stays deterministic.
    """
    label = side["label"]
    side_warnings: List[str] = []
    detection, quality = _detect_and_qualify(side, side_warnings)

    # The decoded PIL copy is only needed for the detection/quality stage.
    # Drop it before OCR so the worker is not holding a full pixel buffer
    # (plus a second decode inside the OCR engine) for the rest of the scan.
    if "pil_image" in side:
        del side["pil_image"]

    ocr_result = _run_ocr(side["image_ref"])
    quality = _merge_quality(quality, ocr_result, label, side_warnings)
    ocr_text = str(ocr_result.get("raw_text") or ocr_result.get("text") or "").strip()
    layout_text = str(ocr_result.get("layout_text") or "").strip()

    scan_side = ScanSide(
        label=label,
        source=side.get("source"),
        ocr_raw_text=ocr_text,
        ocr_engine=ocr_result.get("engine") or "ocr_space",
        ocr_confidence=float(ocr_result.get("confidence") or 0.0),
        ocr_regions=ocr_result.get("regions") or [],
        layout_regions=ocr_result.get("layout_regions") or [],
        layout_text=layout_text or None,
        image_quality=quality,
        detection=detection,
    )

    return {
        "label": label,
        "detection": detection,
        "ocr_result": ocr_result,
        "ocr_text": ocr_text,
        "layout_text": layout_text,
        "scan_side": scan_side,
        "warnings": side_warnings,
    }


def _run_ocr(image_ref: str) -> Dict[str, Any]:
    """Run the production OCR engine; a partial failure returns a warning dict."""
    try:
        result = get_ocr_service().process_image(image_ref)
        if isinstance(result, dict):
            return result
        return dict(_OCR_FAILURE_TEMPLATE)
    except ValueError:
        raise
    except Exception as exc:
        logger.error("OCR unexpectedly raised during scan: %s", exc)
        failure = dict(_OCR_FAILURE_TEMPLATE)
        failure["quality_reason"] = str(exc)
        return failure


def _merge_quality(
    quality: Optional[ImageQuality],
    ocr_result: Dict[str, Any],
    label: str,
    warnings: List[str],
) -> Optional[ImageQuality]:
    """Combine the static quality stage with the OCR engine's own verdict.

    When OCR reports a degraded grade (poor/unusable) that the static stage
    missed, the per-side quality reflects the stricter (OCR) verdict — OCR
    success/failure is the ground truth of whether text was readable.
    """
    ocr_grade = ocr_result.get("image_quality")
    ocr_reason = ocr_result.get("quality_reason")

    if quality is None and ocr_grade:
        quality = ImageQuality(overall=str(ocr_grade), score=0, reason=ocr_reason)
    elif ocr_grade in {"poor", "unusable"} and quality is not None:
        if ocr_grade == "unusable" and quality.overall != "unusable":
            combined_reason = "; ".join(
                filter(None, (quality.reason, ocr_reason))
            )
            quality = ImageQuality(
                overall="unusable",
                score=0,
                reason=combined_reason or None,
            )
            warnings.append(
                f"Image '{label}' OCR was unreadable{(': ' + ocr_reason) if ocr_reason else ''}."
            )
        elif ocr_grade == "poor" and quality.overall == "usable":
            quality = ImageQuality(
                overall="poor",
                score=min(quality.score, 59),
                reason=ocr_reason or quality.reason,
            )
    return quality


def _combine_ocr_text(*texts: str) -> str:
    """Merge multiple OCR passes, dropping duplicate lines.

    Full-image OCR keeps its reading order (the title line stays first). Lines
    the single-pass pass missed or garbled are appended once; duplicates are
    dropped so the extraction regexes never see the same declaration twice.
    """
    seen = set()
    merged: List[str] = []
    for text in texts:
        for line in (text or "").splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            key = stripped.casefold()
            if key not in seen:
                seen.add(key)
                merged.append(stripped)
    return "\n".join(merged)


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
        "importer_name": value("importer_name"),
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