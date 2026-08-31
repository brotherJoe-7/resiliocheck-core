import json
import os
import uuid
import shutil
from datetime import datetime
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from backend.core import (
    download_and_extract_repo,
    gather_source_files,
    scan_for_secrets,
    apply_patch_and_validate,
)
from backend.langchain_pipeline import run_pipeline
from backend.database import engine, get_db
from backend import models, auth, admin

load_dotenv()

# Create all DB tables on startup
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="ResilioCheck AI Backend")

app.include_router(auth.router)
app.include_router(admin.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.on_event("startup")
def on_startup():
    db = next(get_db())
    try:
        seed_defaults(db)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# SCHEMA
# ---------------------------------------------------------------------------

class ScanRequest(BaseModel):
    repo_url: str
    branch: str = "main"
    engine: str = "Llama 3.3 Deep Static Analysis (SAST)"


class SettingsUpdate(BaseModel):
    workspace: str
    timezone: str


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
        "scanned_at":      s.scanned_at.isoformat() if s.scanned_at else None,
    }


# ---------------------------------------------------------------------------
# ENDPOINTS
# ---------------------------------------------------------------------------

@app.get("/")
def health_check():
    return {"status": "online", "service": "ResilioCheck AI Core Engine"}


@app.post("/api/scan")
def run_scan(req: ScanRequest, db: Session = Depends(get_db)):
    if not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured")

    aid           = str(uuid.uuid4())
    workspace_dir = f"./tmp_workspace_{aid[:8]}"

    try:
        shutil.rmtree(workspace_dir, ignore_errors=True)
        os.makedirs(workspace_dir, exist_ok=True)

        download_and_extract_repo(req.repo_url, workspace_dir)
        source_files = gather_source_files(workspace_dir)

        if not source_files:
            shutil.rmtree(workspace_dir, ignore_errors=True)
            result = models.ScanResult(
                repo_url=req.repo_url, branch=req.branch, engine=req.engine,
                gate="APPROVED", explanation="No scannable source files found.",
                critical_count=0, high_count=0,
            )
            db.add(result)
            db.commit()
            db.refresh(result)
            return _scan_to_dict(result)

        secret_findings = scan_for_secrets(source_files)

        # Run the multi-agent LangChain pipeline
        pipeline_result = run_pipeline(source_files, secret_findings)

        # Optional sandbox validation of patched code
        sandbox_verdict = "SKIPPED"
        patched_code    = pipeline_result.get("patched_code", "")
        patched_filename= pipeline_result.get("patched_filename", "patched_script.js")
        if patched_code:
            sandbox_verdict = apply_patch_and_validate(workspace_dir, patched_code, patched_filename)

        shutil.rmtree(workspace_dir, ignore_errors=True)

        # Persist scan result
        result = models.ScanResult(
            repo_url        = req.repo_url,
            branch          = req.branch,
            engine          = req.engine,
            gate            = pipeline_result["gate"],
            gate_rationale  = pipeline_result["gate_rationale"],
            critical_count  = pipeline_result["critical_count"],
            high_count      = pipeline_result["high_count"],
            findings        = pipeline_result["findings"],
            explanation     = pipeline_result["explanation"],
            patched_code    = patched_code,
            patched_filename= patched_filename,
            secret_findings = secret_findings,
            sandbox_verdict = sandbox_verdict,
            patch_status    = "PENDING" if patched_code else "N/A",
        )
        db.add(result)

        # Update agent stats
        secret_agent = db.query(models.Agent).filter(models.Agent.id == "secret-scanner").first()
        if secret_agent:
            stats = secret_agent.stats or []
            for s in stats:
                if s.get("label") == "Secrets Found":
                    s["value"] = str(len(secret_findings))
            secret_agent.stats = stats
            secret_agent.log   = f"> Scan complete for {req.repo_url}\n> {len(secret_findings)} secret(s) detected."

        code_fixer = db.query(models.Agent).filter(models.Agent.id == "code-fixer").first()
        if code_fixer:
            stats = code_fixer.stats or []
            for s in stats:
                if s.get("label") == "Issues Resolved":
                    current = int(s.get("value", "0").replace(",", ""))
                    s["value"] = f"{current + len(pipeline_result['findings']):,}"
            code_fixer.stats = stats
            code_fixer.log   = f"> Processed {len(pipeline_result['findings'])} finding(s) from latest scan.\n> Gate: {pipeline_result['gate']}"

        db.commit()
        db.refresh(result)
        return _scan_to_dict(result)

    except Exception as e:
        shutil.rmtree(workspace_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")


@app.get("/api/scans")
def get_scan_history(db: Session = Depends(get_db)):
    """Return all past scan results, newest first."""
    scans = db.query(models.ScanResult).order_by(models.ScanResult.id.desc()).limit(50).all()
    return [_scan_to_dict(s) for s in scans]


# ── Patch Approval (GitHub PR) ───────────────────────────────────────────────

@app.post("/api/scans/{scan_id}/apply-patch")
def apply_patch_pr(scan_id: int, db: Session = Depends(get_db)):
    """
    Creates a GitHub Pull Request applying the AI-generated patch.
    Uses GITHUB_TOKEN from .env to authenticate.
    """
    import tempfile
    import subprocess
    import requests as http_requests

    scan = db.query(models.ScanResult).filter(models.ScanResult.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if not scan.patched_code:
        raise HTTPException(status_code=400, detail="No patch available for this scan")
    if getattr(scan, "patch_status", "PENDING") == "APPLIED":
        raise HTTPException(status_code=400, detail="Patch already applied")

    github_token = os.getenv("GITHUB_TOKEN")
    if not github_token:
        raise HTTPException(status_code=500, detail="GITHUB_TOKEN is not configured")

    # Parse owner/repo from repo_url
    repo_url = scan.repo_url.rstrip("/")
    parts    = repo_url.replace("https://github.com/", "").split("/")
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="Cannot parse owner/repo from scan URL")
    owner, repo = parts[0], parts[1]

    branch_name  = f"resiliocheck-fix-{scan_id}"
    patched_file = getattr(scan, "patched_filename", None) or "patched_fix.txt"

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
            raise HTTPException(status_code=502, detail=f"GitHub ref lookup failed: {ref_resp.text}")
        base_sha = ref_resp.json()["object"]["sha"]

        # ── 2. Create fix branch ───────────────────────────────────────────────
        create_branch = http_requests.post(
            f"https://api.github.com/repos/{owner}/{repo}/git/refs",
            headers=headers,
            json={"ref": f"refs/heads/{branch_name}", "sha": base_sha},
            timeout=15,
        )
        if create_branch.status_code not in (201, 422):   # 422 = already exists
            raise HTTPException(status_code=502, detail=f"Branch creation failed: {create_branch.text}")

        # ── 3. Get current file SHA (needed for update) ────────────────────────
        file_resp = http_requests.get(
            f"https://api.github.com/repos/{owner}/{repo}/contents/{patched_file}",
            headers=headers,
            params={"ref": branch_name},
            timeout=15,
        )
        file_sha = file_resp.json().get("sha") if file_resp.status_code == 200 else None

        # ── 4. Push patched file ───────────────────────────────────────────────
        import base64
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
            raise HTTPException(status_code=502, detail=f"File push failed: {push_resp.text}")

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
            raise HTTPException(status_code=502, detail=f"PR creation failed: {pr_resp.text}")

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
def reject_patch(scan_id: int, db: Session = Depends(get_db)):
    scan = db.query(models.ScanResult).filter(models.ScanResult.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    scan.patch_status = "REJECTED"
    db.commit()
    return {"status": "success", "patch_status": "REJECTED"}


# ── Gates ────────────────────────────────────────────────────────────────────

@app.get("/api/gates")
def get_gates(db: Session = Depends(get_db)):
    return [_gate_to_dict(g) for g in db.query(models.Gate).all()]


@app.post("/api/gates/{gate_id}/toggle")
def toggle_gate(gate_id: str, db: Session = Depends(get_db)):
    gate = db.query(models.Gate).filter(models.Gate.id == gate_id).first()
    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")
    gate.active = not gate.active
    db.commit()
    db.refresh(gate)
    return {"status": "success", "gate": _gate_to_dict(gate)}


# ── Agents ───────────────────────────────────────────────────────────────────

@app.get("/api/agents")
def get_agents(db: Session = Depends(get_db)):
    return [_agent_to_dict(a) for a in db.query(models.Agent).all()]


@app.post("/api/agents/{agent_id}/toggle")
def toggle_agent(agent_id: str, db: Session = Depends(get_db)):
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
def get_deployments(db: Session = Depends(get_db)):
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
            "status":    "Success" if passed else "Failed",
            "statusCls": "rc-pill-teal" if passed else "rc-pill-red",
            "icon":      "✓" if passed else "!",
            "iconColor": "var(--teal)" if passed else "var(--red)",
            "title":     s.repo_url.rstrip("/").split("/")[-1].replace("-", " ").title(),
            "target":    f"Branch: {s.branch}",
            "checks": [
                {"label": f"SAST: {s.gate}", "ok": passed},
                {"label": f"{s.critical_count} critical, {s.high_count} high issues", "ok": passed},
                {"label": s.scanned_at.strftime("%Y-%m-%d %H:%M UTC") if s.scanned_at else "", "ok": None},
            ],
            "actions": ["Logs"] + (["Rollback"] if not passed else []),
        })
    return deployments


# ── Settings ─────────────────────────────────────────────────────────────────

# Settings are still in-memory (workspace/timezone preferences) — acceptable
_settings = {
    "workspace": "ResilioCheck AI DevSecOps",
    "timezone":  "UTC (Coordinated Universal Time)",
    "plan": {
        "name":          "Enterprise Plan",
        "price":         499,
        "period":        "mo",
        "status":        "Active",
        "billing_cycle": "Billed annually.",
        "seats_used":    1,
        "seats_total":   20,
    },
}


@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    # Populate team from real users table
    users = db.query(models.User).all()
    team  = [{"name": u.full_name or u.email, "email": u.email, "role": u.role} for u in users]
    return {**_settings, "team": team}


@app.post("/api/settings")
def update_settings(s: SettingsUpdate):
    _settings["workspace"] = s.workspace
    _settings["timezone"]  = s.timezone
    return {"status": "success"}


# ── Admin ────────────────────────────────────────────────────────────────────

from backend.auth import require_admin

@app.get("/api/admin/users")
def get_admin_users(db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    users = db.query(models.User).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "scan_count": u.scan_count,
            "last_login": str(u.last_login) if u.last_login else "None",
            "created_at": str(u.created_at),
        }
        for u in users
    ]

@app.get("/api/admin/stats")
def get_admin_stats(db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    total_users = db.query(models.User).count()
    admin_count = db.query(models.User).filter(models.User.role.in_(["admin", "superadmin"])).count()
    total_scans = db.query(models.ScanResult).count()
    return {
        "total_users": total_users,
        "admin_count": admin_count,
        "total_scans": total_scans,
    }

@app.post("/api/admin/users/{user_id}/role")
def update_user_role(user_id: int, role: str, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if target_user.role == "superadmin" and current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Only a superadmin can modify another superadmin")
    target_user.role = role
    db.commit()
    return {"status": "success", "role": target_user.role}

@app.delete("/api/admin/users/{user_id}")
def deactivate_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if target_user.role == "superadmin" and current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Only a superadmin can deactivate another superadmin")
    target_user.is_active = False
    db.commit()
    return {"status": "success", "is_active": target_user.is_active}
