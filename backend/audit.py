"""
backend/audit.py
================
Best-effort audit logging.

Audit entries are valuable but must never break the request that produced
them. In production the ``audit_logs`` table can drift from the ORM model
(hand-created table, missing sequence, extra NOT NULL column, …) and a
failing INSERT used to surface as an HTTP 500 on *successful* login and
register — which the browser then reported as "Failed to fetch" because the
500 was produced outside the CORS middleware.

``record_audit`` writes the entry in its own transaction. On any failure it
rolls back that transaction, logs the exception server-side and returns
``False`` so the caller can carry on.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from backend.models import AuditLog, User

log = logging.getLogger("resiliocheck.audit")


def record_audit(db: Session, *, actor: User | None, action: str, target: str) -> bool:
    """
    Persist an :class:`AuditLog` row. Never raises.

    Call this *after* the primary business commit so that a failed audit write
    cannot roll back the real change (e.g. the freshly created user).
    """
    try:
        entry = AuditLog(
            admin_id=actor.id if actor is not None else None,
            admin_email=actor.email if actor is not None else None,
            action=action,
            target=(target or "")[:2000],
        )
        db.add(entry)
        db.commit()
        return True
    except Exception as exc:  # noqa: BLE001 — audit logging is best-effort by design
        try:
            db.rollback()
        except Exception:  # pragma: no cover
            pass
        log.error(
            "Audit log write failed (action=%s, actor=%s): %s — "
            "check /api/health -> schema for audit_logs table drift",
            action,
            getattr(actor, "email", None),
            exc,
            exc_info=True,
        )
        return False
