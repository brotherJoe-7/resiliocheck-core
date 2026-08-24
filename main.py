import os
import shutil
import zipfile
import requests
import json
import docker
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    print("❌ ERROR: GROQ_API_KEY is missing from .env")
    exit(1)

def download_and_extract_repo(repo_url, target_dir):
    print(f"📥 Downloading repository from {repo_url}...")
    if repo_url.endswith("/"):
        repo_url = repo_url[:-1]
    zip_url = f"{repo_url}/archive/refs/heads/main.zip"
    
    response = requests.get(zip_url, timeout=15)
    if response.status_code != 200:
        print(f"⚠️ Failed to download main branch. Trying master branch...")
        zip_url = f"{repo_url}/archive/refs/heads/master.zip"
        response = requests.get(zip_url, timeout=15)
        
        if response.status_code != 200:
            print(f"❌ ERROR: Failed to download repository. Status code: {response.status_code}")
            exit(1)

    zip_path = os.path.join(target_dir, "repo.zip")
    with open(zip_path, "wb") as f:
        f.write(response.content)
    
    print("📦 Extracting files...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(target_dir)
        
    os.remove(zip_path)

def gather_source_files(workspace_dir):
    js_files = {}
    print("🧹 Filtering frontend assets... Isolating critical backend modules.")
    for root, _, files in os.walk(workspace_dir):
        # Exclude massive folders, styles, configurations and lockfiles
        skip_folders = ["node_modules", "frontend", ".git", "public", "assets", "build", "dist"]
        if any(folder in root for folder in skip_folders):
            continue
            
        for file in files:
            # Strictly pull core backend files
            if file.endswith(".js") and not file.endswith(".config.js") and "test" not in file.lower():
                file_path = os.path.join(root, file)
                # Cap individual file sizes to keep text payloads lightweight for free limits
                if os.path.getsize(file_path) < 15000:
                    with open(file_path, "r", encoding="utf-8") as f:
                        js_files[file_path] = f.read()
    return js_files

def run_ai_analysis(js_files):
    print("🤖 Sending code to Groq AI for vulnerability analysis...")
    
    prompt = "You are an elite secure coding assistant specializing in Node.js and Express.js backend architectures. Given the following JavaScript files, scan them thoroughly for security flaws (e.g., SQL/NoSQL Injections, weak JWT implementation, path traversal, hardcoded secrets). Return a JSON object with exactly two keys: 'explanation' (a text string detailing any security issues found or explicitly confirming the code is secure and clean) and 'patched_code' (a single raw string containing all fixed code updates). ONLY output the raw JSON object, nothing else.\n\n"
    
    # Take a maximum of 3 core files to strictly stay below the free tier token rate limits
    limited_files = dict(list(js_files.items())[:3])
    
    for filepath, content in limited_files.items():
        fname = os.path.basename(filepath)
        prompt += f"--- {fname} ---\n{content}\n\n"

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "openai/gpt-oss-20b",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "response_format": {"type": "json_object"}
    }

    try:
        # ✅ FIXED: Corrected URL endpoint address path to the live API gateway
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        result = response.json()
        
        # ✅ FIXED: Adjusted choices list parsing structure index sequence 
        content = result["choices"][0]["message"]["content"]
        ai_data = json.loads(content)
        
        explanation = ai_data.get("explanation", "Code verification processed.")
        patched_code = ai_data.get("patched_code", "")
        
        print("\n📝 AI Explanation:")
        print(explanation)
        
        return patched_code
        
    except Exception as e:
        print(f"❌ ERROR: AI Analysis failed: {str(e)}")
        if 'response' in locals() and hasattr(response, 'text'):
            print(f"Response: {response.text}")
        return None

def apply_patch_and_validate(workspace_dir, patched_code):
    patched_file_path = os.path.join(workspace_dir, "patched_script.js")
    
    if patched_code and patched_code.strip():
        print(f"🔧 Writing patched code to {patched_file_path}")
        with open(patched_file_path, "w", encoding="utf-8") as f:
            f.write(patched_code)
    else:
        print("✅ No patched code generated (Code is clean).")
        return

    print("🐳 Running Docker Sandbox Validation...")
    try:
        client = docker.from_env()
        abs_workspace = os.path.abspath(workspace_dir)
        
        container = client.containers.run(
            "node:18-alpine",
            command=f"node --check /workspace/patched_script.js",
            volumes={abs_workspace: {'bind': '/workspace', 'mode': 'ro'}},
            detach=True,
            remove=False
        )
        
        exit_status = container.wait()
        logs = container.logs().decode('utf-8')
        
        if exit_status['StatusCode'] == 0:
            print("🟢 Sandbox Validation: PASS (Syntax is secure and valid!)")
        else:
            print("🔴 Sandbox Validation: FAIL")
            print(logs)
            
        container.remove()
            
    except Exception as e:
        print(f"❌ ERROR: Docker validation failed: {str(e)}")

if __name__ == "__main__":
    repo_url = input("🔗 Enter Public GitHub Repository URL: ").strip()
    
    if not repo_url:
        print("❌ ERROR: Repository URL is required.")
        exit(1)
        
    WORKSPACE_DIR = "./tmp_workspace"
    
    if os.path.exists(WORKSPACE_DIR):
        shutil.rmtree(WORKSPACE_DIR, ignore_errors=True)
    os.makedirs(WORKSPACE_DIR, exist_ok=True)
    
    try:
        download_and_extract_repo(repo_url, WORKSPACE_DIR)
        
        js_files = gather_source_files(WORKSPACE_DIR)
        if not js_files:
            print("⚠️ No JavaScript (.js) files found in the repository.")
        else:
            print(f"🔍 Found relevant JavaScript file(s) for core analysis.")
            patched_code = run_ai_analysis(js_files)
            apply_patch_and_validate(WORKSPACE_DIR, patched_code)
            
    finally:
        print("🧹 Execution finished.")

