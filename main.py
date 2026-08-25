import os
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
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    print("ERROR: GROQ_API_KEY is missing from .env")
    raise RuntimeError("GROQ_API_KEY is required. Set it in your .env file and restart.")


# ─────────────────────────────────────────────────────────────────────────────
# SECRET DETECTION PATTERNS
# High-confidence regex patterns for hardcoded credentials across all languages.
# Each entry: (label, compiled_pattern)
# ─────────────────────────────────────────────────────────────────────────────
SECRET_PATTERNS = [
    ("Generic API Key",         re.compile(r'(?i)(api[_-]?key|apikey)\s*[=:]\s*["\']?([A-Za-z0-9\-_]{20,})["\']?')),
    ("Generic Secret/Token",    re.compile(r'(?i)(secret|token|passwd|password|auth_token|access_token)\s*[=:]\s*["\']([^"\']{8,})["\']')),
    ("AWS Access Key",          re.compile(r'(?<![A-Z0-9])(AKIA|AIPA|AKIA|AROA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])')),
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
    print(f"Downloading repository from {repo_url}...")
    if repo_url.endswith("/"):
        repo_url = repo_url[:-1]

    downloaded = False
    for branch in ("main", "master"):
        zip_url = f"{repo_url}/archive/refs/heads/{branch}.zip"
        response = requests.get(zip_url, timeout=20)
        if response.status_code == 200:
            downloaded = True
            break
        print(f"Branch '{branch}' not found, trying next...")

    if not downloaded:
        raise RuntimeError(f"Failed to download repository — neither main nor master branch found.")

    zip_path = os.path.join(target_dir, "repo.zip")
    with open(zip_path, "wb") as f:
        f.write(response.content)

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


def gather_source_files(workspace_dir, max_files=10, max_bytes=30_000):
    """
    Recursively walks workspace_dir and collects source files across all
    meaningful languages and config file types. Returns a dict of
    {filepath: content_string}.

    Limits:
    - max_files  : maximum number of files passed to the AI (default 10)
    - max_bytes  : maximum individual file size in bytes (default 30 KB)
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
    If secret_findings is provided, they are prepended to the prompt so the
    model can suggest remediation for already-detected issues.

    Returns a tuple: (explanation: str, patched_code: str)
    """
    print("Sending code to Groq AI for security analysis...")

    # Build the prompt — language-agnostic, OWASP Top 10 focused
    prompt_parts = [
        "You are an elite application security engineer. Analyse the following source files "
        "for ALL OWASP Top 10 vulnerability categories including but not limited to: "
        "SQL/NoSQL injection, XSS, path traversal, hardcoded secrets and API keys, "
        "weak or missing authentication, insecure deserialization, broken access control, "
        "security misconfiguration, use of components with known vulnerabilities, and "
        "insufficient logging. The files may be in any language (JavaScript, TypeScript, "
        "Python, PHP, Java, Go, Ruby, shell scripts, config files, etc.).\n"
    ]

    if secret_findings:
        prompt_parts.append(
            f"\nPRE-SCAN DETECTED {len(secret_findings)} HARDCODED SECRET(S) — "
            "include remediation advice for each in your explanation:\n"
        )
        for f in secret_findings[:20]:  # cap to avoid blowing token budget
            prompt_parts.append(
                f"  - [{f['pattern']}] in {f['file']} line {f['line']}: {f['snippet']}\n"
            )

    prompt_parts.append(
        "\nReturn a JSON object with exactly two keys:\n"
        "'explanation': a detailed string describing every vulnerability found "
        "(or confirming the code is clean if none are found). "
        "For each issue include: severity (Critical/High/Medium/Low), "
        "affected file and line if known, and a specific fix recommendation.\n"
        "'patched_code': a single raw string with ALL corrected code patches concatenated "
        "(empty string if no patches are needed).\n"
        "Output ONLY the raw JSON object. No markdown, no preamble.\n\n"
        "--- SOURCE FILES ---\n"
    )

    for filepath, content in source_files.items():
        fname = os.path.basename(filepath)
        # Truncate very large files to stay within token budget
        trimmed = content[:8000] if len(content) > 8000 else content
        prompt_parts.append(f"\n=== {fname} ===\n{trimmed}\n")

    prompt = "".join(prompt_parts)

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":           "llama-3.3-70b-versatile",
        "messages":        [{"role": "user", "content": prompt}],
        "temperature":     0.0,
        "response_format": {"type": "json_object"},
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

        try:
            ai_data = json.loads(raw_content)
        except json.JSONDecodeError:
            print("AI returned non-JSON content — treating as empty result.")
            ai_data = {}

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
    patched_file_path = os.path.join(workspace_dir, "patched_script.js")

    if not (patched_code and patched_code.strip()):
        print("No patched code generated (code is clean or non-JS).")
        return

    print(f"Writing patched code to {patched_file_path}")
    with open(patched_file_path, "w", encoding="utf-8") as f:
        f.write(patched_code)

    print("Running Docker Sandbox Validation...")
    try:
        client      = docker.from_env()
        abs_workspace = os.path.abspath(workspace_dir)

        container = client.containers.run(
            "node:18-alpine",
            command="node --check /workspace/patched_script.js",
            volumes={abs_workspace: {"bind": "/workspace", "mode": "ro"}},
            network_disabled=True,  # SECURITY: no outbound from sandbox
            detach=True,
            remove=False,
        )

        exit_status = container.wait()
        logs        = container.logs().decode("utf-8")

        if exit_status["StatusCode"] == 0:
            print("Sandbox Validation: PASS")
        else:
            print("Sandbox Validation: FAIL")
            print(logs)

        container.remove()

    except Exception as e:
        print(f"ERROR: Docker validation failed: {str(e)}")


if __name__ == "__main__":
    repo_url = input("Enter Public GitHub Repository URL: ").strip()

    if not repo_url:
        print("ERROR: Repository URL is required.")
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
                apply_patch_and_validate(WORKSPACE_DIR, patched_code)

    finally:
        print("\nExecution finished.")
