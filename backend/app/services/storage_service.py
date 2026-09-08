"""
Supabase Storage helpers for the inspection pipeline.

Buckets are configured through environment variables (see ``Settings``) and
are created lazily at application startup so the backend never depends on a
manually provisioned Storage bucket.
"""
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

STORAGE_API_BASE = "/storage/v1"
# Placeholder used by Settings when SUPABASE_URL has not been configured.
_PLACEHOLDER_SUPABASE_URL = "https://your-project-id.supabase.co"


def supabase_headers() -> dict[str, str]:
    """Service-role headers for the Supabase Management/Storage Admin API."""
    return {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    }


def is_supabase_configured() -> bool:
    return (
        bool(settings.SUPABASE_SERVICE_ROLE_KEY)
        and bool(settings.SUPABASE_URL)
        and settings.SUPABASE_URL != _PLACEHOLDER_SUPABASE_URL
    )


async def storage_bucket_exists(bucket_name: str) -> bool:
    """Returns True when the bucket exists (idempotent read)."""
    if not is_supabase_configured():
        return False
    url = f"{settings.clean_supabase_url}{STORAGE_API_BASE}/bucket/{bucket_name}"
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url, headers=supabase_headers())
        return response.status_code == 200


async def create_storage_bucket(
    bucket_name: str,
    *,
    public: bool = False,
    file_size_limit: int | None = None,
    allowed_mime_types: list[str] | None = None,
) -> bool:
    """Creates a Storage bucket. Safe to call repeatedly (409 = already exists)."""
    if not is_supabase_configured():
        logger.info("Supabase not configured; skipping bucket creation for %r", bucket_name)
        return False
    url = f"{settings.clean_supabase_url}{STORAGE_API_BASE}/bucket"
    payload: dict = {
        "name": bucket_name,
        "id": bucket_name,
        "public": public,
    }
    if file_size_limit is not None:
        payload["file_size_limit"] = file_size_limit
    if allowed_mime_types:
        payload["allowed_mime_types"] = allowed_mime_types
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(url, headers=supabase_headers(), json=payload)
        return response.status_code in (200, 201, 409)


async def ensure_inspection_reports_bucket() -> None:
    """
    Ensures the ``REPORT_STORAGE_BUCKET`` configured in the environment exists.

    Called from the app lifespan; never raises so a missing or misconfigured
    Supabase project cannot crash the API — it logs and moves on.
    """
    bucket = settings.REPORT_STORAGE_BUCKET
    try:
        if await storage_bucket_exists(bucket):
            logger.info("Report storage bucket %r exists", bucket)
            return
        if await create_storage_bucket(bucket):
            logger.info("Report storage bucket %r ensured", bucket)
    except Exception:
        logger.exception("Failed to ensure report storage bucket %r", bucket)