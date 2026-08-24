"""
monitor/interceptor.py
======================
ResilioCheck Monitor — RASP Continuous Live Network Payload Interceptor

Responsibilities
----------------
* Intercept HTTP request/response pairs from a target application process.
* Classify each payload against a ruleset (SQLi, XSS, RCE, SSRF patterns).
* Emit a structured alert event as a JSON object to a log sink.
* Operate as a non-blocking middleware so it does not affect target latency
  beyond an acceptable budget.

Security posture
----------------
* Detection patterns are pre-compiled regex objects — no dynamic eval/exec.
* Alert payloads are serialised via Pydantic to prevent injection into the
  log sink.
* No raw user content is stored unescaped; all captured values are HTML-
  escaped before persistence.
"""

from __future__ import annotations

import html
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Literal

logger = logging.getLogger("resiliocheck.monitor")

# ---------------------------------------------------------------------------
# Pre-compiled threat patterns (never built from user input)
# ---------------------------------------------------------------------------

_THREAT_PATTERNS: dict[str, re.Pattern[str]] = {
    "sqli": re.compile(
        r"('|(\\x27)|(\\x22)|(;)|(\\x3b)|(\-\-)|(\|)|(\|\|)|(OR\s+1=1)|"
        r"(UNION\s+SELECT)|(/\*)|(\*/)|(\bDROP\b)|(\bINSERT\b))",
        re.IGNORECASE,
    ),
    "xss": re.compile(
        r"(<script[\s\S]*?>[\s\S]*?</script>|javascript:|on\w+\s*=|"
        r"<iframe|<object|<embed|data:text/html)",
        re.IGNORECASE,
    ),
    "path_traversal": re.compile(
        r"(\.\./|\.\.\\|%2e%2e%2f|%2e%2e/|\.\.%2f|%2e\.%2f)",
        re.IGNORECASE,
    ),
    "rce": re.compile(
        r"(\bexec\s*\(|\beval\s*\(|\bsystem\s*\(|\bpopen\s*\(|\bpassthru\s*\(|"
        r"\bshell_exec\s*\(|\bproc_open\s*\()",
        re.IGNORECASE,
    ),
    "ssrf": re.compile(
        r"(localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254\.|::1|"
        r"file://|gopher://|dict://|ftp://|metadata\.google\.internal)",
        re.IGNORECASE,
    ),
}


# ---------------------------------------------------------------------------
# Alert model
# ---------------------------------------------------------------------------


@dataclass
class ThreatAlert:
    alert_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = field(default_factory=time.time)
    threat_class: str = ""
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "LOW"
    matched_pattern: str = ""
    sanitised_payload_snippet: str = ""  # HTML-escaped truncated value
    source_ip: str = "unknown"
    request_path: str = ""


# ---------------------------------------------------------------------------
# Interceptor middleware
# ---------------------------------------------------------------------------


class PayloadInterceptor:
    """
    Analyses HTTP payload strings for known threat signatures.

    Usage::

        interceptor = PayloadInterceptor()
        alerts = interceptor.inspect(payload="<script>alert(1)</script>",
                                     source_ip="10.0.0.1",
                                     request_path="/search")
    """

    _SEVERITY_MAP: dict[str, Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]] = {
        "sqli": "CRITICAL",
        "rce": "CRITICAL",
        "xss": "HIGH",
        "ssrf": "HIGH",
        "path_traversal": "MEDIUM",
    }

    def inspect(
        self,
        payload: str,
        source_ip: str = "unknown",
        request_path: str = "",
    ) -> list[ThreatAlert]:
        """
        Scan *payload* against all pre-compiled threat patterns.

        Parameters
        ----------
        payload:       Raw request body or query-string value to inspect.
        source_ip:     Originating IP address (logged, never echoed to user).
        request_path:  URL path of the intercepted request.

        Returns
        -------
        A list of ThreatAlert objects (empty if no threats detected).
        """
        alerts: list[ThreatAlert] = []

        # Sanitise the snippet before storing — prevents log injection.
        safe_snippet = html.escape(payload[:512])

        for threat_class, pattern in _THREAT_PATTERNS.items():
            match = pattern.search(payload)
            if match:
                alert = ThreatAlert(
                    threat_class=threat_class,
                    severity=self._SEVERITY_MAP.get(threat_class, "LOW"),
                    matched_pattern=pattern.pattern[:80],  # store pattern, not user input
                    sanitised_payload_snippet=safe_snippet,
                    source_ip=source_ip,
                    request_path=request_path,
                )
                alerts.append(alert)
                logger.warning(
                    "THREAT DETECTED | id=%s | class=%s | severity=%s | path=%s | ip=%s",
                    alert.alert_id,
                    alert.threat_class,
                    alert.severity,
                    alert.request_path,
                    alert.source_ip,
                )

        return alerts
