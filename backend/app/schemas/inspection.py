from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.schemas.compliance import ComplianceResult
from app.schemas.product import ProductField


class ScanRequest(BaseModel):
    image_url: Optional[str] = None
    product_name: Optional[str] = None
    brand_name: Optional[str] = None
    manufacturer: Optional[str] = None
    manufacturer_name: Optional[str] = None
    category: Optional[str] = None
    product_category: Optional[str] = None
    is_imported: Optional[bool] = False


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
