"""
engine/agents.py
================
ResilioCheck AI Core — Specialized Analysis Agents
Uses Groq's OpenAI-compatible API endpoint (mirrors main.py approach).
"""

import json
import logging
import os
from typing import Dict, List

import requests
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_community.embeddings import HuggingFaceEmbeddings
from pydantic import BaseModel, Field

logger = logging.getLogger("resiliocheck.engine.agents")

# ---------------------------------------------------------------------------
# Shared Groq API caller  (mirrors main.py exactly)
# ---------------------------------------------------------------------------
_GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
_GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

def _call_groq(api_key: str, prompt: str, model: str = _GROQ_MODEL) -> dict:
    """Call Groq's OpenAI-compatible endpoint and return parsed JSON from the response."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":           model,
        "messages":        [{"role": "user", "content": prompt}],
        "temperature":     0.0,
        "response_format": {"type": "json_object"},
    }
    resp = requests.post(_GROQ_URL, headers=headers, json=payload, timeout=120)
    resp.raise_for_status()

    # ✅ SECURITY: Defensive .get() chaining prevents KeyError / IndexError on
    # partial or malformed Groq API responses (e.g., empty choices list, missing
    # message key). Falls back to empty JSON object string so callers still get
    # a parseable dict.
    resp_json = resp.json()
    choices = resp_json.get("choices") or []
    first_choice = choices[0] if choices else {}
    raw_content = (first_choice.get("message") or {}).get("content", "{}")

    try:
        return json.loads(raw_content)
    except json.JSONDecodeError:
        logger.warning("_call_groq: response content was not valid JSON — returning empty dict.")
        return {}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class SecurityFinding(BaseModel):
    file_path:         str = Field(description="File where the vulnerability was found.")
    vulnerability_type: str = Field(description="OWASP Top 10 category (e.g. SQL Injection).")
    description:       str = Field(description="Detailed description of the vulnerability.")
    severity:          str = Field(description="Severity: CRITICAL, HIGH, MEDIUM, LOW.")

class OWASPReport(BaseModel):
    is_secure: bool                   = Field(description="True if no vulnerabilities found.")
    findings:  List[SecurityFinding]  = Field(description="List of security vulnerabilities.")

class GateDecision(BaseModel):
    explanation:   str = Field(description="Explanation of the final decision and patch applied.")
    patched_files: Dict[str, str] = Field(description="Dictionary of file paths to their complete corrected source code. Empty if no patch.")


# ---------------------------------------------------------------------------
# Agent: CodeChunkingAgent
# ---------------------------------------------------------------------------
class CodeChunkingAgent:
    """Chunks source code into manageable pieces for vector search."""
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
        )

    def process(self, source_code: Dict[str, str]) -> List[dict]:
        logger.info("Chunking %d files", len(source_code))
        chunks = []
        for file_path, content in source_code.items():
            for i, text in enumerate(self.splitter.split_text(content)):
                chunks.append({"text": text, "metadata": {"file_path": file_path, "chunk_id": i}})
        return chunks


# ---------------------------------------------------------------------------
# Agent: EmbeddingAgent
# ---------------------------------------------------------------------------
class EmbeddingAgent:
    """Embeds code chunks into an in-memory vector store."""
    def __init__(self):
        self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

    def upsert_chunks(self, chunks: List[dict], analysis_id: str) -> InMemoryVectorStore:
        logger.info("Upserting %d chunks for analysis %s", len(chunks), analysis_id)
        texts     = [c["text"]     for c in chunks]
        metadatas = [c["metadata"] for c in chunks]
        return InMemoryVectorStore.from_texts(
            texts=texts,
            embedding=self.embeddings,
            metadatas=metadatas,
        )


# ---------------------------------------------------------------------------
# Agent: OWASPAgent  (Groq direct API — matches main.py)
# ---------------------------------------------------------------------------
class OWASPAgent:
    """Uses Groq's OpenAI-compatible API to scan code for OWASP Top 10 vulnerabilities."""

    def __init__(self, groq_api_key: str, model_name: str = _GROQ_MODEL):
        self.api_key = groq_api_key
        self.model   = model_name

    def analyze(self, vectorstore: InMemoryVectorStore,
                query: str = "Find any security vulnerabilities.") -> OWASPReport:
        docs = vectorstore.similarity_search(query, k=5)
        if not docs:
            return OWASPReport(is_secure=True, findings=[])

        context = "\n\n".join(
            f"--- {doc.metadata['file_path']} ---\n{doc.page_content}" for doc in docs
        )

        prompt = (
            "You are an elite application security expert specialising in Node.js, "
            "Python, and web backend security.\n"
            "Scan the following code snippets for OWASP Top 10 vulnerabilities "
            "(SQL Injection, NoSQL Injection, Path Traversal, XSS, Weak JWT, "
            "Hardcoded Secrets, Broken Authentication, etc.).\n\n"
            "Code Snippets:\n"
            f"{context}\n\n"
            "Return a JSON object with exactly two keys:\n"
            "  'is_secure': true/false\n"
            "  'findings': array of objects each with keys: "
            "file_path, vulnerability_type, description, severity (CRITICAL/HIGH/MEDIUM/LOW)\n"
            "ONLY output the raw JSON object, nothing else."
        )

        logger.info("Running OWASP Agent via Groq API (model=%s)...", self.model)
        try:
            data = _call_groq(self.api_key, prompt, self.model)
            findings_raw = data.get("findings") or []
            if not isinstance(findings_raw, list):
                logger.warning("OWASPAgent: 'findings' field is not a list — defaulting to empty.")
                findings_raw = []
            findings = [
                SecurityFinding(
                    file_path=f.get("file_path", "unknown"),
                    vulnerability_type=f.get("vulnerability_type", "Unknown"),
                    description=f.get("description", ""),
                    severity=f.get("severity", "MEDIUM"),
                )
                for f in findings_raw
                if isinstance(f, dict)
            ]
            is_secure = data.get("is_secure", len(findings) == 0)
            return OWASPReport(is_secure=bool(is_secure), findings=findings)
        except Exception as e:
            # ✅ SECURITY: Isolate Groq failures — log cleanly and return a safe
            # fallback report so the pipeline gate degrades gracefully instead of
            # crashing the entire analysis with an unhandled exception.
            logger.error("OWASPAgent Groq call failed — returning safe fallback: %s", e)
            return OWASPReport(
                is_secure=False,
                findings=[
                    SecurityFinding(
                        file_path="unknown",
                        vulnerability_type="Analysis Unavailable",
                        description=f"OWASP scan could not complete: {e}",
                        severity="HIGH",
                    )
                ],
            )


# ---------------------------------------------------------------------------
# Agent: GateDecisionAgent  (Groq direct API — matches main.py)
# ---------------------------------------------------------------------------
class GateDecisionAgent:
    """Synthesises findings into a final gate decision and generates a patch."""

    def __init__(self, groq_api_key: str, model_name: str = _GROQ_MODEL):
        self.api_key = groq_api_key
        self.model   = model_name

    def decide(self, source_code: Dict[str, str], report: OWASPReport) -> GateDecision:
        if report.is_secure or not report.findings:
            return GateDecision(
                explanation="No vulnerabilities found. Code is secure.",
                patched_files={},
            )

        # Take up to 3 files (same limit as main.py)
        limited = dict(list(source_code.items())[:3])
        code_str = ""
        for path, content in limited.items():
            code_str += f"--- {path} ---\n{content}\n\n"

        findings_str = "\n".join(
            f"[{f.severity}] {f.vulnerability_type} in {f.file_path}: {f.description}"
            for f in report.findings
        )

        prompt = (
            "You are a senior security engineer.\n"
            "Based on the following security findings, generate a secure patch for the source code.\n\n"
            f"Security Findings:\n{findings_str}\n\n"
            f"Original Code:\n{code_str}\n\n"
            "Return a JSON object with exactly two keys:\n"
            "  'explanation': a summary of the vulnerabilities and fixes applied.\n"
            "  'patched_files': a dictionary where keys are the file paths and values are the fully corrected source code as a raw string. "
            "If no patch is needed, leave it empty.\n"
            "ONLY output the raw JSON object, nothing else."
        )

        logger.info("Running Gate Decision Agent via Groq API (model=%s)...", self.model)
        try:
            data = _call_groq(self.api_key, prompt, self.model)
            return GateDecision(
                explanation=data.get("explanation", "Security patch applied."),
                patched_files=data.get("patched_files", {}),
            )
        except Exception as e:
            logger.error("GateDecisionAgent Groq call failed: %s", e)
            raise
