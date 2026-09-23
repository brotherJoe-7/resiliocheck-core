"""API-level tests (FastAPI TestClient, Groq + GitHub download mocked)."""
import json
import os
import zipfile

import pytest

from backend import langchain_pipeline as lp
from backend import core
from tests.conftest import groq_ok, groq_err


def test_root_and_health(client):
    assert client.get("/").json()["status"] == "online"
    h = client.get("/api/health").json()
    assert h["db_status"] == "connected"
    assert h["groq_key_set"] is True
    assert "groq_model_fast" in h and "sandbox" in h
    assert "GROQ_API_KEY" not in json.dumps(h)  # never leak secrets


@pytest.mark.parametrize("origin", [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://resiliocheck.vercel.app",                       # production alias
    "https://resiliocheck-git-main-user.vercel.app",         # branch preview
    "https://resiliocheck-abc123def-user-team.vercel.app",   # commit preview
])
def test_cors_allows_dashboard_origins(client, origin):
    """
    Regression: the browser reported "Cannot reach the ResilioCheck API
    (Failed to fetch)" on login because the Vercel origin was rejected at the
    CORS preflight stage. Every dashboard origin must pass the preflight.
    """
    r = client.options(
        "/api/auth/login",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code == 200, (origin, r.text)
    assert r.headers.get("access-control-allow-origin") == origin


@pytest.mark.parametrize("origin", [
    "https://evil.com",
    "https://vercel.app.evil.com",          # suffix spoof
    "https://notvercel.app",                # missing dot before vercel
    "http://resiliocheck.vercel.app",       # plain http is not allowed
    "https://anything.run.app",             # other hosts are not blanket-allowed
    "https://anything.e2b.dev",
])
def test_cors_rejects_foreign_origins(client, origin):
    r = client.options(
        "/api/auth/login",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )
    assert r.status_code == 400, (origin, r.text)
    assert "access-control-allow-origin" not in r.headers


def test_protected_routes_require_auth(client):
    for path in ("/api/scans", "/api/gates", "/api/agents", "/api/deployments", "/api/settings"):
        r = client.get(path)
        assert r.status_code == 401, path
        assert r.json()["detail"]


def test_register_login_me(client):
    email = "alice@example.com"
    r = client.post("/api/auth/register", json={"email": email, "password": "password123", "full_name": "Alice"})
    assert r.status_code == 200
    assert r.json()["role"] in ("superadmin", "user")
    r = client.post("/api/auth/login", json={"email": email.upper(), "password": "password123"})
    assert r.status_code == 200, "login should be case-insensitive on email"
    r = client.post("/api/auth/login", json={"email": email, "password": "wrong-password"})
    assert r.status_code == 401
    r = client.post("/api/auth/register", json={"email": email, "password": "short"})
    assert r.status_code == 422


def test_seeded_gates_and_agents(client, auth_headers):
    gates = client.get("/api/gates", headers=auth_headers).json()
    assert {g["id"] for g in gates} >= {"xss", "sqli", "dep", "secrets"}
    agents = client.get("/api/agents", headers=auth_headers).json()
    assert len(agents) == 3

    r = client.post("/api/gates/xss/toggle", headers=auth_headers).json()
    assert r["gate"]["active"] is False and r["gate"]["status"] == "DISABLED"
    client.post("/api/gates/xss/toggle", headers=auth_headers)

    r = client.post("/api/gates", headers=auth_headers,
                    json={"name": "PCI Check", "desc": "d", "strictness": "Strict", "action": ["Alert Only"]})
    assert r.status_code == 200
    assert r.json()["gate"]["strictness"] == ["Strict"]
    r2 = client.post("/api/gates", headers=auth_headers, json={"name": "PCI Check", "desc": "d"})
    assert r2.json()["gate"]["id"] != r.json()["gate"]["id"]


def test_scan_rejects_bad_urls(client, auth_headers):
    r = client.post("/api/scan", json={"repo_url": "https://gitlab.com/a/b"}, headers=auth_headers)
    assert r.status_code == 400
    r = client.post("/api/scan", json={"repo_url": "https://github.com/a/b", "branch": "../x"}, headers=auth_headers)
    assert r.status_code == 400


def _fake_repo_zip(tmp_path, files: dict) -> bytes:
    zp = tmp_path / "repo.zip"
    with zipfile.ZipFile(zp, "w") as z:
        for name, content in files.items():
            z.writestr(f"demo-repo-main/{name}", content)
    return zp.read_bytes()


class _FakeDownload:
    def __init__(self, payload: bytes, status=200):
        self.status_code = status
        self._payload = payload

    def iter_content(self, chunk_size):
        yield self._payload


def test_full_scan_flow(client, auth_headers, tmp_path, monkeypatch):
    repo_files = {
        "backend/app.py": "import sqlite3\nq = 'SELECT * FROM users WHERE id=' + uid\n",
        "backend/createAdmin.js": "const adminPassword = 'AdminPassword2026!';\n",
        "frontend/pages/login.js": "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap');\n",
    }
    zip_bytes = _fake_repo_zip(tmp_path, repo_files)
    monkeypatch.setattr(core.requests, "get", lambda url, **kw: _FakeDownload(zip_bytes))

    owasp = {"findings": [{"file_path": "backend/app.py", "line_start": 2, "severity": "CRITICAL",
                           "owasp_class": "A03 – Injection", "title": "SQLi", "description": "d", "remediation": "r"}]}
    calls = []

    def fake_post(url, headers, json, timeout):
        calls.append(json["model"])
        if json["model"] == "openai/gpt-oss-120b":
            return groq_err(429, "Rate limit reached for model", {"retry-after": "40"})
        if "OWASP" in json["messages"][0]["content"]:
            return groq_ok(__import__("json").dumps(owasp))
        return groq_ok("import sqlite3\nq = 'SELECT * FROM users WHERE id=?'\n")

    monkeypatch.setattr(lp.requests, "post", fake_post)
    # Prevent actual sleeps during rate-limit retries (would add ~120s to test)
    monkeypatch.setattr(lp.time, "sleep", lambda s: None)

    r = client.post("/api/scan", headers=auth_headers, json={
        "repo_url": "https://github.com/demo/demo-repo", "branch": "main",
        "engine": "Groq GPT-OSS 120B Deep Static Analysis (SAST)",
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["gate"] == "BLOCKED"
    # 120B hits 429 -> falls back to deepseek (new routing: groq 120B -> deepseek)
    from backend import settings as _s
    assert d["model"] == _s.DEEPSEEK_MODEL
    assert calls[0] == "openai/gpt-oss-120b"        # 120B tried first
    assert _s.DEEPSEEK_MODEL in calls               # deepseek used as fallback
    assert d["critical_count"] == 2                      # SQLi + merged hardcoded password
    assert d["patched_filename"] == "backend/app.py"
    assert d["patch_status"] == "PENDING"
    assert d["sandbox_verdict"] == "SKIPPED"             # no Docker in tests
    assert [s["pattern"] for s in d["secret_findings"]] == ["Generic Secret/Token"]  # font URL not flagged
    assert "backend/app.py" in d["files_analysed"]

    # persisted + derived views
    scans = client.get("/api/scans", headers=auth_headers).json()
    assert scans[0]["id"] == d["id"]
    detail = client.get(f"/api/scans/{d['id']}", headers=auth_headers).json()
    assert detail["gate"] == "BLOCKED" and detail["model"] == _s.DEEPSEEK_MODEL
    deps = client.get("/api/deployments", headers=auth_headers).json()
    assert deps[0]["scan_id"] == d["id"] and deps[0]["status"] == "Failed"
    assert client.get("/api/auth/me", headers=auth_headers).json()["scan_count"] >= 1

    # reject / apply
    # Patch GITHUB_TOKEN to empty to guarantee 503 regardless of .env
    from backend import settings as _settings_mod
    _orig_token = _settings_mod.GITHUB_TOKEN
    _settings_mod.GITHUB_TOKEN = ""
    try:
        r = client.post(f"/api/scans/{d['id']}/apply-patch", headers=auth_headers)
        assert r.status_code == 503, f"Expected 503 (no token), got {r.status_code}: {r.text}"
    finally:
        _settings_mod.GITHUB_TOKEN = _orig_token
    r = client.post(f"/api/scans/{d['id']}/reject-patch", headers=auth_headers)
    assert r.json()["patch_status"] == "REJECTED"

    # workspace cleaned up
    assert not [p for p in os.listdir(".") if p.startswith("tmp_workspace_")]


def test_scan_rate_limit_returns_clean_429(client, auth_headers, tmp_path, monkeypatch):
    zip_bytes = _fake_repo_zip(tmp_path, {"a.py": "x = 1\n"})
    monkeypatch.setattr(core.requests, "get", lambda url, **kw: _FakeDownload(zip_bytes))
    monkeypatch.setattr(lp.requests, "post", lambda *a, **k: groq_err(429, "Rate limit", {"retry-after": "300"}))
    monkeypatch.setattr(lp.time, "sleep", lambda s: None)

    r = client.post("/api/scan", headers=auth_headers, json={"repo_url": "https://github.com/demo/demo-repo"})
    assert r.status_code == 429
    assert "RetryError" not in r.text
    assert "rate limit" in r.json()["detail"].lower()


def test_scan_repo_not_found(client, auth_headers, monkeypatch):
    monkeypatch.setattr(core.requests, "get", lambda url, **kw: _FakeDownload(b"", status=404))
    r = client.post("/api/scan", headers=auth_headers, json={"repo_url": "https://github.com/demo/missing"})
    assert r.status_code == 400
    assert "not found" in r.json()["detail"].lower()


def test_settings_roundtrip(client, auth_headers):
    r = client.post("/api/settings", headers=auth_headers, json={"workspace": "Acme", "timezone": "UTC (Coordinated Universal Time)"})
    assert r.status_code == 200
    s = client.get("/api/settings", headers=auth_headers).json()
    assert s["workspace"] == "Acme" and isinstance(s["team"], list)


# ── Regression: "Cannot reach the ResilioCheck API (Failed to fetch)" on a VALID login ──
#
# Root cause found in production: the audit-log INSERT after a successful
# password check raised, the unhandled exception became a 500 that was emitted
# outside CORSMiddleware (no Access-Control-Allow-Origin), and the browser
# surfaced it as a network failure. Wrong passwords (401) worked fine, which is
# what made it look like a connectivity problem.

def test_health_reports_schema(client):
    h = client.get("/api/health").json()
    assert "schema" in h
    assert h["schema"]["ok"] is True, h["schema"]
    assert h["schema"]["missing_tables"] == []


def test_login_and_register_survive_audit_log_failure(client, monkeypatch):
    """A broken audit_logs table must never turn a valid login/register into a 500."""
    from backend import audit as _audit
    from backend import auth as _auth

    calls = {"n": 0}

    def _boom(*_a, **_k):
        calls["n"] += 1
        raise RuntimeError("simulated audit_logs schema drift")

    # Simulate the failing INSERT inside record_audit's own try/except boundary.
    monkeypatch.setattr(_audit.AuditLog, "__init__", _boom)

    email = "audit-fail@example.com"
    r = client.post("/api/auth/register", json={"email": email, "password": "password123", "full_name": "A"})
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]

    _auth.login_limiter.clients.clear()
    r = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == email
    assert calls["n"] >= 2  # both audit attempts were made and swallowed


def test_server_errors_carry_cors_headers(client, monkeypatch):
    """
    A 500 must still pass through CORSMiddleware; otherwise the browser hides
    the real status and the dashboard reports 'Failed to fetch'.
    """
    from backend import auth as _auth

    def _explode(*_a, **_k):
        raise RuntimeError("boom")

    monkeypatch.setattr(_auth, "verify_password", _explode)
    client.post("/api/auth/register", json={"email": "cors500@example.com", "password": "password123"})
    _auth.login_limiter.clients.clear()

    origin = "https://resiliocheck-core.vercel.app"
    r = client.post(
        "/api/auth/login",
        json={"email": "cors500@example.com", "password": "password123"},
        headers={"Origin": origin},
    )
    assert r.status_code == 500
    assert r.headers.get("access-control-allow-origin") == origin
    body = r.json()
    assert "error_id" in body and body["error_id"] in body["detail"]
    assert "boom" not in r.text  # no leak of the raw exception
