import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.routes import scan, inspection, compliance, reports
from app.services.ocr_service import get_tesseract_diagnostics
from app.services.storage_service import ensure_inspection_reports_bucket


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    diagnostics = get_tesseract_diagnostics()
    if diagnostics["available"]:
        logger.info("OCR ready: Tesseract %s", diagnostics["version"])
    else:
        logger.warning("OCR unavailable: %s", diagnostics["message"])

    await ensure_inspection_reports_bucket()

    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)


# ============================================================
# CORS CONFIGURATION
# ============================================================

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    settings.FRONTEND_URL,
]

# Vercel production + preview deployments. FRONTEND_URL (set in Render env)
# covers the apex custom domain; this regex also lets every `*.vercel.app`
# preview URL talk to the API without per-deployment CORS edits.
allow_origin_regex = r"https://.*\.vercel\.app"


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)


def _cors_headers(request: Request) -> dict:
    """
    Best-effort CORS headers for locally-built error responses.
    The real CORSMiddleware normally adds these; this is a safety net so the
    browser can read structured error bodies instead of reporting a bare CORS
    failure when the handler itself raised.
    """
    origin = request.headers.get("origin") or ""
    if origin and (origin in origins or settings.FRONTEND_URL):
        return {
            "Access-Control-Allow-Origin": origin,
            "Vary": "Origin",
        }
    return {}


# ============================================================
# EXCEPTION HANDLERS
# ============================================================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Custom handler for validation errors.
    Sanitizes binary `bytes` in input values so `jsonable_encoder` never throws
    UnicodeDecodeError when binary image data is present in form fields.
    """
    logger.warning("Request validation error on %s %s", request.method, request.url.path)
    clean_errors = []
    for err in exc.errors():
        error_dict = dict(err)
        if "input" in error_dict:
            raw_input = error_dict["input"]
            if isinstance(raw_input, bytes):
                try:
                    error_dict["input"] = raw_input.decode("utf-8")
                except UnicodeDecodeError:
                    error_dict["input"] = f"<binary data ({len(raw_input)} bytes)>"
            elif not isinstance(raw_input, (str, int, float, bool, type(None), list, dict)):
                error_dict["input"] = str(raw_input)
        clean_errors.append(error_dict)
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": clean_errors},
        headers=_cors_headers(request),
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler to log unhandled errors and return structured 500
    responses with proper CORS headers.
    """
    logger.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers=_cors_headers(request),
    )



# ============================================================
# API ROUTES
# ============================================================

app.include_router(
    scan.router,
    prefix=settings.API_V1_STR,
    tags=["scan"],
)

app.include_router(
    inspection.router,
    prefix=settings.API_V1_STR,
    tags=["inspection"],
)

app.include_router(
    compliance.router,
    prefix=settings.API_V1_STR,
    tags=["compliance"],
)

app.include_router(
    reports.router,
    prefix=settings.API_V1_STR,
    tags=["reports"],
)


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health", tags=["health"])
async def health_check():
    """
    Health check endpoint for service monitoring.
    """
    return {"status": "ok"}