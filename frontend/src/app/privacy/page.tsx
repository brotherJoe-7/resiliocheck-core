import Link from 'next/link';
import Navbar from '../components/Navbar';

const sections = [
  ['Information We Collect', 'We collect the email address and full name you provide at registration. We also log the GitHub repository URLs submitted for scanning to maintain audit trails. We do not collect or store the source code from your repositories — repository data is processed in memory and discarded after each scan.'],
  ['How We Use Your Information', 'Your email is used solely for account authentication and important service announcements. Repository scan results are stored in your session and not shared with third parties. We do not sell your personal information under any circumstances.'],
  ['Data Retention', 'Account data is retained for as long as your account is active. You may request permanent deletion of your account and all associated data at any time by contacting privacy@resiliocheck.ai.'],
  ['Security', 'All passwords are hashed using bcrypt. All API communication is authenticated via JWT tokens with 24-hour expiry. Sensitive data in transit is protected via HTTPS/TLS.'],
  ['Contact Us', 'For privacy-related questions or data deletion requests, contact us at privacy@resiliocheck.ai.'],
];

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
      <Navbar />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 80px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>Legal</div>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 56, fontSize: '0.85rem' }}>Last updated: August 27, 2026</p>
        {sections.map(([heading, body]) => (
          <section key={heading} style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 12, color: '#e4e4e7' }}>{heading}</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.9, marginTop: 0 }}>{body}</p>
          </section>
        ))}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <Link href="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.85rem' }}>← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
