import Link from 'next/link';
import { Check, Lock } from 'lucide-react';


const sections = [
  ['Our Security Commitment', 'Security is the foundation of ResilioCheck AI. We apply the same rigorous scrutiny to our own infrastructure that we apply to our customers\'s code.'],
  ['Responsible Disclosure Policy', 'If you discover a security vulnerability in ResilioCheck AI, please report it privately to security@resiliocheck.ai before public disclosure. We commit to acknowledging your report within 48 hours and providing a resolution timeline within 7 days.'],
  ['Bug Bounty', 'We appreciate the security community\'s efforts in keeping our users safe. Critical vulnerabilities that are responsibly disclosed may be eligible for a recognition reward. Please include a proof-of-concept and reproduction steps in your report.'],
  ['Platform Security Controls', 'All repository code is processed in memory and never persisted to disk. Docker sandboxes are network-isolated with zero Linux capabilities. All API endpoints require JWT authentication. Passwords are hashed with bcrypt.'],
  ['Known Limitations', 'The AI scanner may produce false positives or miss novel vulnerability patterns. The secret scanner\'s regex patterns are effective against common formats but may not catch heavily obfuscated credentials.'],
];

export default function SecurityPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 48px', borderBottom: '1px solid #18181b' }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: '1rem', color: '#ea580c', textDecoration: 'none' }}>ResilioCheck AI</Link>
        <Link href="/login" style={{ background: '#ea580c', color: '#fff', borderRadius: 6, padding: '8px 18px', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}>Dashboard →</Link>
      </nav>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 80px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>Security</div>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 8 }}>Security Disclosure</h1>
        <p style={{ color: '#52525b', marginBottom: 56, fontSize: '0.85rem' }}>Last updated: August 27, 2026</p>
        {sections.map(([heading, body]) => (
          <section key={heading} style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 12, color: '#e4e4e7' }}>
              <span style={{ color: '#ea580c', marginRight: 8 }}><Check size={16} /></span>{heading}
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#a1a1aa', lineHeight: 1.9, marginTop: 0 }}>{body}</p>
          </section>
        ))}
        <div style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 10, padding: '24px', marginBottom: 40 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}><Lock size={20} /> Report a Vulnerability</div>
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: 0, marginBottom: 12 }}>Send your report to <strong style={{ color: '#ea580c' }}>security@resiliocheck.ai</strong> with the subject line &quot;Responsible Disclosure&quot;.</p>
          <div style={{ fontSize: '0.8rem', color: '#52525b' }}>We do not pursue legal action against researchers who follow this policy in good faith.</div>
        </div>
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #27272a' }}>
          <Link href="/" style={{ color: '#ea580c', textDecoration: 'none', fontSize: '0.85rem' }}>← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
