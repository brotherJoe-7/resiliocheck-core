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
pip install fastapi uvicorn groq python-dotenv gitpython langchain langchain-groq sqlalchemy docker

# Start the server (runs on port 8000)
uvicorn backend.main:app --reload --port 8000
```
*API Documentation is available at http://localhost:8000/docs*

### 2. Start the Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```
*The dashboard will be available at http://localhost:3000*

## 🔌 API Endpoints (Backend)

The Next.js frontend is fully dynamic and communicates with these FastAPI endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/api/scan` | `POST` | Initiates the LangChain multi-agent pipeline on a GitHub repository. |
| `/api/scans`| `GET`  | Retrieves persistent scan history from the SQLite database. |
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
- **Gate Decision Agent**: Enforces strict numeric policies (e.g. `BLOCKED` if Critical >= 1 or High >= 3) against the findings.
- **Patch Generator & Sandbox**: Generates a targeted fix for the highest severity issue. The patched file is then written back to disk and syntax-validated inside a hardened Docker container, which dynamically supports multiple languages (`.js`, `.ts` via Node 22, `.py`, `.php`, `.rb`, `.sh`).

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
