'use client';
import { apiJson, getApiBaseUrl } from '@/app/utils/apiClient';
import type { Deployment, ScanResult } from '@/app/types';
import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import { Check, X, AlertTriangle, Shield, Clock, GitBranch, ExternalLink } from 'lucide-react';

const API_BASE = getApiBaseUrl();
const WORKFLOW_SNIPPET = `name: ResilioCheck AI Scan
on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger ResilioCheck AI Security Scan
        run: |
          curl -sf -X POST ${API_BASE}/api/scan \\
            -H "Authorization: Bearer \${{ secrets.RESILIOCHECK_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{"repo_url":"https://github.com/\${{ github.repository }}","branch":"\${{ github.ref_name }}"}'`;

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [copied, setCopied] = useState(false);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(WORKFLOW_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Clipboard access denied — please copy the snippet manually.');
    }
  }
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logsModal, setLogsModal] = useState<{ open: boolean; scan: ScanResult | { error: string } | null; loading: boolean }>({
    open: false, scan: null, loading: false,
  });

  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    apiJson<Deployment[]>('/api/deployments')
      .then(data => { setDeployments(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(e => { setLoadError(e instanceof Error ? e.message : 'Failed to load deployments.'); setLoading(false); });
  }, []);

  async function openLogs(dep: Deployment) {
    setLogsModal({ open: true, scan: null, loading: true });
    try {
      const scan = await apiJson<ScanResult>(`/api/scans/${dep.scan_id}`);
      setLogsModal({ open: true, scan, loading: false });
    } catch (e) {
      setLogsModal({ open: true, scan: { error: e instanceof Error ? e.message : 'Failed to load logs.' }, loading: false });
    }
  }

  function handleAction(act: string, dep: Deployment) {
    if (act === 'Logs') { openLogs(dep); return; }
    if (act === 'Rollback') { alert('Rollback requires a manual re-deploy. Contact your DevOps team.'); return; }
    alert(`${act} action not yet available.`);
  }

  return (
    <div>
      <Sidebar />
      <main className="rc-main">
        <div className="rc-page-hdr">
          <div>
            <div className="rc-page-title">Deployments Pipeline</div>
            <div className="rc-page-sub">Real-time monitoring of CI/CD rollouts and security validations.</div>
          </div>
          <button className="rc-btn-primary" onClick={() => setIsModalOpen(true)}>Connect GitHub Actions</button>
        </div>

        {/* KPI cards */}
        {!loading && (() => {
          const total   = deployments.length;
          const blocked = deployments.filter((d) => d.status === 'Failed').length;
          const success = total - blocked;
          const rate    = total > 0 ? ((success / total) * 100).toFixed(1) : '0';
          return (
            <div className="rc-grid-4" style={{ marginBottom: 32 }}>
              {[
                { label: 'Total Scans',         value: total,      trend: 'From database' },
                { label: 'Blocked Deployments', value: blocked,    trend: 'Gate: BLOCKED' },
                { label: 'Avg Validation Time', value: '~45s',     trend: 'Multi-agent pipeline' },
                { label: 'Success Rate',        value: `${rate}%`, trend: 'APPROVED / total' },
              ].map(k => (
                <div key={k.label} className="rc-card">
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{k.label}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4 }}>{k.value}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{k.trend}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {loading && (
          <div className="rc-grid-4" style={{ marginBottom: 32 }}>
            {['Total Scans', 'Blocked Deployments', 'Avg Validation Time', 'Success Rate'].map(l => (
              <div key={l} className="rc-card">
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{l}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4, color: 'var(--text-muted)' }}>—</div>
              </div>
            ))}
          </div>
        )}

        <div className="rc-card">
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 20 }}>Active &amp; Recent Deployments</div>
          {loading ? (
            <div style={{ color: 'var(--text-muted)' }}>Loading deployments...</div>
          ) : loadError ? (
            <div style={{ color: 'var(--red)' }}>{loadError}</div>
          ) : deployments.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No deployments found. Run a scan first!</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {deployments.map(dep => (
                <div key={dep.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div className={`rc-pill ${dep.statusCls}`} style={{ width: 80, justifyContent: 'center' }}>{dep.status}</div>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: dep.iconColor, fontWeight: 700 }}>
                      {dep.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4 }}>{dep.title} <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>{dep.id}</span></div>
                      <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span>{dep.target}</span>
                        {dep.checks.map((chk, idx) => (
                          <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {chk.ok === true && <span style={{ color: 'var(--green)' }}><Check size={12} /></span>}
                            {chk.ok === false && <span style={{ color: 'var(--red)' }}>✕</span>}
                            {chk.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginLeft: 24 }}>
                    {dep.actions.map((act: string) => (
                      <button
                        key={act}
                        className={act === 'Rollback' ? 'rc-btn-secondary rc-btn-danger' : 'rc-btn-secondary'}
                        onClick={() => handleAction(act, dep)}
                      >
                        {act}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Logs Modal ── */}
        {logsModal.open && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(6px)', padding: 24 }}
            onClick={() => setLogsModal({ open: false, scan: null, loading: false })}
          >
            <div className="rc-card" style={{ width: '100%', maxWidth: 720, maxHeight: '88vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Scan Logs</div>
                <button className="rc-btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setLogsModal({ open: false, scan: null, loading: false })}>
                  <X size={16} />
                </button>
              </div>

              {logsModal.loading && <div style={{ color: 'var(--text-muted)', padding: '32px 0', textAlign: 'center' }}>Loading scan data...</div>}
              {!logsModal.loading && logsModal.scan && 'error' in logsModal.scan && <div style={{ color: 'var(--red)' }}>{logsModal.scan.error}</div>}

              {!logsModal.loading && logsModal.scan && !('error' in logsModal.scan) && (() => {
                const s = logsModal.scan as ScanResult;
                const passed = s.gate === 'APPROVED';
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Meta */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[
                        { label: 'Repository', content: <a href={s.repo_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>{(s.repo_url || '').replace('https://github.com/', '')} <ExternalLink size={12} /></a> },
                        { label: 'Scanned At', content: <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={12} />{s.scanned_at ? new Date(s.scanned_at).toLocaleString() : '—'}</span> },
                        { label: 'Branch', content: <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><GitBranch size={12} />{s.branch}</span> },
                        { label: 'Engine', content: s.engine || '—' },
                      ].map(item => (
                        <div key={item.label} style={{ background: 'var(--bg-base)', borderRadius: 8, padding: '12px 14px' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>{item.label}</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{item.content}</div>
                        </div>
                      ))}
                    </div>

                    {/* Gate verdict */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 8, background: passed ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${passed ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                      <Shield size={20} color={passed ? 'var(--green)' : 'var(--red)'} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: passed ? 'var(--green)' : 'var(--red)' }}>Security Gate: {s.gate}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>{s.gate_rationale}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 16 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--red)' }}>{s.critical_count}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>CRITICAL</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f97316' }}>{s.high_count}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>HIGH</div>
                        </div>
                      </div>
                    </div>

                    {/* Findings */}
                    {s.findings && s.findings.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10 }}>Vulnerability Findings ({s.findings.length})</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {s.findings.map((f, idx) => (
                            <div key={idx} style={{ padding: '10px 14px', background: 'var(--bg-base)', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontWeight: 700 }}>{f.title || f.owasp_class || `Finding #${idx + 1}`}</span>
                                {f.severity && <span className={`rc-pill ${String(f.severity).toUpperCase() === 'CRITICAL' ? 'rc-pill-red' : String(f.severity).toUpperCase() === 'HIGH' ? 'rc-pill-orange' : 'rc-pill-gray'}`}>{f.severity}</span>}
                              </div>
                              {f.description && <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{f.description}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Secrets */}
                    {s.secret_findings && s.secret_findings.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10, color: '#f97316', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AlertTriangle size={16} /> Secret Findings ({s.secret_findings.length})
                        </div>
                        {s.secret_findings.map((f, idx) => (
                          <div key={idx} style={{ padding: '10px 14px', background: 'rgba(249,115,22,0.05)', borderRadius: 6, border: '1px solid rgba(249,115,22,0.3)', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                            <><strong>[{f.pattern}]</strong> {f.file}:{f.line} — <code>{f.snippet}</code></>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* AI Explanation */}
                    {s.explanation && (
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10 }}>AI Analysis</div>
                        <div style={{ background: 'var(--bg-base)', borderRadius: 8, padding: '14px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7, border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>{s.explanation}</div>
                      </div>
                    )}

                    {/* Patch */}
                    {s.patched_filename && (
                      <div style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>Auto-Patch Generated</div>
                            <div style={{ color: 'var(--text-muted)' }}>File: <code>{s.patched_filename}</code></div>
                          </div>
                          <span className={`rc-pill ${s.patch_status === 'APPLIED' || s.patch_status === 'APPROVED' ? 'rc-pill-teal' : s.patch_status === 'REJECTED' ? 'rc-pill-red' : 'rc-pill-gray'}`}>{s.patch_status}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Connect GitHub Actions Modal ── */}
        {isModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div className="rc-card" style={{ width: 600 }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>Connect GitHub Actions</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
                Copy and paste the following snippet into <code>.github/workflows/resiliocheck.yml</code> in your repository and add <code>RESILIOCHECK_API_KEY</code> as a GitHub Secret.
              </div>
              <pre style={{ background: '#1e1e1e', padding: 16, borderRadius: 8, fontSize: '0.8rem', overflowX: 'auto', marginBottom: 20, border: '1px solid var(--border)' }}>
                <code style={{ color: '#d4d4d4' }}>{WORKFLOW_SNIPPET}</code>
              </pre>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
                {copied && <span style={{ fontSize: '0.8rem', color: 'var(--green)' }}>Copied to clipboard</span>}
                <button className="rc-btn-secondary" onClick={() => setIsModalOpen(false)}>Close</button>
                <button className="rc-btn-primary" onClick={copySnippet}>Copy Snippet</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
