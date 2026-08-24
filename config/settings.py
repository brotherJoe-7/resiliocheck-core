# config/settings.py
# ===================
# ResilioCheck System Configuration
#
# All runtime configuration is sourced from environment variables.
# Defaults here are safe for local development ONLY — override via a .env
# file (never commit secrets).  Pydantic BaseSettings performs strict
# validation so misconfigured deployments fail fast at startup.

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    Central settings object.

    Usage::

        from config.settings import get_settings
        cfg = get_settings()
        print(cfg.groq_api_key)  # reads GROQ_API_KEY env var
    """

    # ── Service URLs ──────────────────────────────────────────────────────────
    gateway_host: str = Field(default="0.0.0.0", alias="GATEWAY_HOST")
    gateway_port: int = Field(default=8000,      alias="GATEWAY_PORT")
    engine_url: AnyHttpUrl = Field(
        default="http://localhost:8001",          alias="ENGINE_URL"
    )
    dashboard_port: int = Field(default=8501,    alias="DASHBOARD_PORT")

    # ── AI / LLM ─────────────────────────────────────────────────────────────
    groq_api_key: str = Field(default="",        alias="GROQ_API_KEY")
    groq_model: str   = Field(
        default="llama-3.3-70b-versatile",       alias="GROQ_MODEL"
    )
    llm_temperature: float = Field(default=0.0,  alias="LLM_TEMPERATURE")

    # ── GitHub ───────────────────────────────────────────────────────────────
    github_token: str = Field(default="",        alias="GITHUB_TOKEN")

    # ── ChromaDB ─────────────────────────────────────────────────────────────
    chroma_persist_dir: str = Field(
        default="./data/chromadb",               alias="CHROMA_PERSIST_DIR"
    )

    # ── Sandbox ───────────────────────────────────────────────────────────────
    docker_socket: str = Field(
        default="unix:///var/run/docker.sock",   alias="DOCKER_SOCKET"
    )
    sandbox_timeout_seconds: int = Field(
        default=120,                             alias="SANDBOX_TIMEOUT_SECONDS"
    )

    # ── Logging ───────────────────────────────────────────────────────────────
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(
        default="INFO",                          alias="LOG_LEVEL"
    )
    log_dir: str = Field(default="./logs",       alias="LOG_DIR")

    # ── Environment ───────────────────────────────────────────────────────────
    environment: Literal["development", "staging", "production"] = Field(
        default="development",                   alias="ENVIRONMENT"
    )

    @field_validator("groq_api_key")
    @classmethod
    def _require_api_key_in_prod(cls, v: str, info) -> str:  # type: ignore[no-untyped-def]
        # Deferred production check — info.data may not have 'environment' yet
        # when this validator runs; do a runtime guard in get_settings() below.
        return v

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "populate_by_name": True,
        "extra": "ignore",
    }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton Settings instance."""
    cfg = Settings()
    if cfg.environment == "production" and not cfg.groq_api_key:
        raise RuntimeError(
            "GROQ_API_KEY must be set in production environments. "
            "Set the environment variable before starting the service."
        )
    return cfg
