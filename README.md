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
2. **Backend (`/backend`)**: A FastAPI Python server handling all AI scanning, Git integrations, and mock database storage for the dashboard.

## 📦 Local Development

### 1. Start the Backend (FastAPI)
You need to provide a `GROQ_API_KEY` for the AI analysis to work.
```bash
# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Mac/Linux

# Install requirements (if not already installed)
pip install fastapi uvicorn groq python-dotenv gitpython

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
| `/api/scan` | `POST` | Initiates an AI security scan on a given GitHub repository. |
| `/api/agents` | `GET` | Retrieves the status of all autonomous agents. |
| `/api/agents/{id}/toggle` | `POST` | Toggles an agent's active status. |
| `/api/gates` | `GET` | Retrieves the status of security gates. |
| `/api/gates/{id}/toggle` | `POST` | Toggles a security gate. |
| `/api/deployments` | `GET` | Retrieves live CI/CD pipeline deployments. |
| `/api/settings` | `GET` / `POST` | Fetches or updates workspace settings. |

## 🛡️ Platform Modules Explained

The ResilioCheck AI platform consists of several core modules that work together to secure your development lifecycle:

### 1. AI Vulnerability Scanner (Dashboard)
The core engine of ResilioCheck. It takes a GitHub repository URL, downloads the source code into an isolated sandbox, and performs a two-stage scan:
- **Stage 1**: Deterministic regex scanning for hardcoded secrets (API keys, passwords, tokens).
- **Stage 2**: Deep static analysis (SAST) using the Groq Llama 3.3 LLM to find complex vulnerabilities (e.g., SQLi, XSS, Path Traversal) and automatically generate patch code to fix them.

### 2. Security Gates
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
