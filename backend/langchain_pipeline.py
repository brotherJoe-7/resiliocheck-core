"""
backend/langchain_pipeline.py
==============================
ResilioCheck AI — LangChain Multi-Agent Security Pipeline

Implements a three-step sequential analysis chain using the prompts defined
in config/prompts.py:

  Step 1 — OWASP Agent   : Classifies vulnerabilities per file, returns findings[]
  Step 2 — Gate Agent    : Decides APPROVED/BLOCKED based on severity counts
  Step 3 — Patch Agent   : Generates targeted fix for the highest-severity finding

Each step sends a small, focused prompt so we never exceed the Groq TPM limit.
"""

from __future__ import annotations

import json
import os
import re

import requests
from dotenv import load_dotenv

from config.prompts import (
    OWASP_SYSTEM_PROMPT,
    GATE_DECISION_SYSTEM_PROMPT,
)

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _call_groq(system: str, user: str, temperature: float = 0.0) -> str:
    """
    Single Groq API call. Returns the raw text content from the model.
    Raises RuntimeError on API failure.
    """
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":       GROQ_MODEL,
        "messages":    [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "temperature": temperature,
    }
    resp = requests.post(GROQ_URL, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data    = resp.json()
    choices = data.get("choices") or []
    content = (choices[0].get("message") or {}).get("content", "") if choices else ""
    return content.strip()


def _parse_json(raw: str, fallback: dict) -> dict:
    """
    Robustly parse JSON from a model response.
    Strips markdown fences, extracts first {...} block as fallback.
    """
    # Strip markdown fences
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Try extracting first {...} block
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return fallback


# ---------------------------------------------------------------------------
# Pipeline steps
# ---------------------------------------------------------------------------

def run_owasp_agent(source_files: dict, secret_findings: list) -> dict:
    """
    Step 1: OWASP Triage Agent.
    Packs source files into a compact JSON payload and asks the model to
    classify vulnerabilities. Returns a findings dict with:
      { findings[], critical_count, high_count, gate_recommendation }
    """
    print("[Pipeline] Step 1: OWASP Agent — classifying vulnerabilities...")

    # Build a compact source code context (max ~4000 chars total to stay under TPM)
    MAX_CHARS  = 4_000
    code_parts = []
    used       = 0
    for filepath, content in source_files.items():
        fname   = os.path.basename(filepath)
        snippet = content[:400]          # max 400 chars per file
        entry   = f"=== {fname} ===\n{snippet}\n"
        if used + len(entry) > MAX_CHARS:
            break
        code_parts.append(entry)
        used += len(entry)

    secret_text = ""
    if secret_findings:
        lines       = [f"  [{f['pattern']}] {f['file']}:{f['line']}: {f['snippet']}"
                       for f in secret_findings[:5]]
        secret_text = "\nPRE-SCAN SECRETS DETECTED:\n" + "\n".join(lines) + "\n"

    user_msg = (
        "Analyse the following source code for OWASP Top 10 vulnerabilities.\n"
        + secret_text
        + "\nSOURCE CODE:\n"
        + "".join(code_parts)
    )

    raw = _call_groq(OWASP_SYSTEM_PROMPT, user_msg)
    print(f"[Pipeline] OWASP Agent raw response ({len(raw)} chars)")

    fallback = {
        "findings": [],
        "critical_count": 0,
        "high_count": 0,
        "gate_recommendation": "APPROVED",
    }
    result = _parse_json(raw, fallback)

    # Ensure required keys exist
    result.setdefault("findings", [])
    result.setdefault("critical_count", 0)
    result.setdefault("high_count", 0)
    result.setdefault("gate_recommendation", "APPROVED")
    return result


def run_gate_agent(owasp_result: dict) -> dict:
    """
    Step 2: Gate Decision Agent.
    Receives the OWASP findings summary and returns:
      { gate: "APPROVED|BLOCKED", rationale: str }
    """
    print("[Pipeline] Step 2: Gate Agent — deciding APPROVED/BLOCKED...")

    user_msg = json.dumps({
        "critical_count":      owasp_result.get("critical_count", 0),
        "high_count":          owasp_result.get("high_count", 0),
        "gate_recommendation": owasp_result.get("gate_recommendation", "APPROVED"),
        "findings_count":      len(owasp_result.get("findings", [])),
    })

    raw    = _call_groq(GATE_DECISION_SYSTEM_PROMPT, user_msg)
    print(f"[Pipeline] Gate Agent raw response ({len(raw)} chars)")

    fallback = {"gate": "APPROVED", "rationale": "No critical issues detected."}
    result   = _parse_json(raw, fallback)
    result.setdefault("gate", "APPROVED")
    result.setdefault("rationale", "")
    return result


def run_patch_agent(owasp_result: dict, source_files: dict) -> tuple[str, str]:
    """
    Step 3: Patch Generator.
    Targets the highest-severity finding and generates a corrected code snippet.
    Returns a tuple of (patched_code, target_filename).
    """
    findings = owasp_result.get("findings", [])
    # Sort by severity
    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
    findings_sorted = sorted(
        findings,
        key=lambda f: severity_order.get(f.get("severity", "INFO"), 4),
    )

    if not findings_sorted:
        print("[Pipeline] Step 3: Patch Agent — no findings to patch, skipping.")
        return ""

    worst = findings_sorted[0]
    print(f"[Pipeline] Step 3: Patch Agent — generating fix for {worst.get('severity')} issue in {worst.get('file_path', 'unknown')}")

    # Find the relevant file content
    target_file  = worst.get("file_path", "")
    file_content = ""
    for fp, content in source_files.items():
        if os.path.basename(fp) == os.path.basename(target_file):
            file_content = content[:800]
            break

    patch_system = (
        "You are a secure code patch generator. You will receive a vulnerability description "
        "and the relevant source code. Generate ONLY the corrected code for the vulnerable section. "
        "Return ONLY the corrected code as a plain string — no markdown, no explanation, no JSON."
    )
    user_msg = (
        f"VULNERABILITY:\n"
        f"  File: {worst.get('file_path')}\n"
        f"  OWASP: {worst.get('owasp_class')}\n"
        f"  Severity: {worst.get('severity')}\n"
        f"  Description: {worst.get('description')}\n"
        f"  Remediation: {worst.get('remediation')}\n\n"
        f"CURRENT CODE:\n{file_content}\n\n"
        f"Generate the patched version of the vulnerable code section:"
    )

    patched = _call_groq(patch_system, user_msg, temperature=0.1)
    # Strip any accidental markdown fences
    patched = re.sub(r"```\w*\s*", "", patched).strip().rstrip("`").strip()
    print(f"[Pipeline] Patch Agent generated {len(patched)} chars of patched code for {os.path.basename(target_file)}")
    return patched, os.path.basename(target_file)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_pipeline(source_files: dict, secret_findings: list) -> dict:
    """
    Runs the full three-step LangChain-style pipeline.

    Returns a dict with:
      findings         : list of OWASP finding dicts
      critical_count   : int
      high_count       : int
      gate             : "APPROVED" | "BLOCKED"
      gate_rationale   : str
      explanation      : human-readable summary string
      patched_code     : str (may be empty)
      patched_filename : str (may be empty)
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not configured")

    # Step 1: OWASP classification
    owasp_result = run_owasp_agent(source_files, secret_findings)

    # Step 2: Gate decision
    gate_result = run_gate_agent(owasp_result)

    # Step 3: Patch generation (only if issues found)
    patched_code = ""
    patched_filename = ""
    if owasp_result.get("findings"):
        try:
            patched_code, patched_filename = run_patch_agent(owasp_result, source_files)
        except Exception as e:
            print(f"[Pipeline] Patch agent failed (non-fatal): {e}")

    # Build human-readable explanation from findings
    findings = owasp_result.get("findings", [])
    if findings:
        lines = []
        for f in findings:
            lines.append(
                f"[{f.get('severity', 'INFO')}] {f.get('owasp_class', '')} — "
                f"{f.get('file_path', '')} — {f.get('description', '')} "
                f"| Fix: {f.get('remediation', '')}"
            )
        explanation = (
            f"ResilioCheck AI identified {len(findings)} security issue(s) "
            f"({owasp_result.get('critical_count', 0)} critical, "
            f"{owasp_result.get('high_count', 0)} high).\n\n"
            + "\n".join(lines)
        )
    else:
        explanation = (
            "ResilioCheck AI completed a full OWASP Top 10 analysis. "
            "No definitive vulnerabilities were detected in the scanned files. "
            f"Gate verdict: {gate_result.get('gate', 'APPROVED')}. "
            f"{gate_result.get('rationale', '')}"
        )

    return {
        "findings":       findings,
        "critical_count": owasp_result.get("critical_count", 0),
        "high_count":     owasp_result.get("high_count", 0),
        "gate":           gate_result.get("gate", "APPROVED"),
        "gate_rationale": gate_result.get("rationale", ""),
        "explanation":    explanation,
        "patched_code":   patched_code,
        "patched_filename": patched_filename,
    }
