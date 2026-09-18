"""
backend/webhook.py
==================
GitHub Webhook receiver for continuous CI monitoring.

Flow
----
1.  GitHub POSTs a push/PR event to /api/webhooks/github.
2.  We verify the HMAC-SHA256 X-Hub-Signature-256 header.
3.  We return HTTP 200 immediately (GitHub requires fast acks).
4.  A FastAPI BackgroundTask runs the full scan pipeline.
5.  We post a GitHub Commit Status (pending → success/failure) on the
    head commit so GitHub branch protection rules can block merges.
"""

import hashlib
import hmac
import logging
import os
import shutil
import uuid
from datetime import datetime, timezone

import requests as _http
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session
from backend.auth import decrypt_github_token

from backend import models, settings
from backend.auth import get_current_user
from backend.core import (
    apply_patch_and_validate,
    download_and_extract_repo,
    gather_source_files,
    run_local_sast_prefilter,
    scan_for_secrets,
    validate_repo_url,
    validate_branch,
)
from backend.database import get_db
from backend.langchain_pipeline import GroqClient, PipelineError, run_pipeline

log = logging.getLogger("resiliocheck.webhook")

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _verify_signature(body: bytes, signature_header: str | None) -> bool:
    """Return True if the X-Hub-Signature-256 header matches our secret."""
    if not settings.GITHUB_WEBHOOK_SECRET:
        # Secret not configured — skip verification (warn loudly)
        log.warning("GITHUB_WEBHOOK_SECRET not set — skipping signature verification!")
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        settings.GITHUB_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def _post_commit_status(
    repo_full_name: str,
    sha: str,
    state: str,          # "pending" | "success" | "failure" | "error"
    description: str,
    token: str | None = None,
) -> None:
    """Post a GitHub Commit Status using the server GITHUB_TOKEN or user OAuth token."""
    gh_token = token or settings.GITHUB_TOKEN
    if not gh_token:
        log.warning("No GitHub token available — cannot post commit status for %s@%s", repo_full_name, sha[:8])
        return
    try:
        resp = _http.post(
            f"https://api.github.com/repos/{repo_full_name}/statuses/{sha}",
            headers={
                "Authorization": f"token {gh_token}",
                "Accept": "application/vnd.github+json",
            },
            json={
                "state":       state,
                "description": description[:140],
                "context":     "ResilioCheck AI / security-scan",
                "target_url":  f"{settings.FRONTEND_URL}/dashboard",
            },
            timeout=10,
        )
        log.info("Commit status %s posted for %s@%s — HTTP %d", state, repo_full_name, sha[:8], resp.status_code)
    except Exception as exc:
        log.error("Failed to post commit status: %s", exc)


def _run_webhook_scan(
    repo_url: str,
    branch: str,
    sha: str,
    repo_full_name: str,
    user_id: int,
    github_token: str | None,
    sender_login: str | None = None,
) -> None:
    """Full scan pipeline — runs in a background thread via FastAPI BackgroundTasks."""
    from backend.database import SessionLocal  # import here to avoid circular

    _post_commit_status(
        repo_full_name, sha, "pending",
        "ResilioCheck AI is scanning for vulnerabilities…",
        token=github_token,
    )

    db = SessionLocal()
    workspace_dir = os.path.abspath(f"./tmp_wh_{uuid.uuid4().hex[:8]}")

    try:
        os.makedirs(workspace_dir, exist_ok=True)
        download_and_extract_repo(repo_url, workspace_dir, branch=branch, github_token=github_token)
        srcs = gather_source_files(workspace_dir)
        if not srcs:
            _post_commit_status(repo_full_name, sha, "success", "No scannable files found — passed.")
            return

        from backend.main import _relativise, _select_files_for_ai  # avoids circular at module level
        rel_srcs = _relativise(srcs, workspace_dir)
        secrets  = scan_for_secrets(srcs)
        flagged  = run_local_sast_prefilter(workspace_dir)
        selected = _select_files_for_ai(rel_srcs, flagged, secrets, settings.MAX_FILES_FOR_AI)

        client   = GroqClient()
        result   = run_pipeline(selected, secrets, client=client)

        gate          = result["gate"]
        critical      = result["critical_count"]
        high          = result["high_count"]
        gate_rationale = result.get("gate_rationale", "")

        # Persist scan result
        scan = models.ScanResult(
            repo_url        = repo_url,
            branch          = branch,
            engine          = "Webhook Auto-Scan",
            gate            = gate,
            gate_rationale  = gate_rationale,
            critical_count  = critical,
            high_count      = high,
            findings        = result.get("findings", []),
            explanation     = result.get("explanation", ""),
            patched_code    = result.get("patched_code", ""),
            secret_findings = secrets,
            sandbox_verdict = "SKIPPED",
            patch_status    = "PENDING" if result.get("patched_code") else "N/A",
            model           = result.get("model", ""),
            user_id         = user_id,
        )
        db.add(scan)

        # Update monitored repo record
        monitored = db.query(models.MonitoredRepo).filter(
            models.MonitoredRepo.repo_url == repo_url
        ).first()
        if monitored:
            monitored.last_scan_at = datetime.now(timezone.utc)
            monitored.last_gate    = gate

        db.commit()
        db.refresh(scan)

        # Auto-create Pull Request if a patch was generated
        if scan.patched_code and github_token:
            try:
                from backend.github_utils import create_github_pr
                
                # Fetch GitHub username for tagging, assuming repo_full_name has owner
                # But actually we can tag the pusher if we have pusher_login from webhook body
                # For simplicity, we just use the user_id's GitHub profile if available, or just skip tagging
                # Or tag the committer (pusher)
                
                pr_url, target_branch = create_github_pr(
                    github_token=github_token,
                    repo_url=repo_url,
                    base_branch=scan.branch,
                    branch_name=f"resiliocheck-fix-{scan.id}",
                    patched_file=result.get("patched_filename", "patch.txt"),
                    patched_code=scan.patched_code,
                    scan_id=scan.id,
                    gate=scan.gate,
                    gate_rationale=scan.gate_rationale,
                    explanation=scan.explanation,
                    critical_count=scan.critical_count,
                    high_count=scan.high_count,
                    tag_user=sender_login,
                    direct=False
                )
                scan.patch_status = "APPLIED"
                db.commit()
                print(f"Auto-created PR for scan #{scan.id}: {pr_url}")
            except Exception as e:
                print(f"Failed to auto-create PR for scan #{scan.id}: {e}")

        # Post final commit status
        if gate == "APPROVED":
            _post_commit_status(
                repo_full_name, sha, "success",
                f"✓ Security gate APPROVED — {critical} critical, {high} high issues.",
                token=github_token,
            )
        else:
            _post_commit_status(
                repo_full_name, sha, "failure",
                f"✗ Security gate BLOCKED — {critical} critical, {high} high issues. Review on ResilioCheck.",
                token=github_token,
            )
        log.info("Webhook scan complete for %s@%s — gate=%s", repo_url, sha[:8], gate)

    except PipelineError as exc:
        log.error("Webhook pipeline error for %s: %s", repo_url, exc.detail)
        _post_commit_status(repo_full_name, sha, "error",
                            f"Scan error: {exc.detail[:100]}", token=github_token)
    except Exception as exc:
        log.exception("Unexpected webhook scan error for %s", repo_url)
        _post_commit_status(repo_full_name, sha, "error",
                            "Scan error — check ResilioCheck dashboard.", token=github_token)
    finally:
        db.close()
        shutil.rmtree(workspace_dir, ignore_errors=True)


# ── Webhook endpoint ─────────────────────────────────────────────────────────

@router.post("/github")
async def github_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
):
    """
    Receives push and pull_request events from GitHub.
    Returns 200 immediately, then scans in the background.
    """
    body = await request.body()

    if not _verify_signature(body, x_hub_signature_256):
        log.warning("WEBHOOK rejected — invalid signature from %s", request.client.host if request.client else "?")
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")

    if x_github_event not in ("push", "pull_request"):
        return {"status": "ignored", "event": x_github_event}

    import json
    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    # ── Extract repo and commit info ─────────────────────────────────────────
    repo_info = payload.get("repository", {})
    repo_full_name = repo_info.get("full_name", "")  # e.g. "brotherJoe-7/leoneai"
    repo_url_raw   = repo_info.get("html_url", "")

    if x_github_event == "push":
        sha    = payload.get("head_commit", {}).get("id", "")
        branch = payload.get("ref", "refs/heads/main").replace("refs/heads/", "")
    else:  # pull_request
        pr     = payload.get("pull_request", {})
        sha    = pr.get("head", {}).get("sha", "")
        branch = pr.get("head", {}).get("ref", "main")
        if payload.get("action") not in ("opened", "synchronize", "reopened"):
            return {"status": "ignored", "action": payload.get("action")}

    if not sha or not repo_full_name:
        return {"status": "ignored", "reason": "missing sha or repo name"}

    # Normalise URL
    try:
        repo_url = validate_repo_url(f"https://github.com/{repo_full_name}")
        branch   = validate_branch(branch)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Look up the monitored repo to find the owner's token
    monitored = db.query(models.MonitoredRepo).filter(
        models.MonitoredRepo.repo_url == repo_url
    ).first()

    github_token = settings.GITHUB_TOKEN
    user_id = 0
    if monitored:
        owner = db.query(models.User).filter(models.User.id == monitored.user_id).first()
        if owner:
            user_id = owner.id

    log.info("WEBHOOK %s event for %s@%s — queuing scan", x_github_event, repo_url, sha[:8])

    background_tasks.add_task(
        _run_webhook_scan,
        repo_url, branch, sha, repo_full_name, user_id, github_token,
        payload.get("sender", {}).get("login")
    )

    return {"status": "accepted", "repo": repo_url, "sha": sha[:8], "branch": branch}
