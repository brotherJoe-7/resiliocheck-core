'use client';
import { apiJson, ApiError } from '@/app/utils/apiClient';
import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import ChatPanel from '../components/ChatPanel';
import { Zap, Check, AlertTriangle, Hourglass, LayoutGrid, X, CheckCircle2, Sparkles } from 'lucide-react';

import type { ScanResult } from '@/app/types';

const ENGINE_OPTIONS = [
  'Groq GPT-OSS 120B Deep Static Analysis (SAST)',
  'Groq GPT-OSS 20B Fast Static Analysis (SAST)',
  'Qwen 3.8-27B Deep Static Analysis (SAST)',
  'Allam 2-7B Fast Static Analysis (SAST)',
];

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message || fallback;
  return fallback;
}


const INITIAL_GATES = {
  webhook_ingestion: 'PENDING',
  ai_analysis:       'PENDING',
  sandbox_validation:'PENDING',
  rasp_monitoring:   'PENDING',
};

const GATE_LABELS: Record<string, string> = {
  webhook_ingestion:  'Webhook Ingestion',
  ai_analysis:        'AI LLM Analysis',
  sandbox_validation: 'Container Sandbox Validation',
  rasp_monitoring:    'Continuous Network RASP Shielding',
};

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'var(--red)',
  HIGH:     '#f97316',
  MEDIUM:   'var(--accent)',
  LOW:      'var(--green)',
  INFO:     'var(--text-muted)',
};

function GatePill({ status }: { status: string }) {
  const cls =
    status === 'APPROVED' || status === 'PASSED' ? 'rc-pill-green'
    : status === 'PENDING' || status === 'RUNNING' ? 'rc-pill-yellow'
    : status === 'SKIPPED' ? 'rc-pill-gray'
    : 'rc-pill-red';
  const label = status === 'PENDING' ? 'WAITING' : status;
  return <span className={`rc-pill ${cls}`}>{label}</span>;
}

function SeverityBadge({ sev }: { sev: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.6px',
      background: `${SEVERITY_COLOR[sev] ?? 'var(--text-muted)'}22`,
      color: SEVERITY_COLOR[sev] ?? 'var(--text-muted)',
      border: `1px solid ${SEVERITY_COLOR[sev] ?? 'var(--border)'}55`,
    }}>{sev}</span>
  );
}

export default function DashboardPage() {
  const [repoUrl, setRepoUrl]     = useState('');
  const [branch, setBranch]       = useState('main');
  const [engine, setEngine]       = useState(ENGINE_OPTIONS[0]);
  const [gates, setGates]         = useState(INITIAL_GATES);
  const [loading, setLoading]         = useState(false);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchToast, setPatchToast]   = useState<{type: 'success'|'error', msg: string, url?: string} | null>(null);
  const [scanResult, setScanResult]   = useState<ScanResult | null>(null);
  const [history, setHistory]         = useState<ScanResult[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [error, setError]             = useState('');
  const [startTime]                   = useState<number>(() => Date.now());
  const [now, setNow]                 = useState<number | null>(null);
  const [githubConnected, setGithubConnected] = useState<boolean>(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Parse OAuth redirect params and session uptime
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    
    // Check URL parameters for OAuth return
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const oauth = params.get('github_oauth');
      if (oauth === 'success') {
        setPatchToast({ type: 'success', msg: 'Successfully connected GitHub account!' });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (oauth === 'error') {
        const reason = params.get('reason') || 'Unknown error';
        setPatchToast({ type: 'error', msg: `GitHub connection failed: ${reason}` });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    return () => clearInterval(id);
  }, []);

  // Fetch current user details to check github_connected status
  useEffect(() => {
    apiJson<{ github_connected: boolean }>('/api/auth/me')
      .then(me => setGithubConnected(me.github_connected))
      .catch(() => setGithubConnected(false));
  }, []);

  // Fetch persistent scan history from DB on mount
  const loadHistory = useCallback(async () => {
    try {
      const data = await apiJson<ScanResult[]>('/api/scans');
      if (Array.isArray(data)) setHistory(data);
      setHistoryError('');
    } catch (e) {
      setHistoryError(errorMessage(e, 'Could not load scan history.'));
    }
  }, []);

  useEffect(() => {
    const controller = { cancelled: false };
    // Network fetch -> state (async callback, not a synchronous setState)
    Promise.resolve().then(() => { if (!controller.cancelled) loadHistory(); });
    return () => { controller.cancelled = true; };
  }, [loadHistory]);

  async function handleApprove(scanId: number, direct: boolean = false) {
    setPatchLoading(true);
    setPatchToast(null);
    try {
      const data = await apiJson<{ pr_url?: string }>(`/api/scans/${scanId}/apply-patch?direct=${direct}`, { method: 'POST' });
      setPatchToast({ type: 'success', msg: direct ? 'Patch applied directly to the branch.' : 'Pull Request created on GitHub.', url: data.pr_url });
      setScanResult(prev => prev ? { ...prev, patch_status: 'APPLIED' } : prev);
      await loadHistory();
    } catch (e) {
      setPatchToast({ type: 'error', msg: errorMessage(e, direct ? 'Failed to apply patch directly' : 'Failed to create PR') });
    } finally {
      setPatchLoading(false);
    }
  }

  async function handleReject(scanId: number) {
    setPatchLoading(true);
    setPatchToast(null);
    try {
      await apiJson(`/api/scans/${scanId}/reject-patch`, { method: 'POST' });
      setPatchToast({ type: 'error', msg: 'Patch rejected. No changes were pushed.' });
      setScanResult(prev => prev ? { ...prev, patch_status: 'REJECTED' } : prev);
      await loadHistory();
    } catch (e) {
      setPatchToast({ type: 'error', msg: errorMessage(e, 'Failed to reject patch') });
    } finally {
      setPatchLoading(false);
    }
  }

  const criticalVulns = scanResult?.critical_count ?? 0;
  const elapsedMs     = now !== null ? now - startTime : 0;
  const elapsedH      = Math.floor(elapsedMs / 3600000);
  const elapsedD      = Math.floor(elapsedH / 24);
  const sessionScans  = history.length;
  const blockedScans  = history.filter(s => s.gate === 'BLOCKED').length;

  async function handleScan() {
    const url = repoUrl.trim();
    if (!url) { setError('Please enter a GitHub repository URL.'); return; }
    if (!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/?$/.test(url.replace(/\.git$/, ''))) {
      setError('Enter a public GitHub repository URL in the form https://github.com/owner/repo');
      return;
    }
    setError('');
    setLoading(true);
    setScanResult(null);
    setPatchToast(null);
    setGates({ ...INITIAL_GATES, webhook_ingestion: 'RUNNING' });

    try {
      const data = await apiJson<ScanResult>('/api/scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ repo_url: url, branch, engine }),
      });

      const verdict  = data.sandbox_verdict;
      const gatePass = data.gate === 'APPROVED';

      setScanResult(data);
      setGates({
        webhook_ingestion:  'PASSED',
        ai_analysis:        gatePass ? 'APPROVED' : 'BLOCKED',
        sandbox_validation: verdict === 'PASS' ? 'PASSED' : verdict === 'FAIL' || verdict === 'ERROR' ? 'FAILED' : 'SKIPPED',
        rasp_monitoring:    'PASSED',
      });
      await loadHistory();
    } catch (e) {
      let msg = errorMessage(e, 'Scan failed');
      const status = e instanceof ApiError ? e.status : 0;
      
      // Friendly rate limit message
      if (status === 429) {
        msg = "The AI engine is currently experiencing high volume. Please try again in 1-2 minutes.";
      }

      setError(msg);
      
      // A 4xx from validation / download means ingestion failed; anything else means the AI stage failed.
      if (status === 400 || status === 404 || status === 0) {
        setGates({ ...INITIAL_GATES, webhook_ingestion: 'FAILED' });
      } else {
        setGates({ ...INITIAL_GATES, webhook_ingestion: 'PASSED', ai_analysis: 'FAILED' });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Sidebar />
      <main className="rc-main">
        {/* Page Header */}
        <div className="rc-page-hdr">
          <div>
            <div className="rc-page-title">Vulnerability Assessment Pipeline</div>
            <div className="rc-page-sub">Submit a public repository to trigger the full AI-powered scan.</div>
          </div>
          <button
            onClick={() => setChatOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, var(--accent), hsl(from var(--accent) h calc(s + 10) calc(l - 15)))',
              border: 'none', borderRadius: 10, padding: '9px 18px',
              color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
              transition: 'opacity 0.2s, transform 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
          >
            <Sparkles size={15} /> Ask AI
          </button>
        </div>

        {/* KPI Metrics */}
        <div className="rc-grid-4" style={{ marginBottom: 32 }}>
          {[
            { label: 'Critical Vulns',  value: criticalVulns,    delta: scanResult ? (criticalVulns === 0 ? 'Latest scan is clean' : `${criticalVulns} active issue(s)`) : 'Run a scan to populate', up: criticalVulns === 0 },
            { label: 'Blocked Scans',    value: blockedScans,     delta: sessionScans ? `${Math.round(((sessionScans - blockedScans) / sessionScans) * 100)}% pass rate` : 'No scans yet', up: blockedScans === 0 },
            { label: 'Total Scans',     value: sessionScans,     delta: 'Persisted in DB',   up: true },
            { label: 'Session Uptime',  value: `${elapsedD}d ${elapsedH % 24}h`, delta: 'Current browser session', up: true },
          ].map(m => (
            <div key={m.label} className="rc-metric">
              <div className="rc-metric-label">{m.label}</div>
              <div className="rc-metric-value">{m.value}</div>
              <div className={`rc-metric-delta ${m.up ? '' : 'down'}`}>{m.delta}</div>
            </div>
          ))}
        </div>

        {/* Onboarding / Getting Started (Shows only when no scans exist) */}
        {!loading && history.length === 0 && !scanResult && (
          <div className="rc-card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}>
            <div className="rc-card-hdr">
              <div className="rc-card-title" style={{ fontSize: '1.1rem' }}>👋 Welcome to ResilioCheck AI!</div>
            </div>
            <div style={{ padding: '0 20px 20px', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6 }}>
              <p style={{ marginBottom: 16 }}>It looks like you haven't run any scans yet. Here is how to get started:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div style={{ padding: 16, background: 'var(--bg-base)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>1. Connect GitHub (Optional)</strong><br />
                  If you want to scan private repositories, click the "Connect GitHub" link below to authenticate via OAuth.
                </div>
                <div style={{ padding: 16, background: 'var(--bg-base)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>2. Enter a Repository URL</strong><br />
                  Paste any public (or authorized private) GitHub URL and click <strong style={{ color: 'var(--accent)' }}>INITIATE SCAN</strong>.
                </div>
                <div style={{ padding: 16, background: 'var(--bg-base)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>3. Review & Approve</strong><br />
                  The LangChain agents will analyse your code. If severe vulnerabilities are found, you can review the patch and automatically create a Pull Request.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main 2-Col */}
        <div className="rc-grid-2" style={{ marginBottom: 24 }}>
          {/* Scan Config */}
          <div className="rc-card">
            <div className="rc-card-hdr">
              <div className="rc-card-title"><Zap size={16} /> Repository Target &amp; Configuration</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="rc-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Repository URL Target</span>
                {githubConnected && <span style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600 }}><Check size={12} style={{ display: 'inline', marginBottom: -2 }} /> GitHub Connected</span>}
              </label>
              <input className="rc-input" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" />
              {!githubConnected && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Only public repositories can be scanned.</span>
                  <button 
                    onClick={async () => {
                      try {
                        const data = await apiJson<{ url: string }>('/api/auth/github/oauth-url');
                        window.location.href = data.url;
                      } catch (e) {
                        setError('Could not initiate GitHub login. Please try again.');
                      }
                    }} 
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                  >
                    Connect GitHub to scan private repos &rarr;
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="rc-label">Branch Target</label>
                <select className="rc-select" value={branch} onChange={e => setBranch(e.target.value)}>
                  {['main', 'master', 'develop', 'staging'].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="rc-label">Analysis Engine Profile</label>
                <select className="rc-select" value={engine} onChange={e => setEngine(e.target.value)}>
                  {ENGINE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <button className="rc-btn-primary" onClick={handleScan} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? <><Hourglass size={16} /> Running 3-Stage AI Pipeline...</> : <><Zap size={16} /> INITIATE SCAN</>}
            </button>
            {error && (
              <div style={{ marginTop: 12, color: 'var(--red)', fontSize: '0.8rem', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, display: 'flex', gap: 8, alignItems: 'flex-start', wordBreak: 'break-word' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{error}</span>
              </div>
            )}
          </div>

          {/* Gate Status */}
          <div className="rc-card">
            <div className="rc-card-hdr">
              <div className="rc-card-title"><LayoutGrid size={24} /> Pipeline Gate Status</div>
              {scanResult && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: scanResult.gate === 'APPROVED' ? 'var(--green)' : 'var(--red)' }}>
                  AI Verdict: {scanResult.gate}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(gates).map(([key, val]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6 }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{GATE_LABELS[key]}</span>
                  <GatePill status={val} />
                </div>
              ))}
            </div>
            {scanResult?.gate_rationale && (
              <div style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-base)', borderRadius: 6, borderLeft: '3px solid var(--accent)' }}>
                {scanResult.gate_rationale}
              </div>
            )}
          </div>
        </div>

        {/* Scan Results — OWASP Findings Table */}
        {scanResult && (
          <div className="rc-card" style={{ marginBottom: 24 }}>
            <div className="rc-card-hdr">
              <div className="rc-card-title">📊 Intelligent Vulnerability Remediation Report</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: '0.7rem', padding: '4px 12px', borderRadius: 20, fontWeight: 700, background: scanResult.gate === 'APPROVED' ? 'rgba(20,209,120,0.12)' : 'rgba(239,68,68,0.12)', color: scanResult.gate === 'APPROVED' ? 'var(--green)' : 'var(--red)', border: `1px solid ${scanResult.gate === 'APPROVED' ? 'rgba(20,209,120,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                  Gate: {scanResult.gate}
                </span>
              </div>
            </div>

            {/* Summary */}
            <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg-base)', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.8px' }}>
                ● AI MULTI-AGENT ANALYSIS COMPLETE{scanResult.model ? ` — MODEL: ${scanResult.model.toUpperCase()}` : ''}{scanResult.files_analysed?.length ? ` — ${scanResult.files_analysed.length} FILE(S)` : ''}
              </div>
              <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{scanResult.explanation}</p>
            </div>

            {/* OWASP Findings Table */}
            {scanResult.findings?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 10 }}>
                  OWASP FINDINGS — {scanResult.findings.length} issue(s) — {scanResult.critical_count} critical, {scanResult.high_count} high
                </div>
                <div className="rc-table-wrap">
                <table className="rc-table">
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>OWASP Class</th>
                      <th>File</th>
                      <th>Description</th>
                      <th>Remediation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanResult.findings.map((f, i) => (
                      <tr key={i}>
                        <td data-label="Severity"><SeverityBadge sev={f.severity} /></td>
                        <td data-label="OWASP Class" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{f.owasp_class}</td>
                        <td data-label="File" title={f.file_path} style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{f.file_path?.split('/').pop()}{f.line_start ? `:${f.line_start}` : ''}</td>
                        <td data-label="Description" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{f.description}</td>
                        <td data-label="Remediation" style={{ fontSize: '0.78rem', color: 'var(--green)' }}>{f.remediation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {/* Secret Findings */}
            {scanResult.secret_findings?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--red)', marginBottom: 10 }}>
                  <AlertTriangle size={16} /> Pre-Scan Secrets Scanner — {scanResult.secret_findings.length} Hardcoded Secret(s) Detected
                </div>
                {scanResult.secret_findings.map((f, i) => (
                  <div key={i} style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '10px 14px', marginBottom: 6, fontFamily: 'monospace', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--red)', fontWeight: 700 }}>[{f.pattern}]</span>
                    <span style={{ color: 'var(--text-muted)' }}> {f.file} : line {f.line}</span>
                    <div style={{ color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{f.snippet}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Patched Code + Approve/Reject */}
            {scanResult.patched_code && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--green)' }}>
                    <Check size={16} /> AI-Generated Patch — Sandbox Verdict: {scanResult.sandbox_verdict} — File: {scanResult.patched_filename || 'unknown'}
                  </div>
                  {/* Status badge */}
                  {scanResult.patch_status === 'APPLIED' && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(20,209,120,0.12)', color: 'var(--green)', border: '1px solid rgba(20,209,120,0.3)' }}><Check size={16} /> PR CREATED</span>
                  )}
                  {scanResult.patch_status === 'REJECTED' && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(239,68,68,0.12)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' }}><X size={16} className="text-red-500" /> REJECTED</span>
                  )}
                </div>
                <pre style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px', overflow: 'auto', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                  {scanResult.patched_code}
                </pre>

                {/* Approve / Reject action bar */}
                {scanResult.patch_status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="rc-btn-primary"
                      onClick={() => handleApprove(scanResult.id, false)}
                      disabled={patchLoading}
                      style={{ fontSize: '0.78rem', padding: '8px 20px' }}
                    >
                      {patchLoading ? <><Hourglass size={16} /> Creating PR...</> : <><CheckCircle2 size={16} /> Approve &amp; Create PR</>}
                    </button>
                    <button
                      onClick={() => handleApprove(scanResult.id, true)}
                      disabled={patchLoading}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--accent)',
                        color: 'var(--accent)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        padding: '8px 20px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {patchLoading ? <><Hourglass size={16} /> Merging...</> : <><CheckCircle2 size={16} /> Approve &amp; Merge Directly</>}
                    </button>
                    <button
                      className="rc-btn-secondary"
                      onClick={() => handleReject(scanResult.id)}
                      disabled={patchLoading}
                      style={{ fontSize: '0.78rem', padding: '8px 20px', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.4)', marginLeft: 'auto' }}
                    >
                      <X size={16} className="text-red-500" /> Reject Fix
                    </button>
                  </div>
                )}

                {/* Toast notification */}
                {patchToast && (
                  <div style={{
                    marginTop: 10, padding: '10px 14px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600,
                    background: patchToast.type === 'success' ? 'rgba(20,209,120,0.1)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${patchToast.type === 'success' ? 'rgba(20,209,120,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: patchToast.type === 'success' ? 'var(--green)' : 'var(--red)',
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  }}>
                    {patchToast.type === 'success' ? <CheckCircle2 size={16} /> : <X size={16} />}
                    {patchToast.msg}
                    {patchToast.url && (
                      <a href={patchToast.url} target="_blank" rel="noreferrer" style={{ marginLeft: 10, color: 'var(--accent)', textDecoration: 'underline' }}>
                        View PR →
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Historical Log — from DB */}
        <div className="rc-card" style={{ marginBottom: 24 }}>
          <div className="rc-card-hdr">
            <div className="rc-card-title">📦 Historical Evaluation Log Records</div>
            <span style={{ fontSize: '0.72rem', color: historyError ? 'var(--red)' : 'var(--text-muted)' }}>{historyError || `${history.length} scan(s) in database`}</span>
          </div>
          <div className="rc-table-wrap">
          <table className="rc-table">
            <thead>
              <tr>
                <th>Repository</th>
                <th>Branch</th>
                <th>Scanned At</th>
                <th>Critical</th>
                <th>High</th>
                <th>AI Gate</th>
                <th>Sandbox</th>
                <th>Patch</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No scan records yet. Trigger a scan above.</td></tr>
              ) : history.map((s) => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => { setScanResult(s); setPatchToast(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} title="Click to view this scan report">
                  <td style={{ color: 'var(--text-primary)', fontSize: '0.8rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(s.repo_url || '').replace('https://github.com/', '')}
                  </td>
                  <td style={{ fontSize: '0.78rem' }}>{s.branch}</td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {s.scanned_at ? new Date(s.scanned_at).toLocaleString() : '—'}
                  </td>
                  <td><span style={{ color: s.critical_count > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{s.critical_count}</span></td>
                  <td><span style={{ color: s.high_count > 0 ? '#f97316' : 'var(--green)', fontWeight: 700 }}>{s.high_count}</span></td>
                  <td><GatePill status={s.gate} /></td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.sandbox_verdict || 'SKIPPED'}</td>
                  <td style={{ fontSize: '0.72rem', fontWeight: 700,
                    color: s.patch_status === 'APPLIED' ? 'var(--green)' : s.patch_status === 'REJECTED' ? 'var(--red)' : s.patch_status === 'PENDING' ? 'var(--accent)' : 'var(--text-muted)'
                  }}>{s.patch_status || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* Predictive Threat Analysis */}
        <div className="rc-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ marginBottom: 12, color: 'var(--accent)' }}><Zap size={32} /></div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Predictive Threat Analysis</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.7 }}>
            The ResilioCheck AI multi-agent engine processes repositories through OWASP classification,
            gate decision, and automated patch generation stages.<br />
            {history.length > 0
              ? `${history.filter((s) => s.gate === 'APPROVED').length} of ${history.length} scan(s) passed all security gates.`
              : 'Submit a repository above to begin threat analysis.'}
          </div>
        </div>
      </main>

      <ChatPanel
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        scanId={scanResult?.id ?? null}
      />
    </div>
  );
}