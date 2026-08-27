import os
import uuid
import shutil
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Ensure we import from the new location of the core logic
from backend.core import (
    download_and_extract_repo, 
    gather_source_files,
    scan_for_secrets, 
    run_ai_analysis, 
    apply_patch_and_validate
)

load_dotenv()

app = FastAPI(title="ResilioCheck AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScanRequest(BaseModel):
    repo_url: str
    branch: str = "main"
    engine: str = "Llama 3.3 Deep Static Analysis (SAST)"

# ---------------------------------------------------------------------------
# IN-MEMORY DATABASE FOR DEMO PURPOSES
# ---------------------------------------------------------------------------

db_gates = [
    {"id": "xss", "name": "XSS Prevention", "desc": "Analyzes frontend payloads for malicious script injection.", "strictness": ["Standard (Block Known)", "Strict (Block All)", "Permissive"], "action": ["Block Deploy & Alert", "Alert Only", "Log Only"], "active": True, "status": "ACTIVE", "statusCls": "rc-pill-green"},
    {"id": "dep", "name": "Dependency Audit", "desc": "Scans package manifests for CVEs and outdated libraries.", "strictness": ["Block Critical CVEs", "Block All CVEs", "Report Only"], "action": ["Deep Scan (Transitive)", "Direct Only", "Report"], "active": True, "status": "ISSUE DETECTED", "statusCls": "rc-pill-red"},
]

db_agents = [
    {"id": "code-fixer", "name": "Code Fixer", "icon": "✦", "statusLabel": "Working", "statusColor": "var(--green)", "active": True, "stats": [{"label": "Efficiency", "value": "98.4%"}, {"label": "Issues Resolved", "value": "1,204"}], "log": "> Applying patch to authentication service...\n[SUCCESS]"},
    {"id": "secret-scanner", "name": "Secret Scanner", "icon": "◎", "statusLabel": "Thinking", "statusColor": "var(--accent)", "active": True, "stats": [{"label": "Scan Rate", "value": "4.2M/s"}, {"label": "Secrets Found", "value": "12"}], "log": "> Scanning repository PR-882... Analyzing diffs."},
    {"id": "patch-automator", "name": "Patch Automator", "icon": "⏱", "statusLabel": "Idle", "statusColor": "var(--text-muted)", "active": False, "stats": [{"label": "Dependency Health", "value": "100%"}, {"label": "Pending Updates", "value": "0"}], "log": "> System up to date.\nEntering standby mode."},
]

db_deployments = [
    {"id": "DEP-892", "status": "In Progress", "statusCls": "rc-pill-orange", "icon": "⟳", "iconColor": "var(--accent)", "title": "Core Services Update v2.4.1", "target": "Target: Staging-EU-West", "checks": [{"label": "SAST Passed", "ok": True}, {"label": "DAST Passed", "ok": True}], "actions": ["Logs", "Cancel"], "cancelDanger": False},
    {"id": "DEP-891", "status": "Success", "statusCls": "rc-pill-teal", "icon": "✓", "iconColor": "var(--teal)", "title": "Auth Microservice Hotfix", "target": "Target: Production-US-East", "checks": [{"label": "Full Security Clearance", "ok": True}, {"label": "Duration: 4m 12s", "ok": None}], "actions": ["Logs", "Rollback"], "cancelDanger": True},
    {"id": "DEP-898", "status": "Failed", "statusCls": "rc-pill-red", "icon": "!", "iconColor": "var(--red)", "title": "Payment Gateway Integration", "target": "Target: Staging-EU-West", "checks": [{"label": "Dependency Check Failed", "ok": False}, {"label": "Reverted to previous state", "ok": None}], "actions": ["View Error Logs"], "cancelDanger": False},
]

db_settings = {
    "workspace": "Alpha Core DevSecOps",
    "timezone": "UTC (Coordinated Universal Time)",
    "plan": {
        "name": "Enterprise Plan",
        "price": 499,
        "period": "mo",
        "status": "Active",
        "billing_cycle": "Billed annually. Next invoice on Nov 1, 2024.",
        "seats_used": 12,
        "seats_total": 20,
    },
    "team": [
        {"name": "Alice Freeman", "email": "alice@resiliocheck.ai", "role": "Owner"},
        {"name": "Bob Smith", "email": "bob@resiliocheck.ai", "role": "Admin"},
        {"name": "Charlie Davis", "email": "charlie@resiliocheck.ai", "role": "Viewer"}
    ]
}

# ---------------------------------------------------------------------------
# API ENDPOINTS
# ---------------------------------------------------------------------------

@app.get("/")
def health_check():
    return {"status": "online", "service": "ResilioCheck AI Core Engine"}

@app.post("/api/scan")
def run_scan(req: ScanRequest):
    if not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured on the server")
        
    aid = str(uuid.uuid4())
    workspace_dir = f"./tmp_workspace_{aid[:8]}"
    
    try:
        shutil.rmtree(workspace_dir, ignore_errors=True)
        os.makedirs(workspace_dir, exist_ok=True)
        download_and_extract_repo(req.repo_url, workspace_dir)
        source_files = gather_source_files(workspace_dir)
        if not source_files:
            shutil.rmtree(workspace_dir, ignore_errors=True)
            return {"status": "success", "explanation": "No scannable source files found in the repository.", "secret_findings": [], "patched_files": {}}
            
        secret_findings = scan_for_secrets(source_files)
        explanation, patched_code = run_ai_analysis(source_files, secret_findings)
        ai_patched_files = {}
        sandbox_verdict = "SKIPPED"
        if patched_code:
            ai_patched_files["remediation.patch.v4.3.js"] = patched_code
            sandbox_verdict = apply_patch_and_validate(workspace_dir, patched_code)
            
        shutil.rmtree(workspace_dir, ignore_errors=True)
        return {"status": "success", "explanation": explanation or "Analysis complete. System secure.", "secret_findings": secret_findings, "patched_files": ai_patched_files, "sandbox_verdict": sandbox_verdict}
    except Exception as e:
        shutil.rmtree(workspace_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

@app.get("/api/gates")
def get_gates():
    return db_gates

@app.post("/api/gates/{gate_id}/toggle")
def toggle_gate(gate_id: str):
    for g in db_gates:
        if g["id"] == gate_id:
            g["active"] = not g["active"]
            return {"status": "success", "gate": g}
    raise HTTPException(status_code=404, detail="Gate not found")

@app.get("/api/agents")
def get_agents():
    return db_agents

@app.post("/api/agents/{agent_id}/toggle")
def toggle_agent(agent_id: str):
    for a in db_agents:
        if a["id"] == agent_id:
            a["active"] = not a["active"]
            a["statusLabel"] = "Working" if a["active"] else "Idle"
            a["statusColor"] = "var(--green)" if a["active"] else "var(--text-muted)"
            return {"status": "success", "agent": a}
    raise HTTPException(status_code=404, detail="Agent not found")

@app.get("/api/deployments")
def get_deployments():
    return db_deployments

@app.get("/api/settings")
def get_settings():
    return db_settings

class SettingsUpdate(BaseModel):
    workspace: str
    timezone: str

@app.post("/api/settings")
def update_settings(s: SettingsUpdate):
    db_settings["workspace"] = s.workspace
    db_settings["timezone"] = s.timezone
    return {"status": "success"}
