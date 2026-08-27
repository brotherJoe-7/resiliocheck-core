'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { href: '/dashboard/gates', label: 'Security Gates', icon: '🛡' },
  { href: '/dashboard/deployments', label: 'Deployments', icon: '🚀' },
  { href: '/dashboard/agents', label: 'Agents', icon: '🖥' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const displayName = user?.full_name || user?.email || 'System Administrator';
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const isSuperAdmin = user?.role === 'superadmin';

  function handleLogout() {
    logout();
    router.push('/');
  }

  return (
    <aside className="rc-sidebar">
      <div className="rc-sidebar-brand">
        <div className="rc-sidebar-logo">ResilioCheck AI</div>
        <div className="rc-sidebar-sub">Autonomous Security</div>
      </div>

      <nav className="rc-nav">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link key={href} href={href} className={`rc-nav-item ${active ? 'active' : ''}`}>
              <span style={{ fontSize: '0.85rem', width: 18, textAlign: 'center' }}>{icon}</span>
              {label}
            </Link>
          );
        })}

        {isSuperAdmin && (
          <Link
            href="/dashboard/admin"
            className={`rc-nav-item ${pathname.startsWith('/dashboard/admin') ? 'active' : ''}`}
            style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}
          >
            <span style={{ fontSize: '0.85rem', width: 18, textAlign: 'center' }}>👑</span>
            Admin Control
          </Link>
        )}
      </nav>

      <div className="rc-sidebar-footer">
        <div className="rc-user">
          <div className="rc-user-avatar">{initials}</div>
          <div>
            <div className="rc-user-name">{displayName}</div>
            <div className="rc-user-role">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              {isSuperAdmin ? 'SUPER ADMIN' : user?.role?.toUpperCase() || 'USER'}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--green)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
          AUTONOMOUS MODE: ACTIVE
        </div>
        <Link href="/dashboard/settings" className="rc-footer-link">
          <span>👤</span> Profile
        </Link>
        <button
          onClick={handleLogout}
          className="rc-footer-link"
          style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: 0 }}
        >
          <span>↪</span> Logout
        </button>
      </div>
    </aside>
  );
}
