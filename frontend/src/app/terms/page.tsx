import Link from 'next/link';

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fafafa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <h1 style={{ fontSize: '2rem', marginBottom: 16 }}>Terms</h1>
      <p style={{ color: '#a1a1aa', marginBottom: 24 }}>This page is currently under construction.</p>
      <Link href="/" style={{ color: '#ea580c', textDecoration: 'none' }}>← Back to Home</Link>
    </div>
  );
}
