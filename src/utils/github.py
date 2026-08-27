"""
utils/github.py
===============
GitHub API utilities for automated PR creation and management.
"""

import base64
import logging
import re
import requests
from typing import Dict, Optional, Tuple
from urllib.parse import quote

logger = logging.getLogger("resiliocheck.github")

# ✅ SECURITY: strict 'owner/repo' allowlist — every repo name is validated
# before being interpolated into a GitHub API URL (prevents URL/path injection).
_REPO_RE   = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9\-]{0,38})/[A-Za-z0-9._\-]{1,100}$")
_BRANCH_RE = re.compile(r"^[A-Za-z0-9._\-/]{1,255}$")


def _safe_repo(repo_full_name: str) -> str:
    if not _REPO_RE.fullmatch(repo_full_name):
        raise ValueError(f"Invalid repository name: {repo_full_name!r}")
    return repo_full_name


def _safe_branch(branch: str) -> str:
    if not _BRANCH_RE.fullmatch(branch) or ".." in branch:
        raise ValueError(f"Invalid branch name: {branch!r}")
    return branch


class GitHubApp:
    def __init__(self, token: str):
        self.token = token
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json"
        }
        self.api_url = "https://api.github.com"

    def get_default_branch(self, repo_full_name: str) -> str:
        url = f"{self.api_url}/repos/{_safe_repo(repo_full_name)}"
        resp = requests.get(url, headers=self.headers, timeout=10)
        resp.raise_for_status()
        return resp.json().get("default_branch", "main")

    def create_branch(self, repo_full_name: str, base_branch: str, new_branch: str) -> bool:
        repo_full_name = _safe_repo(repo_full_name)
        base_branch, new_branch = _safe_branch(base_branch), _safe_branch(new_branch)
        # Get base branch SHA
        ref_url = f"{self.api_url}/repos/{repo_full_name}/git/refs/heads/{quote(base_branch, safe='/')}"
        resp = requests.get(ref_url, headers=self.headers, timeout=10)
        resp.raise_for_status()
        base_sha = resp.json()["object"]["sha"]

        # Create new branch
        create_url = f"{self.api_url}/repos/{repo_full_name}/git/refs"
        payload = {
            "ref": f"refs/heads/{new_branch}",
            "sha": base_sha
        }
        create_resp = requests.post(create_url, headers=self.headers, json=payload, timeout=10)
        
        # 422 usually means branch already exists
        if create_resp.status_code == 422:
            return True
        create_resp.raise_for_status()
        return True

    def commit_file(self, repo_full_name: str, branch: str, file_path: str, new_content: str, message: str) -> bool:
        repo_full_name = _safe_repo(repo_full_name)
        branch = _safe_branch(branch)
        # ✅ SECURITY: normalise the file path — strip leading slashes, reject
        # traversal segments, and URL-encode each component.
        file_path = file_path.replace("\\", "/").lstrip("/")
        if ".." in file_path.split("/") or not file_path:
            raise ValueError(f"Invalid file path: {file_path!r}")
        encoded_path = "/".join(quote(part, safe="") for part in file_path.split("/"))
        url = f"{self.api_url}/repos/{repo_full_name}/contents/{encoded_path}"
        
        # Check if file exists to get its SHA
        get_resp = requests.get(f"{url}?ref={quote(branch, safe='')}", headers=self.headers, timeout=10)
        file_sha = None
        if get_resp.status_code == 200:
            file_sha = get_resp.json().get("sha")

        encoded_content = base64.b64encode(new_content.encode("utf-8")).decode("utf-8")
        payload = {
            "message": message,
            "content": encoded_content,
            "branch": branch
        }
        if file_sha:
            payload["sha"] = file_sha

        put_resp = requests.put(url, headers=self.headers, json=payload, timeout=10)
        put_resp.raise_for_status()
        return True

    def create_pull_request(self, repo_full_name: str, head_branch: str, base_branch: str, title: str, body: str) -> Tuple[str, int]:
        repo_full_name = _safe_repo(repo_full_name)
        head_branch, base_branch = _safe_branch(head_branch), _safe_branch(base_branch)
        url = f"{self.api_url}/repos/{repo_full_name}/pulls"
        payload = {
            "title": title,
            "head": head_branch,
            "base": base_branch,
            "body": body
        }
        resp = requests.post(url, headers=self.headers, json=payload, timeout=10)
        
        # 422 often means PR already exists
        if resp.status_code == 422:
            # Find the existing PR
            get_resp = requests.get(f"{url}?head={repo_full_name.split('/')[0]}:{head_branch}", headers=self.headers, timeout=10)
            if get_resp.status_code == 200 and len(get_resp.json()) > 0:
                pr = get_resp.json()[0]
                return pr["html_url"], pr["number"]
            
        resp.raise_for_status()
        data = resp.json()
        return data["html_url"], data["number"]

    def merge_pull_request(self, repo_full_name: str, pr_number: int) -> bool:
        url = f"{self.api_url}/repos/{_safe_repo(repo_full_name)}/pulls/{int(pr_number)}/merge"
        resp = requests.put(url, headers=self.headers, timeout=10)
        resp.raise_for_status()
        return True

    def close_pull_request(self, repo_full_name: str, pr_number: int) -> bool:
        url = f"{self.api_url}/repos/{_safe_repo(repo_full_name)}/pulls/{int(pr_number)}"
        payload = {"state": "closed"}
        resp = requests.patch(url, headers=self.headers, json=payload, timeout=10)
        resp.raise_for_status()
        return True

    def get_pull_request_status(self, repo_full_name: str, pr_number: int) -> dict:
        url = f"{self.api_url}/repos/{_safe_repo(repo_full_name)}/pulls/{int(pr_number)}"
        resp = requests.get(url, headers=self.headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return {
            "state": data.get("state"),
            "merged": data.get("merged", False),
            "html_url": data.get("html_url")
        }
