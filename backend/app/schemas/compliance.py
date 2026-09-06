from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class ComplianceCheckRequest(BaseModel):
    inspection_id: Optional[str] = None
    declarations: Optional[Dict[str, Any]] = None
    product_information: Optional[Dict[str, Any]] = None
    is_imported: bool = False


class ComplianceRuleResult(BaseModel):
    rule_id: str
    rule_name: str
    status: str  # PASS, FAIL, UNCERTAIN, NOT_APPLICABLE
    details: str


class ComplianceResult(BaseModel):
    """A compliance rule result aligned with Legal Metrology validation requirements."""

    rule_id: str = "RULE-PC-01"
    rule_code: str = "RULE-PC-01"
    rule_name: str
    legal_reference: str = ""
    applicable: bool = True
    detected_value: Optional[str] = None
    normalized_value: Optional[str] = None
    extracted_value: Optional[str] = None  # legacy alias
    ocr_confidence: float = 0.0
    status: str = "PASS"  # PASS, FAIL, UNCERTAIN, NOT_APPLICABLE
    result: str = "pass"  # pass, fail, warning, not_applicable (legacy sync)
    reason: str = ""
    explanation: str = ""  # legacy alias
    evidence_text: Optional[str] = None
    evidence: Optional[str] = None  # legacy alias
    requirement: Optional[str] = None


class ComplianceCheckResponse(BaseModel):
    inspection_id: Optional[str] = None
    overall_result: str = "pass"  # pass, review, fail
    overall_status: str = "PASS"  # PASS, REVIEW_REQUIRED, FAIL, INCONCLUSIVE
    risk_score: int = 0
    compliance_score: int = 0
    results: List[ComplianceResult] = Field(default_factory=list)


class ReportGenerationRequest(BaseModel):
    inspection_id: str
    format: Optional[str] = "pdf"


class ReportGenerationResponse(BaseModel):
    report_id: str
    inspection_id: str
    download_url: str
    generated_at: str
