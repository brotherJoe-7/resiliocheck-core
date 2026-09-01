'use client';
import { fetchApi } from '../../utils/apiClient';
import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import { Circle } from 'lucide-react';


export default function GatesPage() {
  const [gates, setGates]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanStats, setScanStats] = useState({ total: 0, blocked: 0 });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newGate, setNewGate] = useState({ name: '', desc: '', strictness: 'Standard', action: 'Alert Only' });

  useEffect(() => {
    fetchApi('/api/gates')
      .then(res => res.json())
      .then(data => { setGates(data); setLoading(false); })
      .catch(err => console.error(err));

    // Load scan history to compute real block/pass counts
    fetchApi('/api/scans')
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
      await fetchApi(`/api/gates/${id}/toggle`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateGate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetchApi('/api/gates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGate)
      });
      const data = await res.json();
      if (data.status === 'success') {
        setGates([...gates, data.gate]);
        setIsModalOpen(false);
        setNewGate({ name: '', desc: '', strictness: 'Standard', action: 'Alert Only' });
      }
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
          <button className="rc-btn-primary" onClick={() => setIsModalOpen(true)}>Create Custom Gate</button>
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
                        {gate.strictness.map ? gate.strictness.map((s: string) => <option key={s}>{s}</option>) : <option>{gate.strictness}</option>}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Action on Failure</div>
                      <select className="rc-input">
                        {gate.action.map ? gate.action.map((a: string) => <option key={a}>{a}</option>) : <option>{gate.action}</option>}
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
