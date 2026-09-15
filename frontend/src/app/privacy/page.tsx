import Navbar from '../components/Navbar';
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-base)' }}>
        <Navbar activeItem="" />
      </div>
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '60px 24px 100px' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: 16 }}>Privacy Policy</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 48, fontSize: '1.1rem' }}>
          Last Updated: September 2026
        </p>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 16 }}>1. Introduction</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Welcome to ResilioCheck AI. We are committed to protecting your privacy and ensuring the security of your source code. This Privacy Policy explains how we collect, use, and safeguard your information when you use our autonomous security platform.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 16 }}>2. How We Handle Your Code (Zero-Retention)</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            ResilioCheck AI requires access to your source code to perform security analysis. We employ a strict <strong>Zero-Retention Policy</strong>:
          </p>
          <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 12, paddingLeft: 20 }}>
            <li style={{ marginBottom: 8 }}>Code is downloaded to an ephemeral, isolated sandbox container.</li>
            <li style={{ marginBottom: 8 }}>Once the AI analysis and sandbox validation are complete, the container and all source files are <strong>immediately and permanently deleted</strong>.</li>
            <li style={{ marginBottom: 8 }}>We do not train our models on your private source code.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 16 }}>3. Information We Collect</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
            We only collect the minimum information required to operate the service:
          </p>
          <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: 20 }}>
            <li style={{ marginBottom: 8 }}><strong>Account Information:</strong> Name and email address when you register.</li>
            <li style={{ marginBottom: 8 }}><strong>OAuth Tokens:</strong> If you connect GitHub, we receive a temporary OAuth access token. This token is used strictly to read the repositories you select and is securely encrypted at rest.</li>
            <li style={{ marginBottom: 8 }}><strong>Scan Metadata:</strong> We store the metadata of your scans (e.g., number of vulnerabilities found, branch name, timestamp) to display in your dashboard. We do not store the underlying code.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 16 }}>4. Third-Party AI Providers</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            We utilize secure third-party Large Language Model providers (such as Groq and DeepSeek) to analyze code snippets. Our agreements with these providers strictly prohibit them from using your code snippets for model training or retention.
          </p>
        </section>
        
        <div style={{ marginTop: 60, paddingTop: 24, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <Link href="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>← Back to Home</Link>
        </div>
      </main>
    </div>
  );
}
