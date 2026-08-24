# ResilioCheck AI — Code Explanation Document

This document is intended for the development team to understand the entire codebase, line-by-line and component-by-component, ensuring everyone is prepared for the dissertation defense. It covers the four primary modules of the system and how they have been secured.

## 1. Gateway (Module 1)
**File:** `src/gateway/controller.py`

The Gateway is the entry point for the application. It receives webhooks from GitHub or manual requests from the Dashboard.
- **Pydantic Validation (Security):** We use strict models like `WebhookPayload` and `ManualAnalysisRequest`. Crucially, we enforce that `clone_url` must start with `https://github.com/`. This prevents Server-Side Request Forgery (SSRF), where an attacker could provide an internal IP (like AWS metadata) or a local file path (`file:///etc/passwd`) to steal data.
- **Workspace Isolation:** The Gateway clones the repository into a local temporary workspace (`tmp_workspace/`) isolated per `analysis_id` (a unique UUID). It extracts `.py` files and creates an `engine_envelope` (JSON).
- **Asynchronous Execution:** It uses FastAPI's `BackgroundTasks` so the API responds to GitHub immediately with `HTTP_202_ACCEPTED`, while the heavy cloning and scanning happens in the background (`_run_analysis_background`).

## 2. AI Engine (Module 2)
**Files:** `src/engine/analyzer.py` and `src/engine/agents.py`

This is the core LangChain Multi-Agent orchestration layer.
- **agents.py:** 
  - `CodeChunkingAgent`: Splits large files into 1000-character chunks with overlap so the LLM doesn't lose context.
  - `EmbeddingAgent`: Converts the text into vector embeddings using a local HuggingFace model (`all-MiniLM-L6-v2`) and upserts them into ChromaDB.
  - `OWASPAgent`: Uses Groq (Llama 3.1 70B) to perform similarity searches against ChromaDB to find security vulnerabilities. It outputs a strictly typed `OWASPReport` using LangChain's structured output.
  - `GateDecisionAgent`: Takes the findings and rewrites the vulnerable code blocks to output a secure `patched_code`.
- **analyzer.py:** 
  - `AnalysisOrchestrator`: Sequences the agents in a `try...except` block. If the LLM successfully patches the code, it sends it to the Sandbox (Port 8002).
  - **Dynamic Stats (`/stats`):** This file keeps an in-memory `_results_store` dict mapping UUIDs to their analysis results. It calculates the `analyses_run`, `critical_findings`, and `uptime` dynamically so the Dashboard has real numbers without mocking.

## 3. Sandbox (Module 3)
**File:** `src/sandbox/runner.py`

The sandbox provides isolated test execution for the AI-generated patches to ensure they are syntactically valid before deployment.
- **Docker Python SDK:** It initializes a Docker client connected to the host machine.
- **Execution:** It creates a temporary directory, writes the LLM-patched code to it, and runs an ephemeral `python:3.10-slim` container mapped to that directory (in read-only mode where possible).
- **Security Check:** If the container exits with code `0` (meaning `python -m py_compile` passed), it returns `PASS` (APPROVED). Otherwise, it returns `FAIL` (BLOCKED). The container is immediately destroyed.

## 4. Dashboard UI (Module 4)
**File:** `src/dashboard/app.py`

This Streamlit application provides the Security Operations Center (SOC) view.
- **No Native Docker (Security):** The previous version of the dashboard instantiated Docker containers directly. This meant the web UI needed root-level Docker privileges, opening the system to Remote Code Execution (RCE) if compromised. Now, the dashboard ONLY makes HTTP POST/GET requests to the Gateway (`http://localhost:8000`).
- **Dynamic Real-Time Data:** The Dashboard polls `http://localhost:8001/stats` to populate the KPI metrics at the top of the screen. No mock data is used.
- **Polling Loop:** When an analyst clicks "Run Live Analysis Pipeline", the Dashboard sends a POST request to the Gateway, receives an `analysis_id`, and then loops using `time.sleep(2)` to poll the `/status/{analysis_id}` endpoint until the gate clears.

---
### Setup Instructions for Demo
1. Ensure your `.env` contains `GROQ_API_KEY`.
2. Start Docker Desktop (the daemon must be running).
3. Start the three backend services on their respective ports (`uvicorn src.gateway.controller:app --port 8000`, etc).
4. Start the dashboard `streamlit run src/dashboard/app.py`.
