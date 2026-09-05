'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { LayoutGrid, Settings, Rocket, Shield, Monitor, Crown, User, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';

const NAV = [
  { href: '/dashboard',             label: 'Dashboard',      Icon: LayoutGrid },
  { href: '/dashboard/gates',       label: 'Security Gates', Icon: Shield },
  { href: '/dashboard/deployments', label: 'Deployments',    Icon: Rocket },
  { href: '/dashboard/agents',      label: 'Agents',         Icon: Monitor },
  { href: '/dashboard/settings',    label: 'Settings',       Icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName = user?.full_name || user?.email || 'System Administrator';
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const isSuperAdmin = user?.role === 'superadmin';

  function handleLogout() {
    logout();
    router.push('/');
  }

  const sidebarContent = (
    <aside className={`rc-sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="rc-sidebar-brand">
        <Link href="/" style={{ textDecoration: 'none', display: 'block' }}>
          <Image
            src="/logo.jpg"
            alt="ResilioCheck AI"
            width={160}
            height={36}
            style={{ objectFit: 'contain', width: '100%', height: 'auto', maxHeight: 36 }}
            priority
          />
        </Link>
        <div className="rc-sidebar-sub">Autonomous Security</div>
      </div>

      <nav className="rc-nav">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link key={href} href={href} className={`rc-nav-item ${active ? 'active' : ''}`} onClick={() => setMobileOpen(false)}>
              <Icon size={16} />
              {label}
            </Link>
          );
        })}

        {isSuperAdmin && (
          <Link
            href="/dashboard/admin"
            className={`rc-nav-item ${pathname.startsWith('/dashboard/admin') ? 'active' : ''}`}
            style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}
            onClick={() => setMobileOpen(false)}
          >
            <Crown size={16} />
            Admin Control
          </Link>
        )}
      </nav>

      <div className="rc-sidebar-footer">
        <div className="rc-user">
          <div className="rc-user-avatar">{initials}</div>
          <div>
            <div className="rc-user-name">{displayName.split(' ')[0]}</div>
            <div className="rc-user-role">
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              {user?.role || 'user'}
            </div>
          </div>
        </div>
        <Link href="/dashboard/settings" className="rc-footer-link" onClick={() => setMobileOpen(false)}>
          <User size={14} /> Profile
        </Link>
        <button onClick={handleLogout} className="rc-footer-link" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left' }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="rc-mobile-topbar">
        <button className="rc-mobile-topbar-btn" onClick={() => setMobileOpen(true)}>
          <Menu size={20} /> Menu
        </button>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Image src="/logo.jpg" alt="ResilioCheck AI" width={120} height={28} style={{ objectFit: 'contain', height: 28, width: 'auto' }} />
        </Link>
        <div style={{ width: 60 }} />
      </div>

      {/* Backdrop overlay */}
      {mobileOpen && (
        <div className="rc-sidebar-overlay open" onClick={() => setMobileOpen(false)} />
      )}

      {/* Close button inside sidebar on mobile */}
      {sidebarContent}
    </>
  );
}
