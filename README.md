# ResilioCheck AI Core Engine

ResilioCheck AI is a modern, autonomous DevSecOps pipeline built with a dual architecture: a lightning-fast **Next.js** frontend and a powerful **FastAPI (Python)** backend. It integrates directly into your CI/CD workflow to detect secrets, analyze vulnerabilities, and auto-remediate code issues in real-time.

## 📖 Table of Contents
- [Architecture](#-architecture)
- [Local Development](#-local-development)
- [API Endpoints](#-api-endpoints)
- [Platform Modules Explained](#-platform-modules-explained)

## 🚀 Architecture

The project is split into two primary services:
1. **Frontend (`/frontend`)**: A Next.js 16 (React) application styled with Tailwind CSS, providing the dashboard and user interface.
2. **Backend (`/backend`)**: A FastAPI Python server powered by a LangChain Multi-Agent workflow, utilizing SQLite for persistence and Docker for sandbox validation.

## 📦 Local Development

### 1. Start the Backend (FastAPI)
You need to provide a `GROQ_API_KEY` for the AI analysis to work.
```bash
# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Mac/Linux

# Install requirements
pip install -r requirements.txt          # runtime
pip install -r requirements-dev.txt      # + pytest / httpx for the test-suite

# Configure
cp .env.example .env                     # then set GROQ_API_KEY (and JWT_SECRET_KEY in production)

# Start the server (runs on port 8000)
uvicorn backend.main:app --reload --port 8000

# Run the tests (Groq + GitHub are mocked — no network needed)
pytest -q
```
*API Documentation is available at http://localhost:8000/docs — a config/diagnostics summary at http://localhost:8000/api/health*

> **Docker sandbox is optional.** If no Docker daemon / `resiliocheck-sandbox` image is available (e.g. on Cloud Run) the sandbox stage is reported as `SKIPPED` instead of failing the scan. Build the image with `docker build -t resiliocheck-sandbox:latest -f backend/Dockerfile.sandbox .` to enable it.

### 2. Start the Frontend (Next.js)
```bash
cd frontend
cp .env.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```
*The dashboard will be available at http://localhost:3000*

### 3. Groq models & rate limits

| Setting | Default | Notes |
|---|---|---|
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Strongest model on the Groq free/developer tier |
| `GROQ_FALLBACK_MODELS` | `openai/gpt-oss-20b,qwen/qwen3.6-27b,…` | Tried in order on 429 / 404 / decommission |
| `LLM_TPM_BUDGET` | `8000` | Free-tier tokens-per-minute; every request is trimmed to fit |
| `LLM_MAX_TOTAL_WAIT_SECONDS` | `150` | Max time spent honouring `retry-after` before returning a clean HTTP 429 |
| `GATE_AGENT_MODE` | `deterministic` | Gate verdict is computed locally (0 extra LLM calls); set `llm` to add model confirmation |

Groq rate limits are enforced **per model**, so when the primary model returns `429` the pipeline hops to the next model immediately instead of sleeping. `llama-3.3-70b-versatile` is enterprise-only on Groq since Aug 2026 and is therefore only a late fallback.

## 🔌 API Endpoints (Backend)

The Next.js frontend is fully dynamic and communicates with these FastAPI endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Non-secret diagnostics: model chain, key presence, DB & sandbox status. |
| `/api/auth/register` `/login` `/me` | `POST`/`GET` | JWT authentication. First registered user becomes `superadmin`. |
| `/api/scan` | `POST` | Runs the multi-agent pipeline on a public GitHub repository (`repo_url`, `branch`, `engine`). |
| `/api/scans`| `GET`  | Retrieves persistent scan history. `/api/scans/{id}` returns one scan. |
| `/api/scans/{id}/apply-patch` | `POST` | Opens a GitHub PR with the AI patch (needs `GITHUB_TOKEN`). |
| `/api/scans/{id}/reject-patch` | `POST` | Marks the patch as rejected. |
| `/api/agents` | `GET` | Retrieves the status of all autonomous agents. |
| `/api/agents/{id}/toggle` | `POST` | Toggles an agent's active status. |
| `/api/gates` | `GET` | Retrieves the status of security gates. |
| `/api/gates/{id}/toggle` | `POST` | Toggles a security gate. |
| `/api/deployments` | `GET` | Retrieves live CI/CD pipeline deployments. |
| `/api/settings` | `GET` / `POST` | Fetches or updates workspace settings. |

## 🛡️ Platform Modules Explained

The ResilioCheck AI platform consists of several core modules that work together to secure your development lifecycle:

### 1. LangChain Multi-Agent AI Pipeline
The core engine of ResilioCheck. It downloads the source code into an isolated sandbox, performing a deterministic pre-scan for secrets, followed by a 3-stage LLM workflow:
- **OWASP Classification Agent**: Analyzes code files for deep semantic vulnerabilities (SQLi, Broken Access Control) returning structured JSON.
- **Gate Decision Agent**: Enforces the numeric policy `BLOCKED` if Critical ≥ 1 or High ≥ 3. Severity counts are always recomputed from the findings list (the model's own arithmetic is never trusted), and hardcoded secrets found by the deterministic pre-scan are merged in as CRITICAL findings.
- **Patch Generator & Sandbox**: Generates a complete, PR-ready corrected file for the highest-severity finding (files up to `PATCH_MAX_FILE_CHARS`). When a Docker daemon is available the patch is syntax-validated inside a hardened container (`.js`, `.ts` via Node 22, `.py`, `.php`, `.rb`, `.sh`); otherwise the sandbox stage is `SKIPPED`.

### 2. 🔄 Automated Pull Requests & Remediation Workflow
When a vulnerability is detected and a patch is successfully generated in the sandbox, users can push the fix directly to GitHub.
- **Concurrent Approvals**: Teams can review, approve, or reject patches directly from the **ResilioCheck Dashboard**. Approving a patch triggers the backend (`/api/scan/apply-patch`) to automatically create a new branch and open a Pull Request against the target repository.
- **GitHub-Native Review**: Once the PR is opened, the fix can also be reviewed, modified, and merged natively on GitHub by repository maintainers.
- **Current Mechanism**: Automated PRs are currently powered by a centralized bot token (`GITHUB_TOKEN` environment variable).

### 3. Security Gates
Security Gates act as automated checkpoints in your CI/CD pipeline. When enabled, they evaluate every pull request or commit.
- **XSS Prevention Gate**: Blocks code that contains potential Cross-Site Scripting vulnerabilities.
- **Dependency Audit Gate**: Stops deployments if critical CVEs are found in your `package.json` or `requirements.txt`.
You can configure the strictness of these gates (e.g., "Alert Only" vs "Block Deploy").

### 3. Deployments Pipeline
This module provides real-time monitoring of your application rollouts across different environments (Staging, Production). It tracks whether a deployment passed its security checks and allows you to manually halt or rollback a deployment if an anomaly is detected during rollout.

### 4. Agent Command Center
Autonomous remediation agents run continuously in the background to maintain repository health:
- **Code Fixer**: Automatically opens PRs to fix detected vulnerabilities.
- **Secret Scanner**: Continuously monitors incoming commits for leaked secrets.
- **Patch Automator**: Automatically bumps outdated dependencies to secure versions.
These agents can be toggled on/off individually.

### 5. Organization Settings
The administrative hub where you manage your workspace preferences, generate API keys for CLI/CI integrations, view your current Enterprise billing plan, and invite team members with role-based access control (RBAC).

## 🔮 Future Work: Private Repositories & User Authorization (World Standard)

To scale this to a "world standard" product that securely supports private repositories, the following architectural upgrades are on the roadmap:

1. **GitHub App Integration (OAuth)**: 
   Instead of using a single centralized bot token (`GITHUB_TOKEN`), users will click an **"Authorize with GitHub"** button upon signing in. This will implement the standard OAuth2 flow, requesting scoped permissions (e.g., `repo` access).
2. **User-Delegated PRs**: 
   When a user clicks "Approve Patch" on the dashboard, the backend will use *their specific OAuth token* to fork the repo (if necessary), create a branch, and open the Pull Request on their behalf.
3. **Private Repository Scanning**: 
   By authenticating the user via GitHub App, the backend will be able to clone and scan private repositories securely using the user's short-lived access tokens, ensuring zero unauthorized data leakage.
