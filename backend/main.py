import logging
import os
import uuid
import shutil
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from backend import settings
from backend.core import (
    download_and_extract_repo,
    gather_source_files,
    scan_for_secrets,
    apply_patch_and_validate,
    run_local_sast_prefilter,
    validate_repo_url,
    validate_branch,
    sandbox_status,
    docker_status,
)
from backend.langchain_pipeline import (
    run_pipeline,
    run_patch_retry_agent,
    GroqClient,
    PipelineError,
)
from backend.database import engine, get_db
from backend import models, auth, admin
from backend.auth import get_current_user

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("resiliocheck.api")

# Create all DB tables on startup
models.Base.metadata.create_all(bind=engine)


def _ensure_columns() -> None:
    """
    Minimal forward-only migration: add columns that were introduced after the
    initial schema (create_all never alters existing tables).
    """
    from sqlalchemy import inspect as sa_inspect
    wanted = {
        "scan_results": {
            "patched_filename": "VARCHAR DEFAULT ''",
            "patch_status":     "VARCHAR DEFAULT 'PENDING'",
            "model":            "VARCHAR DEFAULT ''",
            "user_id":          "INTEGER",
        },
        "users": {
            "scan_count":    "INTEGER DEFAULT 0",
            "github_token":  "VARCHAR",
        },
    }
    try:
        insp = sa_inspect(engine)
        with engine.begin() as conn:
            for table, cols in wanted.items():
                if table not in insp.get_table_names():
                    continue
                existing = {c["name"] for c in insp.get_columns(table)}
                for col, ddl in cols.items():
                    if col not in existing:
                        conn.execute(sa_text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
    except Exception as exc:  # pragma: no cover
        logging.getLogger("resiliocheck.api").warning("Column migration skipped: %s", exc)


_ensure_columns()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = next(get_db())
    try:
        seed_defaults(db)
    finally:
        db.close()
    log.info("ResilioCheck API started — model chain: %s, sandbox: %s",
             settings.resolve_model_chain(None), docker_status())
    yield


app = FastAPI(title="ResilioCheck AI Backend", version="2.0.0", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(admin.router)

_raw_origins = settings.FRONTEND_URL
_allowed_origins = [o.strip().rstrip("/") for o in _raw_origins.split(",") if o.strip()]
for _local in ("http://localhost:3000", "http://127.0.0.1:3000"):
    if _local not in _allowed_origins:
        _allowed_origins.append(_local)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_origin_regex=r"https://.*\.(vercel\.app|e2b\.dev|run\.app)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(PipelineError)
async def _pipeline_error_handler(_request: Request, exc: PipelineError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def _unhandled_error_handler(_request: Request, exc: Exception):
    # Never leak stack traces / raw exception reprs (e.g. "RetryError[<Future ...>]") to clients.
    log.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error. Please try again."})


@app.middleware("http")
async def _audit_middleware(request: Request, call_next):
    """Prompt 3 — Log every request and any error responses for security monitoring."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "unknown"
    )
    log.info("REQUEST  %s %s  ip=%s", request.method, request.url.path, client_ip)
    response = await call_next(request)
    if response.status_code >= 400:
        log.warning(
            "RESPONSE %s %s  ip=%s  status=%d",
            request.method, request.url.path, client_ip, response.status_code,
        )
    return response

# ---------------------------------------------------------------------------
# DB SEEDING — populate default gates & agents on first run
# ---------------------------------------------------------------------------

DEFAULT_GATES = [
    {
        "id": "xss",
        "name": "XSS Prevention",
        "desc": "Analyzes frontend payloads for malicious script injection.",
        "strictness": ["Standard (Block Known)", "Strict (Block All)", "Permissive"],
        "action": ["Block Deploy & Alert", "Alert Only", "Log Only"],
        "active": True,
    },
    {
        "id": "sqli",
        "name": "SQL Injection Guard",
        "desc": "Detects unsanitised database queries and ORM misuse.",
        "strictness": ["Block All", "Warn Only"],
        "action": ["Block Deploy & Alert", "Log Only"],
        "active": True,
    },
    {
        "id": "dep",
        "name": "Dependency Audit",
        "desc": "Scans package manifests for CVEs and outdated libraries.",
        "strictness": ["Block Critical CVEs", "Block All CVEs", "Report Only"],
        "action": ["Deep Scan (Transitive)", "Direct Only", "Report"],
        "active": True,
    },
    {
        "id": "secrets",
        "name": "Secrets Detection",
        "desc": "Prevents hardcoded API keys, tokens and credentials from being shipped.",
        "strictness": ["Block All", "Warn Only"],
        "action": ["Block Deploy & Alert", "Alert Only"],
        "active": True,
    },
]

DEFAULT_AGENTS = [
    {
        "id": "code-fixer",
        "name": "Code Fixer",
        "icon": "✦",
        "active": True,
        "status_label": "Working",
        "stats": [{"label": "Efficiency", "value": "98.4%"}, {"label": "Issues Resolved", "value": "0"}],
        "log": "> Awaiting scan results...",
    },
    {
        "id": "secret-scanner",
        "name": "Secret Scanner",
        "icon": "◎",
        "active": True,
        "status_label": "Active",
        "stats": [{"label": "Scan Rate", "value": "4.2M/s"}, {"label": "Secrets Found", "value": "0"}],
        "log": "> Monitoring repository activity...",
    },
    {
        "id": "patch-automator",
        "name": "Patch Automator",
        "icon": "⏱",
        "active": False,
        "status_label": "Idle",
        "stats": [{"label": "Dependency Health", "value": "100%"}, {"label": "Pending Updates", "value": "0"}],
        "log": "> System up to date.\nEntering standby mode.",
    },
]


def seed_defaults(db: Session):
    """Populate gates and agents on first startup if tables are empty."""
    if db.query(models.Gate).count() == 0:
        for g in DEFAULT_GATES:
            db.add(models.Gate(**g))
    if db.query(models.Agent).count() == 0:
        for a in DEFAULT_AGENTS:
            db.add(models.Agent(**a))
    db.commit()




# ---------------------------------------------------------------------------
# SCHEMA
# ---------------------------------------------------------------------------

import html
from pydantic import BaseModel, Field, field_validator

_BRANCH_RE = re.compile(r'^[A-Za-z0-9._\-/]{1,120}$')
_SAFE_TEXT_RE = re.compile(r'[<>"\']')  # reject HTML injection chars in free-text

_VALID_ENGINES = {
    "Groq GPT-OSS 120B Deep Static Analysis (SAST)",
    "Groq GPT-OSS 20B Fast Static Analysis (SAST)",
    "Qwen 27B Deep Static Analysis (SAST)",
    "Llama 3.3 Deep Static Analysis (SAST)",
}

def _sanitize_text(value: str, max_len: int = 256) -> str:
    """Strip HTML injection characters and enforce length."""
    value = value.strip()[:max_len]
    value = _SAFE_TEXT_RE.sub('', value)
    return value


class ScanRequest(BaseModel):
    repo_url: str = Field(..., min_length=10, max_length=300)
    branch:   str = Field("main", max_length=120)
    engine:   str = Field("Groq GPT-OSS 120B Deep Static Analysis (SAST)", max_length=120)

    @field_validator('branch')
    @classmethod
    def branch_must_be_safe(cls, v: str) -> str:
        v = v.strip()
        if not _BRANCH_RE.match(v):
            raise ValueError('Branch name contains invalid characters. Only alphanumeric, dot, dash, underscore, and slash are allowed.')
        return v

    @field_validator('engine')
    @classmethod
    def engine_must_be_known(cls, v: str) -> str:
        if v not in _VALID_ENGINES:
            # Accept unknown engines but sanitize to prevent injection
            return _sanitize_text(v, 120)
        return v


class SettingsUpdate(BaseModel):
    workspace: str = Field(..., min_length=1, max_length=120)
    timezone:  str = Field(..., min_length=1, max_length=120)

    @field_validator('workspace', 'timezone')
    @classmethod
    def sanitize_fields(cls, v: str) -> str:
        return _sanitize_text(v, 120)


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _gate_to_dict(g: models.Gate) -> dict:
    return {
        "id":         g.id,
        "name":       g.name,
        "desc":       g.desc,
        "active":     g.active,
        "strictness": g.strictness or [],
        "action":     g.action or [],
        "status":     "ACTIVE" if g.active else "DISABLED",
        "statusCls":  "rc-pill-green" if g.active else "rc-pill-red",
    }


def _agent_to_dict(a: models.Agent) -> dict:
    return {
        "id":          a.id,
        "name":        a.name,
        "icon":        a.icon,
        "active":      a.active,
        "statusLabel": a.status_label,
        "statusColor": "var(--green)" if a.active else "var(--text-muted)",
        "stats":       a.stats or [],
        "log":         a.log or "",
    }


def _scan_to_dict(s: models.ScanResult) -> dict:
    return {
        "id":              s.id,
        "repo_url":        s.repo_url,
        "branch":          s.branch,
        "engine":          s.engine,
        "gate":            s.gate,
        "gate_rationale":  s.gate_rationale,
        "critical_count":  s.critical_count,
        "high_count":      s.high_count,
        "findings":        s.findings or [],
        "explanation":     s.explanation,
        "patched_code":    s.patched_code,
        "patched_filename": getattr(s, "patched_filename", "") or "",
        "patch_status":    getattr(s, "patch_status", "PENDING") or "PENDING",
        "secret_findings": s.secret_findings or [],
        "sandbox_verdict": s.sandbox_verdict,
        "model":           getattr(s, "model", "") or "",
        "scanned_at":      s.scanned_at.isoformat() if s.scanned_at else None,
    }


# ---------------------------------------------------------------------------
# ENDPOINTS
# ---------------------------------------------------------------------------

@app.get("/")
def health_check():
    return {"status": "online", "service": "ResilioCheck AI Core Engine"}

@app.get("/api/health")
def api_health():
    """Returns non-secret config info for diagnostics — model chain, key presence, DB & sandbox status."""
    try:
        with engine.connect() as conn:
            conn.execute(sa_text("SELECT 1"))
        db_status = "connected"
    except Exception as e:  # pragma: no cover
        db_status = f"error: {str(e)[:120]}"
    return {
        "status":    "online",
        "version":   app.version,
        "db_status": db_status,
        "sandbox":   docker_status(),
        **settings.public_config(),
    }


def _relativise(srcs: dict, workspace_dir: str) -> dict:
    """{abs_path: content} -> {relative/posix/path: content}"""
    out = {}
    for path, content in srcs.items():
        rel = os.path.relpath(path, workspace_dir).replace("\\", "/")
        # Strip the GitHub archive's top-level "<repo>-<ref>/" folder
        parts = rel.split("/", 1)
        rel = parts[1] if len(parts) == 2 else rel
        out[rel] = content
    return out


# Patterns that indicate test/fixture/lock/generated files — low value for AI analysis
_TEST_SKIP = re.compile(
    r'(test_|_test\.|\.test\.|\.spec\.|__tests__|/tests?/|'
    r'node_modules|\.lock$|package-lock|yarn\.lock|\.min\.js$|'
    r'\.map$|migrations?/|fixtures?/)',
    re.IGNORECASE,
)
# High-priority application code patterns
_APP_PRIORITY = re.compile(
    r'(route|controller|model|middleware|auth|service|handler|'
    r'app\.(py|js|ts)|main\.(py|js|ts)|server\.(js|ts|py)|index\.(js|ts|php)|'
    r'api/|views?\.|schema|serializer|util|helper|config(?!.*lock)|\.env)',
    re.IGNORECASE,
)


def _select_files_for_ai(rel_srcs: dict, flagged_files: set, secrets: list, max_files: int) -> dict:
    """Prioritise SAST-flagged, secret-bearing and application files."""
    secret_basenames = {f["file"] for f in secrets}
    priority, secondary = {}, {}
    for rel_path, content in rel_srcs.items():
        is_test  = bool(_TEST_SKIP.search(rel_path))
        flagged  = rel_path in flagged_files
        is_app   = bool(_APP_PRIORITY.search(rel_path))
        has_sec  = os.path.basename(rel_path) in secret_basenames
        if flagged or has_sec or (is_app and not is_test):
            priority[rel_path] = content
        else:
            secondary[rel_path] = content

    selected = dict(list(priority.items())[:max_files])
    for rel_path, content in secondary.items():
        if len(selected) >= max_files:
            break
        selected[rel_path] = content
    if not selected:
        selected = dict(list(rel_srcs.items())[:5])
    log.info("Passing %d file(s) to AI pipeline (%d priority, %d secondary).",
             len(selected), len(priority), len(secondary))
    return selected


def _run_scan_blocking(repo_url: str, branch: str, engine_label: str, workspace_dir: str, github_token: str | None = None) -> dict:
    """Everything CPU / network heavy runs here, inside a worker thread."""
    used_ref = download_and_extract_repo(repo_url, workspace_dir, branch=branch, github_token=github_token)
    srcs = gather_source_files(workspace_dir)
    if not srcs:
        return {"empty": True}

    rel_srcs = _relativise(srcs, workspace_dir)
    secrets  = scan_for_secrets(srcs)
    flagged  = run_local_sast_prefilter(workspace_dir)   # returns set() when sandbox tools unavailable
    selected = _select_files_for_ai(rel_srcs, flagged, secrets, settings.MAX_FILES_FOR_AI)

    client = GroqClient(models=settings.resolve_model_chain(engine_label))
    pipe_res = run_pipeline(selected, secrets, client=client)

    verdict, logs = "SKIPPED", ""
    p_code = pipe_res.get("patched_code", "")
    p_file = pipe_res.get("patched_filename", "")
    if p_code and p_file:
        max_retries = 1   # each retry costs an LLM call — keep within the TPM budget
        for attempt in range(max_retries + 1):
            verdict, logs = apply_patch_and_validate(workspace_dir, p_code, p_file)
            if verdict != "FAIL" or attempt == max_retries:
                break
            log.info("Patch failed validation (attempt %d) — asking the AI to repair it", attempt + 1)
            try:
                p_code = run_patch_retry_agent(pipe_res, selected, p_code, logs, client=client)
                pipe_res["patched_code"] = p_code
            except PipelineError as exc:
                log.warning("Patch retry skipped: %s", exc.detail)
                break

    return {
        "empty": False,
        "used_ref": used_ref,
        "secrets": secrets,
        "pipeline": pipe_res,
        "sandbox_verdict": verdict,
        "sandbox_logs": logs[-2000:] if logs else "",
    }


@app.post("/api/scan")
async def run_scan(req: ScanRequest, db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
    if not settings.GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is not configured on the server.")

    try:
        repo_url = validate_repo_url(req.repo_url)
        branch   = validate_branch(req.branch)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    aid           = str(uuid.uuid4())
    workspace_dir = os.path.abspath(f"./tmp_workspace_{aid[:8]}")

    try:
        shutil.rmtree(workspace_dir, ignore_errors=True)
        os.makedirs(workspace_dir, exist_ok=True)

        outcome = await run_in_threadpool(
            _run_scan_blocking, repo_url, branch, req.engine, workspace_dir,
            current_user.github_token or None,
        )

        if outcome.get("empty"):
            result = models.ScanResult(
                repo_url=repo_url, branch=branch, engine=req.engine,
                gate="APPROVED", gate_rationale="No scannable source files found.",
                explanation="No scannable source files found in the repository.",
                critical_count=0, high_count=0, patch_status="N/A", sandbox_verdict="SKIPPED",
            )
            db.add(result)
            current_user.scan_count = (current_user.scan_count or 0) + 1
            db.commit()
            db.refresh(result)
            return _scan_to_dict(result)

        pipeline_result = outcome["pipeline"]
        secret_findings = outcome["secrets"]
        patched_code     = pipeline_result.get("patched_code", "") or ""
        patched_filename = (pipeline_result.get("patched_filename", "") or "").replace("\\", "/").lstrip("/")
        # Sanitize relative path before persisting to prevent path traversal in GitHub PRs
        if patched_code and (not re.match(r"^[A-Za-z0-9._\-/]+$", patched_filename)
                             or ".." in patched_filename.split("/")):
            patched_filename = "resiliocheck_patch.txt"

        result = models.ScanResult(
            repo_url         = repo_url,
            branch           = branch,
            engine           = req.engine,
            gate             = pipeline_result["gate"],
            gate_rationale   = pipeline_result["gate_rationale"],
            critical_count   = pipeline_result["critical_count"],
            high_count       = pipeline_result["high_count"],
            findings         = pipeline_result["findings"],
            explanation      = pipeline_result["explanation"],
            patched_code     = patched_code,
            patched_filename = patched_filename if patched_code else "",
            secret_findings  = secret_findings,
            sandbox_verdict  = outcome["sandbox_verdict"],
            patch_status     = "PENDING" if patched_code else "N/A",
            model            = pipeline_result.get("model", ""),
            user_id          = current_user.id,
        )
        db.add(result)

        # Update agent stats
        secret_agent = db.query(models.Agent).filter(models.Agent.id == "secret-scanner").first()
        if secret_agent:
            stats = list(secret_agent.stats or [])
            for st in stats:
                if st.get("label") == "Secrets Found":
                    st["value"] = str(len(secret_findings))
            secret_agent.stats = stats
            secret_agent.log   = f"> Scan complete for {repo_url}\n> {len(secret_findings)} secret(s) detected."

        code_fixer = db.query(models.Agent).filter(models.Agent.id == "code-fixer").first()
        if code_fixer:
            stats = list(code_fixer.stats or [])
            for st in stats:
                if st.get("label") == "Issues Resolved":
                    try:
                        current = int(str(st.get("value", "0")).replace(",", ""))
                    except ValueError:
                        current = 0
                    st["value"] = f"{current + len(pipeline_result['findings']):,}"
            code_fixer.stats = stats
            code_fixer.log   = (f"> Processed {len(pipeline_result['findings'])} finding(s) from latest scan.\n"
                                f"> Gate: {pipeline_result['gate']} | Model: {pipeline_result.get('model', '')}")

        current_user.scan_count = (current_user.scan_count or 0) + 1
        db.commit()
        db.refresh(result)
        payload = _scan_to_dict(result)
        payload["sandbox_logs"] = outcome.get("sandbox_logs", "")
        payload["llm_calls"] = pipeline_result.get("llm_calls", 0)
        payload["files_analysed"] = pipeline_result.get("files_analysed", [])
        return payload

    except PipelineError as exc:
        log.warning("Pipeline error for %s: %s", repo_url, exc.detail)
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except (ValueError, RuntimeError) as exc:
        # download / validation problems — message is already user-friendly
        log.warning("Scan failed for %s: %s", repo_url, exc)
        raise HTTPException(status_code=400, detail=f"Scan failed: {exc}")
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Unexpected pipeline failure for %s", repo_url)
        raise HTTPException(status_code=500, detail=f"Pipeline error: {type(exc).__name__}: {str(exc)[:300]}")
    finally:
        shutil.rmtree(workspace_dir, ignore_errors=True)


@app.get("/api/scans")
def get_scan_history(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Prompt 4 (IDOR) — Return only scans that belong to the current user.
    Admins and superadmins can see all scans for oversight.
    """
    query = db.query(models.ScanResult)
    if current_user.role not in ("admin", "superadmin"):
        query = query.filter(models.ScanResult.user_id == current_user.id)
    scans = query.order_by(models.ScanResult.id.desc()).limit(50).all()
    return [_scan_to_dict(s) for s in scans]


# ── Patch Approval (GitHub PR) ───────────────────────────────────────────────

@app.post("/api/scans/{scan_id}/apply-patch")
def apply_patch_pr(scan_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Creates a GitHub Pull Request applying the AI-generated patch.
    Uses GITHUB_TOKEN from .env to authenticate.
    """
    import base64
    import requests as http_requests

    scan = db.query(models.ScanResult).filter(models.ScanResult.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    # Prompt 4 (IDOR) — Verify the requesting user owns this scan (admins are exempt).
    if current_user.role not in ("admin", "superadmin") and getattr(scan, "user_id", None) != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this scan.")
    if not scan.patched_code:
        raise HTTPException(status_code=400, detail="No patch available for this scan")
    if getattr(scan, "patch_status", "PENDING") == "APPLIED":
        raise HTTPException(status_code=400, detail="Patch already applied")

    github_token = settings.GITHUB_TOKEN
    if not github_token:
        raise HTTPException(status_code=503, detail="GITHUB_TOKEN is not configured on the server — automated PRs are disabled.")

    # Parse owner/repo from repo_url
    repo_url = scan.repo_url.rstrip("/")
    parts    = repo_url.replace("https://github.com/", "").split("/")
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="Cannot parse owner/repo from scan URL")
    owner, repo = parts[0], parts[1]

    branch_name  = f"resiliocheck-fix-{scan_id}"
    patched_file = (getattr(scan, "patched_filename", None) or "resiliocheck_patch.txt").lstrip("/")
    if not re.match(r"^[A-Za-z0-9._\-/]+$", patched_file) or ".." in patched_file.split("/"):
        raise HTTPException(status_code=400, detail="Stored patch filename is invalid")

    try:
        # ── 1. Get default branch SHA ──────────────────────────────────────────
        headers = {
            "Authorization": f"token {github_token}",
            "Accept":        "application/vnd.github+json",
        }
        ref_resp = http_requests.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/ref/heads/{scan.branch}",
            headers=headers, timeout=15,
        )
        if ref_resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"GitHub ref lookup failed ({ref_resp.status_code}): {ref_resp.text[:300]}")
        base_sha = ref_resp.json()["object"]["sha"]

        # ── 2. Create fix branch ───────────────────────────────────────────────
        create_branch = http_requests.post(
            f"https://api.github.com/repos/{owner}/{repo}/git/refs",
            headers=headers,
            json={"ref": f"refs/heads/{branch_name}", "sha": base_sha},
            timeout=15,
        )
        if create_branch.status_code not in (201, 422):   # 422 = already exists
            raise HTTPException(status_code=502, detail=f"Branch creation failed ({create_branch.status_code}): {create_branch.text[:300]}")

        # ── 3. Get current file SHA (needed for update) ────────────────────────
        file_resp = http_requests.get(
            f"https://api.github.com/repos/{owner}/{repo}/contents/{patched_file}",
            headers=headers,
            params={"ref": branch_name},
            timeout=15,
        )
        file_sha = file_resp.json().get("sha") if file_resp.status_code == 200 else None

        # ── 4. Push patched file ───────────────────────────────────────────────
        content_b64 = base64.b64encode(scan.patched_code.encode()).decode()
        update_payload = {
            "message": f"fix(resiliocheck): AI-generated security patch for scan #{scan_id}",
            "content": content_b64,
            "branch":  branch_name,
        }
        if file_sha:
            update_payload["sha"] = file_sha

        push_resp = http_requests.put(
            f"https://api.github.com/repos/{owner}/{repo}/contents/{patched_file}",
            headers=headers,
            json=update_payload,
            timeout=15,
        )
        if push_resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"File push failed ({push_resp.status_code}): {push_resp.text[:300]}")

        # ── 5. Open Pull Request ───────────────────────────────────────────────
        pr_resp = http_requests.post(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            headers=headers,
            json={
                "title": f"[ResilioCheck AI] Security Fix — Scan #{scan_id}",
                "body":  (
                    f"**Automated security patch generated by ResilioCheck AI.**\n\n"
                    f"**Scanned Repository:** {scan.repo_url}\n"
                    f"**Branch:** `{scan.branch}`\n"
                    f"**Gate Verdict:** `{scan.gate}`\n"
                    f"**Findings:** {scan.critical_count} critical, {scan.high_count} high\n\n"
                    f"### Rationale\n{scan.gate_rationale}\n\n"
                    f"### AI Explanation\n{scan.explanation}\n"
                ),
                "head": branch_name,
                "base": scan.branch,
            },
            timeout=15,
        )
        if pr_resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"PR creation failed ({pr_resp.status_code}): {pr_resp.text[:300]}")

        pr_url = pr_resp.json().get("html_url", "")

        # ── 6. Mark scan as APPLIED ────────────────────────────────────────────
        scan.patch_status = "APPLIED"
        db.commit()

        return {"status": "success", "pr_url": pr_url, "branch": branch_name}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GitHub PR failed: {str(e)}")


@app.post("/api/scans/{scan_id}/reject-patch")
def reject_patch(scan_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    scan = db.query(models.ScanResult).filter(models.ScanResult.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    # Prompt 4 (IDOR) — Verify the requesting user owns this scan.
    if current_user.role not in ("admin", "superadmin") and getattr(scan, "user_id", None) != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this scan.")
    if not scan.patched_code:
        raise HTTPException(status_code=400, detail="No patch available for this scan")
    if scan.patch_status == "APPLIED":
        raise HTTPException(status_code=400, detail="Patch already applied — cannot reject")
    scan.patch_status = "REJECTED"
    db.commit()
    return {"status": "success", "patch_status": "REJECTED"}


# ── Gates ────────────────────────────────────────────────────────────────────

@app.get("/api/gates")
def get_gates(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return [_gate_to_dict(g) for g in db.query(models.Gate).all()]

class GateCreate(BaseModel):
    name:       str = Field(..., min_length=2, max_length=80)
    desc:       str = Field("", max_length=400)
    strictness: list[str] | str = Field(default_factory=list)
    action:     list[str] | str = Field(default_factory=list)

    @field_validator('name', 'desc')
    @classmethod
    def sanitize_gate_fields(cls, v: str) -> str:
        return _sanitize_text(v, 400)

@app.post("/api/gates")
def create_gate(gate_in: GateCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    strictness = [gate_in.strictness] if isinstance(gate_in.strictness, str) else gate_in.strictness
    action     = [gate_in.action] if isinstance(gate_in.action, str) else gate_in.action
    base_id = re.sub(r"[^a-z0-9]+", "_", gate_in.name.lower()).strip("_") or "gate"
    gate_id = base_id
    n = 1
    while db.query(models.Gate).filter(models.Gate.id == gate_id).first():
        n += 1
        gate_id = f"{base_id}_{n}"
    new_gate = models.Gate(
        id=gate_id,
        name=gate_in.name,
        desc=gate_in.desc,
        active=True,
        strictness=strictness,
        action=action,
    )
    db.add(new_gate)
    db.commit()
    db.refresh(new_gate)
    return {"status": "success", "gate": _gate_to_dict(new_gate)}


@app.post("/api/gates/{gate_id}/toggle")
def toggle_gate(gate_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    gate = db.query(models.Gate).filter(models.Gate.id == gate_id).first()
    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")
    gate.active = not gate.active
    db.commit()
    db.refresh(gate)
    return {"status": "success", "gate": _gate_to_dict(gate)}


# ── Agents ───────────────────────────────────────────────────────────────────

@app.get("/api/agents")
def get_agents(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return [_agent_to_dict(a) for a in db.query(models.Agent).all()]


@app.post("/api/agents/{agent_id}/toggle")
def toggle_agent(agent_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.active       = not agent.active
    agent.status_label = "Working" if agent.active else "Idle"
    db.commit()
    db.refresh(agent)
    return {"status": "success", "agent": _agent_to_dict(agent)}


# ── Deployments ──────────────────────────────────────────────────────────────

@app.get("/api/deployments")
def get_deployments(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Derive deployments dynamically from the 10 most recent scan results.
    Each scan = one deployment entry with a real status and security gate verdict.
    """
    scans = db.query(models.ScanResult).order_by(models.ScanResult.id.desc()).limit(10).all()
    if not scans:
        return []

    deployments = []
    for i, s in enumerate(scans):
        dep_id = f"DEP-{900 - i:03d}"
        passed = s.gate == "APPROVED"
        deployments.append({
            "id":        dep_id,
            "scan_id":   s.id,
            "status":    "Success" if passed else "Failed",
            "statusCls": "rc-pill-teal" if passed else "rc-pill-red",
            "icon":      "✓" if passed else "!",
            "iconColor": "var(--teal)" if passed else "var(--red)",
            "title":     (s.repo_url or "").rstrip("/").split("/")[-1].replace("-", " ").title() or "Unknown",
            "target":    f"Branch: {s.branch}",
            "checks": [
                {"label": f"SAST: {s.gate}", "ok": passed},
                {"label": f"{s.critical_count} critical, {s.high_count} high issues", "ok": passed},
                {"label": s.scanned_at.strftime("%Y-%m-%d %H:%M UTC") if s.scanned_at else "", "ok": None},
            ],
            "actions": ["Logs"] + (["Rollback"] if not passed else []),
        })
    return deployments


@app.get("/api/scans/{scan_id}")
def get_scan_detail(scan_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Return full detail for a single scan result (used by Logs modal)."""
    s = db.query(models.ScanResult).filter(models.ScanResult.id == scan_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Scan not found")
    return _scan_to_dict(s)


# ── Settings ─────────────────────────────────────────────────────────────────

# Settings are still in-memory (workspace/timezone preferences) — acceptable
_settings = {
    "workspace": "ResilioCheck AI DevSecOps",
    "timezone":  "UTC (Coordinated Universal Time)",
    "plan": {
        "name":          "Pro Plan",
        "price":         5,
        "period":        "mo",
        "status":        "Active",
        "billing_cycle": "Billed monthly.",
        "seats_used":    1,
        "seats_total":   20,
    },
}


@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    team = []
    if current_user.role in ["admin", "superadmin"]:
        users = db.query(models.User).all()
        team = [{"name": u.full_name or u.email, "email": u.email, "role": u.role} for u in users]
    else:
        # Standard users only see themselves in the team list
        team = [{"name": current_user.full_name or current_user.email, "email": current_user.email, "role": current_user.role}]
        
    return {**_settings, "team": team}


@app.post("/api/settings")
def update_settings(s: SettingsUpdate, current_user: models.User = Depends(get_current_user)):
    _settings["workspace"] = s.workspace
    _settings["timezone"]  = s.timezone
    return {"status": "success"}


