import Link from 'next/link';

export default function Navbar({ activeItem }: { activeItem?: string }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 48px', height: 60, borderBottom: '1px solid #27272a' }}>
      <Link href="/" style={{ textDecoration: 'none' }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#ea580c' }}>ResilioCheck AI</div>
      </Link>
      <div style={{ display: 'flex', gap: 32, fontSize: '0.85rem', color: '#a1a1aa' }}>
        {['Platform', 'Solutions', 'Documentation', 'Pricing'].map(item => {
          const isActive = activeItem === item;
          const href = item === 'Pricing' ? '/' : `/${item.toLowerCase()}`;
          return (
            <Link 
              key={item} 
              href={href} 
              style={{ 
                color: isActive ? '#ea580c' : '#a1a1aa', 
                textDecoration: isActive ? 'underline' : 'none', 
                textUnderlineOffset: 4, 
                cursor: 'pointer', 
                transition: 'color 0.15s' 
              }}
            >
              {item}
            </Link>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Link href="/login" style={{ fontSize: '0.82rem', color: '#a1a1aa', textDecoration: 'none', transition: 'color 0.15s' }}>Console Login</Link>
        <Link href="/register" style={{ background: '#ea580c', color: 'white', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', transition: 'opacity 0.15s' }}>Request Access</Link>
      </div>
    </nav>
  );
}
