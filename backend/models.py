from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, JSON
from sqlalchemy.sql import func
from backend.database import Base


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    email           = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name       = Column(String, default="")
    role            = Column(String, default="user")  # "user" | "admin" | "superadmin"
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    last_login      = Column(DateTime(timezone=True), nullable=True)
    scan_count      = Column(Integer, default=0)


class ScanResult(Base):
    __tablename__ = "scan_results"

    id              = Column(Integer, primary_key=True, index=True)
    repo_url        = Column(String, nullable=False)
    branch          = Column(String, default="main")
    engine          = Column(String, default="")
    gate            = Column(String, default="APPROVED")   # APPROVED | BLOCKED
    gate_rationale  = Column(Text, default="")
    critical_count  = Column(Integer, default=0)
    high_count      = Column(Integer, default=0)
    findings        = Column(JSON, default=list)           # list of finding dicts
    explanation     = Column(Text, default="")
    patched_code    = Column(Text, default="")
    secret_findings = Column(JSON, default=list)
    sandbox_verdict = Column(String, default="SKIPPED")
    scanned_at      = Column(DateTime(timezone=True), server_default=func.now())


class Gate(Base):
    __tablename__ = "gates"

    id          = Column(String, primary_key=True)          # e.g. "xss"
    name        = Column(String, nullable=False)
    desc        = Column(Text, default="")
    active      = Column(Boolean, default=True)
    strictness  = Column(JSON, default=list)
    action      = Column(JSON, default=list)


class Agent(Base):
    __tablename__ = "agents"

    id          = Column(String, primary_key=True)          # e.g. "code-fixer"
    name        = Column(String, nullable=False)
    icon        = Column(String, default="✦")
    active      = Column(Boolean, default=True)
    status_label = Column(String, default="Idle")
    stats       = Column(JSON, default=list)
    log         = Column(Text, default="")
