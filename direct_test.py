# direct_test.py
import os
import requests
from groq import Groq

print("🚀 STARTING DIRECT RESILIOCHECK VALIDATION TEST...")

# 1. Force verify the Groq Key
api_key = os.getenv("GROQ_API_KEY", "PASTE_YOUR_GROQ_KEY_HERE")
if "gsk_" not in api_key:
    print("❌ ERROR: Your GROQ_API_KEY is missing or invalid in your environment!")
    exit()

# 2. Test a direct request to the Llama 3.3 Engine on Port 8001
test_payload = {
    "file_path": "app.py",
    "code": "import sqlite3\n\ndef login(user, pas):\n    # Intentional Flaw\n    return sqlite3.execute(f'SELECT * FROM users WHERE u={user}')"
}

print("🧠 Testing communication with AI Engine on Port 8001...")
try:
    response = requests.post("http://localhost:8001/analyze", json=test_payload, timeout=10)
    print("📥 RAW ENGINE RESPONSE SUCCESSFULLY RECEIVED:")
    print(response.json())
except Exception as e:
    print(f"❌ CONNECTION FAILED: Port 8001 engine is not running or crashed. Error: {str(e)}")
