from typing import Optional
from fastapi import Header, HTTPException, status
from app.core.config import settings
from supabase import create_client, Client


def get_supabase_client() -> Optional[Client]:
    url = settings.clean_supabase_url
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    if url and key:
        try:
            return create_client(url, key)
        except Exception:
            return None
    return None


def _is_production() -> bool:
    return settings.ENVIRONMENT.strip().lower() in ("production", "prod")


async def verify_auth_token(authorization: Optional[str] = Header(None)) -> dict:
    """
    Verifies the Bearer token with Supabase Auth and authorizes the caller.

    Authorization rules (fail closed):
      - A valid Supabase access token is always required.
      - The caller's ``profiles`` row is authoritative for role and status.
      - ``admin`` accounts are allowed.
      - ``inspector`` accounts are allowed only while ``verification_status``
        is ``approved``. Pending, rejected and suspended inspectors are denied.

    When no Supabase project is configured the backend fails closed in
    production. In development/test it returns a local identity so tooling and
    the test suite can run without a live auth provider.
    """
    supabase = get_supabase_client()

    if supabase is None:
        if _is_production():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication backend is not configured.",
            )
        return {"sub": "dev-user", "role": "authenticated", "verification_status": "approved"}

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    token = authorization[len("Bearer ") :].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    try:
        result = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication credentials.",
        )

    if not result or not result.user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication credentials.",
        )

    user = result.user

    # The profiles table is authoritative for authorization state; JWT metadata
    # is only a snapshot and must never be trusted for role/status decisions.
    role: Optional[str] = None
    verification_status: Optional[str] = None
    try:
        profile_res = (
            supabase.table("profiles")
            .select("role, verification_status")
            .eq("id", user.id)
            .limit(1)
            .execute()
        )
        rows = profile_res.data or []
        if rows:
            role = rows[0].get("role")
            verification_status = rows[0].get("verification_status")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify account authorization.",
        )

    if role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account profile not found.",
        )

    if role == "admin":
        pass
    elif role == "inspector":
        if verification_status != "approved":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is not authorized for inspection access.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not authorized.",
        )

    return {
        "sub": user.id,
        "email": user.email,
        "role": role,
        "verification_status": verification_status,
    }
