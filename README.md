<div align="center">

# ResilioCheck AI

**Autonomous DevSecOps pipeline — scan public *or private* GitHub repositories, classify OWASP Top 10 vulnerabilities with Groq-hosted LLMs, gate the deployment, watch repos continuously via webhooks, and open a pull request with an AI-generated fix.**

[![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/frontend-Next.js%2016-000000?logo=nextdotjs)](https://nextjs.org/)
[![Groq](https://img.shields.io/badge/LLM-Groq-f55036)](https://console.groq.com/)
[![Python](https://img.shields.io/badge/python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Tests](https://img.shields.io/badge/tests-pytest%20%E2%80%A2%2032%20passing-brightgreen)](#-testing)
[![License](https://img.shields.io/badge/license-MIT-blue)](#-license)

</div>

---

## Table of Contents

- [What it does](#-what-it-does)
- [Architecture](#-architecture)
- [Quick start](#-quick-start)
- [Configuration](#-configuration)
- [The scan pipeline in depth](#-the-scan-pipeline-in-depth)
- [Rate limits & model fallback](#-rate-limits--model-fallback)
- [API reference](#-api-reference)
- [Dashboard modules](#-dashboard-modules)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Security model](#-security-model)
- [Troubleshooting](#-troubleshooting)
- [Project layout](#-project-layout)
- [Dissertation peer-testing guide](#-dissertation-peer-testing-guide)
- [Roadmap](#-roadmap)

---

## ✨ What it does

Paste a GitHub URL into the dashboard (or let a webhook trigger it) and ResilioCheck will:

1. **Download** the repository archive for the requested branch (falls back to the default branch). Private repositories are supported once the user has **connected GitHub via OAuth**.
2. **Pre-scan for secrets** deterministically with 17 high-confidence regex patterns (AWS/Stripe/GitHub/Slack keys, private-key blocks, connection strings, hard-coded passwords…).
3. **Prioritise files** — SAST-flagged files, files containing secrets and application code (routes, auth, models, config) go to the LLM first; tests, fixtures and lockfiles last.
4. **OWASP-classify** the code with a Groq-hosted model and return structured findings (`file_path`, `line_start`, `owasp_class`, `severity`, `title`, `description`, `remediation`).
5. **Gate** the deployment with a deterministic policy: `BLOCKED` if *Critical ≥ 1* or *High ≥ 3*, otherwise `APPROVED`.
6. **Generate a patch** — a complete, PR-ready corrected file for the highest-severity finding.
7. **Validate the patch** with an in-process subprocess sandbox (syntax check via `node --check` / `py_compile` / `php -l` / `ruby -c` / `bash -n` + bandit/semgrep SAST). No Docker daemon is required, so it runs on Cloud Run; tools that are missing are simply skipped.
8. **Persist** the result, update agent statistics and let a reviewer **approve → open a GitHub PR** or **reject** the patch from the dashboard.
9. **Monitor continuously** — register a repo under *Security Gates → Monitored Repositories* and ResilioCheck auto-creates the GitHub webhook (and optional branch-protection rule), re-scans on every `push` / `pull_request`, and posts a **commit status** (`success` / `failure`) so the gate blocks merges natively in GitHub.

Every scan is stored in the database (scoped to the owning user) and surfaced in the *Historical Evaluation Log*, *Deployments* and *Security Gates* views. The dashboard ships with a **light/dark theme toggle** and a built-in documentation page.

---

## 🏗 Architecture

```
┌──────────────────────────┐        HTTPS/JSON        ┌────────────────────────────────────────────┐
│  Next.js 16 dashboard     │ ───────────────────────▶ │  FastAPI backend  (backend/main.py)         │
│  frontend/                │ ◀─────────────────────── │                                            │
│  • JWT stored in browser  │                          │  ┌──────────────┐  ┌─────────────────────┐ │
│  • RequireAuth guard      │                          │  │ auth.py      │  │ core.py             │ │
│  • apiClient (401→logout) │                          │  │ JWT + bcrypt │  │ download • secrets  │ │
│  • light / dark theme     │                          │  │ RBAC • OAuth │  │ file ranking        │ │
└──────────────────────────┘                          │  │ rate limiter │  │ subprocess sandbox  │ │
        ▲                                             │  └──────────────┘  └─────────────────────┘ │
        │  GitHub OAuth callback                      │  ┌──────────────┐                           │
   github.com ───── push / PR webhooks ──────────────▶│  │ webhook.py   │  HMAC verify → bg scan    │
        ◀──────── commit status (CI gate) ────────────│  │              │  → commit status          │
                                                      │  └──────────────┘                           │
                                                      │  ┌──────────────────────────────────────┐  │
                                                      │  │ langchain_pipeline.py                 │  │
                                                      │  │ GroqClient ─ model chain + retry-after│──┼──▶ api.groq.com
                                                      │  │ OWASP agent → Gate → Patch agent      │  │
                                                      │  └──────────────────────────────────────┘  │
                                                      │  SQLAlchemy 2.0  ──▶  SQLite / PostgreSQL   │
                                                      └────────────────────────────────────────────┘
```

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, lucide-react | Fully client-rendered dashboard; talks to the API via `NEXT_PUBLIC_API_URL` |
| Backend | FastAPI, Pydantic v2, SQLAlchemy 2.0, PyJWT, bcrypt | Async endpoints; heavy work runs in a thread pool; request audit middleware; brute-force rate limiting on auth |
| GitHub | OAuth App + webhooks + Statuses API | Private-repo scans with the user's own token; continuous CI gate via commit statuses |
| LLM | Groq OpenAI-compatible chat API (`openai/gpt-oss-120b` primary) | Dependency-free client with per-model fallback |
| Storage | SQLite (default) or PostgreSQL via `DATABASE_URL` | Tables auto-created; forward-only column migration on boot |
| Sandbox | subprocess: bandit, semgrep, node, python, php, ruby, bash | Runs inside the API container (Cloud Run-friendly); missing tools are skipped, never executes app code |

---

## 🚀 Quick start

### Prerequisites

- Python **3.11+**, Node **22+**
- A free [Groq API key](https://console.groq.com/keys)
- *(optional)* a GitHub **OAuth App** for private repositories and a **PAT** for automated PRs

### 1 · Backend

```bash
# from the repository root
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements-dev.txt                  # runtime + pytest/httpx

cp .env.example .env                                 # set GROQ_API_KEY at minimum
uvicorn backend.main:app --reload --port 8000
```

- Swagger UI → <http://localhost:8000/docs>
- Diagnostics → <http://localhost:8000/api/health> (model chain, key presence, DB & sandbox status — no secrets)

### 2 · Frontend

```bash
cd frontend
cp .env.example .env.local        # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                       # http://localhost:3000
```

### 3 · First run

1. Open <http://localhost:3000/register> — **the first account becomes `superadmin`**.
2. Go to the dashboard, paste `https://github.com/owner/repo`, pick a branch and engine profile, hit **INITIATE SCAN**.
3. Review findings, secrets and the generated patch. If `GITHUB_TOKEN` is configured you can **Approve & Create PR**.
4. *(optional)* **Settings → Connect GitHub** to scan private repositories with your own OAuth token; **Security Gates → Monitored Repositories** to enable continuous scanning.

### 4 · Optional: GitHub OAuth (private repositories)

1. GitHub → *Settings → Developer settings → OAuth Apps → New OAuth App*.
2. Authorization callback URL: `<BACKEND_URL>/api/auth/github/callback` (e.g. `http://localhost:8000/api/auth/github/callback`).
3. Put the client ID / secret into `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` and set `BACKEND_URL`.
4. Click **Connect GitHub** in *Settings*. The token is stored per user and used for archive downloads, webhook registration and commit statuses. **Disconnect** removes it.

`/api/health → sandbox` lists which validation tools (`semgrep`, `bandit`, `node`, `php`, `ruby`) are present in the current environment; the backend `Dockerfile` installs semgrep + bandit via `requirements.txt`.

---

## ⚙️ Configuration

All settings are read once in `backend/settings.py` from environment variables / `.env`. The full annotated template is in [`.env.example`](.env.example).

### Core

| Variable | Default | Description |
|---|---|---|
| `GROQ_API_KEY` | — | **Required.** Groq API key |
| `JWT_SECRET_KEY` | *(ephemeral in dev)* | **Required when `ENVIRONMENT=production`.** `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ENVIRONMENT` | `development` | `production` enforces `JWT_SECRET_KEY` |
| `DATABASE_URL` | `sqlite:///./resiliocheck.db` | Any SQLAlchemy URL; `postgres://` is rewritten to `postgresql://` |
| `FRONTEND_URL` | `http://localhost:3000` | Comma-separated CORS origins (`*.vercel.app` is always allowed) |
| `GITHUB_TOKEN` | — | Bot PAT with `repo` scope; fallback for *Approve & Create PR* and webhook auto-setup when the user has not connected OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | GitHub OAuth App — enables *Connect GitHub* and private-repo scanning |
| `GITHUB_WEBHOOK_SECRET` | — | HMAC secret used to verify `X-Hub-Signature-256` and to auto-register webhooks |
| `BACKEND_URL` | `http://localhost:8000` | Public URL of this API — used for the OAuth callback and webhook target |
| `LOG_LEVEL` | `INFO` | Python logging level |

### LLM & rate limiting

| Variable | Default | Description |
|---|---|---|
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Primary model (strongest on the free/developer tier) |
| `GROQ_FALLBACK_MODELS` | `openai/gpt-oss-20b,qwen/qwen3.6-27b,llama-3.3-70b-versatile,llama-3.1-8b-instant` | Tried in order on 429 / 404 / decommission |
| `LLM_TPM_BUDGET` | `8000` | Tokens-per-minute cap per request (Groq free tier) |
| `LLM_MAX_OUTPUT_TOKENS` | `1800` | `max_tokens` for the OWASP agent |
| `LLM_MAX_CONTEXT_CHARS` | `14000` | Source code sent per OWASP request (~3 900 tokens) |
| `LLM_MAX_CHARS_PER_FILE` | `1400` | Per-file excerpt size |
| `LLM_MAX_TOTAL_WAIT_SECONDS` | `150` | Max time spent honouring `retry-after` before returning HTTP 429 |
| `LLM_REQUEST_TIMEOUT_SECONDS` | `90` | Per-request HTTP timeout |
| `GATE_AGENT_MODE` | `deterministic` | `llm` additionally asks the model to confirm (may only tighten the verdict) |
| `PATCH_MAX_FILE_CHARS` | `6000` | Larger files are reported but not auto-patched |
| `MAX_FILES_FOR_AI` | `12` | Files sent to the OWASP agent per scan |

### Sandbox

| Variable | Default | Description |
|---|---|---|
| `SANDBOX_ENABLED` | `true` | Set `false` to skip patch validation entirely |
| `SANDBOX_TIMEOUT_SECONDS` | `180` | Wall-clock limit per validation tool |

### Frontend

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | production Cloud Run URL | Backend base URL (no trailing slash) |

---

## 🔬 The scan pipeline in depth

```
POST /api/scan ─▶ validate URL & branch
              ─▶ download <repo>/archive/refs/heads/<branch>.zip  (fallback HEAD → main → master)
              ─▶ gather_source_files()        multi-language, skips node_modules/dist/lockfiles, 20 KB/file cap
              ─▶ scan_for_secrets()           17 regex patterns, placeholder filter, comment skipping
              ─▶ run_local_sast_prefilter()   bandit + semgrep via subprocess (skipped if tools missing)
              ─▶ _select_files_for_ai()       flagged ∪ secret-bearing ∪ app code  →  MAX_FILES_FOR_AI
              ─▶ run_pipeline()
                   ├─ Step 1  OWASP agent      structured JSON findings (json_mode when supported)
                   ├─ Step 1.5 merge secrets   pre-scan hits become CRITICAL findings if the model missed them
                   ├─ Step 2  Gate             Critical ≥ 1 or High ≥ 3 → BLOCKED   (counts recomputed locally)
                   └─ Step 3  Patch agent      complete corrected file for the worst CRITICAL/HIGH finding
              ─▶ apply_patch_and_validate()    subprocess: syntax check + SAST → PASS / FAIL / SKIPPED
                   └─ on FAIL: one AI repair attempt using the sandbox logs
              ─▶ persist ScanResult (user_id-scoped), bump agent stats & user.scan_count

POST /api/webhooks/github ─▶ verify HMAC ─▶ 200 immediately ─▶ background scan of the pushed ref
                          ─▶ POST commit status  success | failure  (context: resiliocheck/security-gate)
```

Design decisions worth knowing:

- **The model's arithmetic is never trusted.** `critical_count` / `high_count` are recomputed from the findings list, and the gate is applied locally, so a hallucinated `"critical_count": 99` can't block a clean repo.
- **Secrets are deterministic.** A hard-coded credential found by regex is a CRITICAL finding whether or not the LLM agrees.
- **Patches are whole files with real paths.** `patched_filename` is the repository-relative path (e.g. `backend/createAdmin.js`), which is exactly what the GitHub PR endpoint needs.
- **Everything is bounded.** Payload size, output tokens, wait time and retries all have explicit ceilings so a scan completes (or fails cleanly) well inside a Cloud Run request timeout.

---

## ⏱ Rate limits & model fallback

Groq enforces limits **per model** (free tier ≈ 30 RPM / 8 000 TPM per model). The old implementation retried the same model three times and then leaked `RetryError[<Future …>]` to the UI. `GroqClient` now:

1. Reads `retry-after` (or `x-ratelimit-reset-tokens`) from a 429 response.
2. **Immediately hops to the next model** in the chain instead of sleeping.
3. Only when *every* model is rate-limited does it sleep for the shortest `retry-after`, up to `LLM_MAX_TOTAL_WAIT_SECONDS` total.
4. Marks models returning 404 / "decommissioned" / "per day" quota errors as dead for the rest of the scan.
5. Retries without `response_format=json_object` when a model answers 400 *"Failed to generate JSON"* or rejects JSON mode.
6. Surfaces a human-readable message with the right HTTP status:

| Situation | HTTP | Message (abridged) |
|---|---|---|
| Wait budget exhausted | **429** | *Groq rate limit reached on every configured model … retry in ~N seconds* |
| Bad / missing API key | **500** | *Groq rejected the API key (401) … verify GROQ_API_KEY* |
| All models unavailable | **502** | *All configured Groq models were rejected or exhausted. Tried: …* |
| Prompt too large | **413** | *Prompt is too large for the per-minute token budget* (auto-shrinks twice first) |
| Repo not found / private without OAuth | **400** | *Repository not found (HTTP 404). Check that the URL is correct and the repository is public — or connect GitHub for private repos.* |
| Too many login attempts | **429** | *Too many attempts. Please try again later.* (5 per minute per IP on `/api/auth/*`) |

The **Analysis Engine Profile** dropdown chooses which model is tried *first*; the rest of the chain is always appended as fallback.

---

## 📡 API reference

All `/api/*` routes except `/api/health` and `/api/auth/*` require `Authorization: Bearer <jwt>`.

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | `{email, password (≥8), full_name}` → token. First user becomes `superadmin`. Rate-limited. |
| `POST` | `/api/auth/login` | `{email, password}` → token (email is case-insensitive). Rate-limited. |
| `GET` | `/api/auth/me` | Current user incl. `scan_count` and `github_connected` |
| `GET` | `/api/auth/github/oauth-url` · `/github/login` | Start the GitHub OAuth flow for the signed-in user |
| `GET` | `/api/auth/github/callback` | OAuth callback — stores the user's GitHub token, redirects to the frontend |
| `DELETE` | `/api/auth/github` | Disconnect GitHub (removes the stored token) |

### Scanning

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/scan` | `{repo_url, branch="main", engine}` → full `ScanResult` (see below). Uses the caller's GitHub OAuth token for private repos. |
| `GET` | `/api/scans` | The caller's last 50 scans, newest first (admins see all) |
| `GET` | `/api/scans/{id}` | Single scan — ownership enforced (IDOR-safe) |
| `POST` | `/api/scans/{id}/apply-patch` | Creates branch `resiliocheck-fix-{id}`, commits the patched file, opens a PR (user OAuth token, else `GITHUB_TOKEN`). |
| `POST` | `/api/scans/{id}/reject-patch` | Marks the patch `REJECTED` |

### Continuous monitoring

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/monitored-repos` | Repos the caller is monitoring, with last gate / last scan time |
| `POST` | `/api/monitored-repos` | `{repo_url, branch, protect_branch?}` → registers the repo, auto-creates the GitHub webhook (and optional branch-protection rule requiring the `resiliocheck/security-gate` status) |
| `DELETE` | `/api/monitored-repos/{id}` | Stop monitoring (removes the webhook when possible) |
| `POST` | `/api/webhooks/github` | GitHub → ResilioCheck. Verifies `X-Hub-Signature-256`, returns 200, scans in the background, posts a commit status |

<details>
<summary><code>ScanResult</code> shape</summary>

```jsonc
{
  "id": 12,
  "repo_url": "https://github.com/owner/repo",
  "branch": "main",
  "engine": "Groq GPT-OSS 120B Deep Static Analysis (SAST)",
  "gate": "BLOCKED",                       // APPROVED | BLOCKED
  "gate_rationale": "1 critical finding(s) detected — policy requires zero critical issues.",
  "critical_count": 1,
  "high_count": 0,
  "findings": [{
    "file_path": "backend/createAdmin.js", "line_start": 16, "line_end": 16,
    "owasp_class": "A07 – Identification & Authentication Failures",
    "severity": "CRITICAL", "title": "Hardcoded admin password",
    "description": "...", "remediation": "..."
  }],
  "secret_findings": [{ "file": "createAdmin.js", "line": 16, "pattern": "Generic Secret/Token", "snippet": "..." }],
  "explanation": "ResilioCheck AI analysed 11 file(s) with openai/gpt-oss-120b and identified ...",
  "patched_code": "…complete corrected file…",
  "patched_filename": "backend/createAdmin.js",
  "patch_status": "PENDING",               // PENDING | APPLIED | REJECTED | N/A
  "sandbox_verdict": "SKIPPED",            // PASS | FAIL | ERROR | SKIPPED
  "model": "openai/gpt-oss-120b",
  "scanned_at": "2026-09-13T08:40:12+00:00",
  "llm_calls": 2,
  "files_analysed": ["backend/routes/auth.js", "..."]
}
```
</details>

### Platform

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Version, DB status, sandbox tool availability, model chain, key/OAuth presence (never the secrets) |
| `GET` / `POST` | `/api/gates` · `POST /api/gates/{id}/toggle` | Security gates CRUD |
| `GET` | `/api/agents` · `POST /api/agents/{id}/toggle` | Autonomous agents |
| `GET` | `/api/deployments` | Deployments derived from the 10 latest scans |
| `GET` / `POST` | `/api/settings` | Workspace prefs, plan, team (roster visible to admins only) |
| `GET` | `/api/admin/users` · `/stats` · `/audit-logs` | Admin / superadmin only |
| `POST` | `/api/admin/users/{id}/role` · `DELETE /api/admin/users/{id}` | Superadmin only, audited |

---

## 🖥 Dashboard modules

| Route | Purpose |
|---|---|
| `/dashboard` | Run scans, watch the four pipeline gates, read the OWASP report, review secrets, approve/reject the patch, browse history (click a row to reload its report), onboarding guide |
| `/dashboard/gates` | Toggle XSS / SQLi / Dependency / Secrets gates, create custom gates, live pass-rate from real scans, **Monitored Repositories** (add/remove, one-click webhook + branch protection) |
| `/dashboard/documentation` | In-app documentation: pipeline, agents, gates, private-repo setup |
| `/dashboard/deployments` | One entry per scan with gate verdict, *Logs* modal, GitHub Actions snippet (copy-to-clipboard) |
| `/dashboard/agents` | Code Fixer, Secret Scanner, Patch Automator — stats update after every scan |
| `/dashboard/settings` | Workspace name / timezone, resource usage, team roster (RBAC-filtered), **Connect / Disconnect GitHub** |
| `/dashboard/admin` | Superadmin: users, roles, deactivation, audit log |

All dashboard routes are wrapped in `RequireAuth`; an expired or rejected token clears the session and redirects to `/login?next=…`. Every page honours the light/dark theme toggle (`ThemeContext`, CSS variables) and is responsive down to mobile widths. Public pages: landing, `/platform`, `/solutions`, `/documentation`, `/security`, `/privacy`, `/terms`.

---

## 🧪 Testing

```bash
pytest -q            # 32 tests, ~5 s, no network — Groq and GitHub are mocked
```

| File | Covers |
|---|---|
| `tests/test_pipeline.py` | JSON extraction (fences, `<think>`, braces in strings), severity normalisation, gate policy, `retry-after` parsing, **model hop on 429**, decommissioned-model skip, wait-budget → clean 429, 401 not retried, `json_mode` fallback, full pipeline (blocked + patch + secret merge), clean repo = single call, 413 shrink-and-retry |
| `tests/test_api.py` | Health endpoint leaks no secrets, auth enforcement, register/login edge cases, gates CRUD, URL/branch validation, **end-to-end scan** against a synthetic repo zip (fallback to `gpt-oss-20b`, persistence, deployments, reject/apply, workspace cleanup), clean 429, 404 repository |

The auth endpoints are brute-force rate-limited (5 requests / minute / IP); `tests/conftest.py` resets the limiter between tests and caches the session token.

Frontend quality gates:

```bash
cd frontend && npx tsc --noEmit && npx eslint src
```

---

## ☁️ Deployment

### Backend → Google Cloud Run (or any container host)

```bash
docker build -t resiliocheck-api .
gcloud run deploy resiliocheck-api --image resiliocheck-api --region europe-west1 --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production,FRONTEND_URL=https://your-app.vercel.app,BACKEND_URL=https://resiliocheck-api-xxxx.run.app,GROQ_MODEL=openai/gpt-oss-120b \
  --set-secrets GROQ_API_KEY=groq-key:latest,JWT_SECRET_KEY=jwt-secret:latest,GITHUB_TOKEN=github-token:latest,GITHUB_CLIENT_ID=gh-client-id:latest,GITHUB_CLIENT_SECRET=gh-client-secret:latest,GITHUB_WEBHOOK_SECRET=gh-webhook-secret:latest
```

- The sandbox runs via subprocess inside the container — no Docker-in-Docker needed. semgrep/bandit come from `requirements.txt`; Node is only needed for JS/TS syntax checks (add it to the `Dockerfile` if you want them on Cloud Run).
- `BACKEND_URL` must be the public URL: it is the OAuth callback base and the webhook target GitHub calls back into.
- Use a managed PostgreSQL `DATABASE_URL` for persistence across revisions; SQLite on Cloud Run is ephemeral.
- Keep `LLM_MAX_TOTAL_WAIT_SECONDS` below your Cloud Run request timeout (default 300 s).

### Frontend → Vercel

Set `NEXT_PUBLIC_API_URL` to the Cloud Run URL. `*.vercel.app` origins are always allowed by the backend CORS policy; add custom domains to `FRONTEND_URL`.

### Dev Containers / Codespaces

`.devcontainer/devcontainer.json` provisions Python 3.11, Node 22 and Docker-in-Docker, installs both dependency sets and starts the API (8000) and dashboard (3000) on attach.

---

## 🔐 Security model

- **SSRF guard** — only `https://github.com/<owner>/<repo>` URLs pass `validate_repo_url`; branch names are validated separately.
- **Zip-slip protection** — every archive member is real-path-checked before extraction; archives are capped at 100 MB and streamed to disk.
- **Path traversal** — `patched_filename` must match `^[A-Za-z0-9._\-/]+$` with no `..` segments before it is written or pushed.
- **Static-only sandbox** — validation tools only parse / lint the patched file with a hard timeout; repository code is never executed.
- **Auth** — bcrypt password hashes, HS256 JWTs (24 h), `WWW-Authenticate` on 401, inactive accounts rejected at login, role checks for admin routes, audit log for role changes / deactivations, **5 req/min/IP rate limit** on login & register, auth-event logging.
- **Tenant isolation** — scans and monitored repos carry `user_id`; detail/patch endpoints check ownership (IDOR protection). GitHub OAuth tokens are stored per user and never returned by the API.
- **Input hardening** — Pydantic length limits plus sanitisation of free-text fields on every entry point; webhook payloads are HMAC-verified before parsing; request audit middleware logs method, path, IP and status.
- **No secret leakage** — `/api/health` reports presence booleans only; the global exception handler returns a generic 500 and logs the trace server-side.
- **Prompt isolation** — system prompts in `config/prompts.py` are constants; repository code only ever appears in the `user` message.

---

## 🛠 Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `429 Groq rate limit reached on every configured model` | All models in the chain are throttled. Wait the indicated seconds, add models to `GROQ_FALLBACK_MODELS`, or upgrade the Groq plan. |
| `Groq rejected the API key (401)` | `GROQ_API_KEY` missing/invalid in the backend environment. Check `/api/health → groq_key_set`. |
| `All configured Groq models were rejected` | Model IDs are decommissioned. Update `GROQ_MODEL` / `GROQ_FALLBACK_MODELS` from <https://console.groq.com/docs/models>. |
| Sandbox always `SKIPPED` | `SANDBOX_ENABLED=false`, or the required tool is not installed — see `/api/health → sandbox` for which of `semgrep`/`bandit`/`node`/`php`/`ruby` are present. |
| `GITHUB_TOKEN is not configured` when approving | Connect GitHub via OAuth in *Settings*, or set a bot PAT with `repo` scope on the backend. |
| *Connect GitHub* button missing / OAuth fails | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` unset, or the OAuth App callback URL ≠ `<BACKEND_URL>/api/auth/github/callback`. Check `/api/health → github_oauth_configured`. |
| Webhook returns 401 | `GITHUB_WEBHOOK_SECRET` on the backend differs from the secret configured on the GitHub webhook. Re-add the monitored repo to re-register it. |
| `Too many attempts` on login | Brute-force limiter (5/min/IP). Wait a minute. |
| Dashboard keeps redirecting to `/login` | Backend restarted with an ephemeral dev JWT key. Set a fixed `JWT_SECRET_KEY`. |
| CORS error in the browser | Add the frontend origin (no trailing slash) to `FRONTEND_URL`. |
| `RuntimeError: JWT_SECRET_KEY is required in production` | Expected when `ENVIRONMENT=production` — set the secret. |

---

## 📁 Project layout

```
.
├── backend/
│   ├── main.py                 FastAPI app, /api/scan orchestration, gates/agents/deployments/settings, monitored repos
│   ├── webhook.py              GitHub webhook receiver (HMAC), background scans, commit statuses
│   ├── langchain_pipeline.py   GroqClient (fallback + retry-after) and the OWASP → Gate → Patch agents
│   ├── core.py                 repo download (public + OAuth), file collection, secret regexes, subprocess sandbox
│   ├── settings.py             typed environment configuration, engine → model chain
│   ├── auth.py / admin.py      JWT auth, GitHub OAuth, rate limiter, RBAC, audit log
│   ├── models.py / database.py SQLAlchemy 2.0 models & session
│   └── Dockerfile.sandbox      (legacy) Docker image — no longer required at runtime
├── config/prompts.py           system prompts (constants, never formatted with user data)
├── frontend/                   Next.js 16 dashboard (src/app/**)
│   └── src/app/
│       ├── utils/apiClient.ts  fetch wrapper, ApiError, 401 handling
│       ├── context/AuthContext.tsx · ThemeContext.tsx
│       ├── components/RequireAuth.tsx · Sidebar.tsx · Navbar.tsx
│       ├── dashboard/          page.tsx, gates/, deployments/, agents/, settings/, admin/, documentation/
│       └── types.ts            shared API response types
├── tests/                      pytest suite (conftest mocks Groq + GitHub)
├── Dockerfile                  backend image (Cloud Run ready)
├── requirements.txt / requirements-dev.txt
└── .env.example                annotated configuration template
```

---

## 🎓 Dissertation Peer-Testing Guide

This section explains how to share ResilioCheck AI with colleagues for evaluation, collect evidence for your dissertation, and monitor tester activity — all from the **Super Admin Dashboard**.

### 1. Share the live URL

The production deployment is on Vercel. Share the URL with your testers — they register their own account at `/register`.

> **Note:** The first account ever created automatically becomes `superadmin`. All subsequent registrations become `user` by default.

### 2. Provision tester accounts (as superadmin)

All account management is done from **Dashboard → Super Admin** (`/dashboard/admin`).

| Task | How |
|---|---|
| View all registered testers | The **Registered Users** table lists every account, their last login time, and how many scans they have run |
| Promote a tester to `admin` | Change the role dropdown next to their name — logged in the Activity Log |
| Revoke access | Click **Revoke** — the tester's account is deactivated and they cannot log in |
| Restore access | Click **Reactivate** to re-enable a deactivated account |

### 3. Monitor tester activity (Activity Log)

The **Activity Log** on the Super Admin page captures every significant event automatically:

| Event code | When it fires |
|---|---|
| `USER_REGISTERED` | A new tester creates an account |
| `LOGIN` | A tester successfully logs in (with their IP) |
| `SCAN_COMPLETED` | A tester runs a repository scan (repo URL, branch, gate verdict, critical/high counts) |
| `ROLE_CHANGE` | An admin changes a user's role |
| `USER_DEACTIVATION` | An admin revokes an account |
| `USER_REACTIVATION` | An admin restores an account |

Click **Refresh** at any time to load the latest 100 events.

### 4. Collecting evidence for your dissertation

#### Screenshots
Capture the following screens with real tester data:
- **Activity Log** showing `USER_REGISTERED` and `SCAN_COMPLETED` rows for each tester
- **Registered Users** table showing multiple active accounts with scan counts > 0
- **Dashboard → Vulnerability Assessment Pipeline** with a real scan result (OWASP findings table, gate verdict, AI-generated patch)
- **Approve & Create PR** / **Reject Fix** workflow after clicking a PENDING scan in history

#### API evidence (for technical appendix)
The backend exposes machine-readable evidence at these authenticated endpoints:

```bash
# All registered users (admin+)
GET /api/admin/users

# Platform-wide stats (admin+)
GET /api/admin/stats

# Full activity log (superadmin only)
GET /api/admin/audit-logs

# Individual scan results for a user
GET /api/scans
```

You can hit these with `curl` or Postman using your superadmin JWT:
```bash
curl -H "Authorization: Bearer <your_token>" https://<your-vercel-url>/api/admin/audit-logs
```

#### Suggested dissertation write-up structure

1. **System overview** — link to the GitHub repo and the live Vercel URL
2. **Evaluation methodology** — describe how testers were given access (self-registration, you provisioned the URL)
3. **Evidence of use** — include the Activity Log screenshot (covers RQ: *was the system actually used by independent testers?*)
4. **Functional correctness** — include a scan result showing the OWASP findings table and gate verdict
5. **Test results** — reference the 32/32 automated test pass rate (`pytest tests/ -v` output)
6. **Security model** — summarise the RBAC tiers (user → admin → superadmin) and the audit trail

### 5. Recommended tester tasks (evaluation script)

Give each tester the following tasks and ask them to self-report in a questionnaire:

1. Register an account at `<live-url>/register`
2. Navigate to the **Dashboard**
3. Paste a public GitHub URL (e.g. `https://github.com/OWASP/WebGoat`) and click **INITIATE SCAN**
4. Review the OWASP findings table and the AI-generated patch
5. Click **Approve & Create PR** or **Reject Fix**
6. Navigate to **Security Gates** and register the repo for continuous monitoring
7. Report any usability or functional issues

As you collect responses, cross-reference tester names against the Activity Log to confirm their actions were recorded.

---

## 🗺 Roadmap

- **GitHub App installation** — replace the OAuth App with a GitHub App for fine-grained, org-wide permissions and check-runs with inline annotations.
- **Multi-file patches** — extend the patch agent to emit a unified diff across several files.
- **Webhook delivery log** — surface recent webhook deliveries and commit-status results in the dashboard.
- **Async scans** — background job queue with progress streaming for very large repositories.
- **Persisted settings & API keys** — move workspace settings and CI keys from memory into the database.

---

## 📄 License

MIT — see `LICENSE` (or add one if you fork this project).
