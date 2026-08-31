'use client';
import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/api/deployments')
      .then(res => res.json())
      .then(data => { setDeployments(data); setLoading(false); })
      .catch(err => console.error(err));
  }, []);

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <main className="rc-main">
        <div className="rc-page-hdr">
          <div>
            <div className="rc-page-title">Deployments Pipeline</div>
            <div className="rc-page-sub">Real-time monitoring of CI/CD rollouts and security validations.</div>
          </div>
          <button className="rc-btn-primary">Connect GitHub Actions</button>
        </div>

        {/* Dynamic KPI metrics derived from real scan data */}
        {!loading && (() => {
          const total    = deployments.length;
          const blocked  = deployments.filter((d: any) => d.status === 'Failed').length;
          const success  = total - blocked;
          const rate     = total > 0 ? ((success / total) * 100).toFixed(1) : '—';
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
              {[
                { label: 'Total Scans',          value: total,             trend: 'From database' },
                { label: 'Blocked Deployments',  value: blocked,           trend: 'Gate: BLOCKED' },
                { label: 'Avg Validation Time',  value: '~45s',            trend: 'Multi-agent pipeline' },
                { label: 'Success Rate',         value: `${rate}%`,        trend: 'APPROVED / total' },
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
            {['Total Scans', 'Blocked Deployments', 'Avg Validation Time', 'Success Rate'].map(l => (
              <div key={l} className="rc-card">
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{l}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4, color: 'var(--text-muted)' }}>—</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Loading...</div>
              </div>
            ))}
          </div>
        )}


        <div className="rc-card">
          <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 20 }}>Active & Recent Deployments</div>
          
          {loading ? (
            <div style={{ color: 'var(--text-muted)' }}>Loading deployments...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {deployments.map(dep => (
                <div key={dep.id} style={{ display: 'flex', alignItems: 'center', padding: '16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-base)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: dep.iconColor, fontWeight: 800, marginRight: 16 }}>
                    {dep.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>{dep.id}</span>
                      <span className={`rc-pill ${dep.statusCls}`}>{dep.status}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{dep.title} • {dep.target}</div>
                  </div>
                  
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 24, borderLeft: '1px solid var(--border)' }}>
                    {dep.checks.map((chk: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: chk.ok === false ? 'var(--red)' : 'var(--text-secondary)' }}>
                        {chk.ok === true && <span style={{ color: 'var(--teal)' }}>✓</span>}
                        {chk.ok === false && <span style={{ color: 'var(--red)' }}>✗</span>}
                        {chk.ok === null && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        {chk.label}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginLeft: 24 }}>
                    {dep.actions.map((act: string) => (
                      <button key={act} className={act === 'Rollback' || act === 'Cancel' ? 'rc-btn-secondary rc-btn-danger' : 'rc-btn-secondary'}>
                        {act}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
