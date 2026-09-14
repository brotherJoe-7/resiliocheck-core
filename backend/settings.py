"""
backend/settings.py
===================
Single source of truth for all environment-driven configuration.

Every module imports from here instead of calling ``os.getenv`` with its own
(often inconsistent) defaults.
"""

from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()


def _env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    return value.strip() if value is not None and value.strip() else default


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name, "").lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return default


# ── Environment ─────────────────────────────────────────────────────────────
ENVIRONMENT: str = _env("ENVIRONMENT", "development").lower()
IS_PRODUCTION: bool = ENVIRONMENT in ("production", "prod")

# ── Groq / LLM ──────────────────────────────────────────────────────────────
GROQ_API_KEY: str = _env("GROQ_API_KEY")
GROQ_URL: str = _env("GROQ_URL", "https://api.groq.com/openai/v1/chat/completions")

# Primary model.  ``openai/gpt-oss-120b`` is the strongest model available on
# the Groq free/developer tier.  ``llama-3.3-70b-versatile`` is enterprise-only
# on Groq as of Aug-2026 so it is kept only as a late fallback.
GROQ_MODEL: str = _env("GROQ_MODEL", "openai/gpt-oss-120b")

# Comma-separated list of models to try (in order) if the primary model is
# unavailable, decommissioned, or rate-limited.  Groq rate limits are enforced
# PER MODEL, so switching model is a legitimate way to keep the scan going.
GROQ_FALLBACK_MODELS: list[str] = [
    m.strip()
    for m in _env(
        "GROQ_FALLBACK_MODELS",
        "openai/gpt-oss-20b,qwen/qwen3.6-27b,llama-3.3-70b-versatile,llama-3.1-8b-instant",
    ).split(",")
    if m.strip()
]

LLM_TEMPERATURE: float = _env_float("LLM_TEMPERATURE", 0.0)

# Token budget.  The Groq free tier gives 8 000 tokens / minute for the
# gpt-oss models, so every single request (prompt + completion) must stay
# comfortably below that.
LLM_TPM_BUDGET: int = _env_int("LLM_TPM_BUDGET", 8000)
LLM_MAX_OUTPUT_TOKENS: int = _env_int("LLM_MAX_OUTPUT_TOKENS", 1800)
# Max characters of source code sent to the OWASP agent in one request.
# ~3.6 chars per token  ->  14 000 chars ≈ 3 900 tokens.
LLM_MAX_CONTEXT_CHARS: int = _env_int("LLM_MAX_CONTEXT_CHARS", 14_000)
LLM_MAX_CHARS_PER_FILE: int = _env_int("LLM_MAX_CHARS_PER_FILE", 1_400)
# Largest file (in chars) for which we ask the model to return a full,
# PR-ready patched file.  Larger files are reported but not auto-patched.
PATCH_MAX_FILE_CHARS: int = _env_int("PATCH_MAX_FILE_CHARS", 6_000)
# Hard ceiling on how long the whole pipeline may spend waiting for rate
# limits before giving up (seconds).  Cloud Run's default request timeout is
# 300 s, so keep this well below it.
LLM_MAX_TOTAL_WAIT_SECONDS: int = _env_int("LLM_MAX_TOTAL_WAIT_SECONDS", 150)
LLM_REQUEST_TIMEOUT_SECONDS: int = _env_int("LLM_REQUEST_TIMEOUT_SECONDS", 90)

# ``deterministic`` (default) applies the numeric gate policy locally.
# ``llm`` additionally asks the Gate Agent model to confirm the verdict.
GATE_AGENT_MODE: str = _env("GATE_AGENT_MODE", "deterministic").lower()

# ── GitHub ──────────────────────────────────────────────────────────────────
GITHUB_TOKEN: str = _env("GITHUB_TOKEN")
GITHUB_WEBHOOK_SECRET: str = _env("GITHUB_WEBHOOK_SECRET")

# GitHub OAuth App credentials (used for private repository scanning).
# Register at: https://github.com/settings/developers -> OAuth Apps
GITHUB_CLIENT_ID: str = _env("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET: str = _env("GITHUB_CLIENT_SECRET")

# ── Auth ────────────────────────────────────────────────────────────────────
JWT_SECRET_KEY: str = _env("JWT_SECRET_KEY")
ACCESS_TOKEN_EXPIRE_HOURS: int = _env_int("ACCESS_TOKEN_EXPIRE_HOURS", 24)

# ── CORS ────────────────────────────────────────────────────────────────────
FRONTEND_URL: str = _env("FRONTEND_URL", "http://localhost:3000")

# ── Database ────────────────────────────────────────────────────────────────
DATABASE_URL: str = _env("DATABASE_URL", "sqlite:///./resiliocheck.db")

# ── Sandbox ─────────────────────────────────────────────────────────────────
SANDBOX_ENABLED: bool = _env_bool("SANDBOX_ENABLED", True)
SANDBOX_IMAGE: str = _env("SANDBOX_IMAGE", "resiliocheck-sandbox:latest")
SANDBOX_TIMEOUT_SECONDS: int = _env_int("SANDBOX_TIMEOUT_SECONDS", 180)

# ── Scan limits ─────────────────────────────────────────────────────────────
MAX_FILES_FOR_AI: int = _env_int("MAX_FILES_FOR_AI", 12)


# ── Engine profile → model chain ────────────────────────────────────────────
# The dashboard lets the user pick an "Analysis Engine Profile".  We map that
# free-text label to the model we try FIRST; the remaining models in the
# default chain are appended as fallbacks.

def resolve_model_chain(engine: str | None) -> list[str]:
    """
    Return an ordered, de-duplicated list of Groq model IDs to try for the
    requested engine profile.
    """
    import re as _re
    label = (engine or "").lower()
    tokens = set(_re.findall(r"[a-z0-9.]+", label))
    preferred: list[str] = []

    if "120b" in tokens:
        preferred.append("openai/gpt-oss-120b")
    elif "20b" in tokens or "fast" in tokens:
        preferred.append("openai/gpt-oss-20b")
    elif "qwen" in tokens:
        preferred.append("qwen/qwen3.6-27b")
    elif "llama" in tokens and "3.3" in tokens and "deep" not in tokens:
        # Explicit Llama request (enterprise accounts).  The legacy default
        # label "Llama 3.3 Deep Static Analysis (SAST)" intentionally maps to
        # the default chain because that model is no longer on the free tier.
        preferred.append("llama-3.3-70b-versatile")

    chain: list[str] = []
    for m in preferred + [GROQ_MODEL] + GROQ_FALLBACK_MODELS:
        if m and m not in chain:
            chain.append(m)
    return chain


def public_config() -> dict:
    """Non-secret configuration summary for the /api/health endpoint."""
    return {
        "environment":              ENVIRONMENT,
        "groq_model":               GROQ_MODEL,
        "groq_fallbacks":           GROQ_FALLBACK_MODELS,
        "groq_key_set":             bool(GROQ_API_KEY),
        "github_token_set":         bool(GITHUB_TOKEN),
        "github_oauth_configured":  bool(GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET),
        "gate_agent_mode":          GATE_AGENT_MODE,
        "llm_tpm_budget":           LLM_TPM_BUDGET,
        "sandbox_enabled":          SANDBOX_ENABLED,
        "max_files_for_ai":         MAX_FILES_FOR_AI,
    }
