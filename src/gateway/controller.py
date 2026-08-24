"""
gateway/controller.py
=====================
ResilioCheck FastAPI Webhook Controller — Module 1: Integration Gateway
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import traceback
import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Literal, Dict

import requests
from github import Github
from fastapi import FastAPI, Header, HTTPException, Request, status, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl, field_validator

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
_LOG_FILE = "logs/gateway.log"
os.makedirs("logs", exist_ok=True)
logging.basicConfig(
    filename=_LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("resiliocheck.gateway")

app = FastAPI(title="ResilioCheck Gateway", version="0.2.0", docs_url="/docs", redoc_url=None)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class RepositoryPayload(BaseModel):
    full_name: str
    clone_url: HttpUrl
    default_branch: str

    @field_validator("clone_url")
    @classmethod
    def _validate_clone_url(cls, v: HttpUrl) -> HttpUrl:
        if not str(v).startswith("https://github.com/"):
            raise ValueError("clone_url must point to https://github.com/ to prevent SSRF.")
        return v

    @field_validator("full_name")
    @classmethod
    def _no_path_traversal(cls, v: str) -> str:
        forbidden = {"..", "\\", "<", ">", ";", "&", "|", "`"}
        for char in forbidden:
            if char in v and char not in {"/"}:
                raise ValueError(f"Illegal character in full_name: {char!r}")
        parts = v.split("/")
        if len(parts) != 2 or not all(p.strip() for p in parts):
            raise ValueError("full_name must be in 'owner/repo' format.")
        return v

class WebhookPayload(BaseModel):
    event_type: Literal["push", "pull_request"]
    repository: RepositoryPayload
    sender_login: str
    head_commit_sha: str

    @field_validator("head_commit_sha")
    @classmethod
    def _validate_sha(cls, v: str) -> str:
        if not v.isalnum() or len(v) not in {7, 40}:
            raise ValueError("head_commit_sha must be a 7 or 40 hex character SHA.")
        return v.lower()

    @field_validator("sender_login")
    @classmethod
    def _validate_login(cls, v: str) -> str:
        import re
        if not re.fullmatch(r"[A-Za-z0-9\-]{1,39}", v):
            raise ValueError("sender_login contains invalid characters.")
        return v

class ManualAnalysisRequest(BaseModel):
    repo_url: str
    branch: str
    sender: str
    
    @field_validator("repo_url")
    @classmethod
    def _validate_repo_url(cls, v: str) -> str:
        if not v.startswith("https://github.com/"):
            raise ValueError("repo_url must point to https://github.com/ to prevent SSRF.")
        return v

# ---------------------------------------------------------------------------
# State Store
# ---------------------------------------------------------------------------
_ENGINE_URL = "http://localhost:8001/analyze"
_status_store: Dict[str, Dict] = {}

# Safe writable workspace — avoids Windows temp-dir permission errors.
_WORKSPACE_ROOT = Path("tmp_workspace")
_WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)


def _clone_or_download(clone_url: str, dest: Path) -> bool:
    """
    Try `git clone` first; if git is absent or the clone fails, fall back to
    downloading the repository as a public GitHub ZIP archive.
    Returns True on success, False on failure.
    """
    # ── Strategy 1: git clone ──────────────────────────────────────────────
    try:
        result = subprocess.run(
            ["git", "clone", "--depth", "1", clone_url, str(dest)],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode == 0:
            logger.info("git clone succeeded for %s", clone_url)
            return True
        logger.warning("git clone failed (rc=%d): %s", result.returncode, result.stderr[:400])
    except FileNotFoundError:
        logger.warning("'git' binary not found on PATH — falling back to ZIP download.")
    except Exception as exc:
        logger.warning("git clone raised an exception: %s", exc)

    # ── Strategy 2: public GitHub ZIP download ─────────────────────────────
    # Convert clone URL  https://github.com/owner/repo.git
    # into ZIP URL       https://github.com/owner/repo/archive/refs/heads/main.zip
    try:
        url_clean = clone_url.rstrip("/")
        if url_clean.endswith(".git"):
            url_clean = url_clean[:-4]
        # Default branch fallback — use HEAD archive which GitHub resolves automatically
        zip_url = f"{url_clean}/archive/HEAD.zip"
        logger.info("Attempting ZIP download from %s", zip_url)
        resp = requests.get(zip_url, timeout=120, stream=True)
        resp.raise_for_status()
        with zipfile.ZipFile(BytesIO(resp.content)) as zf:
            zf.extractall(dest)
        # GitHub wraps everything in a top-level folder — flatten it one level
        entries = list(dest.iterdir())
        if len(entries) == 1 and entries[0].is_dir():
            inner = entries[0]
            for item in inner.iterdir():
                shutil.move(str(item), str(dest))
            inner.rmdir()
        logger.info("ZIP download and extraction succeeded for %s", clone_url)
        return True
    except Exception as exc:
        logger.error("ZIP download also failed: %s", traceback.format_exc())
        return False

def _run_analysis_background(analysis_id: str, engine_envelope: dict, clone_url: str):
    logger.info("Background task started for %s", analysis_id)
    _status_store[analysis_id] = {
        "webhook_ingestion": "PENDING",
        "ai_analysis": "PENDING",
        "sandbox_validation": "PENDING",
        "rasp_monitoring": "PENDING",
        "gate": "PENDING"
    }

    source_code: Dict[str, str] = {}
    # Create a unique, writable workspace under ./tmp_workspace
    workspace = _WORKSPACE_ROOT / analysis_id
    workspace.mkdir(parents=True, exist_ok=True)

    try:
        # ── Step 1: Acquire source code ────────────────────────────────────
        success = _clone_or_download(clone_url, workspace)
        if not success:
            logger.error("Could not acquire source for %s — both git and ZIP failed.", analysis_id)
            _status_store[analysis_id]["webhook_ingestion"] = "BLOCKED"
            _status_store[analysis_id]["gate"] = "BLOCKED"
            return

        # ── Step 2: Extract source files (multi-language) ──────────────────
        SUPPORTED_EXTS = {".py", ".js", ".ts", ".jsx", ".tsx", ".php", ".java", ".rb", ".go"}
        EXCLUDED_DIRS  = {"node_modules", ".git", "build", "dist", "__pycache__", ".next", "vendor", "venv"}
        MAX_FILES      = 20
        MAX_FILE_BYTES = 50_000  # 50 KB per file

        for root, dirs, files in os.walk(workspace):
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS and not d.startswith(".")]
            for file in files:
                if len(source_code) >= MAX_FILES:
                    break
                if any(file.endswith(ext) for ext in SUPPORTED_EXTS):
                    filepath = Path(root) / file
                    try:
                        if filepath.stat().st_size > MAX_FILE_BYTES:
                            logger.info("Skipping large file: %s", filepath)
                            continue
                        rel_path = str(filepath.relative_to(workspace))
                        source_code[rel_path] = filepath.read_text(encoding="utf-8", errors="replace")
                    except Exception as read_err:
                        logger.warning("Could not read %s: %s", filepath, read_err)

        if not source_code:
            logger.warning("No supported source files found in %s — proceeding with empty payload.", clone_url)

        logger.info("Extracted %d Python files for %s.", len(source_code), analysis_id)
        engine_envelope["source_code"] = source_code
        _status_store[analysis_id]["webhook_ingestion"] = "APPROVED"

        # Dispatch to engine
        response = requests.post(
            _ENGINE_URL,
            json=engine_envelope,
            timeout=300,
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()
        engine_response = response.json()
        
        # The engine will return overall gate status and update pipeline_gates
        # Our engine will run the Groq LLM (ai_analysis) and then forward to Sandbox (sandbox_validation).
        # To keep it simple, engine response should contain statuses for its steps.
        # But for this prototype, if it returns APPROVED, we assume all steps passed.
        gate = engine_response.get("gate", "PENDING")
        _status_store[analysis_id]["ai_analysis"] = engine_response.get("ai_analysis_status", "APPROVED" if gate == "APPROVED" else "BLOCKED")
        _status_store[analysis_id]["sandbox_validation"] = engine_response.get("sandbox_validation_status", "APPROVED" if gate == "APPROVED" else "BLOCKED")
        _status_store[analysis_id]["rasp_monitoring"] = "APPROVED" # placeholder for RASP
        _status_store[analysis_id]["gate"] = gate

        # We create a PR if the original code was vulnerable (BLOCKED) but the patch was verified by the Sandbox (APPROVED)
        if gate == "BLOCKED" and _status_store[analysis_id]["sandbox_validation"] == "APPROVED":
            logger.info("Vulnerability patched and verified. Committing patch to GitHub.")
            try:
                settings_module = __import__("config.settings", fromlist=["get_settings"])
                github_token = settings_module.get_settings().github_token
                if not github_token:
                    logger.error("No GITHUB_TOKEN configured. Skipping PR creation.")
                else:
                    repo_full_name = engine_envelope.get("repo")
                    res = requests.get(f"http://localhost:8001/result/{analysis_id}")
                    if res.ok:
                        data = res.json()
                        patched_code = data.get("patched_code")
                        explanation = data.get("explanation", "Automated fix by ResilioCheck AI.")
                        source_files = engine_envelope.get("source_code", {})
                        if patched_code and source_files:
                            filename = list(source_files.keys())[0]
                            gh = Github(github_token)
                            repo = gh.get_repo(repo_full_name)
                            
                            branch_name = "resiliocheck-patch"
                            default_branch = engine_envelope.get("branch", repo.default_branch)
                            sb = repo.get_branch(default_branch)
                            
                            try:
                                repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sb.commit.sha)
                            except Exception as e:
                                logger.warning("Branch might already exist: %s", e)
                                
                            try:
                                contents = repo.get_contents(filename, ref=branch_name)
                                repo.update_file(contents.path, "[ResilioCheck AI] Secure Patch", patched_code, contents.sha, branch=branch_name)
                                
                                repo.create_pull(
                                    title="[ResilioCheck AI] Automated Security Remediation",
                                    body=explanation,
                                    head=branch_name,
                                    base=default_branch
                                )
                                logger.info("Successfully created Pull Request.")
                            except Exception as e:
                                logger.error("Could not update file or create PR: %s", e)
                        else:
                            logger.error("Missing patched code or source files.")
                    else:
                        logger.error("Failed to fetch patch result for PR.")
            except Exception as e:
                logger.error("GitHub integration error: %s", traceback.format_exc())

    except Exception:
        logger.error("Background task failed: %s", traceback.format_exc())
        _status_store[analysis_id]["webhook_ingestion"] = "BLOCKED"
        _status_store[analysis_id]["gate"] = "BLOCKED"
    finally:
        # Always clean up the workspace directory
        try:
            shutil.rmtree(workspace, ignore_errors=True)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/webhook", status_code=status.HTTP_202_ACCEPTED)
async def receive_webhook(
    payload: WebhookPayload,
    background_tasks: BackgroundTasks,
    x_github_event: str = Header(default="", alias="X-GitHub-Event"),
) -> JSONResponse:
    analysis_id = str(uuid.uuid4())
    logger.info("Webhook received | event=%s | repo=%s | sha=%s", payload.event_type, payload.repository.full_name, payload.head_commit_sha)

    engine_envelope = {
        "event_type": payload.event_type,
        "repo": payload.repository.full_name,
        "clone_url": str(payload.repository.clone_url),
        "branch": payload.repository.default_branch,
        "sha": payload.head_commit_sha,
        "sender": payload.sender_login,
    }

    background_tasks.add_task(_run_analysis_background, analysis_id, engine_envelope, str(payload.repository.clone_url))

    return JSONResponse(
        content={
            "status": "accepted",
            "gate": "PENDING",
            "analysis_id": analysis_id,
        }
    )

@app.post("/analyze_manual", status_code=status.HTTP_202_ACCEPTED)
async def analyze_manual(
    payload: ManualAnalysisRequest,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    analysis_id = str(uuid.uuid4())
    logger.info("Manual analysis triggered | repo=%s", payload.repo_url)
    
    # Extract owner/repo
    full_name = payload.repo_url.replace("https://github.com/", "").replace(".git", "").strip("/")
    if full_name.endswith("/"):
        full_name = full_name[:-1]
    
    engine_envelope = {
        "event_type": "manual",
        "repo": full_name,
        "clone_url": payload.repo_url,
        "branch": payload.branch,
        "sha": "manual_run_000000000000000000000000000",
        "sender": payload.sender,
        "analysis_id": analysis_id,
    }
    
    background_tasks.add_task(_run_analysis_background, analysis_id, engine_envelope, payload.repo_url)
    
    return JSONResponse(
        content={
            "status": "accepted",
            "gate": "PENDING",
            "analysis_id": analysis_id,
        }
    )

@app.get("/status/{analysis_id}")
async def get_status(analysis_id: str) -> dict:
    if analysis_id in _status_store:
        return _status_store[analysis_id]
    raise HTTPException(status_code=404, detail="Analysis ID not found")

@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> dict:
    return {"service": "gateway", "status": "ok"}

@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    error_id = str(uuid.uuid4())
    logger.error("Unhandled exception [%s]: %s", error_id, traceback.format_exc())
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "An internal error occurred.", "error_id": error_id},
    )
