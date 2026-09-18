import argparse
import os
import sys
import json
import subprocess
from getpass import getpass

# Adjust sys.path so we can import from backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv, set_key
load_dotenv()

from backend.core import gather_source_files, scan_for_secrets, apply_patch_and_validate
from backend.langchain_pipeline import run_pipeline
from backend.github_utils import create_github_pr

def get_git_info(target_dir):
    try:
        url = subprocess.check_output(["git", "remote", "get-url", "origin"], cwd=target_dir, stderr=subprocess.DEVNULL).decode().strip()
        branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=target_dir, stderr=subprocess.DEVNULL).decode().strip()
        return url, branch
    except Exception:
        return None, None

def ensure_api_key(env_path):
    if not os.getenv("GROQ_API_KEY"):
        print("\n🔑 GROQ_API_KEY is not set.")
        key = getpass("Please enter your Groq API Key (input hidden): ").strip()
        if key:
            os.environ["GROQ_API_KEY"] = key
            save = input("Save to .env for future use? [y/N]: ").strip().lower()
            if save == 'y':
                if not os.path.exists(env_path):
                    open(env_path, 'a').close()
                set_key(env_path, "GROQ_API_KEY", key)
                print("Saved to .env")
        else:
            print("API Key is required to run the AI scan.")
            sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="ResilioCheck CLI - Deep Security Analysis")
    parser.add_argument("path", nargs="?", default=".", help="Local directory path to scan")
    parser.add_argument("--max-files", type=int, default=500, help="Maximum number of files to analyze")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    
    args = parser.parse_args()

    target_dir = os.path.abspath(args.path)
    if not os.path.isdir(target_dir):
        print(f"Error: {target_dir} is not a valid directory.")
        sys.exit(1)

    env_path = os.path.join(target_dir, ".env")
    if not os.path.exists(env_path):
        env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    
    ensure_api_key(env_path)

    print(f"\n🚀 Scanning directory: {target_dir} ...")
    
    source_files = gather_source_files(target_dir, max_files=args.max_files, max_bytes=1000000)
    
    if not source_files:
        print("No scannable source files found.")
        sys.exit(0)
        
    print(f"Found {len(source_files)} source file(s) for analysis.")
    
    rel_files = {os.path.relpath(p, target_dir).replace("\\", "/"): c for p, c in source_files.items()}
    
    secret_findings = scan_for_secrets(source_files)
    if secret_findings:
        print(f"\n⚠️  Found {len(secret_findings)} secret(s):")
        for f in secret_findings:
            print(f"  [{f['severity']}] {f['pattern']} at {f['file']}:{f['line']} -> {f['snippet']}")
    else:
        print("\n✅ No secrets found.")

    print("\n🧠 Running Deep AI Analysis...")
    result = run_pipeline(rel_files, secret_findings)
    
    sandbox_verdict = "SKIPPED"
    if result.get("patched_code"):
        print("\n⚙️ Applying AI Patch in Sandbox...")
        sandbox_verdict, logs = apply_patch_and_validate(
            target_dir, 
            result["patched_code"], 
            result.get("patched_filename", "patch.txt")
        )

    if args.json:
        result["sandbox_verdict"] = sandbox_verdict
        print(json.dumps(result, indent=2))
        return

    print("\n" + "="*50)
    print(f" GATE VERDICT: {result['gate']}")
    print("="*50)
    print(f"Rationale: {result['gate_rationale']}\n")
    
    if result.get("explanation"):
        print("🔍 EXPLANATION:")
        print(result["explanation"])
        print()
        
    if result.get("patched_code"):
        print(f"🛠️ PATCH GENERATED for {result.get('patched_filename')}")
        print(f"Sandbox Validation: {sandbox_verdict}")
        print("\n```")
        print(result["patched_code"])
        print("```\n")

        repo_url, branch = get_git_info(target_dir)
        if repo_url and branch and "github.com" in repo_url:
            print(f"📌 Detected GitHub Repository: {repo_url} (Branch: {branch})")
            auto_pr = input("Would you like to automatically create a GitHub Pull Request with this fix? [y/N]: ").strip().lower()
            if auto_pr == 'y':
                github_token = os.getenv("GITHUB_TOKEN")
                if not github_token:
                    github_token = getpass("Please enter your GitHub Personal Access Token (input hidden): ").strip()
                    if github_token:
                        save_gh = input("Save GITHUB_TOKEN to .env for future use? [y/N]: ").strip().lower()
                        if save_gh == 'y':
                            if not os.path.exists(env_path):
                                open(env_path, 'a').close()
                            set_key(env_path, "GITHUB_TOKEN", github_token)
                            print("Saved to .env")
                    else:
                        print("GitHub Token is required for Auto-PR. Skipping.")
                        return

                print("\n🚀 Pushing fix to GitHub and opening Pull Request...")
                try:
                    pr_url, target_branch = create_github_pr(
                        github_token=github_token,
                        repo_url=repo_url,
                        base_branch=branch,
                        branch_name="resiliocheck-cli-fix",
                        patched_file=result.get("patched_filename", "patch.txt"),
                        patched_code=result["patched_code"],
                        scan_id="CLI",
                        gate=result["gate"],
                        gate_rationale=result["gate_rationale"],
                        explanation=result["explanation"],
                        critical_count=result.get("critical_count", 0),
                        high_count=result.get("high_count", 0),
                        tag_user=None,
                        direct=False
                    )
                    print(f"✅ Success! Pull Request created: {pr_url}")
                except Exception as e:
                    print(f"❌ Failed to create Pull Request: {e}")
        else:
            print("Not a recognized GitHub repository. Auto-PR skipped.")

if __name__ == "__main__":
    main()

