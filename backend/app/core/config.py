import re
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "PackIntel Backend API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"

    SUPABASE_URL: str = "https://your-project-id.supabase.co"
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    FRONTEND_URL: str = "http://localhost:3000"
    TESSERACT_CMD: str = ""
    VISION_PROVIDER: str = "gemini"
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    OPENAI_API_URL: str = "https://api.openai.com/v1/chat/completions"
    VISION_API_KEY: str = ""
    VISION_MODEL: str = "gemini-3.6-flash"
    VISION_TIMEOUT_SECONDS: int = 30

    # Master switch for multimodal (Gemini) vision fallback in the scan
    # pipeline. The OCR.Space engine is the only OCR source; this flag merely
    # re-arms the optional vision pass for future use. Off by default.
    ENABLE_VISION_FALLBACK: bool = False

    # Pipeline tuning (see scanning pipeline services).
    # Detection confidence below which an image is NOT considered a food
    # package (0.0-1.0). Detection failure never aborts a scan.
    FOOD_PACKAGE_CONFIDENCE_THRESHOLD: float = 0.45
    # Maximum accepted image payload (MiB) per uploaded scan image.
    MAX_IMAGE_SIZE_MB: int = 10
    # Hard timeout (seconds) for each OCR.Space API call.
    OCR_TIMEOUT_SECONDS: int = 60

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def clean_supabase_url(self) -> str:
        url = self.SUPABASE_URL or ""
        url = re.sub(r"/rest/v1/?$", "", url)
        return url.rstrip("/")


settings = Settings()
