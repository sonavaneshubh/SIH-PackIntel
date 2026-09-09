import re
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "PackIntel Backend API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"

    SUPABASE_URL: str = "https://your-project-id.supabase.co"
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    # Name of the Supabase Storage bucket used for compliance report artifacts.
    # Create this bucket in Supabase Storage (e.g. "inspection-reports").
    REPORT_STORAGE_BUCKET: str = "inspection-reports"
    FRONTEND_URL: str = "http://localhost:3000"
    TESSERACT_CMD: str = ""
    VISION_PROVIDER: str = "gemini"
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    OPENAI_API_URL: str = "https://api.openai.com/v1/chat/completions"
    VISION_API_KEY: str = ""
    VISION_MODEL: str = "gemini-2.5-flash"
    VISION_TIMEOUT_SECONDS: int = 30

    # Master switch for multimodal (Gemini) vision fallback in the scan
    # pipeline. The OCR.Space engine is the only OCR source; this flag merely
    # re-arms the optional vision pass for future use. Off by default.
    ENABLE_VISION_FALLBACK: bool = False

    # Primary Gemini Vision extraction: when enabled, Gemini analyses the
    # actual image and returns structured product data directly, bypassing
    # the OCR → text-normalizer → product-extractor path. Disabled by default
    # so that existing tests run against the OCR-only pipeline.
    GEMINI_PRIMARY_ENABLED: bool = False

    # Pipeline tuning (see scanning pipeline services).
    # Detection confidence below which an image is NOT considered a food
    # package (0.0-1.0). Detection failure never aborts a scan.
    FOOD_PACKAGE_CONFIDENCE_THRESHOLD: float = 0.45
    # Maximum accepted image payload (MiB) per uploaded scan image.
    MAX_IMAGE_SIZE_MB: int = 10
    # Hard cap on the longest image side (px). Images are downscaled to this
    # bound at ingestion so every decoded copy downstream (PIL buffer, base64
    # data URI, PNG re-encode, OCR/vision fetch) stays small. 1600 px is ample
    # for label OCR text and matches the common 2000 px OCR.Space limit.
    MAX_IMAGE_DIMENSION: int = 1600
    # Maximum bytes accepted when downloading an image URL (scan JSON path).
    # Guards the pipeline against unbounded remote downloads spiking memory.
    MAX_IMAGE_DOWNLOAD_MB: int = 15
    # Hard timeout (seconds) for each OCR.Space API call.
    OCR_TIMEOUT_SECONDS: int = 60

    # When True, the scan pipeline logs the worker's RSS at key stages so peak
    # memory can be observed in the Render logs. Off by default; never a
    # high-frequency logger (one line per scan stage, not per event).
    ENABLE_MEMORY_MONITOR: bool = False

    # Supabase Storage bucket that holds generated inspection report artifacts
    # (PDF/JSON/Excel). The backend ensures it exists at startup and the
    # frontend uploads reports into it. Keep in sync with the frontend bucket.
    REPORT_STORAGE_BUCKET: str = "inspection-reports"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def clean_supabase_url(self) -> str:
        url = self.SUPABASE_URL or ""
        url = re.sub(r"/rest/v1/?$", "", url)
        return url.rstrip("/")


settings = Settings()
