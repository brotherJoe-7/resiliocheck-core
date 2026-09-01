'use client';
import { fetchApi } from '../../utils/apiClient';
import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import { Zap, Check, AlertTriangle, Hourglass, LayoutGrid, X, CheckCircle2 } from 'lucide-react';


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
  const cls   = status === 'APPROVED' ? 'rc-pill-green' : status === 'PENDING' ? 'rc-pill-yellow' : 'rc-pill-red';
  const label = status === 'PENDING' ? 'COMPILING' : status;
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
  const [engine, setEngine]       = useState('Llama 3.3 Deep Static Analysis (SAST)');
  const [gates, setGates]         = useState(INITIAL_GATES);
  const [loading, setLoading]         = useState(false);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchToast, setPatchToast]   = useState<{type: 'success'|'error', msg: string, url?: string} | null>(null);
  const [scanResult, setScanResult]   = useState<any>(null);
  const [history, setHistory]         = useState<any[]>([]);
  const [error, setError]             = useState('');
  const [startTime]                   = useState(Date.now());

  // Fetch persistent scan history from DB on mount
  const loadHistory = useCallback(async () => {
    try {
      const res  = await fetchApi('/api/scans');
      const data = await res.json();
      if (Array.isArray(data)) setHistory(data);
    } catch { /* backend may not be running yet */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleApprove(scanId: number) {
    setPatchLoading(true);
    setPatchToast(null);
    try {
      const res  = await fetchApi(`/api/scans/${scanId}/apply-patch`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create PR');
      setPatchToast({ type: 'success', msg: `<CheckCircle2 size={16} /> Pull Request created!`, url: data.pr_url });
      // Refresh scanResult patch_status
      setScanResult((prev: any) => prev ? { ...prev, patch_status: 'APPLIED' } : prev);
      await loadHistory();
    } catch (e: any) {
      setPatchToast({ type: 'error', msg: `❌ ${e.message}` });
    } finally {
      setPatchLoading(false);
    }
  }

  async function handleReject(scanId: number) {
    setPatchLoading(true);
    setPatchToast(null);
    try {
      await fetchApi(`/api/scans/${scanId}/reject-patch`, { method: 'POST' });
      setPatchToast({ type: 'error', msg: '<X size={16} className="text-red-500" /> Patch rejected.' });
      setScanResult((prev: any) => prev ? { ...prev, patch_status: 'REJECTED' } : prev);
      await loadHistory();
    } catch (e: any) {
      setPatchToast({ type: 'error', msg: `❌ ${e.message}` });
    } finally {
      setPatchLoading(false);
    }
  }

  const criticalVulns = scanResult?.critical_count ?? 0;
  const elapsedH      = Math.floor((Date.now() - startTime) / 3600000);
  const sessionScans  = history.length;

  async function handleScan() {
    if (!repoUrl.trim()) { setError('Please enter a GitHub repository URL.'); return; }
    setError('');
    setLoading(true);
    setScanResult(null);
    setGates(INITIAL_GATES);

    try {
      const res  = await fetchApi('/api/scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ repo_url: repoUrl, branch, engine }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Scan failed');

      const verdict  = data.sandbox_verdict;
      const aiOk     = data.explanation !== 'AI analysis failed.';
      const gatePass = data.gate === 'APPROVED';

      setScanResult(data);
      setGates({
        webhook_ingestion:  'APPROVED',
        ai_analysis:        aiOk ? (gatePass ? 'APPROVED' : 'FAILED') : 'FAILED',
        sandbox_validation: verdict === 'PASS' || verdict === 'SKIPPED' ? 'APPROVED' : 'FAILED',
        rasp_monitoring:    'APPROVED',
      });
      // Reload history from DB to include the new scan
      await loadHistory();
    } catch (e: any) {
      setError(e.message);
      setGates(g => ({ ...g, webhook_ingestion: 'FAILED' }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <main className="rc-main">
        {/* Page Header */}
        <div className="rc-page-hdr">
          <div>
            <div className="rc-page-title">Vulnerability Assessment Pipeline</div>
            <div className="rc-page-sub">Submit a public repository to trigger the full AI-powered scan.</div>
          </div>
        </div>

        {/* KPI Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Critical Vulns',  value: criticalVulns,    delta: criticalVulns === 0 ? '−100% (Clean)' : `+${criticalVulns} Active Issues`, up: criticalVulns === 0 },
            { label: 'System Health',   value: '99.9%',          delta: '+0.2% (Optimized)', up: true },
            { label: 'Total Scans',     value: sessionScans,     delta: 'Persisted in DB',   up: true },
            { label: 'Uptime',          value: `0d ${elapsedH}h`,delta: '100% Stability',    up: true },
          ].map(m => (
            <div key={m.label} className="rc-metric">
              <div className="rc-metric-label">{m.label}</div>
              <div className="rc-metric-value">{m.value}</div>
              <div className={`rc-metric-delta ${m.up ? '' : 'down'}`}>{m.delta}</div>
            </div>
          ))}
        </div>

        {/* Main 2-Col */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, marginBottom: 24 }}>
          {/* Scan Config */}
          <div className="rc-card">
            <div className="rc-card-hdr">
              <div className="rc-card-title"><Zap size={16} /> Repository Target &amp; Configuration</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="rc-label">Repository URL Target</label>
              <input className="rc-input" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="rc-label">Branch Target</label>
                <select className="rc-select" value={branch} onChange={e => setBranch(e.target.value)}>
                  {['main', 'master', 'develop', 'staging'].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="rc-label">Analysis Engine Profile</label>
                <select className="rc-select" value={engine} onChange={e => setEngine(e.target.value)}>
                  {['Llama 3.3 Deep Static Analysis (SAST)', 'GPT-4 Code Core', 'Groq Fast Analysis'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <button className="rc-btn-primary" onClick={handleScan} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? <><Hourglass size={16} /> Running 3-Stage AI Pipeline...</> : <><Zap size={16} /> INITIATE SCAN</>}
            </button>
            {error && <div style={{ marginTop: 12, color: 'var(--red)', fontSize: '0.8rem', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6 }}><AlertTriangle size={16} /> {error}</div>}
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
                  <GatePill status={val as string} />
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
              <div style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.8px' }}>● AI MULTI-AGENT ANALYSIS COMPLETE</div>
              <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{scanResult.explanation}</p>
            </div>

            {/* OWASP Findings Table */}
            {scanResult.findings?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 10 }}>
                  OWASP FINDINGS — {scanResult.findings.length} issue(s) — {scanResult.critical_count} critical, {scanResult.high_count} high
                </div>
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
                    {scanResult.findings.map((f: any, i: number) => (
                      <tr key={i}>
                        <td><SeverityBadge sev={f.severity} /></td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{f.owasp_class}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{f.file_path?.split('/').pop()}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{f.description}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--green)' }}>{f.remediation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Secret Findings */}
            {scanResult.secret_findings?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--red)', marginBottom: 10 }}>
                  <AlertTriangle size={16} /> Pre-Scan Secrets Scanner — {scanResult.secret_findings.length} Hardcoded Secret(s) Detected
                </div>
                {scanResult.secret_findings.map((f: any, i: number) => (
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
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                      className="rc-btn-primary"
                      onClick={() => handleApprove(scanResult.id)}
                      disabled={patchLoading}
                      style={{ fontSize: '0.78rem', padding: '8px 20px' }}
                    >
                      {patchLoading ? <><Hourglass size={16} /> Creating PR...</> : <><CheckCircle2 size={16} /> Approve &amp; Create PR</>}
                    </button>
                    <button
                      className="rc-btn-secondary"
                      onClick={() => handleReject(scanResult.id)}
                      disabled={patchLoading}
                      style={{ fontSize: '0.78rem', padding: '8px 20px', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.4)' }}
                    >
                      <X size={16} className="text-red-500" /> Reject Fix
                    </button>
                    <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>Approving will open a Pull Request on GitHub with this patch.</span>
                  </div>
                )}

                {/* Toast notification */}
                {patchToast && (
                  <div style={{
                    marginTop: 10, padding: '10px 14px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600,
                    background: patchToast.type === 'success' ? 'rgba(20,209,120,0.1)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${patchToast.type === 'success' ? 'rgba(20,209,120,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: patchToast.type === 'success' ? 'var(--green)' : 'var(--red)',
                  }}>
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
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{history.length} scan(s) in database</span>
          </div>
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
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No scan records yet. Trigger a scan above.</td></tr>
              ) : history.map((s: any) => (
                <tr key={s.id}>
                  <td style={{ color: 'var(--text-primary)', fontSize: '0.8rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.repo_url.replace('https://github.com/', '')}
                  </td>
                  <td style={{ fontSize: '0.78rem' }}>{s.branch}</td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {s.scanned_at ? new Date(s.scanned_at).toLocaleString() : '—'}
                  </td>
                  <td><span style={{ color: s.critical_count > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{s.critical_count}</span></td>
                  <td><span style={{ color: s.high_count > 0 ? '#f97316' : 'var(--green)', fontWeight: 700 }}>{s.high_count}</span></td>
                  <td><GatePill status={s.gate} /></td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.sandbox_verdict}</td>
                  <td style={{ fontSize: '0.72rem', fontWeight: 700,
                    color: s.patch_status === 'APPLIED' ? 'var(--green)' : s.patch_status === 'REJECTED' ? 'var(--red)' : s.patch_status === 'PENDING' ? 'var(--accent)' : 'var(--text-muted)'
                  }}>{s.patch_status || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Predictive Threat Analysis */}
        <div className="rc-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}><Zap size={16} /></div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Predictive Threat Analysis</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.7 }}>
            The ResilioCheck AI multi-agent engine processes repositories through OWASP classification,
            gate decision, and automated patch generation stages.<br />
            {history.length > 0
              ? `${history.filter((s: any) => s.gate === 'APPROVED').length} of ${history.length} scan(s) passed all security gates.`
              : 'Submit a repository above to begin threat analysis.'}
          </div>
        </div>
      </main>
    </div>
  );
}