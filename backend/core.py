import os
import time
import re
import shutil
import zipfile
import requests
import json
import docker
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

# NOTE: The key is validated lazily inside run_ai_analysis() instead of at
# import time — the dashboard imports helper functions from this module and a
# module-level RuntimeError would crash the whole Streamlit app on startup.


def _require_api_key() -> None:
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is required. Set it in your .env file and restart.")


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
    ("Basic Auth in URL",       re.compile(r'https?://[^:@\s]+:[^@\s]{4,}@[^\s]+')),
]

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


def download_and_extract_repo(repo_url, target_dir):
    # ✅ SECURITY: validate + normalise the URL before any request (SSRF guard).
    repo_url = validate_repo_url(repo_url)
    print(f"Downloading repository from {repo_url}...")

    zip_path = os.path.join(target_dir, "repo.zip")
    downloaded = False
    # 'HEAD' resolves to the default branch automatically; keep main/master
    # as explicit fallbacks for older mirrors.
    for ref in ("HEAD", "refs/heads/main", "refs/heads/master"):
        zip_url = f"{repo_url}/archive/{ref}.zip"
        try:
            response = requests.get(zip_url, timeout=30, stream=True)
        except requests.RequestException as exc:
            print(f"Request for '{ref}' failed: {exc}")
            continue
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
            break
        print(f"Ref '{ref}' not found (HTTP {response.status_code}), trying next...")

    if not downloaded:
        raise RuntimeError("Failed to download repository — no default/main/master branch found.")

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
    for filepath, content in source_files.items():
        lines = content.splitlines()
        for lineno, line in enumerate(lines, start=1):
            # Skip obviously commented-out lines
            stripped = line.strip()
            if stripped.startswith(("#", "//", "*", "<!--")):
                continue
            for label, pattern in SECRET_PATTERNS:
                if pattern.search(line):
                    findings.append({
                        "file":    os.path.basename(filepath),
                        "line":    lineno,
                        "pattern": label,
                        "snippet": line.strip()[:120],  # truncate long lines
                    })
                    break  # one finding per line is enough
    return findings


def run_ai_analysis(source_files, secret_findings=None):
    """
    Sends collected source files to the Groq LLM for deep security analysis.
    Uses llama3-8b-8192 for its high TPM allowance on free tier.
    Files are ranked by security relevance and packed into one prompt that
    stays within ~7000 tokens to avoid rate-limit errors.

    Returns a tuple: (explanation: str, patched_code: str)
    """
    _require_api_key()
    print("Sending code to Groq AI for security analysis...")

    # Build compact system preamble
    preamble = (
        "You are an elite application security engineer. Analyse the following source files "
        "for OWASP Top 10 vulnerabilities: SQL injection, XSS, path traversal, hardcoded secrets, "
        "weak auth, broken access control, security misconfig, and known vulnerable components.\n"
    )

    secret_block = ""
    if secret_findings:
        lines = [f"  - [{f['pattern']}] {f['file']}:{f['line']}: {f['snippet']}" for f in secret_findings[:10]]
        secret_block = f"\nPRE-SCAN: {len(secret_findings)} hardcoded secret(s) detected — include remediation:\n" + "\n".join(lines) + "\n"

    suffix = (
        "\nReturn ONLY a raw JSON object with two keys:\n"
        "'explanation': detailed vulnerability findings with severity and fix recommendations.\n"
        "'patched_code': corrected code string (empty string if no patches needed).\n"
        "--- SOURCE FILES ---\n"
    )

    # Pack as many files as possible within ~27000 chars (~6750 tokens)
    MAX_PAYLOAD_CHARS = 27_000
    file_parts = []
    total_chars = len(preamble) + len(secret_block) + len(suffix)
    for filepath, content in source_files.items():
        fname = os.path.basename(filepath)
        # Each file gets at most 1500 chars to share budget fairly
        trimmed = content[:1500] if len(content) > 1500 else content
        snippet = f"\n=== {fname} ===\n{trimmed}\n"
        if total_chars + len(snippet) > MAX_PAYLOAD_CHARS:
            break
        file_parts.append(snippet)
        total_chars += len(snippet)

    prompt = preamble + secret_block + suffix + "".join(file_parts)
    print(f"Prompt payload: {len(prompt)} chars covering {len(file_parts)} file(s).")

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":       GROQ_MODEL,
        "messages":    [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        # NOTE: Do NOT use response_format json_object — some models emit empty
        # failed_generation when the prompt contains code with special chars.
        # We extract JSON manually from the response text instead.
    }

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=90,
        )
        response.raise_for_status()
        result = response.json()

        choices     = result.get("choices") or []
        first       = choices[0] if choices else {}
        raw_content = (first.get("message") or {}).get("content", "{}")

        # First try direct JSON parse
        ai_data = {}
        try:
            ai_data = json.loads(raw_content)
        except json.JSONDecodeError:
            # Fallback: extract first {...} block from the response
            match = re.search(r'\{[\s\S]*\}', raw_content)
            if match:
                try:
                    ai_data = json.loads(match.group(0))
                except json.JSONDecodeError:
                    pass
            if not ai_data:
                # Last resort: treat entire response as the explanation
                ai_data = {"explanation": raw_content.strip(), "patched_code": ""}

        explanation  = ai_data.get("explanation", "Code verification processed.")
        patched_code = ai_data.get("patched_code", "")

        print("\nAI Explanation:")
        print(explanation)
        return explanation, patched_code

    except Exception as e:
        print(f"ERROR: AI Analysis failed: {str(e)}")
        if "response" in locals() and hasattr(response, "text"):
            print(f"Response: {response.text}")
        return "AI analysis failed.", None


def apply_patch_and_validate(workspace_dir, patched_code):
    """
    Writes the AI-generated patch to disk and syntax-validates it inside a
    hardened, network-isolated Docker container.

    Returns one of: "PASS", "FAIL", "SKIPPED", "ERROR" so callers (CLI and
    dashboard) can surface the real sandbox verdict instead of guessing.
    """
    patched_file_path = os.path.join(workspace_dir, "patched_script.js")

    if not (patched_code and patched_code.strip()):
        print("No patched code generated (code is clean or non-JS).")
        return "SKIPPED"

    print(f"Writing patched code to {patched_file_path}")
    with open(patched_file_path, "w", encoding="utf-8") as f:
        f.write(patched_code)

    print("Running Docker Sandbox Validation...")
    container = None
    try:
        client        = docker.from_env()
        abs_workspace = os.path.abspath(workspace_dir)

        container = client.containers.run(
            "node:18-alpine",
            command="node --check /workspace/patched_script.js",
            volumes={abs_workspace: {"bind": "/workspace", "mode": "ro"}},
            # ✅ SECURITY: hardened profile — no network, read-only root fs,
            # no capabilities, no privilege escalation, resource limits.
            network_disabled=True,
            read_only=True,
            cap_drop=["ALL"],
            security_opt=["no-new-privileges:true"],
            mem_limit="512m",
            pids_limit=64,
            detach=True,
            remove=False,
        )

        exit_status = container.wait(timeout=120)
        logs        = container.logs().decode("utf-8", errors="replace")

        if exit_status["StatusCode"] == 0:
            print("Sandbox Validation: PASS")
            return "PASS"
        print("Sandbox Validation: FAIL")
        print(logs)
        return "FAIL"

    except Exception as e:
        print(f"ERROR: Docker validation failed: {str(e)}")
        return "ERROR"
    finally:
        # ✅ Always clean up the container — the previous version leaked
        # containers whenever wait()/logs() raised before remove().
        if container is not None:
            try:
                container.remove(force=True)
            except Exception:
                pass


if __name__ == "__main__":
    _require_api_key()
    repo_url = input("Enter Public GitHub Repository URL: ").strip()

    if not repo_url:
        print("ERROR: Repository URL is required.")
        exit(1)

    try:
        repo_url = validate_repo_url(repo_url)
    except ValueError as ve:
        print(f"ERROR: {ve}")
        exit(1)

    WORKSPACE_DIR = "./tmp_workspace"

    if os.path.exists(WORKSPACE_DIR):
        shutil.rmtree(WORKSPACE_DIR, ignore_errors=True)
    os.makedirs(WORKSPACE_DIR, exist_ok=True)

    try:
        download_and_extract_repo(repo_url, WORKSPACE_DIR)

        source_files = gather_source_files(WORKSPACE_DIR)
        if not source_files:
            print("No scannable source files found in the repository.")
        else:
            print(f"Found {len(source_files)} file(s) for analysis.")

            # Stage 1: Deterministic regex secret scan
            secret_findings = scan_for_secrets(source_files)
            if secret_findings:
                print(f"\nPRE-SCAN ALERT — {len(secret_findings)} hardcoded secret(s) detected:")
                for f in secret_findings:
                    print(f"  [{f['pattern']}] {f['file']}:{f['line']} — {f['snippet']}")
            else:
                print("Pre-scan: No hardcoded secrets detected by pattern matching.")

            # Stage 2: AI deep analysis
            explanation, patched_code = run_ai_analysis(source_files, secret_findings)

            # Stage 3: Docker sandbox validation (JS patches only)
            if patched_code:
                verdict = apply_patch_and_validate(WORKSPACE_DIR, patched_code)
                print(f"Final sandbox verdict: {verdict}")

    finally:
        # ✅ Clean up the downloaded workspace so repository contents never
        # linger on disk (or get committed) after a run.
        shutil.rmtree(WORKSPACE_DIR, ignore_errors=True)
        print("\nExecution finished.")
