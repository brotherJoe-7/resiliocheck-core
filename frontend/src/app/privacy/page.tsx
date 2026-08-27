import Link from 'next/link';

const sections = [
  ['Information We Collect', 'We collect the email address and full name you provide at registration. We also log the GitHub repository URLs submitted for scanning to maintain audit trails. We do not collect or store the source code from your repositories — repository data is processed in memory and discarded after each scan.'],
  ['How We Use Your Information', 'Your email is used solely for account authentication and important service announcements. Repository scan results are stored in your session and not shared with third parties. We do not sell your personal information under any circumstances.'],
  ['Data Retention', 'Account data is retained for as long as your account is active. You may request permanent deletion of your account and all associated data at any time by contacting privacy@resiliocheck.ai.'],
  ['Security', 'All passwords are hashed using bcrypt. All API communication is authenticated via JWT tokens with 24-hour expiry. Sensitive data in transit is protected via HTTPS/TLS.'],
  ['Contact Us', 'For privacy-related questions or data deletion requests, contact us at privacy@resiliocheck.ai.'],
];

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 48px', borderBottom: '1px solid #18181b' }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: '1rem', color: '#ea580c', textDecoration: 'none' }}>ResilioCheck AI</Link>
        <Link href="/login" style={{ background: '#ea580c', color: '#fff', borderRadius: 6, padding: '8px 18px', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}>Dashboard →</Link>
      </nav>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 80px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>Legal</div>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: '#52525b', marginBottom: 56, fontSize: '0.85rem' }}>Last updated: August 27, 2026</p>
        {sections.map(([heading, body]) => (
          <section key={heading} style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 12, color: '#e4e4e7' }}>{heading}</h2>
            <p style={{ fontSize: '0.9rem', color: '#a1a1aa', lineHeight: 1.9, marginTop: 0 }}>{body}</p>
          </section>
        ))}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #27272a' }}>
          <Link href="/" style={{ color: '#ea580c', textDecoration: 'none', fontSize: '0.85rem' }}>← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
