'use client';
import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';

export default function GatesPage() {
  const [gates, setGates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/api/gates')
      .then(res => res.json())
      .then(data => { setGates(data); setLoading(false); })
      .catch(err => console.error(err));
  }, []);

  async function toggle(id: string) {
    setGates(g => g.map(gate => gate.id === id ? { ...gate, active: !gate.active, status: !gate.active ? 'ACTIVE' : 'INACTIVE', statusCls: !gate.active ? 'rc-pill-green' : 'rc-pill-gray' } : gate));
    try {
      await fetch(`http://localhost:8000/api/gates/${id}/toggle`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <main className="rc-main">
        <div className="rc-page-hdr">
          <div>
            <div className="rc-page-title">Security Gates</div>
            <div className="rc-page-sub">Configure proactive blocks in your CI/CD pipeline.</div>
          </div>
          <button className="rc-btn-primary">Create Custom Gate</button>
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

            <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="rc-card">
                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 16 }}>System Health</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Blocked Commits (24h)</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--red)' }}>14</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Bypassed Gates</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)' }}>2</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Avg Evaluation Time</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>1.2s</span>
                </div>
              </div>

              <div className="rc-card">
                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 12 }}>Recent Blocks</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--red)', fontWeight: 600 }}>XSS Prevention</span> blocked PR #492
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>2 hours ago by @johndoe</div>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--red)', fontWeight: 600 }}>Dependency Audit</span> blocked PR #489
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>5 hours ago by @sarah</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
