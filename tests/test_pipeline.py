"""Unit tests for the Groq client + multi-agent pipeline (no network)."""
import json

import pytest

from backend import langchain_pipeline as lp
from tests.conftest import FakeResponse, groq_ok, groq_err


def make_client(responder, models=None, max_total_wait=30):
    """Build a GroqClient with a fake HTTP post function.

    The new GroqClient uses task-routing instead of a models= list.
    We patch the settings so _get_route() returns our test models,
    then supply a fake post= that calls responder(payload).
    """
    import backend.settings as _settings
    model_list = models or ["m1", "m2"]

    # Patch settings so the router picks our test models
    original_fast = _settings.GROQ_MODEL_FAST
    original_deep = _settings.GROQ_MODEL_DEEP
    original_deepseek = _settings.DEEPSEEK_MODEL
    _settings.GROQ_MODEL_FAST = model_list[0]
    _settings.GROQ_MODEL_DEEP = model_list[0]
    # If a second model is provided, use it as the deepseek fallback
    _settings.DEEPSEEK_MODEL = model_list[1] if len(model_list) > 1 else model_list[0]

    calls = []

    def fake_post(url, headers, json, timeout):
        calls.append(json["model"])
        return responder(json)

    client = lp.GroqClient(
        api_key="k",
        max_total_wait=max_total_wait,
        post=fake_post,
        sleep=lambda s: None,
    )

    # Expose dead_models for test assertions — now a real field on GroqClient
    # (no need to add dummy; dataclass has it)

    return client, calls


# ── parsing helpers ─────────────────────────────────────────────────────────

def test_parse_json_handles_fences_and_prose():
    raw = 'Sure!\n```json\n{"findings": [], "critical_count": 0}\n```\nHope this helps.'
    assert lp._parse_json(raw, {})["critical_count"] == 0


def test_parse_json_handles_think_blocks_and_braces_in_strings():
    raw = '<think>{not json}</think>{"a": "x } y", "b": 1}'
    assert lp._parse_json(raw, {}) == {"a": "x } y", "b": 1}


def test_parse_json_returns_fallback_on_garbage():
    assert lp._parse_json("no json here", {"x": 1}) == {"x": 1}


def test_strip_code_fences():
    assert lp._strip_code_fences("```js\nconst a = 1;\n```") == "const a = 1;\n"
    assert lp._strip_code_fences("plain") == "plain\n"


def test_normalize_findings_maps_basename_and_severity():
    out = lp.normalize_findings(
        [{"file_path": "server.js", "severity": "critical", "line_start": "3"},
         {"file_path": "x.py", "severity": "weird"}, "junk"],
        known_files=["backend/server.js", "x.py"],
    )
    assert out[0]["file_path"] == "backend/server.js"
    assert out[0]["severity"] == "CRITICAL"
    assert out[0]["line_start"] == 3
    assert out[1]["severity"] == "INFO"


@pytest.mark.parametrize("crit,high,expected", [(0, 0, "APPROVED"), (0, 2, "APPROVED"), (0, 3, "BLOCKED"), (1, 0, "BLOCKED")])
def test_decide_gate_policy(crit, high, expected):
    assert lp.decide_gate(crit, high)[0] == expected


def test_parse_retry_after_header_formats():
    assert lp._parse_retry_after(FakeResponse(429, {}, {"retry-after": "7"})) == 7.0
    assert lp._parse_retry_after(FakeResponse(429, {}, {"x-ratelimit-reset-tokens": "2m3.5s"})) == 123.5
    assert lp._parse_retry_after(FakeResponse(429, {}, {})) == 5.0


# ── GroqClient behaviour ────────────────────────────────────────────────────

def test_client_hops_to_next_model_on_rate_limit():
    """When groq primary is rate-limited beyond the time budget, falls back to deepseek (m2)."""
    def responder(payload):
        if payload["model"] == "m1":
            # retry-after=50 exceeds max_total_wait=30 so client skips to fallback
            return groq_err(429, "Rate limit reached", {"retry-after": "50"})
        return groq_ok("hello")

    client, calls = make_client(responder, max_total_wait=30)
    assert client.chat("s", "u") == "hello"
    assert calls == ["m1", "m2"]
    assert client.last_model == "m2"


def test_client_skips_decommissioned_model_permanently():
    """Once a model is decommissioned it is added to self.dead_models and skipped on future calls."""
    def responder(payload):
        if payload["model"] == "m1":
            return groq_err(400, "The model `m1` has been decommissioned")
        return groq_ok("ok")

    client, calls = make_client(responder)
    client.chat("s", "u")   # m1 decommissioned, falls back to m2
    client.chat("s", "u")   # m1 in dead_models, goes straight to m2
    assert calls == ["m1", "m2", "m2"]
    assert "m1" in client.dead_models


def test_client_waits_then_retries_within_budget():
    """Client sleeps retry-after each time 429 is within budget, then succeeds."""
    state = {"n": 0}

    def responder(payload):
        state["n"] += 1
        if state["n"] <= 2:
            return groq_err(429, "limit", {"retry-after": "2"})
        return groq_ok("done")

    client, calls = make_client(responder, max_total_wait=10)
    assert client.chat("s", "u") == "done"
    # Two sleeps of 2s each before the third call succeeds
    assert client.waited == 4.0
    assert len(calls) == 3


def test_client_raises_clean_rate_limit_error_when_budget_exhausted():
    client, _ = make_client(lambda p: groq_err(429, "limit", {"retry-after": "50"}), max_total_wait=10)
    with pytest.raises(lp.GroqRateLimitError) as exc:
        client.chat("s", "u")
    assert exc.value.status_code == 429
    assert "RetryError" not in str(exc.value)
    assert "rate limit" in exc.value.detail.lower()


def test_client_auth_error_is_not_retried():
    """401 immediately raises GroqAuthError without trying the deepseek fallback."""
    client, calls = make_client(lambda p: groq_err(401, "Invalid API Key"))
    with pytest.raises(lp.GroqAuthError):
        client.chat("s", "u")
    # Raises after the first 401, does not proceed to fallback
    assert len(calls) == 1
    assert calls[0] == "m1"


def test_client_all_models_gone():
    client, _ = make_client(lambda p: groq_err(404, "model not found"))
    with pytest.raises(lp.GroqModelUnavailable):
        client.chat("s", "u")


def test_client_missing_key():
    client = lp.GroqClient(api_key="", post=lambda **k: None)
    with pytest.raises(lp.GroqAuthError):
        client.chat("s", "u")


def test_client_drops_json_mode_when_unsupported():
    """When a model returns 400 with response_format error, retry same model without json_mode."""
    seen = []

    def responder(payload):
        seen.append("response_format" in payload)
        if "response_format" in payload:
            return groq_err(400, "response_format is not supported by this model")
        return groq_ok("{}")

    client, _ = make_client(responder, models=["m1"])
    assert client.chat("s", "u", json_mode=True) == "{}"
    # First call has response_format, second retries without it on same model
    assert seen[0] is True
    assert seen[1] is False


# ── full pipeline ───────────────────────────────────────────────────────────

OWASP_RESPONSE = json.dumps({
    "findings": [
        {"file_path": "app.py", "line_start": 4, "line_end": 4, "owasp_class": "A03 – Injection",
         "severity": "CRITICAL", "title": "SQL injection", "description": "concat", "remediation": "params"},
        {"file_path": "app.py", "line_start": 9, "line_end": 9, "owasp_class": "A05",
         "severity": "LOW", "title": "Debug on", "description": "d", "remediation": "r"},
    ],
    "critical_count": 99,  # deliberately wrong — pipeline must recount
    "high_count": 0,
})


def test_run_pipeline_blocked_with_patch_and_secret_merge():
    def responder(payload):
        sys_msg = payload["messages"][0]["content"]
        if "OWASP" in sys_msg:
            return groq_ok(OWASP_RESPONSE)
        return groq_ok("```python\nimport os\nsafe = True\n```")

    client, calls = make_client(responder, models=["m1"])
    files = {"app.py": "q = 'SELECT * FROM t WHERE id=' + uid\n", "config.py": "PASSWORD = 'hunter2secret'\n"}
    secrets = [{"file": "config.py", "line": 1, "pattern": "Hardcoded Password", "snippet": "PASSWORD = 'hunter2secret'"}]

    result = lp.run_pipeline(files, secrets, client=client)

    assert result["gate"] == "BLOCKED"
    assert result["critical_count"] == 2          # 1 from model + 1 merged secret
    assert result["high_count"] == 0
    sevs = [f["severity"] for f in result["findings"]]
    assert sevs == sorted(sevs, key=lambda s: lp.SEVERITY_ORDER[s])
    assert result["patched_filename"] == "app.py"
    assert result["patched_code"] == "import os\nsafe = True\n"
    assert result["model"] == "m1"
    assert result["llm_calls"] == 2               # OWASP + patch (gate is deterministic)
    assert "2 critical" in result["explanation"]


def test_run_pipeline_clean_repo_makes_single_call():
    client, calls = make_client(lambda p: groq_ok('{"findings": []}'), models=["m1"])
    result = lp.run_pipeline({"a.js": "console.log(1)\n"}, [], client=client)
    assert result["gate"] == "APPROVED"
    assert result["findings"] == []
    assert result["patched_code"] == ""
    assert len(calls) == 1


def test_run_pipeline_patch_failure_is_non_fatal():
    def responder(payload):
        if "OWASP" in payload["messages"][0]["content"]:
            return groq_ok(OWASP_RESPONSE)
        return groq_err(429, "limit", {"retry-after": "99"})

    client, _ = make_client(responder, models=["m1"], max_total_wait=5)
    result = lp.run_pipeline({"app.py": "x = 1\n"}, [], client=client)
    assert result["gate"] == "BLOCKED"
    assert result["patched_code"] == ""
    assert "patch generation was skipped" in result["explanation"]


def test_run_pipeline_shrinks_payload_on_413():
    sizes = []

    def responder(payload):
        user = payload["messages"][1]["content"]
        sizes.append(len(user))
        if len(sizes) == 1:
            return groq_err(413, "Request too large")
        return groq_ok('{"findings": []}')

    client, _ = make_client(responder, models=["m1"])
    big = {f"f{i}.py": "x = 1\n" * 300 for i in range(20)}
    lp.run_pipeline(big, [], client=client)
    assert len(sizes) == 2 and sizes[1] < sizes[0]


def test_merge_secret_findings_skips_duplicates_and_noise():
    existing = [{"file_path": "cfg.py", "line_start": 1, "severity": "CRITICAL", "title": "Hardcoded secret"}]
    merged = lp.merge_secret_findings(existing, [
        {"file": "cfg.py", "line": 1, "pattern": "Generic Secret/Token", "snippet": "x"},
        {"file": "other.py", "line": 7, "pattern": "AWS Access Key", "snippet": "AKIA..."},
    ])
    assert len(merged) == 2
    assert merged[1]["file_path"] == "other.py"
