from datetime import datetime
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from app.schemas.compliance import ComplianceCheckRequest, ComplianceCheckResponse, ComplianceResult
from app.services.compliance_service import ComplianceService
from app.services.rules_service import RulesService, CodifiedRule
from app.api.dependencies import get_current_user
from app.core.config import settings

try:
    from supabase import create_client, Client
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False

router = APIRouter()


def get_supabase_admin() -> Optional[Any]:
    if HAS_SUPABASE and settings.SUPABASE_SERVICE_ROLE_KEY and settings.clean_supabase_url:
        try:
            return create_client(settings.clean_supabase_url, settings.SUPABASE_SERVICE_ROLE_KEY)
        except Exception:
            return None
    return None


@router.get("/compliance/rules", response_model=List[CodifiedRule])
async def get_rules():
    """
    GET /api/compliance/rules
    Returns active codified Legal Metrology rules from the Rules Database.
    """
    return RulesService.get_active_rules()


@router.post("/compliance/check", response_model=ComplianceCheckResponse)
async def check_compliance(
    request: ComplianceCheckRequest, current_user: dict = Depends(get_current_user)
):
    """
    POST /api/compliance/check
    Runs rule-driven Legal Metrology compliance checks and saves results to Supabase.
    """
    supabase = get_supabase_admin()

    # Evaluate compliance using rule-driven service
    response = ComplianceService.evaluate_compliance(
        inspection_id=request.inspection_id,
        declarations=request.declarations,
        product_information=request.product_information,
        is_imported=request.is_imported,
    )

    # Save compliance results to Supabase if configured
    if supabase and request.inspection_id:
        try:
            compliance_records = []
            for rule_result in response.results:
                compliance_records.append({
                    "inspection_id": request.inspection_id,
                    "rule_code": rule_result.rule_code or rule_result.rule_id,
                    "rule_name": rule_result.rule_name,
                    "requirement": rule_result.requirement or "",
                    "extracted_value": rule_result.detected_value or rule_result.extracted_value or "",
                    "result": rule_result.result,
                    "explanation": rule_result.reason or rule_result.explanation or "",
                    "evidence": rule_result.evidence_text or rule_result.evidence or "",
                    "created_at": datetime.utcnow().isoformat(),
                })

            if compliance_records:
                # Idempotent write: an inspection must have one result row per
                # rule. Remove any previously stored results before inserting so
                # a re-run of the check never duplicates rule rows (mirrors the
                # unique index on (inspection_id, rule_code)).
                supabase.table("compliance_results").delete().eq(
                    "inspection_id", request.inspection_id
                ).execute()
                supabase.table("compliance_results").insert(compliance_records).execute()
        except Exception as e:
            # Log error but don't fail the request
            print(f"Failed to save compliance results: {e}")

    return response


@router.get("/compliance/results/{inspection_id}", response_model=List[ComplianceResult])
async def get_compliance_results(inspection_id: str, current_user: dict = Depends(get_current_user)):
    """
    GET /api/compliance/results/{inspection_id}
    Retrieves compliance results for an inspection from Supabase.
    """
    supabase = get_supabase_admin()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    inspector_id = current_user.get("sub")
    if not inspector_id:
        raise HTTPException(status_code=401, detail="Invalid user")

    # Verify inspection belongs to user
    insp_result = supabase.table("inspections").select("id").eq("id", inspection_id).eq("inspector_id", inspector_id).single().execute()
    if getattr(insp_result, "error", None):
        raise HTTPException(status_code=404, detail="Inspection not found")

    result = supabase.table("compliance_results").select("*").eq("inspection_id", inspection_id).order("created_at").execute()

    if getattr(result, "error", None):
        raise HTTPException(status_code=500, detail=f"Failed to get compliance results: {result.error.message}")

    return result.data or []