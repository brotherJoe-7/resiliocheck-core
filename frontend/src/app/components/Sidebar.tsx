'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { href: '/dashboard/gates', label: 'Security Gates', icon: '🛡' },
  { href: '/dashboard/deployments', label: 'Deployments', icon: '🚀' },
  { href: '/dashboard/agents', label: 'Agents', icon: '🖥' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar({ user = 'System Administrator' }: { user?: string }) {
  const pathname = usePathname();
  const initials = user.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

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
      </nav>

      <div className="rc-sidebar-footer">
        <div className="rc-user">
          <div className="rc-user-avatar">{initials}</div>
          <div>
            <div className="rc-user-name">{user}</div>
            <div className="rc-user-role">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              AUTONOMOUS MODE: ACTIVE
            </div>
          </div>
        </div>
        <Link href="/dashboard/settings" className="rc-footer-link">
          <span>👤</span> Profile
        </Link>
        <Link href="/" className="rc-footer-link">
          <span>↪</span> Logout
        </Link>
      </div>
    </aside>
  );
}
