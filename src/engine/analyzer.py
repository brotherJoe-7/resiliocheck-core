"""
engine/analyzer.py
==================
ResilioCheck AI Core — Module 2: LangChain Multi-Agent Engine
"""

from __future__ import annotations

import logging
import time
import traceback
import uuid
from typing import Literal, Dict

import requests
from fastapi import FastAPI
from pydantic import BaseModel, HttpUrl, field_validator

from config.settings import get_settings
from .agents import CodeChunkingAgent, EmbeddingAgent, OWASPAgent, GateDecisionAgent
from src.utils.github import GitHubApp

logger = logging.getLogger("resiliocheck.engine")

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class AnalysisRequest(BaseModel):
    event_type: Literal["push", "pull_request", "manual"]
    repo: str
    clone_url: str
    branch: str
    sha: str
    sender: str
    source_code: Dict[str, str]
    analysis_id: str = ""   # gateway passes its own ID; engine uses it if provided

    @field_validator("sha")
    @classmethod
    def _validate_sha(cls, v: str) -> str:
        # Accept standard git SHAs (7 or 40 hex chars) or manual run tokens
        if v.startswith("manual_run_"):
            return v
        if not v.isalnum() or len(v) not in {7, 40}:
            raise ValueError("sha must be a 7 or 40 hex character SHA or a manual_run token.")
        return v.lower()

class AnalysisResult(BaseModel):
    analysis_id: str
    repo: str
    sha: str
    gate: str
    findings_summary: str
    critical_count: int
    high_count: int
    ai_analysis_status: str
    sandbox_validation_status: str

# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

_SANDBOX_URL = "http://localhost:8002/sandbox"
_results_store: Dict[str, dict] = {}
_START_TIME = time.time()

class AnalysisOrchestrator:
    def __init__(self):
        self._settings = get_settings()
        self.groq_api_key = self._settings.groq_api_key
        self._model = self._settings.groq_model or "llama-3.1-70b-versatile"
        
        # Initialize agents
        self.chunking_agent = CodeChunkingAgent()
        self.embedding_agent = EmbeddingAgent()
        if self.groq_api_key:
            self.owasp_agent = OWASPAgent(groq_api_key=self.groq_api_key, model_name=self._model)
            self.gate_agent = GateDecisionAgent(groq_api_key=self.groq_api_key, model_name=self._model)
        else:
            self.owasp_agent = None
            self.gate_agent = None
            
        import os
        github_token = os.getenv("GITHUB_TOKEN")
        self.github_app = GitHubApp(github_token) if github_token else None

    def run(self, request: AnalysisRequest) -> AnalysisResult:
        # Use the gateway's analysis_id when provided, otherwise generate one
        analysis_id = request.analysis_id if request.analysis_id else str(uuid.uuid4())
        logger.info("Analysis started | id=%s | repo=%s", analysis_id, request.repo)

        try:
            if not self.groq_api_key:
                raise RuntimeError("GROQ_API_KEY is not configured.")

            # Step 1: LLM Analysis (Multi-Agent Pipeline)
            try:
                # 1. Chunk code
                chunks = self.chunking_agent.process(request.source_code)
                
                # 2. Embed into Chroma
                vectorstore = self.embedding_agent.upsert_chunks(chunks, analysis_id)
                
                # 3. OWASP Analysis
                owasp_report = self.owasp_agent.analyze(vectorstore)
                
                # 4. Gate Decision & Patching
                decision = self.gate_agent.decide(request.source_code, owasp_report)

                explanation = decision.explanation
                patched_files = decision.patched_files
                
                pr_url = ""
                pr_number = None
                
                if patched_files and self.github_app:
                    try:
                        base_branch = request.branch or "main"
                        new_branch = f"resiliocheck-patch-{analysis_id[:8]}"
                        self.github_app.create_branch(request.repo, base_branch, new_branch)
                        for fpath, new_content in patched_files.items():
                            self.github_app.commit_file(request.repo, new_branch, fpath, new_content, f"Fix vulnerabilities in {fpath}")
                        
                        pr_title = "[ResilioCheck AI] Security Patch"
                        pr_body = f"## Automated Security Fix\\n\\n**Analysis ID:** {analysis_id}\\n\\n**Explanation:**\\n{explanation}"
                        pr_url, pr_number = self.github_app.create_pull_request(request.repo, new_branch, base_branch, pr_title, pr_body)
                    except Exception as gh_e:
                        logger.error("Failed to create GitHub PR: %s", gh_e)
                        explanation += f"\\n\\n[GitHub PR Failed]: {str(gh_e)}"

                if owasp_report.is_secure:
                    ai_status = "APPROVED"
                    sandbox_source_code = request.source_code
                    findings_summary = "Code is secure. No vulnerabilities found."
                else:
                    ai_status = "BLOCKED"
                    if patched_files:
                        sandbox_source_code = request.source_code.copy()
                        sandbox_source_code.update(patched_files)
                    else:
                        sandbox_source_code = request.source_code
                    findings_summary = f"Found {len(owasp_report.findings)} vulnerability/ies."

                _results_store[analysis_id] = {
                    "explanation": explanation,
                    "patched_files": patched_files,
                    "pr_url": pr_url,
                    "pr_number": pr_number,
                    "ai_status": ai_status
                }

            except Exception as e:
                print(f"🚨 ENGINE CRASH LOG: {str(e)}")
                logger.error("Failed during LangChain Multi-Agent execution: %s", traceback.format_exc())
                
                # Fallback logic requested by user
                explanation = "Analysis processing fallback triggered due to multi-agent failure."
                patched_files = {}
                findings_summary = "Fallback triggered."
                
                _results_store[analysis_id] = {
                    "explanation": explanation,
                    "patched_files": patched_files,
                    "pr_url": "",
                    "pr_number": None,
                    "ai_status": "BLOCKED"
                }
                ai_status = "BLOCKED"
                sandbox_status = "BLOCKED"
                sandbox_source_code = request.source_code

            # Step 2: Sandbox Validation
            logger.info("Sending patched code to Sandbox for %s", analysis_id)
            sandbox_payload = {
                "analysis_id": analysis_id,
                "source_code": sandbox_source_code
            }
            
            try:
                sandbox_resp = requests.post(_SANDBOX_URL, json=sandbox_payload, timeout=120)
                sandbox_resp.raise_for_status()
                sandbox_result = sandbox_resp.json()
                verdict = sandbox_result.get("verdict", "ERROR")
                sandbox_status = "APPROVED" if verdict == "PASS" else "BLOCKED"
            except Exception as e:
                logger.error("Sandbox request failed: %s", e)
                sandbox_status = "BLOCKED"
            
            gate = "APPROVED" if (ai_status == "APPROVED" and sandbox_status == "APPROVED") else "BLOCKED"
            
            has_vulns = False
            if 'owasp_report' in locals() and not owasp_report.is_secure:
                has_vulns = True
                
            _results_store[analysis_id].update({
                "gate": gate,
                "has_vulnerabilities": has_vulns
            })
            
            return AnalysisResult(
                analysis_id=analysis_id,
                repo=request.repo,
                sha=request.sha,
                gate=gate,
                findings_summary=findings_summary if gate == "APPROVED" else "Analysis or Sandbox tests failed.",
                critical_count=0,
                high_count=0,
                ai_analysis_status=ai_status,
                sandbox_validation_status=sandbox_status
            )

        except Exception as e:
            error_id = str(uuid.uuid4())
            logger.error("Pipeline error [%s]: %s", error_id, traceback.format_exc())
            return AnalysisResult(
                analysis_id=analysis_id,
                repo=request.repo,
                sha=request.sha,
                gate="BLOCKED",
                findings_summary=f"Internal analysis error. Ref: {error_id}",
                critical_count=0,
                high_count=0,
                ai_analysis_status="BLOCKED",
                sandbox_validation_status="BLOCKED"
            )

# ---------------------------------------------------------------------------
# FastAPI Endpoints
# ---------------------------------------------------------------------------

app = FastAPI(title="ResilioCheck Engine")
_orchestrator = AnalysisOrchestrator()

@app.post("/analyze", response_model=AnalysisResult)
def analyze_endpoint(request: AnalysisRequest) -> AnalysisResult:
    return _orchestrator.run(request)

@app.get("/result/{analysis_id}")
def get_result(analysis_id: str) -> dict:
    return _results_store.get(analysis_id, {"explanation": "No data found.", "patched_files": {}, "pr_url": "", "pr_number": None})

@app.get("/stats")
def get_stats() -> dict:
    analyses_run = len(_results_store)
    critical_findings = sum(1 for data in _results_store.values() if data.get("has_vulnerabilities", False))
    gates_blocked = sum(1 for data in _results_store.values() if data.get("gate") == "BLOCKED")
    uptime_seconds = time.time() - _START_TIME
    
    return {
        "analyses_run": analyses_run,
        "critical_findings": critical_findings,
        "gates_blocked": gates_blocked,
        "uptime_seconds": uptime_seconds
    }
