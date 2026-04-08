from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://prowler:prowler@localhost:5432/cloudaudit"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    encryption_key: str = ""  # Fernet key base64; empty uses derived dev key (not for prod)
    prowler_image: str = "prowlercloud/prowler:stable"
    prowler_auto_pull: bool = False
    scan_output_dir: str = "/data/scans"
    docker_available: bool = False
    github_token: str | None = None
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    gemini_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
