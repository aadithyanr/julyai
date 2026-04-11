"""Configuration management for JulyAI backend."""

from pydantic_settings import BaseSettings
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    runpod_api_key: str = ""
    runpod_enabled: bool = False
    backend_url: str = "http://localhost:8000"
    runpod_callback_enabled: bool = False
    gemini_api_key: str = "AIzaSyBKYWiGaiVnNjN2G2m_sfPEsZLSmazA_3E"

    # Supabase configuration
    supabase_url: str = ""
    supabase_key: str = ""  # Fallback for backward compatibility
    supabase_anon_key: str = ""  # Anon key for frontend operations
    supabase_service_role_key: str = ""  # Service role key for backend operations
    supabase_ai_models_bucket: str = "ai-models"
    supabase_datasets_bucket: str = "datasets"

    # Google Cloud Storage configuration (legacy)
    gcs_bucket_name: str = ""
    google_application_credentials: str = ""
    max_upload_size_mb: int = 200

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

# Set RunPod API key globally for Flash
if settings.runpod_api_key:
    os.environ["RUNPOD_API_KEY"] = settings.runpod_api_key
