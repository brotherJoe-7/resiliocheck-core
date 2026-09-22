'use client';
import { apiJson } from '@/app/utils/apiClient';
import type { AdminUser, AdminStats, AuditLog } from '@/app/types';
import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';
import { Settings, AlertTriangle, RefreshCw, ShieldCheck, ShieldOff, UserCheck } from 'lucide-react';

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const [u, s, logs] = await Promise.all([
        apiJson<AdminUser[]>('/api/admin/users').catch(() => [] as AdminUser[]),
        apiJson<AdminStats>('/api/admin/stats').catch(() => null),
        apiJson<AuditLog[]>('/api/admin/audit-logs').catch(() => [] as AuditLog[]),
      ]);
      setUsers(Array.isArray(u) ? u : []);
      setStats(s);
      setAuditLogs(Array.isArray(logs) ? logs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'superadmin' && user.role !== 'admin') { router.push('/dashboard'); return; }
    // Schedule the initial fetch on the next tick so state updates do not run
    // synchronously inside the effect body (react-hooks/set-state-in-effect).
    const t = setTimeout(() => { void loadAll(); }, 0);
    return () => clearTimeout(t);
  }, [user, authLoading, router, loadAll]);

  async function updateRole(userId: number, newRole: string) {
    setError('');
    try {
      await apiJson(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      setUsers(u => u.map(x => x.id === userId ? { ...x, role: newRole } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role');
    }
  }

  async function deactivate(userId: number) {
    if (!confirm('Deactivate this user? They will no longer be able to sign in.')) return;
    setError('');
    try {
      await apiJson(`/api/admin/users/${userId}`, { method: 'DELETE' });
      setUsers(u => u.map(x => x.id === userId ? { ...x, is_active: false } : x));
      await loadAll(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deactivate user');
    }
  }

  async function reactivate(userId: number) {
    setError('');
    try {
      await apiJson(`/api/admin/users/${userId}/reactivate`, { method: 'POST' });
      setUsers(u => u.map(x => x.id === userId ? { ...x, is_active: true } : x));
      await loadAll(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reactivate user');
    }
  }

  const rolePill = (role: string) => {
    const colors: Record<string, string> = { superadmin: 'rc-pill-orange', admin: 'rc-pill-teal', user: 'rc-pill-gray' };
    return <span className={`rc-pill ${colors[role] || 'rc-pill-gray'}`}>{role}</span>;
  };

  const actionColor = (action: string) => {
    if (action === 'SCAN_COMPLETED') return 'rc-pill-teal';
    if (action === 'LOGIN' || action === 'USER_REGISTERED') return 'rc-pill-green';
    if (action === 'USER_DEACTIVATION') return 'rc-pill-red';
    if (action === 'USER_REACTIVATION') return 'rc-pill-orange';
    if (action === 'ROLE_CHANGE') return 'rc-pill-yellow';
    return 'rc-pill-gray';
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="rc-main">
        <div className="rc-page-hdr">
          <div>
            <div className="rc-page-title"><Settings size={24} style={{ display: 'inline', marginRight: 10 }} />Super Admin Dashboard</div>
            <div className="rc-page-sub">Manage all platform users, roles, and monitor global usage — including tester activity for your evaluation.</div>
          </div>
          <button
            onClick={() => loadAll(true)}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Platform Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Total Users', value: stats.total_users, icon: '👥' },
              { label: 'Total Scans', value: stats.total_scans, icon: '🔍' },
              { label: 'Blocked Scans', value: stats.blocked_scans ?? '—', icon: '🛑' },
              { label: 'Admin Users', value: stats.admin_count, icon: '🛡️' },
            ].map(k => (
              <div key={k.label} className="rc-card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>{k.icon}</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ margin: '0 0 20px', padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: 'var(--red)', fontSize: '0.85rem', display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {/* Registered Users */}
        <div className="rc-card" style={{ marginBottom: 24 }}>
          <div className="rc-card-hdr">
            <div className="rc-card-title">👥 Registered Users</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{users.length} account(s)</span>
          </div>
          {loading ? (
            <div style={{ color: 'var(--text-muted)', padding: 16 }}>Loading users...</div>
          ) : (
            <div className="rc-table-wrap">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Scans</th>
                  <th>Last Login</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.full_name || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                    </td>
                    <td>{rolePill(u.role)}</td>
                    <td style={{ fontWeight: 600 }}>{u.scan_count}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {(!u.last_login || u.last_login === 'None' || u.last_login === 'null') ? 'Never' : new Date(u.last_login).toLocaleString()}
                    </td>
                    <td>
                      <span className={`rc-pill ${u.is_active ? 'rc-pill-green' : 'rc-pill-red'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {user?.role === 'superadmin' && (
                          <select
                            value={u.role}
                            onChange={e => updateRole(u.id, e.target.value)}
                            className="rc-input"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'auto' }}
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                            <option value="superadmin">SuperAdmin</option>
                          </select>
                        )}
                        {u.is_active ? (
                          <button onClick={() => deactivate(u.id)} className="rc-btn-secondary" style={{ fontSize: '0.72rem', padding: '4px 10px', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ShieldOff size={12} /> Revoke
                          </button>
                        ) : (
                          <button onClick={() => reactivate(u.id)} className="rc-btn-secondary" style={{ fontSize: '0.72rem', padding: '4px 10px', color: 'var(--green)', borderColor: 'rgba(34,197,94,0.35)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <UserCheck size={12} /> Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Activity / Audit Log */}
        <div className="rc-card">
          <div className="rc-card-hdr">
            <div className="rc-card-title"><ShieldCheck size={16} /> Activity Log</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last 100 events · superadmin only</span>
          </div>
          {loading ? (
            <div style={{ color: 'var(--text-muted)', padding: 16 }}>Loading activity log...</div>
          ) : auditLogs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>
              No activity recorded yet. Events appear here as testers register, log in, and run scans.
            </div>
          ) : (
            <div className="rc-table-wrap">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '0.82rem' }}>{log.admin_email}</td>
                    <td><span className={`rc-pill ${actionColor(log.action)}`}>{log.action.replace('_', ' ')}</span></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.target}>{log.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}