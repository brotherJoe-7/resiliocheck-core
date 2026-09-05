'use client';
import { fetchApi } from '@/app/utils/apiClient';
import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import { Check } from 'lucide-react';


export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchApi('/api/deployments')
      .then(res => res.json())
      .then(data => { setDeployments(data); setLoading(false); })
      .catch(err => console.error(err));
  }, []);

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
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 20 }}>Active & Recent Deployments</div>
          {loading ? (
            <div style={{ color: 'var(--text-muted)' }}>Loading deployments...</div>
          ) : deployments.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No deployments found.</div>
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
                        {dep.checks.map((chk: any, idx: number) => (
                          <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {chk.ok === true && <span style={{ color: 'var(--green)' }}><Check size={16} /></span>}
                            {chk.ok === false && <span style={{ color: 'var(--red)' }}>!</span>}
                            {chk.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginLeft: 24 }}>
                    {dep.actions.map((act: string) => (
                      <button key={act} className={act === 'Rollback' || act === 'Cancel' ? 'rc-btn-secondary rc-btn-danger' : 'rc-btn-secondary'} onClick={() => alert(`${act} action is coming soon.`)}>
                        {act}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {isModalOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div className="rc-card" style={{ width: 600 }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>Connect GitHub Actions</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
                Copy and paste the following snippet into a new file at <code>.github/workflows/resiliocheck.yml</code> in your repository.
                Ensure you have added your <code>RESILIOCHECK_API_KEY</code> as a GitHub Repository Secret.
              </div>
              
              <pre style={{ background: '#1e1e1e', padding: 16, borderRadius: 8, fontSize: '0.8rem', overflowX: 'auto', marginBottom: 20, border: '1px solid var(--border)' }}>
                <code style={{ color: '#d4d4d4' }}>{`name: ResilioCheck AI Scan

on:
  push:
    branches: [ "main", "master" ]
  pull_request:
    branches: [ "main", "master" ]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger ResilioCheck AI Security Scan
        run: |
          curl -X POST https://resiliocheck.io/api/scan \\
            -H "Authorization: Bearer \${{ secrets.RESILIOCHECK_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{"repo_url":"https://github.com/\${{ github.repository }}","branch":"\${{ github.ref_name }}","engine":"Groq Llama 3.3"}'
`}</code>
              </pre>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button className="rc-btn-secondary" onClick={() => setIsModalOpen(false)}>Close</button>
                <button className="rc-btn-primary" onClick={() => { navigator.clipboard.writeText('name: ResilioCheck AI Scan\n\non:\n  push:\n    branches: [ "main", "master" ]\n  pull_request:\n    branches: [ "main", "master" ]\n\njobs:\n  scan:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Trigger ResilioCheck AI Security Scan\n        run: |\n          curl -X POST https://resiliocheck.io/api/scan \\\n            -H "Authorization: Bearer ${{ secrets.RESILIOCHECK_API_KEY }}" \\\n            -H "Content-Type: application/json" \\\n            -d \'{"repo_url":"https://github.com/${{ github.repository }}","branch":"${{ github.ref_name }}","engine":"Groq Llama 3.3"}\''); alert('Copied to clipboard!'); setIsModalOpen(false); }}>Copy Snippet</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}