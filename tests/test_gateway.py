"""
tests/test_gateway.py
=====================
Gateway controller smoke tests.

These tests validate the Pydantic models and route logic without requiring
a live Docker environment or LLM credentials.  They use httpx's ASGI
test client to call FastAPI routes in-process.

Run:
    pytest tests/test_gateway.py -v
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src.gateway.controller import app

client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------


def test_health_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "gateway"


# ---------------------------------------------------------------------------
# Webhook input validation (Pydantic guard tests)
# ---------------------------------------------------------------------------


def test_webhook_rejects_missing_fields() -> None:
    """Incomplete payload must be rejected with 422 Unprocessable Entity."""
    response = client.post("/webhook", json={"event_type": "push"})
    assert response.status_code == 422


def test_webhook_rejects_invalid_sha() -> None:
    """SHA that is not alphanumeric hex must fail validation."""
    payload = {
        "event_type": "push",
        "repository": {
            "full_name": "owner/repo",
            "clone_url": "https://github.com/owner/repo.git",
            "default_branch": "main",
        },
        "sender_login": "alice",
        "head_commit_sha": "../../etc/passwd",  # path traversal attempt
    }
    response = client.post("/webhook", json=payload)
    assert response.status_code == 422


def test_webhook_rejects_invalid_login() -> None:
    """sender_login containing shell metacharacters must fail validation."""
    payload = {
        "event_type": "push",
        "repository": {
            "full_name": "owner/repo",
            "clone_url": "https://github.com/owner/repo.git",
            "default_branch": "main",
        },
        "sender_login": "alice; DROP TABLE users;--",
        "head_commit_sha": "a" * 40,
    }
    response = client.post("/webhook", json=payload)
    assert response.status_code == 422


def test_webhook_rejects_unsupported_event_type() -> None:
    """Only 'push' and 'pull_request' are valid event types."""
    payload = {
        "event_type": "delete",  # not in Literal["push", "pull_request"]
        "repository": {
            "full_name": "owner/repo",
            "clone_url": "https://github.com/owner/repo.git",
            "default_branch": "main",
        },
        "sender_login": "alice",
        "head_commit_sha": "a" * 40,
    }
    response = client.post("/webhook", json=payload)
    assert response.status_code == 422
