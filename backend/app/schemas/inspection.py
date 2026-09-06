from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.schemas.compliance import ComplianceResult
from app.schemas.product import ProductField


class ScanRequest(BaseModel):
    """Accept either a single-image JSON body (backward compatible) or the
    fields carried alongside the multipart upload (files handled separately).

    ``image_url`` / ``back_image_url`` support the legacy JSON body where images
    are referenced by URL or data URI. New clients should send ``front_image``
    and ``back_image`` as multipart file fields to the same endpoint.
    """

    image_url: Optional[str] = None
    # Explicit aliases so the frontend can name the two sides clearly.
    front_image_url: Optional[str] = None
    back_image_url: Optional[str] = None
    product_name: Optional[str] = None
    brand_name: Optional[str] = None
    manufacturer: Optional[str] = None
    manufacturer_name: Optional[str] = None
    category: Optional[str] = None
    product_category: Optional[str] = None
    is_imported: Optional[bool] = False


class ImageDetection(BaseModel):
    """Outcome of the food-package detection stage for one image."""

    is_food_package: bool = False
    confidence: float = 0.0
    reason: str = ""


class ImageQuality(BaseModel):
    """Standalone quality verdict for one side of the scan."""

    overall: str = "unknown"  # usable | poor | unusable | unknown
    score: int = 0
    reason: Optional[str] = None


class ScanSide(BaseModel):
    """Per-image (front/back) processing outcome."""

    label: Optional[str] = None  # "front" | "back"
    source: Optional[str] = None  # url / data-uri / upload
    ocr_raw_text: str = ""
    ocr_engine: Optional[str] = None
    ocr_confidence: float = 0.0
    ocr_regions: List[Dict[str, Any]] = []
    layout_regions: List[Dict[str, Any]] = []
    layout_text: Optional[str] = None
    image_quality: Optional[ImageQuality] = None
    detection: Optional[ImageDetection] = None


class ScanResponse(BaseModel):
    status: str = "success"
    success: bool = True
    scan_completed: bool = True
    inspection_id: str
    message: str = "Scan processing started successfully."
    ocr_raw_text: Optional[str] = None
    ocr_engine: Optional[str] = None
    ocr_confidence: float = 0.0
    ocr_regions: List[Dict[str, Any]] = []
    layout_regions: List[Dict[str, Any]] = []
    layout_text: Optional[str] = None
    layout_region_count: int = 0
    extracted_declarations: Optional[Dict[str, Any]] = None
    product_information: Dict[str, ProductField] = {}
    extraction_source: str = "ocr"
    vision_used: bool = False
    vision_error: Optional[str] = None
    extraction_confidence: Optional[float] = None
    compliance_results: List[ComplianceResult] = []
    score: int = 0
    compliance_score: int = 0
    risk_score: int = 0
    overall_result: str = "review"
    image_quality: str = "unknown"
    quality_reason: Optional[str] = None
    report: Optional[str] = None

    # ---- Two-image pipeline additions (all optional / backward compatible) ----
    front_side: Optional[ScanSide] = None
    back_side: Optional[ScanSide] = None
    images_processed: int = 0
    detection: Optional[ImageDetection] = None
    warnings: List[str] = []


class InspectionCreate(BaseModel):
    product_name: str
    category: str
    manufacturer: str
    is_imported: bool = False
    image_url: Optional[str] = None


class InspectionResponse(BaseModel):
    id: str
    inspection_number: str
    product_name: str
    category: str
    manufacturer: str
    is_imported: bool
    status: str
    overall_result: Optional[str] = None
    risk_score: Optional[int] = None
    compliance_score: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
