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
        if patched_code:
            sandbox_verdict = apply_patch_and_validate(workspace_dir, patched_code)

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
            secret_findings = secret_findings,
            sandbox_verdict = sandbox_verdict,
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
