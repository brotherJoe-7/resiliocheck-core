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
DATABASE_URL: str = _env("DATABASE_URL", "sqlite:///./resiliocheck.db")

# ── Groq / LLM ──────────────────────────────────────────────────────────────
GROQ_API_KEY: str = _env("GROQ_API_KEY")
GROQ_URL: str = _env("GROQ_URL", "https://api.groq.com/openai/v1/chat/completions")
DEEPSEEK_API_KEY: str = _env("DEEPSEEK_API_KEY")

# Model 1: Fast Triage / Quick Tasks
GROQ_MODEL_FAST: str = _env("GROQ_MODEL_FAST", "openai/gpt-oss-20b")
# Model 2: Deep Analysis / Patching
GROQ_MODEL_DEEP: str = _env("GROQ_MODEL_DEEP", "openai/gpt-oss-120b")

# Ultimate Fallback Model
DEEPSEEK_MODEL: str = _env("DEEPSEEK_MODEL", "deepseek-v4.1-flash")

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
TOKEN_ENCRYPTION_KEY: str = _env("TOKEN_ENCRYPTION_KEY")
ACCESS_TOKEN_EXPIRE_HOURS: int = _env_int("ACCESS_TOKEN_EXPIRE_HOURS", 168)  # 7 days

# ── CORS ────────────────────────────────────────────────────────────────────
FRONTEND_URL: str = _env("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL: str = _env("BACKEND_URL", "http://localhost:8000")
# Regex matched against the Origin header in addition to FRONTEND_URL.
# Default allows every Vercel deployment of the dashboard (production alias and
# preview URLs). Set CORS_ALLOW_ORIGIN_REGEX=off to disable regex matching.
_DEFAULT_CORS_REGEX = r"^https://[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$"
_cors_regex_raw = _env("CORS_ALLOW_ORIGIN_REGEX", _DEFAULT_CORS_REGEX)
CORS_ALLOW_ORIGIN_REGEX: str = (
    "" if _cors_regex_raw.lower() in ("off", "none", "disabled", "false", "0") else _cors_regex_raw
)

# ── Database ────────────────────────────────────────────────────────────────
DATABASE_URL: str = _env("DATABASE_URL", "sqlite:///./resiliocheck.db")

# ── Sandbox ─────────────────────────────────────────────────────────────────
SANDBOX_ENABLED: bool = _env_bool("SANDBOX_ENABLED", True)
SANDBOX_IMAGE: str = _env("SANDBOX_IMAGE", "resiliocheck-sandbox:latest")
SANDBOX_TIMEOUT_SECONDS: int = _env_int("SANDBOX_TIMEOUT_SECONDS", 180)

# ── Scan limits ─────────────────────────────────────────────────────────────
MAX_FILES_FOR_AI: int = _env_int("MAX_FILES_FOR_AI", 12)

# Max scans per calendar day for regular users (role="user").
# Admins and superadmins are never rate-limited.
# Recommended: 3 (free test tier) — raise to 5 for early-access users.
DAILY_SCAN_LIMIT_USER: int = _env_int("DAILY_SCAN_LIMIT_USER", 3)





def public_config() -> dict:
    """Non-secret configuration summary for the /api/health endpoint."""
    return {
        "environment":              ENVIRONMENT,
        "groq_model_fast":          GROQ_MODEL_FAST,
        "groq_model_deep":          GROQ_MODEL_DEEP,
        "groq_key_set":             bool(GROQ_API_KEY),
        "github_token_set":         bool(GITHUB_TOKEN),
        "github_oauth_configured":  bool(GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET),
        "gate_agent_mode":          GATE_AGENT_MODE,
        "llm_tpm_budget":           LLM_TPM_BUDGET,
        "sandbox_enabled":          SANDBOX_ENABLED,
        "max_files_for_ai":         MAX_FILES_FOR_AI,
    }
