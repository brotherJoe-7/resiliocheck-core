import Navbar from '../components/Navbar';
import Link from 'next/link';

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-base)' }}>
        <Navbar activeItem="" />
      </div>
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '60px 24px 100px' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: 16 }}>Terms of Service</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 48, fontSize: '1.1rem' }}>
          Last Updated: September 2026
        </p>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 16 }}>1. Acceptance of Terms</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            By accessing or using ResilioCheck AI, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 16 }}>2. Service Description</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            ResilioCheck AI provides an automated security analysis platform for source code using artificial intelligence. We attempt to identify security vulnerabilities, misconfigurations, and hardcoded secrets.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 16 }}>3. No Liability for Undetected Vulnerabilities</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong>Our service is provided on an "as is" and "as available" basis.</strong> While we strive for high accuracy, automated security scanning and AI analysis are not perfect and cannot guarantee the discovery of all vulnerabilities. 
          </p>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 12 }}>
            You acknowledge and agree that ResilioCheck AI shall not be held liable for any security breaches, data losses, or damages resulting from vulnerabilities that our platform failed to detect or report. Our tool should be used as a supplementary layer of security, not a replacement for comprehensive manual security audits and standard security practices.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 16 }}>4. Responsible Use</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            You agree to only scan repositories for which you have the legal right or authorization to access and analyze. Using ResilioCheck AI to scan unauthorized targets or for malicious purposes is strictly prohibited and will result in immediate account termination.
          </p>
        </section>
        
        <div style={{ marginTop: 60, paddingTop: 24, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <Link href="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>← Back to Home</Link>
        </div>
      </main>
    </div>
  );
}
