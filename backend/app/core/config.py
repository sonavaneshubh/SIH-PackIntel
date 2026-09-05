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
    VISION_MODEL: str = "gemini-2.5-flash"
    VISION_TIMEOUT_SECONDS: int = 30

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def clean_supabase_url(self) -> str:
        url = self.SUPABASE_URL or ""
        url = re.sub(r"/rest/v1/?$", "", url)
        return url.rstrip("/")


settings = Settings()
