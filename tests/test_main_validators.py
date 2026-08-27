"""
tests/test_main_validators.py
=============================
Unit tests for main.py security helpers (no network / Docker / LLM needed).
"""

from __future__ import annotations

import pytest

from main import validate_repo_url, scan_for_secrets


# ── validate_repo_url (SSRF guard) ──────────────────────────────────────────

def test_valid_repo_url_normalised() -> None:
    assert validate_repo_url("https://github.com/owner/repo/") == "https://github.com/owner/repo"
    assert validate_repo_url("https://github.com/owner/repo.git") == "https://github.com/owner/repo"


@pytest.mark.parametrize("bad", [
    "http://github.com/owner/repo",              # not https
    "https://evil.com/owner/repo",                # wrong host
    "https://github.com@evil.com/owner/repo",     # userinfo SSRF trick
    "https://github.com/../../etc/passwd",        # traversal
    "https://github.com/owner",                   # missing repo
    "https://github.com/owner/repo/extra",        # extra path segment
    "",                                            # empty
])
def test_invalid_repo_urls_rejected(bad: str) -> None:
    with pytest.raises(ValueError):
        validate_repo_url(bad)


# ── scan_for_secrets (deterministic pre-scan) ───────────────────────────────

def test_scan_detects_hardcoded_password() -> None:
    files = {"config.py": 'password = "SuperSecret123"\n'}
    findings = scan_for_secrets(files)
    assert findings, "Hardcoded password should be detected"


def test_scan_detects_aws_key() -> None:
    files = {"deploy.sh": 'export KEY=AKIAIOSFODNN7EXAMPLE\n'}
    findings = scan_for_secrets(files)
    assert any("AWS" in f["pattern"] for f in findings)


def test_scan_ignores_comments() -> None:
    files = {"app.py": '# password = "SuperSecret123"\n'}
    assert scan_for_secrets(files) == []
