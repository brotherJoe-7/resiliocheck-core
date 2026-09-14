import logging
import secrets as _secrets
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import bcrypt
from pydantic import BaseModel, EmailStr, Field
from backend import settings
from backend.database import get_db
from backend.models import User

log = logging.getLogger("resiliocheck.auth")

SECRET_KEY = settings.JWT_SECRET_KEY
if not SECRET_KEY:
    if settings.IS_PRODUCTION:
        raise RuntimeError(
            "JWT_SECRET_KEY is required in production. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    # Development convenience: ephemeral key (tokens are invalidated on restart).
    SECRET_KEY = _secrets.token_hex(32)
    log.warning("JWT_SECRET_KEY not set — using an ephemeral development key. Set it in .env for persistent sessions.")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = settings.ACCESS_TOKEN_EXPIRE_HOURS

bearer_scheme = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False

def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Dependency: get current user from bearer token ───────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please sign in.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(credentials.credentials)
    user = db.query(User).filter(User.email == payload.get("sub")).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return current_user



# ── Schemas ──────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = ""

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=256)


from fastapi import APIRouter, Depends, HTTPException, Request
from collections import defaultdict
import time

class RateLimiter:
    def __init__(self, max_calls: int, time_window: int):
        self.max_calls = max_calls
        self.time_window = time_window
        self.clients = defaultdict(list)
    
    def __call__(self, request: Request):
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "unknown"
            
        now = time.time()
        self.clients[ip] = [t for t in self.clients[ip] if now - t < self.time_window]
        
        if len(self.clients[ip]) >= self.max_calls:
            raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")
            
        self.clients[ip].append(now)

login_limiter = RateLimiter(max_calls=5, time_window=60)

# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db), _: None = Depends(login_limiter)):
    if db.query(User).filter(User.email == req.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    # First user becomes superadmin automatically
    is_first = db.query(User).count() == 0
    user = User(
        email=req.email.lower(),
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        role="superadmin" if is_first else "user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": user.email, "role": user.role})
    return {"access_token": token, "token_type": "bearer", "role": user.role, "email": user.email, "full_name": user.full_name}

@router.post("/login")
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db), _: None = Depends(login_limiter)):
    forwarded = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "unknown"
    )
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user or not verify_password(req.password, user.hashed_password):
        log.warning("AUTH_FAILURE  ip=%s  email=%s  reason=bad_credentials", client_ip, req.email.lower())
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        log.warning("AUTH_FAILURE  ip=%s  email=%s  reason=account_inactive", client_ip, req.email.lower())
        raise HTTPException(status_code=403, detail="Account is deactivated")
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    log.info("AUTH_SUCCESS  ip=%s  email=%s  role=%s", client_ip, user.email, user.role)
    token = create_access_token({"sub": user.email, "role": user.role})
    return {"access_token": token, "token_type": "bearer", "role": user.role, "email": user.email, "full_name": user.full_name}

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "scan_count": current_user.scan_count,
        "created_at": str(current_user.created_at),
        "last_login": str(current_user.last_login),
        "github_connected": bool(current_user.github_token),
    }


# ── GitHub OAuth ──────────────────────────────────────────────────────────────

import urllib.parse
import requests as _http

@router.get("/github/oauth-url")
def github_oauth_url(current_user: User = Depends(get_current_user)):
    """
    Returns the GitHub OAuth authorization URL as JSON so the frontend can
    redirect to it while still sending the bearer token via fetch().
    The browser cannot attach Authorization headers to a plain window.location
    redirect, so we use this two-step: fetch URL → JS redirect.
    """
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth is not configured on this server. Contact your administrator.",
        )
    state = create_access_token({"sub": current_user.email, "role": current_user.role})
    params = urllib.parse.urlencode({
        "client_id": settings.GITHUB_CLIENT_ID,
        "scope":     "repo read:user",
        "state":     state,
    })
    return {"url": f"https://github.com/login/oauth/authorize?{params}"}


@router.get("/github/login")
def github_login(current_user: User = Depends(get_current_user)):
    """
    Step 1 of GitHub OAuth: redirect the authenticated user to GitHub's
    authorization page. GitHub will redirect back to /api/auth/github/callback
    with a short-lived `code` once the user grants permission.

    We embed the user's JWT as the `state` parameter so the callback can
    identify who is connecting (CSRF protection via opaque bearer token).
    """
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth is not configured on this server. Contact your administrator.",
        )
    # Re-use the user's current JWT as the state token.
    # The callback will decode it to identify the user.
    state = create_access_token({"sub": current_user.email, "role": current_user.role})
    params = urllib.parse.urlencode({
        "client_id": settings.GITHUB_CLIENT_ID,
        "scope":     "repo read:user",          # 'repo' covers private repos
        "state":     state,
    })
    github_auth_url = f"https://github.com/login/oauth/authorize?{params}"
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=github_auth_url)


@router.get("/github/callback")
def github_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    """
    Step 2 of GitHub OAuth: GitHub redirects here after the user authorises.
    We exchange the `code` for an access token, store it on the user's profile,
    then redirect the browser back to the Vercel frontend.
    """
    frontend = settings.FRONTEND_URL.rstrip("/")

    # Handle user denial or GitHub error
    if error or not code or not state:
        reason = error or "missing_code"
        log.warning("GitHub OAuth callback error: %s", reason)
        return _redirect_to_frontend(frontend, success=False, reason=reason)

    # Validate state — it must be a valid JWT identifying a real user
    try:
        payload = decode_token(state)
        user = db.query(User).filter(User.email == payload.get("sub")).first()
    except HTTPException:
        user = None

    if not user or not user.is_active:
        return _redirect_to_frontend(frontend, success=False, reason="invalid_state")

    if not settings.GITHUB_CLIENT_SECRET:
        return _redirect_to_frontend(frontend, success=False, reason="oauth_not_configured")

    # Exchange the temporary code for a permanent access token
    try:
        token_resp = _http.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            json={
                "client_id":     settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code":          code,
            },
            timeout=15,
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()
    except Exception as exc:
        log.error("GitHub token exchange failed: %s", exc)
        return _redirect_to_frontend(frontend, success=False, reason="token_exchange_failed")

    access_token = token_data.get("access_token")
    if not access_token:
        gh_error = token_data.get("error_description", token_data.get("error", "unknown"))
        log.warning("GitHub did not return an access token: %s", gh_error)
        return _redirect_to_frontend(frontend, success=False, reason=gh_error)

    # Persist the token on the user's profile
    user.github_token = access_token
    db.commit()
    log.info("GitHub OAuth token stored for user %s", user.email)

    return _redirect_to_frontend(frontend, success=True)


def _redirect_to_frontend(frontend: str, *, success: bool, reason: str = ""):
    """Helper: redirect back to the Vercel frontend with an OAuth status flag."""
    from fastapi.responses import RedirectResponse
    params = {"github_oauth": "success" if success else "error"}
    if reason:
        params["reason"] = reason
    return RedirectResponse(url=f"{frontend}/dashboard?{urllib.parse.urlencode(params)}")
