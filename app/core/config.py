from pathlib import Path
import os

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic_settings.sources import DotEnvSettingsSource


class Settings(BaseSettings):
    # =========================================
    # Environment Configuration
    # =========================================
    APP_ENV: str = "development"

    # =========================================
    # Pydantic Settings Configuration
    # =========================================
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # =========================================
    # Application Metadata
    # =========================================
    APP_NAME: str = "PurifieldWater Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # =========================================
    # Server Configuration
    # =========================================
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    LOG_LEVEL: str = "INFO"

    # =========================================
    # Upload and Storage Configuration
    # =========================================
    MAX_UPLOAD_SIZE: int = 3 * 1024 * 1024
    REQUEST_TIMEOUT: int = 10

    # =========================================
    # Database Configuration
    # =========================================
    DATABASE_URL: str = "postgresql+asyncpg://engineer:plant172839@postgres/purifield-water"

    STORAGE_DIR: Path = Path("storage")
    UPLOAD_DIR: Path = Path("storage/uploads")
    UPLOAD_PROFILE_DIR: Path = Path("storage/profile")

    # =========================================
    # Redis Configuration
    # =========================================
    REDIS_URL: str = "redis://redis:6379/0"

    # =========================================
    # JWT / Auth Configuration
    # =========================================
    SECRET_KEY: str = os.getenv('SECRET_KEY', 'dev-secret-change-me')
    ALGORITHM: str = os.getenv('JWT_ALGORITHM', 'HS256')
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '60'))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv('REFRESH_TOKEN_EXPIRE_DAYS', '7'))

    # =========================================
    # Admin Bootstrap Configuration
    # =========================================
    APP_ADMIN_USERNAME: str = "admin"
    APP_ADMIN_PASSWORD: str = "admin"
    APP_ADMIN_ROLE: str = "super admin"

    # =========================================
    # SMTP / Email Notification Configuration
    # =========================================
    SMTP_HOST: str | None = os.getenv('SMTP_HOST', None)
    SMTP_PORT: int = int(os.getenv('SMTP_PORT', '587'))
    SMTP_USER: str | None = os.getenv('SMTP_USER', None)
    SMTP_PASSWORD: str | None = os.getenv('SMTP_PASSWORD', None)
    SMTP_FROM_EMAIL: str | None = os.getenv('SMTP_FROM_EMAIL', None)
    SMTP_FROM_NAME: str = os.getenv('SMTP_FROM_NAME', 'Purifield Water Alarm System')
    SMTP_TLS: bool = os.getenv('SMTP_TLS', 'true').lower() in ('true', '1', 'yes')

    def settings_customise_sources(cls, *args, **kwargs):
        settings_cls = kwargs.get('settings_cls', cls)

        init_settings = None
        env_settings = None
        file_secret_settings = None

        if len(args) == 5:
            settings_cls = args[0] or settings_cls
            init_settings = args[1]
            env_settings = args[2]
            file_secret_settings = args[4]
        elif len(args) == 4:
            init_settings = args[0]
            env_settings = args[1]
            file_secret_settings = args[3]
        elif len(args) == 3:
            init_settings = args[0]
            env_settings = args[1]
            file_secret_settings = args[2]
        else:
            init_settings = kwargs.get('init_settings')
            env_settings = kwargs.get('env_settings')
            file_secret_settings = kwargs.get('file_secret_settings')
            settings_cls = kwargs.get('settings_cls', settings_cls)

        env_name = os.getenv("APP_ENV", "development")

        dotenv_env = DotEnvSettingsSource(settings_cls, f".env.{env_name}")
        dotenv_default = DotEnvSettingsSource(settings_cls, ".env")

        return (
            init_settings,
            env_settings,
            dotenv_env,
            dotenv_default,
            file_secret_settings,
        )


# =========================================
# Singleton Settings Instance
# =========================================
settings = Settings()

# Create required directories
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.UPLOAD_PROFILE_DIR.mkdir(parents=True, exist_ok=True)
