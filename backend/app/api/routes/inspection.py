from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.core.config import settings
from app.api.dependencies import get_current_user
from supabase import create_client, Client

router = APIRouter()


def get_supabase_admin() -> Optional[Client]:
    if settings.SUPABASE_SERVICE_ROLE_KEY:
        try:
            return create_client(settings.clean_supabase_url, settings.SUPABASE_SERVICE_ROLE_KEY)
        except Exception:
            return None
    return None


class InspectionCreateRequest(BaseModel):
    product_name: str
    brand_name: Optional[str] = None
    manufacturer_name: str
    product_category: str
    is_imported: bool = False


class InspectionUpdateRequest(BaseModel):
    status: Optional[str] = None
    overall_result: Optional[str] = None
    risk_score: Optional[int] = None
    notes: Optional[str] = None
    inspected_at: Optional[str] = None


class InspectionResponse(BaseModel):
    id: str
    inspection_number: str
    inspector_id: str
    product_name: Optional[str]
    brand_name: Optional[str]
    manufacturer_name: Optional[str]
    product_category: Optional[str]
    is_imported: bool
    status: str
    overall_result: Optional[str]
    risk_score: Optional[int]
    notes: Optional[str]
    inspected_at: Optional[str]
    created_at: str
    updated_at: str


@router.post("/inspection", response_model=InspectionResponse)
async def create_inspection(
    request: InspectionCreateRequest, current_user: dict = Depends(get_current_user)
):
    """
    POST /api/inspection
    Creates a new inspection record in Supabase.
    """
    supabase = get_supabase_admin()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    inspector_id = current_user.get("sub")
    if not inspector_id:
        raise HTTPException(status_code=401, detail="Invalid user")

    # Generate inspection number
    now = datetime.utcnow()
    inspection_number = f"INS-{now.strftime('%Y%m%d')}-{now.strftime('%H%M%S')}"

    payload = {
        "inspection_number": inspection_number,
        "inspector_id": inspector_id,
        "product_name": request.product_name,
        "brand_name": request.brand_name,
        "manufacturer_name": request.manufacturer_name,
        "product_category": request.product_category,
        "is_imported": request.is_imported,
        "status": "draft",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }

    result = supabase.table("inspections").insert(payload).select().single().execute()

    if result.error:
        raise HTTPException(status_code=500, detail=f"Failed to create inspection: {result.error.message}")

    return result.data


@router.get("/inspections", response_model=List[InspectionResponse])
async def list_inspections(
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: dict = Depends(get_current_user)
):
    """
    GET /api/inspections
    Lists user's inspection history from Supabase.
    """
    supabase = get_supabase_admin()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    inspector_id = current_user.get("sub")
    if not inspector_id:
        raise HTTPException(status_code=401, detail="Invalid user")

    query = supabase.table("inspections").select("*").eq("inspector_id", inspector_id).order("created_at", desc=True).range(offset, offset + limit - 1)

    if status_filter:
        query = query.eq("status", status_filter)

    result = query.execute()

    if result.error:
        raise HTTPException(status_code=500, detail=f"Failed to list inspections: {result.error.message}")

    return result.data or []


@router.get("/inspection/{inspection_id}", response_model=InspectionResponse)
async def get_inspection(inspection_id: str, current_user: dict = Depends(get_current_user)):
    """
    GET /api/inspection/{inspection_id}
    Retrieves details for a specific inspection from Supabase.
    """
    supabase = get_supabase_admin()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    inspector_id = current_user.get("sub")
    if not inspector_id:
        raise HTTPException(status_code=401, detail="Invalid user")

    result = supabase.table("inspections").select("*").eq("id", inspection_id).eq("inspector_id", inspector_id).single().execute()

    if result.error:
        if result.error.code == "PGRST116":
            raise HTTPException(status_code=404, detail="Inspection not found")
        raise HTTPException(status_code=500, detail=f"Failed to get inspection: {result.error.message}")

    return result.data


@router.patch("/inspection/{inspection_id}", response_model=InspectionResponse)
async def update_inspection(
    inspection_id: str, request: InspectionUpdateRequest, current_user: dict = Depends(get_current_user)
):
    """
    PATCH /api/inspection/{inspection_id}
    Updates an inspection record in Supabase.
    """
    supabase = get_supabase_admin()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    inspector_id = current_user.get("sub")
    if not inspector_id:
        raise HTTPException(status_code=401, detail="Invalid user")

    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.utcnow().isoformat()

    result = supabase.table("inspections").update(updates).eq("id", inspection_id).eq("inspector_id", inspector_id).select().single().execute()

    if result.error:
        if result.error.code == "PGRST116":
            raise HTTPException(status_code=404, detail="Inspection not found")
        raise HTTPException(status_code=500, detail=f"Failed to update inspection: {result.error.message}")

    return result.data