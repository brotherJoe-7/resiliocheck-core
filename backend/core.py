import os
import time
import re
import shutil
import zipfile
import logging
import requests
import json
import subprocess
import tempfile
from pathlib import Path

from backend import settings

log = logging.getLogger("resiliocheck.core")

GROQ_API_KEY = settings.GROQ_API_KEY
GROQ_MODEL   = settings.GROQ_MODEL


def _require_api_key() -> None:
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is required. Set it in your .env file and restart.")


# ─────────────────────────────────────────────────────────────────────────────
# SUBPROCESS SANDBOX AVAILABILITY
# ─────────────────────────────────────────────────────────────────────────────

def _tool_exists(name: str) -> bool:
    """Return True if a CLI tool is on PATH."""
    return shutil.which(name) is not None


def sandbox_status() -> dict:
    """
    Returns which SAST tools are available in the current environment.
    Used by the /api/health endpoint for diagnostics.
    """
    return {
        "enabled":  settings.SANDBOX_ENABLED,
        "mode":     "subprocess",
        "semgrep":  _tool_exists("semgrep"),
        "bandit":   _tool_exists("bandit"),
        "node":     _tool_exists("node"),
        "php":      _tool_exists("php"),
        "ruby":     _tool_exists("ruby"),
    }


# Keep docker_status() as a compatibility shim so existing callers don't break
def docker_status() -> dict:
    return {"available": False, "reason": "Sandbox now uses subprocess mode — Docker not required.", "image": "N/A"}


# ✅ SECURITY: strict GitHub 'owner/repo' allowlist — used to validate every
# repository URL before any network request is made (SSRF prevention).
_REPO_PATH_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9\-]{0,38})/[A-Za-z0-9._\-]{1,100}$")

# ✅ SECURITY: cap downloaded archive size (100 MB) to prevent memory-
# exhaustion DoS from adversarially large repositories.
_MAX_ZIP_BYTES = 100 * 1024 * 1024


def validate_repo_url(repo_url: str) -> str:
    """
    Validate that *repo_url* is a well-formed public GitHub repository URL.
    Returns the normalised URL or raises ValueError.
    Blocks SSRF vectors like 'https://github.com@evil.com/x' or internal hosts.
    """
    url = repo_url.strip().rstrip("/")
    if not url.startswith("https://github.com/"):
        raise ValueError("Only https://github.com/ repository URLs are accepted.")
    path = url[len("https://github.com/"):]
    if path.endswith(".git"):
        path = path[:-4]
    if not _REPO_PATH_RE.fullmatch(path):
        raise ValueError("Repository URL must be in the form https://github.com/owner/repo")
    return f"https://github.com/{path}"


# ─────────────────────────────────────────────────────────────────────────────
# SECRET DETECTION PATTERNS
# High-confidence regex patterns for hardcoded credentials across all languages.
# Each entry: (label, compiled_pattern)
# ─────────────────────────────────────────────────────────────────────────────
SECRET_PATTERNS = [
    ("Generic API Key",         re.compile(r'(?i)(api[_-]?key|apikey)\s*[=:]\s*["\']?([A-Za-z0-9\-_]{20,})["\']?')),
    ("Generic Secret/Token",    re.compile(r'(?i)(secret|token|passwd|password|auth_token|access_token)\s*[=:]\s*["\']([^"\']{8,})["\']')),
    ("AWS Access Key",          re.compile(r'(?<![A-Z0-9])(AKIA|AIPA|AROA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])')),
    ("AWS Secret Key",          re.compile(r'(?i)aws[_-]?secret[_-]?access[_-]?key\s*[=:]\s*["\']?([A-Za-z0-9/+=]{40})["\']?')),
    ("Google API Key",          re.compile(r'AIza[0-9A-Za-z\-_]{35}')),
    ("Google OAuth Client",     re.compile(r'[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com')),
    ("Private Key Block",       re.compile(r'-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----')),
    ("Stripe Key",              re.compile(r'(?i)(sk|pk)_(live|test)_[0-9a-zA-Z]{24,}')),
    ("GitHub Token",            re.compile(r'gh[pousr]_[A-Za-z0-9]{36,}')),
    ("Slack Token",             re.compile(r'xox[baprs]-[0-9A-Za-z\-]{10,}')),
    ("SendGrid Key",            re.compile(r'SG\.[A-Za-z0-9\-_]{22,}\.[A-Za-z0-9\-_]{43,}')),
    ("Twilio Key",              re.compile(r'SK[0-9a-fA-F]{32}')),
    ("JWT Token",               re.compile(r'eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_.+/=]*')),
    ("Hardcoded Password",      re.compile(r'(?i)(password|passwd|pwd)\s*=\s*["\'](?!.*\{)[^"\']{6,}["\']')),
    ("MongoDB Connection",      re.compile(r'mongodb(\+srv)?://[^:]+:[^@]+@')),
    ("SQL Connection String",   re.compile(r'(?i)(jdbc:|mysql://|postgres://|postgresql://)[^\s"\'<>]+')),
    # user:pass@host  — requires a real host after the '@' and excludes the
    # Google-Fonts style 'wght@400;500' query strings (no ':' before '@').
    ("Basic Auth in URL",       re.compile(r'https?://[A-Za-z0-9._%+\-]+:[^@\s/?#]{4,}@[A-Za-z0-9.\-]+(?::\d+)?(?:/|\s|$|["\'])')),
]

# Snippets that look like secrets but are placeholders / examples
_PLACEHOLDER_RE = re.compile(
    r'(your[_-]?|<[^>]+>|xxx+|\$\{|process\.env|os\.environ|getenv|example|placeholder|changeme|'
    r'\bnull\b|\bnone\b|\bundefined\b)',
    re.IGNORECASE,
)

# File types to scan (binary, lockfiles and generated output excluded)
SCANNABLE_EXTENSIONS = {
    ".js", ".ts", ".jsx", ".tsx",   # JavaScript / TypeScript
    ".py",                           # Python
    ".php",                          # PHP
    ".java",                         # Java
    ".go",                           # Go
    ".rb",                           # Ruby
    ".cs",                           # C#
    ".env", ".env.example",          # Environment files
    ".yaml", ".yml",                 # Config / CI
    ".toml",                         # Config
    ".sh", ".bash",                  # Shell scripts
    ".html", ".htm",                 # Templates that may embed keys
    ".xml",                          # Config / Android manifests
    ".json",                         # Config (excludes package-lock via size cap)
    ".cfg", ".ini", ".conf",         # Generic config
}

SKIP_FOLDERS = {
    "node_modules", ".git", "dist", "build", ".next", "__pycache__",
    ".tox", "vendor", "public", "assets", "coverage", "migrations",
    ".venv", "venv", "env", ".env",
}

SKIP_FILENAMES = {
    "package-lock.json", "yarn.lock", "poetry.lock", "Pipfile.lock",
    "composer.lock", "Gemfile.lock", "cargo.lock",
}


_BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/\-]{0,100}$")


def validate_branch(branch: str | None) -> str:
    """Return a safe branch name (defaults to 'main')."""
    b = (branch or "main").strip()
    if not _BRANCH_RE.fullmatch(b) or ".." in b or b.endswith("/") or b.endswith(".lock"):
        raise ValueError("Invalid branch name.")
    return b


def download_and_extract_repo(repo_url, target_dir, branch: str | None = None, github_token: str | None = None):
    """
    Download the repository archive for *branch* (falls back to the default
    branch, then main/master) and extract it safely into *target_dir*.
    Returns the ref that was actually downloaded.

    If *github_token* is provided it is sent as a Bearer Authorization header,
    enabling access to private repositories the token holder has permission to read.
    """
    # ✅ SECURITY: validate + normalise the URL before any request (SSRF guard).
    repo_url = validate_repo_url(repo_url)
    print(f"Downloading repository from {repo_url}...")

    zip_path = os.path.join(target_dir, "repo.zip")
    downloaded = False
    used_ref = ""
    refs: list[str] = []
    if branch:
        refs.append(f"refs/heads/{validate_branch(branch)}")
    # 'HEAD' resolves to the default branch automatically; keep main/master
    # as explicit fallbacks for older mirrors.
    for r in ("HEAD", "refs/heads/main", "refs/heads/master"):
        if r not in refs:
            refs.append(r)

    # Build request headers — inject auth token when available.
    headers: dict = {}
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"

    last_status = None
    for ref in refs:
        if github_token:
            # The web UI (github.com) ignores Bearer tokens for private archives.
            # We must use the API endpoint to authenticate correctly.
            path = repo_url[len("https://github.com/"):]
            zip_url = f"https://api.github.com/repos/{path}/zipball/{ref}"
            headers["Accept"] = "application/vnd.github+json"
            headers["X-GitHub-Api-Version"] = "2022-11-28"
        else:
            zip_url = f"{repo_url}/archive/{ref}.zip"

        try:
            response = requests.get(zip_url, headers=headers, timeout=30, stream=True, allow_redirects=True)
        except requests.RequestException as exc:
            print(f"Request for '{ref}' failed: {exc}")
            continue
        last_status = response.status_code
        if response.status_code == 200:
            # ✅ SECURITY: stream to disk with a hard size cap.
            written = 0
            with open(zip_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=1 << 16):
                    written += len(chunk)
                    if written > _MAX_ZIP_BYTES:
                        f.close()
                        os.remove(zip_path)
                        raise RuntimeError("Repository archive exceeds the 100 MB safety limit.")
                    f.write(chunk)
            downloaded = True
            used_ref = ref
            if branch and ref != f"refs/heads/{branch}":
                print(f"Branch '{branch}' not found — fell back to '{ref}'.")
            break
        print(f"Ref '{ref}' not found (HTTP {response.status_code}), trying next...")

    if not downloaded:
        if last_status == 404:
            raise RuntimeError(
                "Repository not found (HTTP 404). Check that the URL is correct and the repository is public, "
                "or connect your GitHub account to scan private repositories."
            )
        raise RuntimeError(
            f"Failed to download repository archive (last HTTP status: {last_status}). "
            "Only public GitHub repositories (or private repos with a connected GitHub account) are supported."
        )

    print("Extracting files...")
    # SECURITY: Sanitise every ZIP member to prevent path-traversal (CWE-22).
    target_abs = os.path.realpath(target_dir)
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        for member in zip_ref.namelist():
            member_path = os.path.realpath(os.path.join(target_abs, member))
            if not member_path.startswith(target_abs + os.sep) and member_path != target_abs:
                print(f"Skipping dangerous ZIP entry: {member}")
                continue
            zip_ref.extract(member, target_dir)

    os.remove(zip_path)
    return used_ref


def gather_source_files(workspace_dir, max_files=20, max_bytes=20_000):
    """
    Recursively walks workspace_dir and collects source files across all
    meaningful languages and config file types. Returns a dict of
    {filepath: content_string}.

    Limits:
    - max_files  : maximum number of files passed to the AI (default 20)
    - max_bytes  : maximum individual file size in bytes (default 20 KB)
    """
    collected = {}
    print("Scanning repository — collecting source files across all languages...")

    for root, dirs, files in os.walk(workspace_dir):
        # Prune skip-listed directories in-place so os.walk doesn't descend
        dirs[:] = [d for d in dirs if d not in SKIP_FOLDERS and not d.startswith(".")]

        for filename in files:
            if filename in SKIP_FILENAMES:
                continue

            ext = Path(filename).suffix.lower()
            # Include files with no extension only if they look like dotfiles (.env)
            bare_name = filename.lower()
            is_dotfile = bare_name.startswith(".") and bare_name in {
                ".env", ".env.example", ".env.local", ".env.production",
                ".bashrc", ".bash_profile", ".zshrc",
            }

            if ext not in SCANNABLE_EXTENSIONS and not is_dotfile:
                continue

            file_path = os.path.join(root, filename)
            try:
                size = os.path.getsize(file_path)
                if size > max_bytes:
                    continue
                with open(file_path, "r", encoding="utf-8", errors="ignore") as fh:
                    collected[file_path] = fh.read()
            except Exception:
                continue

        if len(collected) >= max_files * 3:
            # Early exit — we have plenty to choose from; ranking happens next
            break

    # Prioritise files most likely to contain credentials / security logic
    PRIORITY_KEYWORDS = [
        "password", "secret", "token", "key", "auth", "cred",
        "login", "jwt", "api", "db", "database", "config",
    ]

    def _score(item):
        path, content = item
        fname = Path(path).name.lower()
        score = 0
        for kw in PRIORITY_KEYWORDS:
            if kw in fname:
                score += 10
            score += content.lower().count(kw)
        return score

    ranked = sorted(collected.items(), key=_score, reverse=True)
    result = dict(ranked[:max_files])
    print(f"Selected {len(result)} file(s) for analysis (from {len(collected)} collected).")
    return result


def scan_for_secrets(source_files):
    """
    Runs regex-based secret detection across all gathered source files.
    Returns a list of finding dicts:
      { "file": str, "line": int, "pattern": str, "snippet": str }

    This runs BEFORE the AI so that credential leaks are caught deterministically,
    independently of whether the AI model flags them.
    """
    findings = []
    
    # Files that usually contain mock/placeholder credentials
    mock_files = {".env.example", ".env.sample", ".env.template"}
    
    for filepath, content in source_files.items():
        basename = os.path.basename(filepath)
        if basename in mock_files:
            continue
            
        lines = content.splitlines()
        for lineno, line in enumerate(lines, start=1):
            # Skip obviously commented-out lines
            stripped = line.strip()
            if stripped.startswith(("#", "//", "*", "<!--")):
                continue
            for label, pattern in SECRET_PATTERNS:
                if pattern.search(line):
                    # Skip obvious placeholders / env lookups (e.g. password: process.env.PASS)
                    if label in ("Generic API Key", "Generic Secret/Token", "Hardcoded Password") \
                            and _PLACEHOLDER_RE.search(line):
                        continue
                    findings.append({
                        "file":    basename,
                        "line":    lineno,
                        "pattern": label,
                        "snippet": line.strip()[:120],
                    })
                    break  # one finding per line is enough
    return findings


def run_local_sast_prefilter(workspace_dir: str) -> set:
    """
    Runs fast, local SAST tools (semgrep, bandit) over the entire codebase to flag
    suspicious files. Returns a set of relative file paths that have findings.
    This acts as a high-precision filter so we only send relevant files to the LLM.
    """
    flagged_files = set()
    if not settings.SANDBOX_ENABLED:
        print("Local SAST prefilter skipped — Sandbox disabled via SANDBOX_ENABLED=false.")
        return flagged_files
    print("Running local SAST prefilter on entire workspace...")

    abs_workspace = os.path.abspath(workspace_dir)

    try:
        # Run bandit
        if _tool_exists("bandit") and _detect_project_type(abs_workspace) == "python":
            r_bandit = subprocess.run(
                ["bandit", "-r", abs_workspace, "-f", "json", "-ll", "-q",
                 "--exclude", os.path.join(abs_workspace, "node_modules")],
                capture_output=True, text=True, timeout=60
            )
            try:
                if r_bandit.stdout.strip():
                    data = json.loads(r_bandit.stdout)
                    for r in data.get("results", []):
                        filename = r.get("filename", "")
                        if filename.startswith(abs_workspace):
                            flagged_files.add(os.path.relpath(filename, abs_workspace).replace("\\", "/"))
            except Exception as e:
                print(f"Error parsing bandit prefilter: {e}")

        # Run semgrep
        if _tool_exists("semgrep"):
            r_semgrep = subprocess.run(
                ["semgrep", "--config=p/default", abs_workspace, "--json", "--quiet"],
                capture_output=True, text=True, timeout=60
            )
            try:
                if r_semgrep.stdout.strip():
                    data = json.loads(r_semgrep.stdout)
                    for r in data.get("results", []):
                        path = r.get("path", "")
                        if path.startswith(abs_workspace):
                            flagged_files.add(os.path.relpath(path, abs_workspace).replace("\\", "/"))
            except Exception as e:
                print(f"Error parsing semgrep prefilter: {e}")

    except Exception as e:
        print(f"Local SAST prefilter failed: {e}")
        
    print(f"Local SAST prefilter flagged {len(flagged_files)} files.")
    return flagged_files



def _extract_mock_env(workspace_dir: str) -> dict:
    """
    Reads .env.example (or README for ENV= patterns) and generates safe mock
    values so static tools that load dotenv don't complain about missing vars.
    Never returns real secrets — only placeholder values.
    """
    mock_env: dict = {}
    for candidate in [".env.example", ".env.sample", ".env.template"]:
        env_path = None
        for root, dirs, files in os.walk(workspace_dir):
            dirs[:] = [d for d in dirs if d not in SKIP_FOLDERS]
            if candidate in files:
                env_path = os.path.join(root, candidate)
                break
        if env_path:
            try:
                with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" in line:
                            key = line.split("=", 1)[0].strip()
                            # Generate a safe type-appropriate mock value
                            k_lower = key.lower()
                            if "url" in k_lower or "uri" in k_lower:
                                mock_env[key] = "sqlite:///mock.db"
                            elif "port" in k_lower:
                                mock_env[key] = "8080"
                            elif "host" in k_lower:
                                mock_env[key] = "localhost"
                            elif "debug" in k_lower:
                                mock_env[key] = "false"
                            else:
                                mock_env[key] = "mock-placeholder-value"
            except Exception:
                pass
    return mock_env


def _detect_project_type(workspace_dir: str) -> str:
    """Detect the dominant language/framework of the repo."""
    for root, dirs, files in os.walk(workspace_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_FOLDERS]
        if "package.json" in files:
            return "node"
        if "requirements.txt" in files or "pyproject.toml" in files or "setup.py" in files:
            return "python"
        if "go.mod" in files:
            return "go"
        if "Gemfile" in files:
            return "ruby"
        if "composer.json" in files:
            return "php"
    return "unknown"


def apply_patch_and_validate(workspace_dir, patched_code, patched_filename="patched_script.js"):
    """
    Multi-layer subprocess-based static analysis sandbox.
    Runs entirely inside the Cloud Run container — no Docker daemon required.

    Layer 1 — SAST (Static Application Security Testing)
        Python  → bandit  (finds real security bugs: SQL-i, shell-inject, etc.)
        JS/TS   → semgrep (OWASP ruleset, no npm install needed)
        Generic → semgrep secrets ruleset

    Layer 2 — Syntax Validation (always runs)
        JS/JSX  → node --check
        TS/TSX  → node --experimental-strip-types --check
        Python  → python -m py_compile
        PHP     → php -l
        Ruby    → ruby -c
        Shell   → bash -n

    The sandbox NEVER executes the application code.
    """
    if not (patched_code and patched_code.strip()):
        print("No patched code generated — skipping sandbox.")
        return "SKIPPED", ""

    if not settings.SANDBOX_ENABLED:
        print("Sandbox disabled via SANDBOX_ENABLED=false.")
        return "SKIPPED", "Sandbox disabled."

    # C2: Sanitize patched_filename to prevent command injection / path traversal.
    patched_filename = (patched_filename or "").replace("\\", "/").lstrip("/")
    if not re.match(r"^[A-Za-z0-9._\-/]+$", patched_filename) or ".." in patched_filename.split("/"):
        patched_filename = "patched_script.txt"

    patched_file_path = os.path.join(workspace_dir, patched_filename)
    os.makedirs(os.path.dirname(patched_file_path) or workspace_dir, exist_ok=True)
    ext = os.path.splitext(patched_filename)[1].lower()
    project_type = _detect_project_type(workspace_dir)
    abs_workspace = os.path.abspath(workspace_dir)

    print(f"Writing patched code to {patched_file_path}")
    with open(patched_file_path, "w", encoding="utf-8") as f:
        f.write(patched_code)

    timeout = getattr(settings, "SANDBOX_TIMEOUT_SECONDS", 120)
    logs_parts: list[str] = []
    syntax_ok = False
    has_critical = False

    print(f"Running Subprocess Sandbox — project_type={project_type}, ext={ext}")

    try:
        # ── Layer 1: SAST ─────────────────────────────────────────────────────
        sast_json_str = ""
        if (ext == ".py" or project_type == "python") and _tool_exists("bandit"):
            r = subprocess.run(
                ["bandit", "-r", abs_workspace, "-f", "json", "-ll", "-q",
                 "--exclude", os.path.join(abs_workspace, "node_modules")],
                capture_output=True, text=True, timeout=timeout
            )
            sast_json_str = r.stdout
            logs_parts.append(f"[bandit stdout]\n{r.stdout}")

        elif ext in (".js", ".jsx", ".ts", ".tsx") or project_type == "node":
            if _tool_exists("semgrep"):
                config = "p/typescript" if ext in (".ts", ".tsx") else "p/javascript"
                r = subprocess.run(
                    ["semgrep", "--config", config, abs_workspace,
                     "--json", "--quiet"],
                    capture_output=True, text=True, timeout=timeout
                )
                sast_json_str = r.stdout
                logs_parts.append(f"[semgrep stdout]\n{r.stdout}")

        else:
            if _tool_exists("semgrep"):
                r = subprocess.run(
                    ["semgrep", "--config", "p/secrets", abs_workspace,
                     "--json", "--quiet"],
                    capture_output=True, text=True, timeout=timeout
                )
                sast_json_str = r.stdout
                logs_parts.append(f"[semgrep stdout]\n{r.stdout}")
            logs_parts.append("SYNTAX:SKIPPED")  # generic file, skip syntax check
            syntax_ok = True

        # Parse SAST JSON
        if sast_json_str:
            try:
                sast_data = json.loads(sast_json_str)
                # bandit format
                if "results" in sast_data and any(
                    r.get("issue_severity", "").lower() in ["high", "critical"]
                    for r in sast_data["results"]
                ):
                    has_critical = True
                # semgrep format
                if "results" in sast_data and any(
                    r.get("extra", {}).get("severity", "").lower() in ["error", "high", "critical"]
                    for r in sast_data["results"]
                ):
                    has_critical = True
            except Exception as parse_err:
                print(f"Failed to parse SAST JSON: {parse_err}")
                if any(w in sast_json_str.lower() for w in ["critical", "high severity"]):
                    has_critical = True

        # ── Layer 2: Syntax Validation ────────────────────────────────────────
        abs_patch = os.path.abspath(patched_file_path)

        if ext in (".js", ".jsx") and _tool_exists("node"):
            r = subprocess.run(["node", "--check", abs_patch],
                               capture_output=True, text=True, timeout=30)
            syntax_ok = r.returncode == 0
            logs_parts.append(f"SYNTAX:{'OK' if syntax_ok else 'FAIL'}")
            if r.stderr:
                logs_parts.append(r.stderr)

        elif ext in (".ts", ".tsx") and _tool_exists("node"):
            r = subprocess.run(
                ["node", "--experimental-strip-types", "--check", abs_patch],
                capture_output=True, text=True, timeout=30
            )
            syntax_ok = r.returncode == 0
            logs_parts.append(f"SYNTAX:{'OK' if syntax_ok else 'FAIL'}")
            if r.stderr:
                logs_parts.append(r.stderr)

        elif ext == ".py":
            r = subprocess.run(
                ["python", "-m", "py_compile", abs_patch],
                capture_output=True, text=True, timeout=30
            )
            syntax_ok = r.returncode == 0
            logs_parts.append(f"SYNTAX:{'OK' if syntax_ok else 'FAIL'}")
            if r.stderr:
                logs_parts.append(r.stderr)

        elif ext == ".php" and _tool_exists("php"):
            r = subprocess.run(["php", "-l", abs_patch],
                               capture_output=True, text=True, timeout=30)
            syntax_ok = r.returncode == 0
            logs_parts.append(f"SYNTAX:{'OK' if syntax_ok else 'FAIL'}")

        elif ext == ".rb" and _tool_exists("ruby"):
            r = subprocess.run(["ruby", "-c", abs_patch],
                               capture_output=True, text=True, timeout=30)
            syntax_ok = r.returncode == 0
            logs_parts.append(f"SYNTAX:{'OK' if syntax_ok else 'FAIL'}")

        elif ext == ".sh" and _tool_exists("bash"):
            r = subprocess.run(["bash", "-n", abs_patch],
                               capture_output=True, text=True, timeout=30)
            syntax_ok = r.returncode == 0
            logs_parts.append(f"SYNTAX:{'OK' if syntax_ok else 'FAIL'}")

        else:
            # Unknown file type — skip syntax but still report SAST result
            if "SYNTAX:SKIPPED" not in "\n".join(logs_parts):
                logs_parts.append("SYNTAX:SKIPPED")
            syntax_ok = True

    except subprocess.TimeoutExpired:
        print("ERROR: Subprocess sandbox timed out.")
        return "ERROR", "Sandbox timed out after exceeding the allowed execution window."
    except Exception as e:
        print(f"ERROR: Subprocess sandbox failed: {e}")
        return "ERROR", str(e)

    logs = "\n".join(logs_parts)

    if syntax_ok and not has_critical:
        print("Sandbox Validation: PASS")
        return "PASS", logs
    elif not syntax_ok:
        print("Sandbox Validation: FAIL (syntax error in patched code)")
        return "FAIL", logs
    else:
        print("Sandbox Validation: FAIL (critical/high severity SAST findings)")
        return "FAIL", logs


# --- Removed Docker-specific container cleanup block (no longer applicable) ---
if __name__ == "__main__":
    # Simple CLI entry point: python -m backend.core
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    _require_api_key()
    repo_url = input("Enter Public GitHub Repository URL: ").strip()

    if not repo_url:
        print("ERROR: Repository URL is required.")
        raise SystemExit(1)

    try:
        repo_url = validate_repo_url(repo_url)
    except ValueError as ve:
        print(f"ERROR: {ve}")
        raise SystemExit(1)

    WORKSPACE_DIR = "./tmp_workspace"
    shutil.rmtree(WORKSPACE_DIR, ignore_errors=True)
    os.makedirs(WORKSPACE_DIR, exist_ok=True)

    try:
        from backend.langchain_pipeline import run_pipeline

        download_and_extract_repo(repo_url, WORKSPACE_DIR)
        source_files = gather_source_files(WORKSPACE_DIR)
        if not source_files:
            print("No scannable source files found in the repository.")
        else:
            print(f"Found {len(source_files)} file(s) for analysis.")
            rel_files = {os.path.relpath(p, WORKSPACE_DIR).replace("\\", "/"): c for p, c in source_files.items()}
            secret_findings = scan_for_secrets(source_files)
            for f in secret_findings:
                print(f"  [{f['pattern']}] {f['file']}:{f['line']} — {f['snippet']}")
            result = run_pipeline(rel_files, secret_findings)
            print(f"\nGate: {result['gate']} — {result['gate_rationale']}")
            print(result["explanation"])
            if result["patched_code"]:
                verdict, _logs = apply_patch_and_validate(WORKSPACE_DIR, result["patched_code"], result["patched_filename"])
                print(f"Sandbox verdict: {verdict}")
    finally:
        shutil.rmtree(WORKSPACE_DIR, ignore_errors=True)
        print("\nExecution finished.")
