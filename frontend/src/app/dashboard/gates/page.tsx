'use client';
import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';

export default function GatesPage() {
  const [gates, setGates]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanStats, setScanStats] = useState({ total: 0, blocked: 0 });

  useEffect(() => {
    fetch('http://localhost:8000/api/gates')
      .then(res => res.json())
      .then(data => { setGates(data); setLoading(false); })
      .catch(err => console.error(err));

    // Load scan history to compute real block/pass counts
    fetch('http://localhost:8000/api/scans')
      .then(res => res.json())
      .then((scans: any[]) => {
        const blocked = scans.filter(s => s.gate === 'BLOCKED').length;
        setScanStats({ total: scans.length, blocked });
      })
      .catch(() => {});
  }, []);

  async function toggle(id: string) {
    setGates(g => g.map(gate => gate.id === id ? { ...gate, active: !gate.active, status: !gate.active ? 'ACTIVE' : 'INACTIVE', statusCls: !gate.active ? 'rc-pill-green' : 'rc-pill-gray' } : gate));
    try {
      await fetch(`http://localhost:8000/api/gates/${id}/toggle`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  }

  const activeCount   = gates.filter(g => g.active).length;
  const passRate      = scanStats.total > 0
    ? (((scanStats.total - scanStats.blocked) / scanStats.total) * 100).toFixed(1)
    : '—';

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <main className="rc-main">
        <div className="rc-page-hdr">
          <div>
            <div className="rc-page-title">Security Gates</div>
            <div className="rc-page-sub">Configure proactive blocks in your CI/CD pipeline.</div>
          </div>
          <button className="rc-btn-primary" onClick={() => alert('Custom Gate creation wizard is coming soon.')}>Create Custom Gate</button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Loading gates...</div>
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
                        {gate.strictness.map((s: string) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Action on Failure</div>
                      <select className="rc-input">
                        {gate.action.map((a: string) => <option key={a}>{a}</option>)}
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
                  <div>🔴 <strong>BLOCKED</strong> when Critical ≥ 1</div>
                  <div>🟠 <strong>BLOCKED</strong> when High ≥ 3</div>
                  <div>🟢 <strong>APPROVED</strong> otherwise</div>
                  <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    Policy enforced by the AI Gate Decision Agent using prompts defined in <code style={{ fontSize: '0.72rem' }}>config/prompts.py</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

