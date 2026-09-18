"""
backend/langchain_pipeline.py
==============================
ResilioCheck AI — Multi-Agent Security Pipeline (Groq-backed)

Three sequential agents, each with a small focused prompt so a single scan
fits inside the Groq free-tier budget (8 000 tokens / minute per model):

  Step 1 — OWASP Agent : classifies vulnerabilities per file  -> findings[]
  Step 2 — Gate Agent  : APPROVED / BLOCKED from severity counts (deterministic
                          by default, optional LLM confirmation)
  Step 3 — Patch Agent : full corrected file for the worst finding (only when
                          the file is small enough to patch safely)

Resilience features
-------------------
* Rate-limit aware: honours the ``retry-after`` header, but if the wait is
  long it immediately switches to the next model in the chain (Groq limits
  are enforced per model, so this keeps the scan going instead of failing).
* Model fallback: decommissioned / unknown models (404, 400 "model ...")
  are skipped automatically.
* Hard time budget: the pipeline never waits longer than
  ``LLM_MAX_TOTAL_WAIT_SECONDS`` for rate limits — it raises a clean,
  human-readable ``PipelineError`` instead of a ``RetryError[...]``.
* Payload guard: source context is trimmed to fit the TPM budget and on a
  413 / "request too large" response the payload is halved and retried.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Callable

import requests

from backend import settings
from config.prompts import GATE_DECISION_SYSTEM_PROMPT, OWASP_SYSTEM_PROMPT

log = logging.getLogger("resiliocheck.pipeline")

# Backwards-compatible module constants
GROQ_API_KEY = settings.GROQ_API_KEY
GROQ_URL     = settings.GROQ_URL

SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
VALID_SEVERITIES = set(SEVERITY_ORDER)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class PipelineError(Exception):
    """
    Raised for any *expected* failure of the AI pipeline.  ``detail`` is safe
    to show to the end user; ``status_code`` is the HTTP status the API layer
    should return.
    """

    def __init__(self, detail: str, status_code: int = 502):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class GroqAuthError(PipelineError):
    def __init__(self, detail: str):
        super().__init__(detail, status_code=500)


class GroqRateLimitError(PipelineError):
    def __init__(self, detail: str):
        super().__init__(detail, status_code=429)


class GroqPayloadTooLarge(PipelineError):
    def __init__(self, detail: str):
        super().__init__(detail, status_code=413)


class GroqModelUnavailable(PipelineError):
    """All models in the chain were rejected (404 / decommissioned / exhausted)."""


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def estimate_tokens(text: str) -> int:
    """Cheap, conservative token estimate (~3.5 chars per token for code)."""
    return int(len(text) / 3.5) + 8


def _parse_retry_after(resp: requests.Response, default: float = 5.0) -> float:
    """
    Groq sets ``retry-after`` (seconds) on 429.  It also always sends
    ``x-ratelimit-reset-tokens`` like ``7.66s`` or ``2m59.56s``.
    """
    ra = resp.headers.get("retry-after")
    if ra:
        try:
            return max(0.5, float(ra))
        except ValueError:
            pass
    reset = resp.headers.get("x-ratelimit-reset-tokens") or resp.headers.get("x-ratelimit-reset-requests")
    if reset:
        m = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?", reset.strip())
        if m and (m.group(1) or m.group(2) or m.group(3)):
            hours = float(m.group(1) or 0)
            mins = float(m.group(2) or 0)
            secs = float(m.group(3) or 0)
            return max(0.5, hours * 3600 + mins * 60 + secs)
    return default


# ---------------------------------------------------------------------------
# Groq client
# ---------------------------------------------------------------------------

_MODEL_GONE_HINTS = ("decommission", "not exist", "not found", "no longer supported",
                     "does not support", "unsupported", "invalid model", "deprecated")
_TOO_LARGE_HINTS = ("too large", "reduce the length", "reduce your", "context length",
                    "maximum context", "tokens per minute", "tpm")
_JSON_MODE_FAIL_HINTS = (
    "response_format",
    "failed to generate json",
    "failed_generation",
    "json output",
    "json mode",
)


@dataclass
class GroqClient:
    """
    Multi-model AI client with task-based routing across Groq and DeepSeek.
    Retains the original GroqClient name for backwards compatibility.
    """
    api_key: str = field(default_factory=lambda: settings.GROQ_API_KEY)
    deepseek_api_key: str = field(default_factory=lambda: settings.DEEPSEEK_API_KEY)
    max_total_wait: float = field(default_factory=lambda: float(settings.LLM_MAX_TOTAL_WAIT_SECONDS))
    request_timeout: float = field(default_factory=lambda: float(settings.LLM_REQUEST_TIMEOUT_SECONDS))
    tpm_budget: int = field(default_factory=lambda: settings.LLM_TPM_BUDGET)
    post: Callable[..., requests.Response] | None = field(default=None, repr=False)
    sleep: Callable[[float], None] | None = field(default=None, repr=False)

    waited: float = 0.0
    calls: int = 0
    last_model: str = ""

    def _get_route(self, task_type: str) -> dict:
        routes = {
            "triage": {"provider": "groq", "model": settings.GROQ_MODEL_FAST},
            "classify": {"provider": "groq", "model": settings.GROQ_MODEL_FAST},
            "deep_scan": {"provider": "groq", "model": settings.GROQ_MODEL_DEEP},
            "patch": {"provider": "groq", "model": settings.GROQ_MODEL_DEEP},
            "batch": {"provider": "deepseek", "model": settings.DEEPSEEK_MODEL},
            "background": {"provider": "deepseek", "model": settings.DEEPSEEK_MODEL},
        }
        return routes.get(task_type, {"provider": "deepseek", "model": settings.DEEPSEEK_MODEL})

    def chat(self, system: str, user: str = "", *, history: list[dict] | None = None,
             temperature: float = 0.0, max_tokens: int | None = None, json_mode: bool = False,
             task_type: str = "deep_scan") -> str:
             
        max_tokens = max_tokens or settings.LLM_MAX_OUTPUT_TOKENS
        
        prompt_tokens = estimate_tokens(system)
        if history:
            prompt_tokens += sum(estimate_tokens(str(m.get("content", ""))) for m in history)
        else:
            prompt_tokens += estimate_tokens(user)
            
        if prompt_tokens + max_tokens > self.tpm_budget:
            max_tokens = max(256, self.tpm_budget - prompt_tokens - 64)
            if prompt_tokens + max_tokens > self.tpm_budget:
                raise GroqPayloadTooLarge(f"Prompt is too large ({prompt_tokens} tokens, budget {self.tpm_budget}).")

        messages = [{"role": "system", "content": system}]
        if history:
            messages.extend(history)
        elif user:
            messages.append({"role": "user", "content": user})

        payload = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        route = self._get_route(task_type)
        primary_provider = route["provider"]
        primary_model = route["model"]

        fallback_chain = []
        if primary_provider == "groq":
            fallback_chain = [{"provider": "deepseek", "model": settings.DEEPSEEK_MODEL}]

        attempts = [{"provider": primary_provider, "model": primary_model}] + fallback_chain
        last_error = ""
        
        # Track models we've tried and exhausted
        dead_models = set()

        while True:
            for attempt in attempts:
                provider = attempt["provider"]
                model = attempt["model"]
                
                if model in dead_models:
                    continue
                
                payload["model"] = model
                ak = self.api_key if provider == "groq" else self.deepseek_api_key
                base_url = settings.GROQ_URL.replace("/chat/completions", "") if provider == "groq" else "https://api.deepseek.com"
                url = f"{base_url.rstrip('/')}/chat/completions"
                
                if not ak:
                    last_error = f"{provider.capitalize()} API key not configured."
                    continue

                self.calls += 1
                log.info("[%s] call #%d model=%s max_tokens=%s task=%s", provider, self.calls, model, max_tokens, task_type)
                
                try:
                    resp = (self.post or requests.post)(
                        url,
                        headers={"Authorization": f"Bearer {ak}", "Content-Type": "application/json"},
                        json=payload,
                        timeout=self.request_timeout,
                    )
                except requests.RequestException as exc:
                    log.warning("[%s] network error on %s: %s", provider, model, exc)
                    last_error = f"{model}: network error"
                    continue

                if resp.ok:
                    self.last_model = model
                    return self._extract_content(resp, model)

                status = resp.status_code
                err_msg = self._error_message(resp)
                last_error = f"{model}: HTTP {status} — {err_msg}"
                lowered = err_msg.lower()

                if status in (401, 403):
                    log.error("[%s] Auth error: %s", provider, err_msg)
                    continue

                if status == 429:
                    wait = _parse_retry_after(resp)
                    if "per day" in lowered or "tpd" in lowered or "rpd" in lowered or wait > 600:
                        log.warning("[%s] daily quota exhausted on %s; skipping model", provider, model)
                        dead_models.add(model)
                        continue
                    if "too large" in lowered or "tokens per minute" in lowered and "request" in lowered:
                        raise GroqPayloadTooLarge(f"{provider} 429: {err_msg}")
                        
                    log.warning("[%s] %s rate-limited (retry-after≈%.1fs): %s", provider, model, wait, err_msg)
                    continue

                if status in (500, 502, 503, 504):
                    log.warning("[%s] %s transient %s: %s", provider, model, status, err_msg)
                    continue

                if status == 413 or (status == 400 and any(h in lowered for h in _TOO_LARGE_HINTS)):
                    raise GroqPayloadTooLarge(f"{provider} {status}: {err_msg}")
                    
                log.warning("[%s] unexpected error %s on %s: %s", provider, status, model, err_msg)
                
            # If we fall out of the for loop, all attempts failed
            raise GroqModelUnavailable(f"All models in fallback chain failed. Last error: {last_error}")

    @staticmethod
    def _error_message(resp: requests.Response) -> str:
        try:
            body = resp.json()
            err = body.get("error", body) if isinstance(body, dict) else body
            if isinstance(err, dict):
                return str(err.get("message") or err)[:400]
            return str(err)[:400]
        except Exception:
            return (resp.text or "")[:400]

    @staticmethod
    def _extract_content(resp: requests.Response, model: str) -> str:
        try:
            data = resp.json()
        except ValueError:
            raise PipelineError(f"Groq returned a non-JSON body from model '{model}'.")
        choices = data.get("choices") or []
        if not choices:
            failed = (data.get("error") or {}).get("failed_generation", "")
            if failed:
                return str(failed).strip()
            raise PipelineError(f"Groq returned no choices from model '{model}'.")
        message = choices[0].get("message") or {}
        content = message.get("content") or ""
        if not content and message.get("reasoning"):
            content = message["reasoning"]
        return str(content).strip()


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def _parse_json(raw: str, fallback: dict) -> dict:
    """
    Robustly parse JSON from a model response: strips <think> blocks and
    markdown fences, then falls back to the first balanced {...} object.
    """
    if not raw:
        return dict(fallback)
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", raw)
    cleaned = re.sub(r"```(?:json|JSON)?\s*", "", cleaned).strip().rstrip("`").strip()
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else dict(fallback)
    except json.JSONDecodeError:
        pass
    start = cleaned.find("{")
    if start != -1:
        depth = 0
        in_str = False
        esc = False
        for i in range(start, len(cleaned)):
            ch = cleaned[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        parsed = json.loads(cleaned[start:i + 1])
                        if isinstance(parsed, dict):
                            return parsed
                    except json.JSONDecodeError:
                        pass
                    break
    return dict(fallback)


def _strip_code_fences(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    m = re.match(r"^```[\w+.-]*[ \t]*\n([\s\S]*?)\n?```\s*$", text)
    if m:
        return m.group(1).rstrip() + "\n"
    text = re.sub(r"^```[\w+.-]*[ \t]*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.rstrip() + "\n"


def normalize_findings(raw_findings, known_files: list[str] | None = None) -> list[dict]:
    """Coerce whatever the model returned into a clean list of finding dicts."""
    out: list[dict] = []
    if not isinstance(raw_findings, list):
        return out

    def _int(v, default=0):
        try:
            return int(v)
        except (TypeError, ValueError):
            return default

    for f in raw_findings:
        if not isinstance(f, dict):
            continue
        sev = str(f.get("severity", "INFO")).strip().upper()
        if sev not in VALID_SEVERITIES:
            sev = "MEDIUM" if sev in ("MODERATE", "WARNING", "WARN") else "INFO"
        file_path = str(f.get("file_path") or f.get("file") or "unknown").strip().replace("\\", "/")
        if known_files and file_path not in known_files:
            base = os.path.basename(file_path)
            matches = [k for k in known_files if os.path.basename(k) == base]
            if len(matches) == 1:
                file_path = matches[0]
        line_start = _int(f.get("line_start"), 0)
        out.append({
            "file_path":   file_path,
            "line_start":  line_start,
            "line_end":    _int(f.get("line_end"), line_start),
            "owasp_class": str(f.get("owasp_class") or f.get("category") or "Uncategorised")[:120],
            "severity":    sev,
            "title":       str(f.get("title") or f.get("owasp_class") or "Security finding")[:160],
            "description": str(f.get("description") or "")[:600],
            "remediation": str(f.get("remediation") or "")[:600],
        })
    out.sort(key=lambda x: SEVERITY_ORDER.get(x["severity"], 4))
    return out


def count_severities(findings: list[dict]) -> tuple[int, int]:
    critical = sum(1 for f in findings if f.get("severity") == "CRITICAL")
    high     = sum(1 for f in findings if f.get("severity") == "HIGH")
    return critical, high


def decide_gate(critical: int, high: int) -> tuple[str, str]:
    """Deterministic gate policy — mirrors GATE_DECISION_SYSTEM_PROMPT."""
    if critical >= 1:
        return "BLOCKED", f"{critical} critical finding(s) detected — policy requires zero critical issues."
    if high >= 3:
        return "BLOCKED", f"{high} high-severity findings detected — policy threshold is 3."
    if high:
        return "APPROVED", f"{high} high-severity finding(s) below the blocking threshold of 3; no critical issues."
    return "APPROVED", "No critical or high severity findings detected."


# ---------------------------------------------------------------------------
# Payload builder
# ---------------------------------------------------------------------------

def _build_code_context(source_files: dict, max_chars: int, per_file: int) -> tuple[str, list[str]]:
    parts: list[str] = []
    included: list[str] = []
    used = 0
    for path, content in source_files.items():
        snippet = content if len(content) <= per_file else content[:per_file] + "\n... [truncated]"
        entry = f"=== {path} ===\n{snippet}\n"
        if used + len(entry) > max_chars:
            if parts:
                break
            entry = entry[:max_chars]  # always include at least one file
        parts.append(entry)
        included.append(path)
        used += len(entry)
    return "".join(parts), included


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------

def run_owasp_agent(client: GroqClient, source_files: dict, secret_findings: list) -> dict:
    """Step 1: OWASP Triage Agent."""
    log.info("[Pipeline] Step 1: OWASP Agent — classifying vulnerabilities in %d file(s)", len(source_files))

    secret_text = ""
    if secret_findings:
        lines = [f"  [{f.get('pattern')}] {f.get('file')}:{f.get('line')}: {str(f.get('snippet', ''))[:100]}"
                 for f in secret_findings[:6]]
        secret_text = "\nPRE-SCAN SECRETS DETECTED (these are confirmed findings):\n" + "\n".join(lines) + "\n"

    max_chars = settings.LLM_MAX_CONTEXT_CHARS
    per_file  = settings.LLM_MAX_CHARS_PER_FILE
    attempts  = 0
    while True:
        attempts += 1
        code_ctx, included = _build_code_context(source_files, max_chars, per_file)
        user_msg = (
            "Analyse the following source code for OWASP Top 10 vulnerabilities. "
            "Use the file paths exactly as shown in the === headers for file_path.\n"
            + secret_text
            + "\nSOURCE CODE:\n"
            + code_ctx
        )
        try:
            raw = client.chat(OWASP_SYSTEM_PROMPT, user_msg, temperature=settings.LLM_TEMPERATURE, json_mode=True, task_type="triage")
            break
        except GroqPayloadTooLarge as exc:
            if attempts >= 3:
                raise
            max_chars //= 2
            per_file = max(400, per_file // 2)
            log.warning("[Pipeline] payload too large (%s) — shrinking to %d chars", exc.detail, max_chars)

    log.info("[Pipeline] OWASP Agent raw response (%d chars) via %s", len(raw), client.last_model)

    fallback = {"findings": [], "critical_count": 0, "high_count": 0, "gate_recommendation": "APPROVED"}
    parsed = _parse_json(raw, fallback)
    findings = normalize_findings(parsed.get("findings"), known_files=list(source_files.keys()))
    critical, high = count_severities(findings)   # never trust the model's arithmetic
    return {
        "findings":            findings,
        "critical_count":      critical,
        "high_count":          high,
        "gate_recommendation": "BLOCKED" if (critical or high >= 3) else "APPROVED",
        "files_analysed":      included,
        "model":               client.last_model,
    }


def run_gate_agent(client: GroqClient | None, owasp_result: dict) -> dict:
    """
    Step 2: Gate Decision.  Deterministic policy first; if GATE_AGENT_MODE=llm
    the model is asked to confirm and may only make the verdict *stricter*.
    """
    critical = int(owasp_result.get("critical_count", 0))
    high     = int(owasp_result.get("high_count", 0))
    gate, rationale = decide_gate(critical, high)
    result = {"gate": gate, "rationale": rationale, "mode": "deterministic"}

    if settings.GATE_AGENT_MODE == "llm" and client is not None:
        log.info("[Pipeline] Step 2: Gate Agent (LLM confirmation)")
        user_msg = json.dumps({
            "critical_count": critical,
            "high_count": high,
            "findings_count": len(owasp_result.get("findings", [])),
            "deterministic_verdict": gate,
        })
        try:
            raw = client.chat(GATE_DECISION_SYSTEM_PROMPT, user_msg, temperature=0.0, max_tokens=200, json_mode=True, task_type="classify")
            llm = _parse_json(raw, {})
            if str(llm.get("gate", "")).upper() == "BLOCKED" and gate != "BLOCKED":
                result["gate"] = "BLOCKED"
                result["rationale"] = str(llm.get("rationale") or rationale)
            result["mode"] = "llm"
        except PipelineError as exc:
            log.warning("[Pipeline] Gate Agent LLM confirmation skipped: %s", exc.detail)
    else:
        log.info("[Pipeline] Step 2: Gate Agent — %s (%s)", gate, rationale)
    return result


def _pick_worst_patchable(findings: list[dict], source_files: dict) -> tuple[dict | None, str, str]:
    """Return (finding, file_path, content) for the worst finding whose file we have."""
    for f in findings:
        if f.get("severity") not in ("CRITICAL", "HIGH"):
            break
        fp = f.get("file_path", "")
        content = source_files.get(fp)
        if content is None:
            base = os.path.basename(fp)
            for k, v in source_files.items():
                if os.path.basename(k) == base:
                    fp, content = k, v
                    break
        if content is None:
            continue
        if len(content) > settings.PATCH_MAX_FILE_CHARS:
            log.info("[Pipeline] %s too large to auto-patch (%d chars)", fp, len(content))
            continue
        return f, fp, content
    return None, "", ""


PATCH_SYSTEM_PROMPT = (
    "You are a senior application-security engineer producing a pull-request-ready fix.\n"
    "You will receive ONE vulnerability finding and the COMPLETE current contents of the file.\n"
    "Return the COMPLETE corrected file with the vulnerability fixed. Rules:\n"
    "- Keep all unrelated code, imports, comments and formatting exactly as they are.\n"
    "- Do not add explanations, headings or markdown fences — output only the file contents.\n"
    "- Never introduce placeholder secrets; read credentials from environment variables.\n"
    "- The result must be syntactically valid in the file's language."
)


def run_patch_agent(client: GroqClient, owasp_result: dict, source_files: dict) -> tuple[str, str]:
    """Step 3: Patch Generator -> (patched_file_contents, relative_file_path)."""
    findings = owasp_result.get("findings", [])
    worst, target, content = _pick_worst_patchable(findings, source_files)
    if worst is None:
        log.info("[Pipeline] Step 3: Patch Agent — nothing patchable, skipping.")
        return "", ""

    log.info("[Pipeline] Step 3: Patch Agent — fixing %s issue in %s", worst.get("severity"), target)
    user_msg = (
        f"VULNERABILITY\n"
        f"  File: {target}\n"
        f"  OWASP: {worst.get('owasp_class')}\n"
        f"  Severity: {worst.get('severity')}\n"
        f"  Lines: {worst.get('line_start')}-{worst.get('line_end')}\n"
        f"  Description: {worst.get('description')}\n"
        f"  Remediation: {worst.get('remediation')}\n\n"
        f"CURRENT FILE CONTENTS ({target}):\n{content}\n\n"
        f"Return the complete corrected file:"
    )
    out_tokens = min(settings.LLM_MAX_OUTPUT_TOKENS * 2, estimate_tokens(content) + 600)
    patched = _strip_code_fences(client.chat(PATCH_SYSTEM_PROMPT, user_msg, temperature=0.1, max_tokens=out_tokens, task_type="patch"))
    if not patched.strip() or patched.strip() == content.strip():
        log.info("[Pipeline] Patch Agent returned no change.")
        return "", ""
    log.info("[Pipeline] Patch Agent produced %d chars for %s", len(patched), target)
    return patched, target


def run_patch_retry_agent(owasp_result: dict, source_files: dict, failed_patch: str,
                          error_logs: str, client: GroqClient | None = None) -> str:
    """Step 3.5: repair a patch that failed sandbox validation."""
    client = client or GroqClient()
    findings = owasp_result.get("findings", [])
    if not findings:
        return failed_patch
    worst = findings[0]
    trimmed_logs = error_logs[-1500:] if len(error_logs) > 1500 else error_logs
    system = (
        "You are a senior application-security engineer. Your previous complete-file patch failed "
        "validation in an isolated sandbox (syntax check or SAST). You will receive the vulnerability, "
        "your failed patch and the sandbox error output. Return the COMPLETE corrected file that fixes "
        "the vulnerability AND resolves the error. Output only the file contents — no markdown, no prose."
    )
    user_msg = (
        f"VULNERABILITY\n"
        f"  File: {worst.get('file_path')}\n"
        f"  OWASP: {worst.get('owasp_class')}\n"
        f"  Severity: {worst.get('severity')}\n"
        f"  Description: {worst.get('description')}\n"
        f"  Remediation: {worst.get('remediation')}\n\n"
        f"YOUR FAILED PATCH:\n{failed_patch}\n\n"
        f"SANDBOX ERROR OUTPUT:\n{trimmed_logs}\n\n"
        f"Return the complete corrected file:"
    )
    out_tokens = min(settings.LLM_MAX_OUTPUT_TOKENS * 2, estimate_tokens(failed_patch) + 600)
    patched = _strip_code_fences(client.chat(system, user_msg, temperature=0.2, max_tokens=out_tokens, task_type="patch"))
    log.info("[Pipeline] Patch Retry Agent generated %d chars", len(patched))
    return patched or failed_patch


# ---------------------------------------------------------------------------
# Secrets override
# ---------------------------------------------------------------------------

REAL_SECRET_PATTERNS = (
    "hardcoded password", "api key", "token", "secret", "private key",
    "credentials", "aws", "stripe", "google", "slack", "sendgrid", "twilio",
    "mongodb", "sql connection", "basic auth",
)


def merge_secret_findings(findings: list[dict], secret_findings: list[dict]) -> list[dict]:
    """
    Hardcoded credentials found by the deterministic pre-scan are always
    CRITICAL.  Add any that the model did not already report.
    """
    merged = list(findings)
    for sf in secret_findings or []:
        pattern = str(sf.get("pattern", "")).lower()
        if not any(p in pattern for p in REAL_SECRET_PATTERNS):
            continue
        file_name = str(sf.get("file", "unknown"))
        try:
            line = int(sf.get("line", 0) or 0)
        except (TypeError, ValueError):
            line = 0
        already = any(
            os.path.basename(f.get("file_path", "")) == os.path.basename(file_name)
            and f.get("severity") == "CRITICAL"
            and (f.get("line_start") == line
                 or any(k in f.get("title", "").lower() for k in ("secret", "credential", "hardcoded", "api key", "token", "password")))
            for f in merged
        )
        if already:
            continue
        merged.append({
            "file_path":   file_name,
            "line_start":  line,
            "line_end":    line,
            "owasp_class": "A02 – Cryptographic Failures",
            "severity":    "CRITICAL",
            "title":       f"Hardcoded Secret: {sf.get('pattern', 'Unknown')}",
            "description": f"Hardcoded credential detected in {file_name}: {str(sf.get('snippet', ''))[:80]}",
            "remediation": "Move the credential to an environment variable / secret manager and rotate the exposed value immediately.",
        })
    merged.sort(key=lambda x: SEVERITY_ORDER.get(x["severity"], 4))
    return merged


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def build_explanation(findings: list[dict], critical: int, high: int, gate: str,
                      rationale: str, model: str, files_analysed: int) -> str:
    if findings:
        lines = [
            f"[{f['severity']}] {f['title']} — {f['file_path']} (line {f['line_start'] or '?'}) — "
            f"{f['description']} | Fix: {f['remediation']}"
            for f in findings
        ]
        return (
            f"ResilioCheck AI analysed {files_analysed} file(s) with {model or 'Groq'} and identified "
            f"{len(findings)} security issue(s) ({critical} critical, {high} high). Gate verdict: {gate}.\n\n"
            + "\n".join(lines)
        )
    return (
        f"ResilioCheck AI completed an OWASP Top 10 analysis of {files_analysed} file(s) with "
        f"{model or 'Groq'}. No definitive vulnerabilities were detected in the scanned files. "
        f"Gate verdict: {gate}. {rationale}"
    )


def run_pipeline(source_files: dict, secret_findings: list, *, models: list[str] | None = None,
                 client: GroqClient | None = None, generate_patch: bool = True) -> dict:
    """
    Run the full three-step pipeline.

    ``source_files``    — {relative_path: content}
    ``secret_findings`` — output of core.scan_for_secrets()
    """
    if client is None:
        client = GroqClient(models=models or list(DEFAULT_MODEL_CHAIN))
    if not client.api_key:
        raise GroqAuthError("GROQ_API_KEY is not configured on the server.")

    # Step 1
    owasp = run_owasp_agent(client, source_files, secret_findings)

    # Step 1.5 — merge deterministic secret findings
    findings = merge_secret_findings(owasp["findings"], secret_findings)
    critical, high = count_severities(findings)
    owasp.update(findings=findings, critical_count=critical, high_count=high)

    # Step 2
    gate_result = run_gate_agent(client, owasp)

    # Step 3 (non-fatal)
    patched_code, patched_filename, patch_error = "", "", ""
    if generate_patch and findings and findings[0].get("severity") in ("CRITICAL", "HIGH"):
        try:
            patched_code, patched_filename = run_patch_agent(client, owasp, source_files)
        except PipelineError as exc:
            patch_error = exc.detail
            log.warning("[Pipeline] Patch agent skipped: %s", exc.detail)

    explanation = build_explanation(
        findings, critical, high, gate_result["gate"], gate_result["rationale"],
        owasp.get("model", ""), len(owasp.get("files_analysed", [])),
    )
    if patch_error:
        explanation += f"\n\nNote: automatic patch generation was skipped ({patch_error})."

    return {
        "findings":         findings,
        "critical_count":   critical,
        "high_count":       high,
        "gate":             gate_result["gate"],
        "gate_rationale":   gate_result["rationale"],
        "explanation":      explanation,
        "patched_code":     patched_code,
        "patched_filename": patched_filename,
        "model":            owasp.get("model", ""),
        "files_analysed":   owasp.get("files_analysed", []),
        "llm_calls":        client.calls,
    }
