'use client';
import { useState } from 'react';
import Link from 'next/link';

const NAV_ITEMS = ['Platform', 'Solutions', 'Documentation', 'Pricing'] as const;

export default function Navbar({ activeItem }: { activeItem?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 48px', height: 60, borderBottom: '1px solid #27272a', position: 'relative', zIndex: 101, background: '#09090b' }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#ea580c' }}>ResilioCheck AI</div>
        </Link>

        {/* Desktop nav links */}
        <div style={{ display: 'flex', gap: 32, fontSize: '0.85rem', color: '#a1a1aa' }} className="rc-desktop-nav">
          {NAV_ITEMS.map(item => {
            const isActive = activeItem === item;
            const href = item === 'Pricing' ? '/' : `/${item.toLowerCase()}`;
            return (
              <Link
                key={item}
                href={href}
                style={{ color: isActive ? '#ea580c' : '#a1a1aa', textDecoration: isActive ? 'underline' : 'none', textUnderlineOffset: 4, cursor: 'pointer', transition: 'color 0.15s' }}
              >
                {item}
              </Link>
            );
          })}
        </div>

        {/* Desktop CTAs */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }} className="rc-desktop-nav">
          <Link href="/login" style={{ fontSize: '0.82rem', color: '#a1a1aa', textDecoration: 'none' }}>Console Login</Link>
          <Link href="/register" style={{ background: '#ea580c', color: 'white', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }}>Request Access</Link>
        </div>

        {/* Mobile hamburger button */}
        <button className="rc-nav-mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          <span style={{ transform: open ? 'rotate(45deg) translate(4px, 4px)' : 'none' }} />
          <span style={{ opacity: open ? 0 : 1 }} />
          <span style={{ transform: open ? 'rotate(-45deg) translate(4px, -4px)' : 'none' }} />
        </button>
      </nav>

      {/* Mobile overlay menu */}
      <div className={`rc-nav-mobile-overlay${open ? ' open' : ''}`}>
        {NAV_ITEMS.map(item => {
          const isActive = activeItem === item;
          const href = item === 'Pricing' ? '/' : `/${item.toLowerCase()}`;
          return (
            <Link key={item} href={href} className={`rc-nav-mobile-link${isActive ? ' active' : ''}`} onClick={() => setOpen(false)}>
              {item}
            </Link>
          );
        })}
        <div className="rc-nav-mobile-divider" />
        <Link href="/login" className="rc-nav-mobile-link" onClick={() => setOpen(false)}>Console Login</Link>
        <Link href="/register" className="rc-nav-mobile-cta" onClick={() => setOpen(false)}>Request Access →</Link>
      </div>
    </>
  );
}
