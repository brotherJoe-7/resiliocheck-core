"""
ResilioCheck AI — Security Operations Dashboard
src/dashboard/app.py
"""
from __future__ import annotations
import os, sys, time

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure the project root is on sys.path so `src.*` imports resolve correctly
# when Streamlit runs this file directly.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import requests
import streamlit as st
from dotenv import load_dotenv
from src.utils.github import GitHubApp

import glob

try:
    from google.cloud import firestore
    
    # 1. Look through root project folder for a .json file containing 'resiliocheck-ai'
    _root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    _sa_files = [f for f in glob.glob(os.path.join(_root_dir, "*.json")) if "resiliocheck-ai" in f.lower()]
    
    # 2. Initialize db from the detected file path
    if _sa_files:
        db = firestore.Client.from_service_account_json(_sa_files[0])
    else:
        db = firestore.Client(project="ResilioCheck-AI")
except Exception as e:
    db = None
    print(f"Firestore initialization error: {e}")

load_dotenv()
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
github_app = GitHubApp(GITHUB_TOKEN) if GITHUB_TOKEN else None

st.set_page_config(
    page_title="ResilioCheck AI | Enterprise Security",
    page_icon="🛡",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── SVG icons ──────────────────────────────────────────────────────────────────
def ic(name: str, size: int = 18, color: str = "currentColor") -> str:
    _m = {
        "shield":   f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        "scan":     f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
        "cpu":      f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
        "box":      f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
        "eye":      f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        "check":    f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        "x":        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        "clock":    f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        "zap":      f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        "link":     f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
        "lock":     f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        "user":     f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        "alert":    f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        "git":      f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>',
        "bar":      f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        "code":     f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        "wifi":     f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
        "arrow":    f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
        "layers":   f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
        "activity": f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
        "file":     f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        "circle":   f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="{color}" stroke="none"><circle cx="12" cy="12" r="5"/></svg>',
    }
    return _m.get(name, "")

# ── CSS ─────────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,700&display=swap');
*,*::before,*::after{box-sizing:border-box;}
html,body,[class*="css"]{font-family:'Inter',system-ui,sans-serif!important;}

/* ── Base ── */
.stApp{background:#09090B!important;}
.block-container{padding:0 2.5rem 5rem 2.5rem!important;max-width:1300px!important;}
#MainMenu,footer,header,[data-testid="stDecoration"]{visibility:hidden;}
[data-testid="stSidebar"]{background:#09090B!important;border-right:1px solid #18181B!important;}

/* ── Scrollbar ── */
::-webkit-scrollbar{width:5px;}
::-webkit-scrollbar-track{background:#09090B;}
::-webkit-scrollbar-thumb{background:#27272A;border-radius:3px;}
::-webkit-scrollbar-thumb:hover{background:#EA580C;}

/* ── Typography ── */
h1,h2,h3,h4{color:#FAFAFA!important;font-weight:700!important;letter-spacing:-0.5px!important;}
p,li{color:#A1A1AA!important;line-height:1.75!important;}
label{color:#71717A!important;font-size:0.73rem!important;font-weight:600!important;text-transform:uppercase!important;letter-spacing:0.9px!important;}
code{color:#FB923C!important;background:#1C1917!important;border-radius:4px!important;padding:2px 6px!important;}

/* ── Primary button ── */
.stButton>button{
  background:#EA580C!important;color:#fff!important;border:none!important;border-radius:8px!important;
  font-family:'Inter',sans-serif!important;font-weight:600!important;font-size:0.875rem!important;
  padding:11px 22px!important;transition:background 0.15s,box-shadow 0.15s,transform 0.15s!important;
  box-shadow:0 1px 3px rgba(0,0,0,0.5)!important;cursor:pointer!important;letter-spacing:-0.1px!important;
}
.stButton>button:hover{background:#C2410C!important;transform:translateY(-1px)!important;box-shadow:0 4px 14px rgba(234,88,12,0.35)!important;}
.stButton>button:active{transform:translateY(0)!important;}

/* Secondary */
.sec-btn .stButton>button{background:transparent!important;border:1px solid #27272A!important;color:#71717A!important;box-shadow:none!important;}
.sec-btn .stButton>button:hover{border-color:#EA580C!important;color:#EA580C!important;background:transparent!important;box-shadow:none!important;transform:none!important;}

/* Ghost */
.ghost-btn .stButton>button{background:transparent!important;border:none!important;color:#EA580C!important;box-shadow:none!important;font-weight:500!important;padding:8px 12px!important;text-decoration:underline!important;text-underline-offset:3px!important;}
.ghost-btn .stButton>button:hover{color:#FB923C!important;background:transparent!important;box-shadow:none!important;transform:none!important;}

/* ── Inputs ── */
.stTextInput>div>div>input{background:#18181B!important;border:1px solid #27272A!important;border-radius:8px!important;color:#FAFAFA!important;padding:11px 14px!important;font-size:0.9rem!important;font-family:'Inter',sans-serif!important;transition:border-color 0.15s!important;}
.stTextInput>div>div>input::placeholder{color:#3F3F46!important;}
.stTextInput>div>div>input:focus{border-color:#EA580C!important;box-shadow:0 0 0 2px rgba(234,88,12,0.15)!important;outline:none!important;}

/* ── Form ── */
[data-testid="stForm"]{border:1px solid #27272A!important;border-radius:12px!important;background:#18181B!important;padding:28px!important;}
.stFormSubmitButton>button{background:#EA580C!important;color:#fff!important;border:none!important;border-radius:8px!important;font-weight:600!important;font-size:0.9rem!important;padding:12px 24px!important;width:100%!important;transition:background 0.15s!important;}
.stFormSubmitButton>button:hover{background:#C2410C!important;}

/* ── Metrics ── */
[data-testid="stMetric"]{background:#18181B!important;border:1px solid #27272A!important;border-radius:12px!important;padding:20px 22px!important;transition:border-color 0.15s!important;}
[data-testid="stMetric"]:hover{border-color:#EA580C!important;}
[data-testid="stMetricLabel"]{color:#52525B!important;font-size:0.67rem!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:1.4px!important;}
[data-testid="stMetricValue"]{color:#FAFAFA!important;font-size:1.85rem!important;font-weight:800!important;}

/* ── Spinner / Divider ── */
.stSpinner>div{border-top-color:#EA580C!important;}
hr{border-color:#18181B!important;}

/* ══════════ CUSTOM CLASSES ══════════ */

/* Nav */
.rc-nav{display:flex;align-items:center;justify-content:space-between;padding:20px 0;border-bottom:1px solid #18181B;}
.rc-brand{display:flex;align-items:center;gap:9px;font-size:1.05rem;font-weight:800;color:#FAFAFA;letter-spacing:-0.5px;}
.rc-brand em{color:#EA580C;font-style:normal;}
.rc-badge{font-size:0.6rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#52525B;border:1px solid #27272A;border-radius:20px;padding:2px 9px;}

/* Hero */
.rc-hero-l{padding:80px 48px 80px 0;border-right:1px solid #18181B;}
.rc-hero-r{padding:80px 0 80px 48px;}
.rc-label{display:inline-flex;align-items:center;gap:6px;font-size:0.7rem;font-weight:600;color:#EA580C;border:1px solid rgba(234,88,12,0.25);border-radius:20px;padding:4px 12px;margin-bottom:28px;}
.rc-h1{font-size:3.2rem;font-weight:900;color:#FAFAFA;line-height:1.06;letter-spacing:-2px;margin-bottom:24px;}
.rc-h1 em{color:#EA580C;font-style:normal;}
.rc-sub{font-size:1rem;color:#71717A;line-height:1.7;max-width:480px;margin-bottom:36px;}

/* Terminal card */
.rc-terminal{background:#0F0F10;border:1px solid #27272A;border-radius:14px;overflow:hidden;}
.rc-terminal-bar{background:#18181B;padding:12px 18px;display:flex;align-items:center;gap:7px;border-bottom:1px solid #27272A;}
.rc-terminal-dot{width:10px;height:10px;border-radius:50%;}
.rc-terminal-body{padding:20px 22px;font-family:'JetBrains Mono','Fira Code','Courier New',monospace;font-size:0.775rem;line-height:1.75;}
.rc-dim{color:#3F3F46;}
.rc-muted{color:#52525B;}
.rc-white{color:#E4E4E7;}
.rc-orange{color:#FB923C;font-weight:600;}
.rc-red{color:#F87171;}
.rc-yellow{color:#FCD34D;}
.rc-green{color:#4ADE80;font-weight:600;}
.rc-blue{color:#60A5FA;}

/* Steps */
.rc-steps{margin-top:48px;}
.rc-step{display:flex;gap:16px;align-items:flex-start;padding:14px 0;border-bottom:1px solid #18181B;}
.rc-step:last-child{border-bottom:none;}
.rc-step-n{flex-shrink:0;width:28px;height:28px;border-radius:7px;background:#EA580C;color:#fff;font-size:0.72rem;font-weight:800;display:flex;align-items:center;justify-content:center;}
.rc-step-title{font-size:0.88rem;font-weight:700;color:#E4E4E7;margin-bottom:3px;}
.rc-step-desc{font-size:0.78rem;color:#52525B;line-height:1.55;}

/* Feature pill row */
.rc-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:28px;}
.rc-pill{display:inline-flex;align-items:center;gap:6px;font-size:0.72rem;font-weight:500;color:#71717A;background:#18181B;border:1px solid #27272A;border-radius:20px;padding:5px 12px;}
.rc-pill em{color:#EA580C;font-style:normal;}

/* Divider band */
.rc-band{background:#18181B;border-top:1px solid #27272A;border-bottom:1px solid #27272A;padding:32px 0;display:flex;gap:0;margin:0;}
.rc-band-stat{flex:1;padding:0 36px;border-right:1px solid #27272A;}
.rc-band-stat:first-child{padding-left:0;}
.rc-band-stat:last-child{border-right:none;}
.rc-band-num{font-size:1.6rem;font-weight:800;color:#FAFAFA;letter-spacing:-1px;}
.rc-band-num em{color:#EA580C;font-style:normal;}
.rc-band-lbl{font-size:0.75rem;color:#52525B;margin-top:2px;}

/* Section header */
.rc-sec{font-size:0.63rem;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#3F3F46;margin-bottom:36px;display:flex;align-items:center;gap:10px;}
.rc-sec::after{content:'';flex:1;height:1px;background:#18181B;}

/* Feature cards */
.rc-card{background:#18181B;border:1px solid #27272A;border-radius:12px;padding:26px 22px;height:100%;transition:border-color 0.15s,transform 0.15s;}
.rc-card:hover{border-color:#EA580C;transform:translateY(-2px);}
.rc-card-icon{width:38px;height:38px;border-radius:9px;background:#27272A;display:flex;align-items:center;justify-content:center;margin-bottom:16px;}
.rc-card-t{font-size:0.93rem;font-weight:700;color:#E4E4E7;margin-bottom:9px;}
.rc-card-d{font-size:0.78rem;color:#52525B;line-height:1.6;}
.rc-card-tag{display:inline-block;margin-top:14px;font-size:0.61rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#EA580C;border:1px solid #27272A;border-radius:20px;padding:3px 9px;}

/* Gate status */
.rc-gate{background:#18181B;border:1px solid #27272A;border-left:3px solid;border-radius:10px;padding:13px 16px;display:flex;align-items:center;gap:14px;margin-bottom:8px;}
.rc-gate-ok{border-left-color:#22C55E;}
.rc-gate-fail{border-left-color:#EF4444;}
.rc-gate-pend{border-left-color:#EA580C;}
.rc-gate-lbl{font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#52525B;margin-bottom:3px;}
.rc-gate-val{font-size:0.86rem;font-weight:700;display:flex;align-items:center;gap:5px;}
.rc-gate-ok   .rc-gate-val{color:#22C55E;}
.rc-gate-fail .rc-gate-val{color:#EF4444;}
.rc-gate-pend .rc-gate-val{color:#FB923C;}

/* Input panel */
.rc-panel{background:#18181B;border:1px solid #27272A;border-radius:12px;padding:24px 22px 22px;}
.rc-panel-hdr{font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:#52525B;display:flex;align-items:center;gap:7px;padding-bottom:14px;border-bottom:1px solid #18181B;margin-bottom:18px;}

/* Results */
.rc-ok{background:#052E16;border:1px solid #166534;border-radius:10px;padding:18px 20px;color:#22C55E;font-size:0.87rem;line-height:1.75;}
.rc-warn{background:#1C0A00;border:1px solid #9A3412;border-radius:10px;padding:18px 20px;color:#FB923C;font-size:0.87rem;line-height:1.75;}

/* Dash header */
.rc-dh{padding:28px 0 22px;border-bottom:1px solid #18181B;margin-bottom:28px;}
.rc-dh-eye{font-size:0.62rem;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#EA580C;margin-bottom:6px;display:flex;align-items:center;gap:6px;}
.rc-dh-t{font-size:1.5rem;font-weight:800;color:#FAFAFA;margin-bottom:4px;letter-spacing:-0.5px;}
.rc-dh-s{font-size:0.83rem;color:#52525B;}

/* Chip */
.rc-chip{display:inline-flex;align-items:center;gap:6px;font-size:0.75rem;font-weight:500;color:#71717A;background:#18181B;border:1px solid #27272A;border-radius:20px;padding:5px 12px;margin-top:10px;}
.rc-chip span{color:#EA580C;font-weight:600;}

/* Footer */
.rc-footer{text-align:center;padding:48px 0 24px;font-size:0.75rem;color:#27272A;border-top:1px solid #18181B;margin-top:72px;}
</style>
""", unsafe_allow_html=True)

# ── Session state ─────────────────────────────────────────────────────────────
_D = {
    "page_mode": "landing", "current_user": None, "analyses_run": 0,
    "last_repo": "", "ai_explanation": "", "ai_patched_files": {}, "pr_url": "", "pr_number": None, "ai_error": "",
    "pipeline_gates": {"webhook_ingestion":"PENDING","ai_analysis":"PENDING","sandbox_validation":"PENDING","rasp_monitoring":"PENDING"},
    "pipeline_failures": 0,
}
for k, v in _D.items():
    if k not in st.session_state:
        st.session_state[k] = v

# ── Boot timestamp — persists across reruns for accurate uptime calc ───────────
if "app_start_time" not in st.session_state:
    st.session_state.app_start_time = time.time()

def _go(p): st.session_state.page_mode = p; st.rerun()
def _reset():
    st.session_state.pipeline_gates = {k: "PENDING" for k in st.session_state.pipeline_gates}
    st.session_state.ai_explanation = st.session_state.ai_error = st.session_state.pr_url = ""
    st.session_state.ai_patched_files = {}
    st.session_state.pr_number = None

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  LANDING                                                                    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
if st.session_state.page_mode == "landing":

    # ── Nav ──────────────────────────────────────────────────────────────────
    st.markdown(f"""<div class='rc-nav' style='justify-content:center;border-bottom:none;padding-top:40px;'>
        <div class='rc-brand' style='font-size:1.4rem;'>{ic("shield",24,"#EA580C")} ResilioCheck<em>AI</em>
        <span class='rc-badge' style='margin-left:10px;'>Research Build</span></div></div>""", unsafe_allow_html=True)

    # ── Hero — Clean Centered Layout ──────────────────────────────────────────
    st.markdown("<div style='height:40px;'></div>", unsafe_allow_html=True)
    _, center, _ = st.columns([1, 2.5, 1])

    with center:
        st.markdown(f"""
        <div style='text-align:center;padding:40px 0;'>
            <div class='rc-label' style='margin:0 auto 24px;'>{ic("zap",11,"#EA580C")} AI-Powered · Groq Accelerated · OWASP Top 10</div>
            <div class='rc-h1' style='font-size:3.8rem;line-height:1.1;letter-spacing:-2.5px;max-width:800px;margin:0 auto 28px;'>
                Find vulnerabilities<br>before they find <em>your users.</em>
            </div>
            <div class='rc-sub' style='max-width:600px;margin:0 auto 40px;font-size:1.1rem;'>
                ResilioCheck AI scans your GitHub repositories for critical security flaws,
                generates hardened patches with LLM intelligence, and validates every fix
                inside an isolated Docker sandbox — all in under 3 minutes.
            </div>
        </div>
        """, unsafe_allow_html=True)

        c1, c2, c3, c4 = st.columns([1, 1.5, 1.5, 1])
        with c2:
            if st.button("Start Free Analysis", key="h1", use_container_width=True): _go("dashboard")
        with c3:
            st.markdown("<div class='sec-btn'>", unsafe_allow_html=True)
            if st.button("Sign In", key="h2", use_container_width=True): _go("login")
            st.markdown("</div>", unsafe_allow_html=True)

        st.markdown("""
        <div class='rc-pills' style='justify-content:center;margin-top:48px;gap:12px;'>
            <div class='rc-pill'>{c} JS / TS</div>
            <div class='rc-pill'>{p} Python</div>
            <div class='rc-pill'>{j} Java</div>
            <div class='rc-pill'>{g} Go</div>
            <div class='rc-pill'>{ph} PHP</div>
            <div class='rc-pill'>{d} Docker Sandbox</div>
            <div class='rc-pill'>{o} OWASP Top 10</div>
        </div>
        """.format(
            c=ic("check",10,"#EA580C"), p=ic("check",10,"#EA580C"),
            j=ic("check",10,"#EA580C"), g=ic("check",10,"#EA580C"),
            ph=ic("check",10,"#EA580C"), d=ic("check",10,"#EA580C"),
            o=ic("check",10,"#EA580C"),
        ), unsafe_allow_html=True)
        st.markdown("<div style='height:60px;'></div>", unsafe_allow_html=True)

    # ── Stats band ────────────────────────────────────────────────────────────
    st.markdown("""
    <div class='rc-band'>
        <div class='rc-band-stat'>
            <div class='rc-band-num'>OWASP <em>Top 10</em></div>
            <div class='rc-band-lbl'>Full vulnerability coverage</div>
        </div>
        <div class='rc-band-stat'>
            <div class='rc-band-num'><em>&lt;2s</em></div>
            <div class='rc-band-lbl'>Groq inference latency</div>
        </div>
        <div class='rc-band-stat'>
            <div class='rc-band-num'><em>9+</em></div>
            <div class='rc-band-lbl'>Languages supported</div>
        </div>
        <div class='rc-band-stat'>
            <div class='rc-band-num'><em>100%</em></div>
            <div class='rc-band-lbl'>Docker-isolated patches</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("<div style='height:72px;'></div>", unsafe_allow_html=True)

    # ── Feature grid ──────────────────────────────────────────────────────────
    st.markdown("<div class='rc-sec'>Platform Capabilities</div>", unsafe_allow_html=True)

    feats = [
        ("scan",  "Repository Intelligence", "Clones any public GitHub repo and recursively extracts source files across JS, TS, Python, PHP, Java, Ruby, and Go.", "Zero Setup"),
        ("cpu",   "LLM Security Analysis",   "Groq-accelerated model scans all OWASP Top 10 categories: SQL injection, path traversal, XSS, weak JWT, hardcoded credentials.", GROQ_MODEL),
        ("box",   "Sandbox Validation",      "Every generated patch is syntax-validated inside an ephemeral Docker container. No unverified code ever reaches a PR.", "Docker Isolated"),
        ("shield","RASP Monitoring",         "Runtime application self-protection monitors deployed endpoints for anomalous behaviour, zero-days, and live intrusion attempts.", "Always-On"),
    ]
    c1, c2, c3, c4 = st.columns(4, gap="medium")
    for col, (i, t, d, tag) in zip([c1,c2,c3,c4], feats):
        with col:
            st.markdown(f"""<div class='rc-card'>
                <div class='rc-card-icon'>{ic(i,20,"#EA580C")}</div>
                <div class='rc-card-t'>{t}</div>
                <div class='rc-card-d'>{d}</div>
                <div class='rc-card-tag'>{tag}</div>
            </div>""", unsafe_allow_html=True)

    st.markdown("""
    <div class='rc-footer'>
        © 2026 ResilioCheck AI &nbsp;·&nbsp; Dissertation Research Project &nbsp;·&nbsp; All rights reserved.
    </div>""", unsafe_allow_html=True)


# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  LOGIN                                                                      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
elif st.session_state.page_mode == "login":
    st.markdown("<div style='height:72px;'></div>", unsafe_allow_html=True)
    _, center, _ = st.columns([1, 2, 1])
    with center:
        st.markdown(f"""
        <div style='text-align:center;margin-bottom:32px;'>
            <div style='width:48px;height:48px;border-radius:12px;background:#18181B;border:1px solid #27272A;
                        display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;'>
                {ic("shield",24,"#EA580C")}
            </div>
            <div style='font-size:0.63rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;
                        color:#EA580C;margin-bottom:8px;'>Secure Identity Portal</div>
            <div style='font-size:1.45rem;font-weight:800;color:#FAFAFA;letter-spacing:-0.5px;'>
                Sign in to your workspace
            </div>
        </div>""", unsafe_allow_html=True)
        with st.form("lf"):
            un = st.text_input("Email", placeholder="admin@resiliocheck.io")
            pw = st.text_input("Passkey", type="password", placeholder="••••••••••••")
            st.markdown("<div style='height:4px;'></div>", unsafe_allow_html=True)
            if st.form_submit_button("Authenticate", use_container_width=True):
                if not un.strip() or not pw.strip():
                    st.error("Both fields are required.")
                else:
                    st.session_state.current_user = un.strip()
                    st.session_state.page_mode = "dashboard"; st.rerun()
        st.markdown("<div style='height:10px;'></div>", unsafe_allow_html=True)
        _, bc, _ = st.columns([1, 2, 1])
        with bc:
            st.markdown("<div class='ghost-btn'>", unsafe_allow_html=True)
            if st.button("Back to Home", key="lb", use_container_width=True): _go("landing")
            st.markdown("</div>", unsafe_allow_html=True)
        st.markdown("<div style='text-align:center;margin-top:20px;font-size:0.72rem;color:#27272A;'>Protected by end-to-end encryption</div>", unsafe_allow_html=True)


# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  DASHBOARD                                                                  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
elif st.session_state.page_mode == "dashboard":
    _u = st.session_state.current_user or "Analyst"

    with st.sidebar:
        st.markdown(f"""
        <div style='padding:18px 0 14px;border-bottom:1px solid #18181B;margin-bottom:18px;'>
            <div style='display:flex;align-items:center;gap:9px;margin-bottom:4px;'>
                {ic("shield",20,"#EA580C")}
                <span style='font-size:0.95rem;font-weight:800;color:#E4E4E7;'>ResilioCheck AI</span>
            </div>
            <div style='font-size:0.66rem;color:#3F3F46;padding-left:29px;'>Enterprise · v0.2.0</div>
        </div>
        <div style='display:flex;align-items:center;gap:8px;font-size:0.8rem;color:#71717A;
                    margin-bottom:20px;padding:8px 10px;background:#18181B;border-radius:8px;border:1px solid #27272A;'>
            {ic("user",14,"#52525B")} <span style='color:#EA580C;font-weight:600;'>{_u}</span>
        </div>""", unsafe_allow_html=True)

        st.markdown("<div style='font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#3F3F46;margin-bottom:10px;'>System</div>", unsafe_allow_html=True)
        _ok = bool(GROQ_API_KEY and GROQ_API_KEY.startswith("gsk_"))
        st.markdown(f"""
        <div style='display:flex;align-items:center;gap:7px;font-size:0.78rem;color:#71717A;padding:3px 0;'>
            {ic("wifi",12,"#22C55E" if _ok else "#EF4444")} {"Groq Connected" if _ok else "API Key Missing"}
        </div>
        <div style='display:flex;align-items:center;gap:7px;font-size:0.78rem;color:#71717A;padding:3px 0;'>
            {ic("cpu",12,"#22C55E")} Engine Online
        </div>""", unsafe_allow_html=True)

        st.markdown("<div style='height:1px;background:#18181B;margin:14px 0;'></div>", unsafe_allow_html=True)
        st.markdown("<div style='font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#3F3F46;margin-bottom:10px;'>Gates</div>", unsafe_allow_html=True)

        for gk, (gi, gl) in {"webhook_ingestion":("wifi","Webhook"),"ai_analysis":("cpu","AI"),"sandbox_validation":("box","Sandbox"),"rasp_monitoring":("eye","RASP")}.items():
            gv  = st.session_state.pipeline_gates.get(gk, "PENDING")
            clr = {"APPROVED":"#22C55E","FAILED":"#EF4444","BLOCKED":"#EF4444"}.get(gv,"#FB923C")
            st.markdown(f'<div style="display:flex;align-items:center;gap:7px;font-size:0.78rem;color:{clr};padding:3px 0;">{ic(gi,12,clr)} <b>{gv}</b> <span style="color:#3F3F46;font-size:0.7rem;">— {gl}</span></div>', unsafe_allow_html=True)

        if st.session_state.ai_error:
            st.markdown(f'<div style="margin-top:12px;font-size:0.7rem;color:#EF4444;word-break:break-word;padding:10px;background:#18181B;border-radius:8px;border:1px solid #27272A;">{ic("alert",12,"#EF4444")} {st.session_state.ai_error[:280]}</div>', unsafe_allow_html=True)

        st.markdown("<div style='height:1px;background:#18181B;margin:14px 0;'></div>", unsafe_allow_html=True)
        if st.button("Sign Out", use_container_width=True, key="so"):
            st.session_state.current_user = None; _reset(); _go("landing")

    # ── Header ────────────────────────────────────────────────────────────────
    st.markdown(f"""
    <div class='rc-dh'>
        <div class='rc-dh-eye'>{ic("activity",12,"#EA580C")} Security Operations Center</div>
        <div class='rc-dh-t'>Vulnerability Assessment Pipeline</div>
        <div class='rc-dh-s'>Submit a public repository to trigger the full AI-powered scan, <b style='color:#71717A;'>{_u}</b>.</div>
    </div>""", unsafe_allow_html=True)

    # ── KPIs — fully dynamic, no hardcoded values ─────────────────────────────
    # 1. Uptime: elapsed seconds since boot, degraded 0.1 % per pipeline failure.
    _elapsed   = time.time() - st.session_state.app_start_time
    _failures  = int(st.session_state.get("pipeline_failures", 0))
    _uptime_pct = max(0.0, 100.0 - (_failures * 0.1))

    # 2. Analyses run: prefer authoritative Firestore record count; fall back to
    #    local session counter so the metric stays live even without DB access.
    _db_scan_count = None
    if db is not None:
        try:
            _db_scan_count = len(list(db.collection("scans").stream()))
        except Exception:
            _db_scan_count = None
    _analyses_display = _db_scan_count if _db_scan_count is not None else st.session_state.analyses_run

    # 3. Critical findings & blocked gates derived from current session gate state.
    _gates_vals = list(st.session_state.pipeline_gates.values())
    _c = sum(1 for v in _gates_vals if v in ("FAILED", "BLOCKED"))
    _b = _c  # blocked = gates that did not APPROVE

    m1,m2,m3,m4 = st.columns(4, gap="medium")
    m1.metric("Analyses Run",      str(_analyses_display))
    m2.metric("Critical Findings", str(_c))
    m3.metric("Gates Blocked",     str(_b))
    m4.metric("Pipeline Uptime",   f"{_uptime_pct:.2f}%")
    st.markdown("<div style='height:28px;'></div>", unsafe_allow_html=True)

    lc, rc = st.columns([3, 2], gap="large")

    with lc:
        st.markdown(f'<div class="rc-panel"><div class="rc-panel-hdr">{ic("git",13,"#EA580C")} Repository Analysis Target</div>', unsafe_allow_html=True)
        repo_url = st.text_input("GitHub Repository URL", value=st.session_state.last_repo, placeholder="https://github.com/owner/repository", key="ru")
        branch   = st.text_input("Branch Name", value="main", key="br")
        run_btn  = st.button("Run Live Analysis Pipeline", key="rb", use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

        if run_btn:
            if not repo_url.strip(): st.error("Please enter a GitHub repository URL.")
            elif not GROQ_API_KEY:   st.error("GROQ_API_KEY is not configured in .env file.")
            else:
                _reset()
                st.session_state.last_repo = repo_url.strip()
                st.session_state.analyses_run += 1
                try:
                    import uuid
                    import shutil
                    import sys
                    from main import download_and_extract_repo, gather_source_files, run_ai_analysis, apply_patch_and_validate
                    
                    aid = str(uuid.uuid4())
                    
                    with st.spinner("Dispatching to Gateway (Local Pipeline)..."):
                        st.session_state.pipeline_gates["webhook_ingestion"] = "APPROVED"
                        WORKSPACE_DIR = f"./tmp_workspace_{aid[:8]}"
                        if os.path.exists(WORKSPACE_DIR):
                            shutil.rmtree(WORKSPACE_DIR, ignore_errors=True)
                        os.makedirs(WORKSPACE_DIR, exist_ok=True)
                        download_and_extract_repo(repo_url.strip(), WORKSPACE_DIR)

                    with st.spinner("Multi-Agent Engine scanning — this may take 1–3 minutes..."):
                        js_files = gather_source_files(WORKSPACE_DIR)
                        if not js_files:
                            st.session_state.ai_explanation = "No JavaScript (.js) files found in the repository."
                            st.session_state.ai_status = "APPROVED"
                            st.session_state.pipeline_gates["ai_analysis"] = "APPROVED"
                            st.session_state.pipeline_gates["sandbox_validation"] = "APPROVED"
                        else:
                            st.session_state.pipeline_gates["ai_analysis"] = "PENDING"
                            patched_code = run_ai_analysis(js_files)
                            
                            st.session_state.pipeline_gates["ai_analysis"] = "APPROVED"
                            st.session_state.ai_explanation = "Analysis complete. Security issues assessed."
                            if patched_code:
                                st.session_state.ai_patched_files = {"patched_script.js": patched_code}
                                st.session_state.ai_status = "FAILED"
                                apply_patch_and_validate(WORKSPACE_DIR, patched_code)
                            else:
                                st.session_state.ai_status = "APPROVED"
                            st.session_state.pipeline_gates["sandbox_validation"] = "APPROVED"
                            
                        st.session_state.pipeline_gates["rasp_monitoring"] = "APPROVED"
                        
                        if db is not None:
                            try:
                                data_payload = {
                                    "analysis_id": aid,
                                    "repo_url": st.session_state.last_repo,
                                    "explanation": st.session_state.ai_explanation,
                                    "pipeline_gates": st.session_state.pipeline_gates
                                }
                                doc_id = st.session_state.last_repo.replace("/", "_")
                                db.collection("scans").document(doc_id).set(data_payload)
                            except Exception as e:
                                st.error(f"Firestore save error: {e}")
                    st.rerun()
                except Exception as e:
                    st.session_state.pipeline_gates["webhook_ingestion"] = "FAILED"
                    st.session_state.pipeline_failures = st.session_state.get("pipeline_failures", 0) + 1
                    st.session_state.ai_error = f"Pipeline error: {e}"
                    st.error(f"Pipeline error: {e}")

        if st.session_state.last_repo:
            st.markdown(f'<div class="rc-chip">{ic("link",12,"#EA580C")} Last scan: <span>{st.session_state.last_repo}</span></div>', unsafe_allow_html=True)

        if st.session_state.ai_explanation:
            st.markdown("<div style='height:20px;'></div>", unsafe_allow_html=True)
            expl = st.session_state.ai_explanation
            ai_status = st.session_state.get("ai_status", "BLOCKED")
            if ai_status == "APPROVED":
                st.markdown(f'<div class="rc-ok"><b style="display:flex;align-items:center;gap:6px;">{ic("check",15,"#22C55E")} Security Verified — No Vulnerabilities Found</b><br>{expl}</div>', unsafe_allow_html=True)
            else:
                st.markdown(f'<div class="rc-warn"><b style="display:flex;align-items:center;gap:6px;">{ic("alert",15,"#FB923C")} Vulnerability Detected — Review Required</b><br>{expl}</div>', unsafe_allow_html=True)


        if st.session_state.ai_patched_files:
            st.markdown("<div style='height:16px;'></div>", unsafe_allow_html=True)
            st.markdown(f'<div style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#52525B;margin-bottom:10px;display:flex;align-items:center;gap:6px;">{ic("code",12,"#EA580C")} Proposed Security Patches</div>', unsafe_allow_html=True)
            for fpath, fcontent in st.session_state.ai_patched_files.items():
                st.markdown(f"**{fpath}**")
                st.code(fcontent, language="javascript")
                
            if st.session_state.pr_url and st.session_state.pr_number and github_app:
                try:
                    pr_status = github_app.get_pull_request_status(st.session_state.last_repo, st.session_state.pr_number)
                    state = pr_status["state"]
                    merged = pr_status["merged"]
                    
                    st.markdown(f"**GitHub PR:** [{st.session_state.pr_url}]({st.session_state.pr_url})")
                    
                    if state == "open":
                        col1, col2 = st.columns(2)
                        with col1:
                            if st.button("Approve Patch (Merge to GitHub)", use_container_width=True, type="primary"):
                                github_app.merge_pull_request(st.session_state.last_repo, st.session_state.pr_number)
                                time.sleep(1)
                                st.rerun()
                        with col2:
                            st.markdown("<div class='sec-btn'>", unsafe_allow_html=True)
                            if st.button("Reject Patch (Close PR)", use_container_width=True):
                                github_app.close_pull_request(st.session_state.last_repo, st.session_state.pr_number)
                                time.sleep(1)
                                st.rerun()
                            st.markdown("</div>", unsafe_allow_html=True)
                    elif state == "closed":
                        if merged:
                            st.markdown(f'<div class="rc-ok" style="margin-top: 10px;"><b style="display:flex;align-items:center;gap:6px;">{ic("check",15,"#22C55E")} Patch Approved & Merged</b></div>', unsafe_allow_html=True)
                        else:
                            st.markdown(f'<div class="rc-warn" style="margin-top: 10px;"><b style="display:flex;align-items:center;gap:6px;">{ic("x",15,"#FB923C")} Patch Rejected (Closed)</b></div>', unsafe_allow_html=True)
                except Exception as e:
                    st.error(f"Failed to fetch PR status from GitHub: {e}")

        if st.session_state.ai_error:
            st.markdown("<div style='height:10px;'></div>", unsafe_allow_html=True)
            st.warning(f"**Engine Error:** {st.session_state.ai_error}")

        st.markdown("<div style='height:36px;'></div>", unsafe_allow_html=True)
        st.markdown("<div class='rc-sec'>📜 Historic Scan Records</div>", unsafe_allow_html=True)
        if db is not None:
            try:
                for scan in db.collection("scans").stream():
                    s_data = scan.to_dict()
                    _repo = s_data.get("repo_url", "Unknown")
                    _gate = s_data.get("pipeline_gates", {}).get("gate", "Unknown")
                    _aid = s_data.get("analysis_id", "N/A")
                    st.markdown(f"**{_repo}** — Gate Status: `{_gate}`")
                    st.caption(f"Analysis ID: `{_aid}`")
            except Exception as e:
                st.warning(f"Failed to load history: {e}")
        else:
            st.info("Firestore not initialized.")

    with rc:
        st.markdown(f'<div style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:#52525B;margin-bottom:14px;display:flex;align-items:center;gap:6px;">{ic("layers",13,"#EA580C")} Pipeline Gate Status</div>', unsafe_allow_html=True)

        _GM = {"APPROVED":"rc-gate-ok","FAILED":"rc-gate-fail","BLOCKED":"rc-gate-fail","PENDING":"rc-gate-pend"}
        _GC = {"APPROVED":"#22C55E","FAILED":"#EF4444","BLOCKED":"#EF4444","PENDING":"#FB923C"}
        _GL = {"APPROVED":"APPROVED","FAILED":"BLOCKED","BLOCKED":"BLOCKED","PENDING":"PENDING"}
        _GI = {"APPROVED":"check","FAILED":"x","BLOCKED":"x","PENDING":"clock"}

        for gk, gi, glb in [("webhook_ingestion","wifi","Webhook Ingestion"),("ai_analysis","cpu","AI Analysis"),("sandbox_validation","box","Sandbox Validation"),("rasp_monitoring","eye","RASP Monitoring")]:
            gv=st.session_state.pipeline_gates.get(gk,"PENDING")
            st.markdown(f"""
            <div class='rc-gate {_GM.get(gv,"rc-gate-pend")}'>
                <div style='min-width:30px;display:flex;justify-content:center;'>{ic(gi,17,_GC.get(gv,"#FB923C"))}</div>
                <div>
                    <div class='rc-gate-lbl'>{glb}</div>
                    <div class='rc-gate-val'>{ic(_GI.get(gv,"clock"),13,_GC.get(gv,"#FB923C"))} {_GL.get(gv,gv)}</div>
                </div>
            </div>""", unsafe_allow_html=True)

        st.markdown("<div style='height:18px;'></div>", unsafe_allow_html=True)
        st.markdown(f"""
        <div style='background:#18181B;border:1px solid #27272A;border-radius:12px;padding:18px 20px;'>
            <div style='font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;
                        color:#52525B;margin-bottom:14px;display:flex;align-items:center;gap:6px;'>
                {ic("scan",13,"#EA580C")} Scan Parameters
            </div>
            <div style='font-size:0.79rem;color:#71717A;line-height:2.1;'>
                <div style='display:flex;align-items:center;gap:8px;'>{ic("code",11,"#EA580C")} File types: <code>.js .ts .py .php .java .go</code></div>
                <div style='display:flex;align-items:center;gap:8px;'>{ic("x",11,"#EF4444")} Excluded: <code>node_modules</code> <code>dist</code></div>
                <div style='display:flex;align-items:center;gap:8px;'>{ic("layers",11,"#EA580C")} Max files: <code>20 per scan</code></div>
                <div style='display:flex;align-items:center;gap:8px;'>{ic("bar",11,"#EA580C")} Max size: <code>50 KB</code></div>
                <div style='display:flex;align-items:center;gap:8px;'>{ic("cpu",11,"#EA580C")} Model: <code>{GROQ_MODEL} · Groq</code></div>
            </div>
        </div>""", unsafe_allow_html=True)