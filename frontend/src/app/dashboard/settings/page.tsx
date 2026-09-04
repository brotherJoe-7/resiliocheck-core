'use client';
import { fetchApi } from '@/app/utils/apiClient';
import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [workspace, setWorkspace] = useState('');
  const [timezone, setTimezone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchApi('/api/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        setWorkspace(data.workspace);
        setTimezone(data.timezone);
        setLoading(false);
      })
      .catch(err => console.error(err));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      await fetchApi('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, timezone })
      });
      setMessage('Settings saved successfully.');
    } catch (err) {
      setMessage('Failed to save settings.');
    }
    setSaving(false);
    setTimeout(() => setMessage(''), 3000);
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <main className="rc-main">
        <div className="rc-page-hdr">
          <div>
            <div className="rc-page-title">Organization Settings</div>
            <div className="rc-page-sub">Manage workspace preferences, billing, and team access.</div>
          </div>
        </div>

        {loading || !settings ? (
          <div style={{ color: 'var(--text-muted)' }}>Loading settings...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="rc-card">
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>Workspace Preferences</div>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Workspace Name</label>
                  <input type="text" className="rc-input" value={workspace} onChange={e => setWorkspace(e.target.value)} />
                </div>
                
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Primary Timezone</label>
                  <select className="rc-input" value={timezone} onChange={e => setTimezone(e.target.value)}>
                    <option>UTC (Coordinated Universal Time)</option>
                    <option>EST (Eastern Standard Time)</option>
                    <option>PST (Pacific Standard Time)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <button className="rc-btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  {message && <span style={{ fontSize: '0.85rem', color: 'var(--teal)' }}>{message}</span>}
                </div>
              </div>

              <div className="rc-card">
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>API Keys</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>Use these keys to authenticate the CLI and CI/CD integrations.</div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <input type="password" readOnly value="rc_prod_8f92a4bc8..." className="rc-input" style={{ flex: 1, fontFamily: 'monospace' }} />
                  <button className="rc-btn-secondary" onClick={() => alert('API Key copied to clipboard.')}>Copy</button>
                  <button className="rc-btn-secondary" onClick={() => alert('Are you sure you want to revoke this key? (Feature coming soon)')}>Revoke</button>
                </div>
                <button className="rc-btn-secondary" style={{ width: 'auto' }} onClick={() => alert('Key generation is coming soon.')}>+ Generate New Key</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="rc-card" style={{ border: '1px solid var(--accent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{settings.plan.name}</div>
                  <div className="rc-pill rc-pill-orange">{settings.plan.status}</div>
                </div>
                
                <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 4 }}>${settings.plan.price}<span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/{settings.plan.period}</span></div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20 }}>{settings.plan.billing_cycle}</div>
                
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 6 }}>
                    <span>Developer Seats ({settings.plan.seats_used}/{settings.plan.seats_total})</span>
                    <span style={{ fontWeight: 600 }}>{Math.round((settings.plan.seats_used / settings.plan.seats_total) * 100)}%</span>
                  </div>
                  <div style={{ width: '100%', height: 6, background: 'var(--bg-base)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(settings.plan.seats_used / settings.plan.seats_total) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                  </div>
                </div>
                
                <button className="rc-btn-secondary" style={{ width: '100%' }} onClick={() => alert('Billing portal is coming soon.')}>Manage Billing</button>
              </div>

              <div className="rc-card">
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>Team Members ({settings.team.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {settings.team.map((m: any) => (
                    <div key={m.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{m.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.email}</div>
                      </div>
                      <div style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 4, background: 'var(--bg-base)', color: 'var(--text-secondary)' }}>{m.role}</div>
                    </div>
                  ))}
                  <button className="rc-btn-secondary" style={{ marginTop: 8 }} onClick={() => alert('Invite member feature is coming soon.')}>+ Invite Member</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}