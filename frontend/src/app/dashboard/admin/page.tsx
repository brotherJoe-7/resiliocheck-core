'use client';
import { fetchApi } from '@/app/utils/apiClient';
import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';
import { Settings, AlertTriangle } from 'lucide-react';


export default function AdminPage() {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Wait until AuthContext has finished restoring session from localStorage
    if (authLoading) return;
    if (!user || !token) { router.push('/login'); return; }
    if (user.role !== 'superadmin' && user.role !== 'admin') { router.push('/dashboard'); return; }

    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetchApi('/api/admin/users', { headers }).then(r => {
        if (!r.ok) throw new Error(`Users fetch failed: ${r.status}`);
        return r.json();
      }),
      fetchApi('/api/admin/stats', { headers }).then(r => {
        if (!r.ok) throw new Error(`Stats fetch failed: ${r.status}`);
        return r.json();
      }),
    ]).then(([u, s]) => {
      setUsers(Array.isArray(u) ? u : []);
      setStats(s);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, [user, token, authLoading]);

  async function updateRole(userId: number, newRole: string) {
    await fetchApi(`/api/admin/users/${userId}/role?role=${newRole}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setUsers(u => u.map(x => x.id === userId ? { ...x, role: newRole } : x));
  }

  async function deactivate(userId: number) {
    await fetchApi(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setUsers(u => u.map(x => x.id === userId ? { ...x, is_active: false } : x));
  }

  const rolePill = (role: string) => {
    const colors: Record<string, string> = { superadmin: 'rc-pill-orange', admin: 'rc-pill-teal', user: 'rc-pill-gray' };
    return <span className={`rc-pill ${colors[role] || 'rc-pill-gray'}`}>{role}</span>;
  };

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <main className="rc-main">
        <div className="rc-page-hdr">
          <div>
            <div className="rc-page-title"><Settings size={24} /> Super Admin Dashboard</div>
            <div className="rc-page-sub">Manage all platform users, roles, and monitor global usage metrics.</div>
          </div>
        </div>

        {/* Platform Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Total Users', value: stats.total_users },
              { label: 'Total Scans (All Time)', value: stats.total_scans },
              { label: 'Admin Users', value: stats.admin_count },
            ].map(k => (
              <div key={k.label} className="rc-card">
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{k.label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ margin: '0 0 20px', padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: 'var(--red)', fontSize: '0.85rem' }}>
            <AlertTriangle size={16} /> {error} — Make sure the FastAPI backend is running on port 8000 and you are logged in.
          </div>
        )}

        <div className="rc-card">
          <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 20 }}>Registered Users</div>
          {loading ? (
            <div style={{ color: 'var(--text-muted)' }}>Loading users...</div>
          ) : (
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
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.last_login === 'None' ? 'Never' : new Date(u.last_login).toLocaleString()}</td>
                    <td>
                      <span className={`rc-pill ${u.is_active ? 'rc-pill-green' : 'rc-pill-gray'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
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
                        {u.is_active && (
                          <button onClick={() => deactivate(u.id)} className="rc-btn-secondary" style={{ fontSize: '0.72rem', padding: '4px 10px', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }}>
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}