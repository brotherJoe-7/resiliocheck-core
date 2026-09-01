'use client';
import { fetchApi } from '../../utils/apiClient';
import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi('/api/agents')
      .then(res => res.json())
      .then(data => { setAgents(data); setLoading(false); })
      .catch(err => console.error(err));
  }, []);

  async function toggle(id: string) {
    // Optimistic update
    setAgents(a => a.map(ag => ag.id === id ? { ...ag, active: !ag.active, statusLabel: !ag.active ? 'Working' : 'Idle', statusColor: !ag.active ? 'var(--green)' : 'var(--text-muted)' } : ag));
    
    // Server sync
    try {
      await fetchApi(`/api/agents/${id}/toggle`, { method: 'POST' });
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
            <div className="rc-page-title">Agent Command Center</div>
            <div className="rc-page-sub">Monitor and configure autonomous remediation agents.</div>
          </div>
          <button className="rc-btn-primary" onClick={() => alert('Agent deployment marketplace is coming soon.')}>＋ Deploy New Agent</button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Loading agents...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {agents.map(agent => (
              <div key={agent.id} className="rc-card" style={{ opacity: agent.active ? 1 : 0.65, transition: 'opacity 0.3s' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: 'var(--accent)' }}>{agent.icon}</div>
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{agent.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 600, color: agent.statusColor }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: agent.statusColor, display: 'inline-block' }} />
                        {agent.statusLabel}
                      </div>
                    </div>
                  </div>
                  <label className="rc-toggle">
                    <input type="checkbox" checked={agent.active} onChange={() => toggle(agent.id)} />
                    <div className="rc-toggle-track" />
                    <div className="rc-toggle-thumb" />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {agent.stats.map((s: any) => (
                    <div key={s.label}>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Latest Log</div>
                  <pre style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0 }}>{agent.log}</pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}