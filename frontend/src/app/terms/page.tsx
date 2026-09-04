import Link from 'next/link';
import Navbar from '../components/Navbar';

const sections = [
  ['Acceptance of Terms', 'By accessing or using ResilioCheck AI, you agree to be bound by these Terms of Service. If you do not agree, please do not use the platform.'],
  ['Permitted Use', 'ResilioCheck AI is designed for scanning repositories you own or have explicit permission to scan. You must not use this service to scan repositories without authorization. Any such use is a violation of these terms and may violate applicable law.'],
  ['Account Responsibility', 'You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.'],
  ['Service Availability', 'We strive for 99.9% uptime but do not guarantee uninterrupted access. Scheduled maintenance and unforeseen outages may occur.'],
  ['Limitation of Liability', 'ResilioCheck AI is provided as-is. We are not liable for any direct, indirect, or incidental damages resulting from your use of the service, including missed vulnerabilities or false positives in scan results.'],
  ['Termination', 'We reserve the right to suspend or terminate accounts that violate these terms or engage in abusive behaviour without notice.'],
];

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Navbar />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 80px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>Legal</div>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 8 }}>Terms of Service</h1>
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
