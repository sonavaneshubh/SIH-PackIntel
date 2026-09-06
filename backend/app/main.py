import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import scan, inspection, compliance, reports
from app.services.ocr_service import get_tesseract_diagnostics


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    diagnostics = get_tesseract_diagnostics()
    if diagnostics["available"]:
        logger.info("OCR ready: Tesseract %s", diagnostics["version"])
    else:
        logger.warning("OCR unavailable: %s", diagnostics["message"])
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
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    settings.FRONTEND_URL,
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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