'use client';
import { apiJson, getApiBaseUrl } from '@/app/utils/apiClient';
import type { Gate, ScanResult } from '@/app/types';
import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import { Circle, GitBranch, Trash2, Plus, ExternalLink } from 'lucide-react';

interface MonitoredRepo {
  id: number;
  repo_url: string;
  branch: string;
  last_scan_at: string | null;
  last_gate: 'APPROVED' | 'BLOCKED' | 'UNKNOWN';
}

export default function GatesPage() {
  const [gates, setGates]     = useState<Gate[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanStats, setScanStats] = useState({ total: 0, blocked: 0 });
  const [monitored, setMonitored] = useState<MonitoredRepo[]>([]);
  const [newMonitorUrl, setNewMonitorUrl] = useState('');
  const [newMonitorBranch, setNewMonitorBranch] = useState('main');
  const [monitorError, setMonitorError] = useState('');
  const [monitorLoading, setMonitorLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newGate, setNewGate] = useState({ name: '', desc: '', strictness: 'Standard', action: 'Alert Only' });

  const [loadError, setLoadError] = useState('');
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    apiJson<Gate[]>('/api/gates')
      .then(data => { setGates(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(err => { setLoadError(err instanceof Error ? err.message : 'Failed to load gates.'); setLoading(false); });

    // Load scan history to compute real block/pass counts
    apiJson<ScanResult[]>('/api/scans')
      .then((scans) => {
        if (!Array.isArray(scans)) return;
        const blocked = scans.filter(s => s.gate === 'BLOCKED').length;
        setScanStats({ total: scans.length, blocked });
      })
      .catch(() => {});

    // Load monitored repos
    apiJson<MonitoredRepo[]>('/api/monitored-repos')
      .then(data => setMonitored(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  async function toggle(id: string) {
    const prev = gates;
    setGates(g => g.map(gate => gate.id === id ? { ...gate, active: !gate.active, status: !gate.active ? 'ACTIVE' : 'DISABLED', statusCls: !gate.active ? 'rc-pill-green' : 'rc-pill-red' } : gate));
    try {
      const data = await apiJson<{ gate: Gate }>(`/api/gates/${id}/toggle`, { method: 'POST' });
      setGates(g => g.map(gate => gate.id === id ? data.gate : gate));
    } catch (err) {
      console.error(err);
      setGates(prev); // roll back optimistic update
    }
  }

  async function handleCreateGate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    try {
      const data = await apiJson<{ status: string; gate: Gate }>('/api/gates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newGate, strictness: [newGate.strictness], action: [newGate.action] })
      });
      if (data.status === 'success') {
        setGates(g => [...g, data.gate]);
        setIsModalOpen(false);
        setNewGate({ name: '', desc: '', strictness: 'Standard', action: 'Alert Only' });
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create gate.');
    }
  }

  async function handleAddMonitor(e: React.FormEvent) {
    e.preventDefault();
    setMonitorError('');
    setMonitorLoading(true);
    try {
      const data = await apiJson<{ status: string; repo: MonitoredRepo }>('/api/monitored-repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: newMonitorUrl, branch: newMonitorBranch }),
      });
      if (data.status === 'success') {
        setMonitored(m => [data.repo, ...m]);
        setNewMonitorUrl('');
        setNewMonitorBranch('main');
      }
    } catch (err) {
      setMonitorError(err instanceof Error ? err.message : 'Failed to add repository.');
    } finally {
      setMonitorLoading(false);
    }
  }

  async function handleRemoveMonitor(id: number) {
    await apiJson(`/api/monitored-repos/${id}`, { method: 'DELETE' }).catch(console.error);
    setMonitored(m => m.filter(r => r.id !== id));
  }

  const activeCount   = gates.filter(g => g.active).length;
  const passRate      = scanStats.total > 0
    ? (((scanStats.total - scanStats.blocked) / scanStats.total) * 100).toFixed(1)
    : '—';

  const gateColor = (g: string) =>
    g === 'APPROVED' ? 'var(--green)' : g === 'BLOCKED' ? 'var(--red)' : 'var(--text-muted)';
  const gateLabel = (g: string) =>
    g === 'APPROVED' ? '✓ Approved' : g === 'BLOCKED' ? '✗ Blocked' : '— Unknown';

  return (
    <div>
      <Sidebar />
      <main className="rc-main">
        <div className="rc-page-hdr">
          <div>
            <div className="rc-page-title">Security Gates</div>
            <div className="rc-page-sub">Configure proactive blocks in your CI/CD pipeline.</div>
          </div>
          <button className="rc-btn-primary" onClick={() => setIsModalOpen(true)}>Create Custom Gate</button>
        </div>

        {/* ── Continuous Monitoring ──────────────────────────────────────── */}
        <div className="rc-card" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <GitBranch size={20} color="var(--accent)" />
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Continuous Monitoring</div>
            <div className="rc-pill rc-pill-green" style={{ marginLeft: 'auto' }}>{monitored.length} Repo{monitored.length !== 1 ? 's' : ''} Watching</div>
          </div>

          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Register repositories below. Every push will trigger an automatic scan and post a
            <strong style={{ color: 'var(--text-secondary)' }}> commit status</strong> to GitHub —
            blocking the merge if critical vulnerabilities are found.
          </div>

          {/* Add form */}
          <form onSubmit={handleAddMonitor} style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <input
              value={newMonitorUrl} onChange={e => setNewMonitorUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="rc-input" style={{ flex: 2, minWidth: 260 }}
              required
            />
            <input
              value={newMonitorBranch} onChange={e => setNewMonitorBranch(e.target.value)}
              placeholder="Branch (e.g. main)"
              className="rc-input" style={{ flex: 1, minWidth: 120 }}
            />
            <button className="rc-btn-primary" type="submit" disabled={monitorLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Plus size={16} /> Monitor Repo
            </button>
          </form>
          {monitorError && <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: 12 }}>{monitorError}</div>}

          {/* Repo list */}
          {monitored.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No repos monitored yet. Add one above to enable automatic CI gate blocking.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {monitored.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.repo_url.replace('https://github.com/', '')}
                      <a href={r.repo_url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)', display: 'flex' }}><ExternalLink size={12} /></a>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Branch: <strong>{r.branch}</strong> &nbsp;·&nbsp;
                      Last scanned: {r.last_scan_at ? new Date(r.last_scan_at).toLocaleString() : 'Never'}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: gateColor(r.last_gate), whiteSpace: 'nowrap' }}>
                    {gateLabel(r.last_gate)}
                  </div>
                  <button onClick={() => handleRemoveMonitor(r.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title="Stop monitoring">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Webhook setup instructions */}
          <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(234,88,12,0.06)', border: '1px solid rgba(234,88,12,0.2)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--accent)' }}>⚡ Webhook Setup</strong> — In each GitHub repo: <strong>Settings → Webhooks → Add Webhook</strong><br />
            Payload URL: <code style={{ background: 'var(--bg-base)', padding: '1px 6px', borderRadius: 4 }}>{getApiBaseUrl()}/api/webhooks/github</code> &nbsp;·&nbsp;
            Content type: <code style={{ background: 'var(--bg-base)', padding: '1px 6px', borderRadius: 4 }}>application/json</code> &nbsp;·&nbsp;
            Events: <strong>Pushes</strong> + <strong>Pull requests</strong>
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Loading gates...</div>
        ) : loadError ? (
          <div style={{ color: 'var(--red)' }}>{loadError}</div>
        ) : (
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {gates.map(gate => (
                <div key={gate.id} className="rc-card" style={{ opacity: gate.active ? 1 : 0.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{gate.name}</div>
                        <div className={`rc-pill ${gate.statusCls}`}>{gate.status}</div>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{gate.desc}</div>
                    </div>
                    <label className="rc-toggle">
                      <input type="checkbox" checked={gate.active} onChange={() => toggle(gate.id)} />
                      <div className="rc-toggle-track" />
                      <div className="rc-toggle-thumb" />
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Strictness Level</div>
                      <select className="rc-input">
                        {(Array.isArray(gate.strictness) ? gate.strictness : [gate.strictness]).map((s: string) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Action on Failure</div>
                      <select className="rc-input">
                        {(Array.isArray(gate.action) ? gate.action : [gate.action]).map((a: string) => <option key={a}>{a}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Dynamic sidebar */}
            <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="rc-card">
                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 16 }}>System Health</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Active Gates</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--green)' }}>{activeCount} / {gates.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Scans (DB)</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{scanStats.total}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Blocked Deployments</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: scanStats.blocked > 0 ? 'var(--red)' : 'var(--green)' }}>{scanStats.blocked}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Pipeline Pass Rate</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--green)' }}>{passRate}{passRate !== '—' ? '%' : ''}</span>
                </div>
              </div>

              <div className="rc-card">
                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 12 }}>Gate Policy Summary</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                  <div><Circle fill="currentColor" size={16} className="text-red-500" /> <strong>BLOCKED</strong> when Critical ≥ 1</div>
                  <div><Circle fill="currentColor" size={16} className="text-orange-500" /> <strong>BLOCKED</strong> when High ≥ 3</div>
                  <div><Circle fill="currentColor" size={16} className="text-green-500" /> <strong>APPROVED</strong> otherwise</div>
                  <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    Policy enforced by the AI Gate Decision Agent using prompts defined in <code style={{ fontSize: '0.72rem' }}>config/prompts.py</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isModalOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div className="rc-card" style={{ width: 450 }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 16 }}>Create Custom Gate</div>
              <form onSubmit={handleCreateGate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Gate Name</label>
                  <input required type="text" className="rc-input" value={newGate.name} onChange={e => setNewGate({ ...newGate, name: e.target.value })} placeholder="e.g. PCI-DSS Compliance" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Description</label>
                  <textarea required className="rc-input" rows={3} value={newGate.desc} onChange={e => setNewGate({ ...newGate, desc: e.target.value })} placeholder="Describe what this gate enforces..." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Strictness Level</label>
                  <select className="rc-input" value={newGate.strictness} onChange={e => setNewGate({ ...newGate, strictness: e.target.value })}>
                    <option>Standard</option>
                    <option>Block All</option>
                    <option>Permissive</option>
                    <option>Custom AI Policy</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Action on Failure</label>
                  <select className="rc-input" value={newGate.action} onChange={e => setNewGate({ ...newGate, action: e.target.value })}>
                    <option>Alert Only</option>
                    <option>Block Deploy & Alert</option>
                    <option>Auto-Revert Commit</option>
                  </select>
                </div>
                {createError && <div style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{createError}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                  <button type="button" className="rc-btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button type="submit" className="rc-btn-primary">Create Gate</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
