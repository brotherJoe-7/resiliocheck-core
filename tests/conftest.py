"""
Shared pytest fixtures.

Environment is configured BEFORE the backend package is imported so that
``backend.settings`` picks up the test values (isolated SQLite DB, dummy
Groq key, fixed JWT secret).
"""
import os
import sys
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

_TEST_DB = ROOT / "test_resiliocheck.db"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB}")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only-0123456789abcdef")
os.environ.setdefault("GROQ_API_KEY", "gsk_test_dummy_key")
# The fallback provider must be configured for the Groq -> DeepSeek hop to be exercised.
os.environ.setdefault("DEEPSEEK_API_KEY", "sk_test_dummy_deepseek_key")
os.environ.setdefault("SANDBOX_ENABLED", "false")
os.environ.setdefault("ENVIRONMENT", "test")

import pytest  # noqa: E402


class FakeResponse:
    """Minimal stand-in for requests.Response."""

    def __init__(self, status_code: int, body, headers: dict | None = None):
        self.status_code = status_code
        self._body = body
        self.headers = headers or {}
        self.text = json.dumps(body) if not isinstance(body, str) else body

    @property
    def ok(self):
        return self.status_code < 400

    def json(self):
        if isinstance(self._body, str):
            raise ValueError("not json")
        return self._body


def groq_ok(content: str) -> FakeResponse:
    return FakeResponse(200, {"choices": [{"message": {"content": content}}]})


def groq_err(status: int, message: str, headers: dict | None = None) -> FakeResponse:
    return FakeResponse(status, {"error": {"message": message}}, headers)


@pytest.fixture(scope="session")
def app():
    if _TEST_DB.exists():
        _TEST_DB.unlink(missing_ok=True)
    from backend.main import app as _app
    yield _app
    try:
        _TEST_DB.unlink()
    except (PermissionError, FileNotFoundError):
        pass



@pytest.fixture()
def client(app):
    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c


_TOKEN_CACHE: dict = {}


@pytest.fixture()
def auth_headers(client):
    """
    Register (or log in) a test user once per session and reuse the token.
    The auth endpoints are brute-force rate-limited (5 calls / minute / IP),
    so we also reset the limiter to keep tests independent of ordering.
    """
    from backend import auth as _auth
    _auth.login_limiter.clients.clear()

    if "token" not in _TOKEN_CACHE:
        creds = {"email": "tester@example.com", "password": "password123", "full_name": "Test User"}
        r = client.post("/api/auth/register", json=creds)
        if r.status_code == 400:  # already registered in this session
            r = client.post("/api/auth/login", json={"email": creds["email"], "password": creds["password"]})
        assert r.status_code == 200, r.text
        _TOKEN_CACHE["token"] = r.json()["access_token"]
    return {"Authorization": f"Bearer {_TOKEN_CACHE['token']}"}


@pytest.fixture(autouse=True)
def _reset_auth_rate_limiter():
    from backend import auth as _auth
    _auth.login_limiter.clients.clear()
    yield
