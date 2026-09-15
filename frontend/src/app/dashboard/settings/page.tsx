'use client';
import { apiJson } from '@/app/utils/apiClient';
import type { Settings } from '@/app/types';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Sidebar from '../../components/Sidebar';

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, mode, setTheme, setMode } = useTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workspace, setWorkspace] = useState('');
  const [timezone, setTimezone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [loadError, setLoadError] = useState('');
  const [githubConnected, setGithubConnected] = useState(false);

  useEffect(() => {
    // Load Settings
    apiJson<Settings>('/api/settings')
      .then(data => {
        setSettings(data);
        setWorkspace(data.workspace || '');
        setTimezone(data.timezone || '');
        setLoading(false);
      })
      .catch(err => { setLoadError(err instanceof Error ? err.message : 'Failed to load settings.'); setLoading(false); });
      
    // Load current user profile (for github status)
    apiJson<{ github_connected: boolean }>('/api/auth/me')
      .then(me => setGithubConnected(me.github_connected))
      .catch(console.error);
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      await apiJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, timezone, theme, mode })
      });
      setMessage('Settings saved successfully.');
    } catch (err) {
      setMessage(err instanceof Error ? `Failed to save: ${err.message}` : 'Failed to save settings.');
    }
    setSaving(false);
    setTimeout(() => setMessage(''), 3000);
  }

  return (
    <div>
      <Sidebar />
      <main className="rc-main">
        <div className="rc-page-hdr">
          <div>
            <div className="rc-page-title">Organization Settings</div>
            <div className="rc-page-sub">Manage workspace preferences, billing, and team access.</div>
          </div>
        </div>

        {loadError ? (
          <div style={{ color: 'var(--red)' }}>{loadError}</div>
        ) : loading || !settings ? (
          <div style={{ color: 'var(--text-muted)' }}>Loading settings...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="rc-card">
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>Workspace Preferences</div>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Theme Color</label>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {[
                      { id: 'orange', color: '#ea580c' },
                      { id: 'blue',   color: '#3b82f6' },
                      { id: 'purple', color: '#a855f7' },
                      { id: 'green',  color: '#10b981' }
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        title={t.id}
                        style={{
                          width: 32, height: 32, borderRadius: '50%', background: t.color,
                          border: theme === t.id ? '3px solid white' : '2px solid transparent',
                          cursor: 'pointer', outlineOffset: 3,
                          outline: theme === t.id ? `2px solid ${t.color}` : 'none',
                          transition: 'transform 0.15s',
                          transform: theme === t.id ? 'scale(1.15)' : 'scale(1)'
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>Click Save Changes to apply permanently.</div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Display Mode</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[{ id: 'dark', label: '🌙 Dark' }, { id: 'light', label: '☀️ Light' }].map(m => (
                      <button
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        style={{
                          padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                          border: mode === m.id ? '2px solid var(--accent)' : '2px solid var(--border)',
                          background: mode === m.id ? 'var(--accent)' : 'var(--bg-card)',
                          color: mode === m.id ? 'white' : 'var(--text-secondary)',
                          transition: 'all 0.15s'
                        }}
                      >{m.label}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>Click Save Changes to apply permanently.</div>
                </div>

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

              <div className="rc-card">
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>Connected Accounts</div>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <div>
                      <div style={{ fontWeight: 600 }}>GitHub</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Scan public & private repositories</div>
                    </div>
                  </div>
                  {githubConnected ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600, padding: '4px 10px', background: 'rgba(20,209,120,0.1)', borderRadius: 20 }}>Connected</span>
                      <button 
                        className="rc-btn-secondary"
                        onClick={async () => {
                          if (!confirm("Are you sure you want to disconnect GitHub? You will no longer be able to scan private repositories.")) return;
                          try {
                            const res = await fetch('/api/auth/github', {
                              method: 'DELETE',
                              headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                            });
                            if (!res.ok) throw new Error("Failed to disconnect");
                            setGithubConnected(false);
                            setMessage("GitHub account disconnected.");
                          } catch (e) {
                            setMessage("Error disconnecting GitHub.");
                          }
                        }}
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button 
                      className="rc-btn-secondary" 
                      onClick={async () => {
                        try {
                          const data = await apiJson<{ url: string }>('/api/auth/github/oauth-url');
                          window.location.href = data.url;
                        } catch (e) {
                          setMessage(e instanceof Error ? `GitHub error: ${e.message}` : 'Failed to connect GitHub.');
                        }
                      }}
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="rc-card" style={{ border: '1px solid var(--accent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Resource Usage</div>
                  <div className="rc-pill rc-pill-green">Active</div>
                </div>
                
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
                  LLM API usage and workspace limits for this university project.
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 6 }}>
                    <span>Monthly LLM Scan Budget</span>
                    <span style={{ fontWeight: 600 }}>{settings.plan?.seats_used || 0} / 100 Scans</span>
                  </div>
                  <div style={{ width: '100%', height: 6, background: 'var(--bg-base)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(((settings.plan?.seats_used || 0) / 100) * 100, 100)}%`, height: '100%', background: 'var(--accent)' }} />
                  </div>
                </div>
              </div>

              {(user?.role === 'admin' || user?.role === 'superadmin') && (
                <div className="rc-card">
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>Team Members ({(settings.team || []).length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(settings.team || []).map((m) => (
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
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}