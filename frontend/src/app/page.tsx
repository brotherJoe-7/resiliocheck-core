import Link from 'next/link';
import { Check, Shield, GitPullRequest, Code, Terminal, Server, Zap, Lock, Brain } from 'lucide-react';
import Navbar from './components/Navbar';

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      <Navbar activeItem="Platform" />

      {/* Hero Section */}
      <section style={{ padding: 'clamp(60px, 12vw, 120px) clamp(20px, 5vw, 48px)', textAlign: 'center', borderBottom: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
        {/* Glow effect */}
        <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, background: 'radial-gradient(circle, rgba(234, 88, 12, 0.15) 0%, rgba(9, 9, 11, 0) 70%)', zIndex: 0, pointerEvents: 'none' }} />
        
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(234, 88, 12, 0.1)', border: '1px solid rgba(234, 88, 12, 0.2)', padding: '6px 14px', borderRadius: 20, color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600, marginBottom: 24 }}>
            <Zap size={14} /> Meet the new LangChain Multi-Agent Engine
          </div>
          <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-1.5px', lineHeight: 1.1, marginBottom: 24 }}>
            Autonomous Security for <span style={{ color: 'var(--accent)' }}>Modern Teams</span>
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 2vw, 1.25rem)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 40, maxWidth: 640, margin: '0 auto 40px' }}>
            Integrate AI-driven threat detection directly into your CI/CD pipeline. Detect secrets, classify OWASP vulnerabilities, and auto-remediate code issues in real-time.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent)', color: 'white', padding: '14px 28px', borderRadius: 8, fontSize: '1rem', fontWeight: 700, textDecoration: 'none', transition: 'background 0.2s' }}>
              Start for Free
            </Link>
            <Link href="/docs" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '14px 28px', borderRadius: 8, fontSize: '1rem', fontWeight: 600, textDecoration: 'none', transition: 'background 0.2s' }}>
              Read the Docs
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works (Onboarding) */}
      <section style={{ padding: 'clamp(60px, 8vw, 100px) clamp(20px, 5vw, 48px)', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 16 }}>How It Works</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: 600, margin: '0 auto' }}>Deploy a fully autonomous DevSecOps pipeline in just three steps.</p>
          </div>
          
          <div className="rc-grid-3" style={{ gap: 32 }}>
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, position: 'relative' }}>
              <div style={{ position: 'absolute', top: -16, left: 32, background: 'var(--accent)', color: 'white', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>1</div>
              <Code size={32} color="#14b8a6" style={{ marginBottom: 20, marginTop: 10 }} />
              <h3 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: 12 }}>Connect Public & Private Repos</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>Link your GitHub account via secure OAuth. Our system installs webhook listeners to monitor both public and private repositories in real-time.</p>
            </div>
            
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, position: 'relative' }}>
              <div style={{ position: 'absolute', top: -16, left: 32, background: 'var(--accent)', color: 'white', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>2</div>
              <Terminal size={32} color="#a855f7" style={{ marginBottom: 20, marginTop: 10 }} />
              <h3 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: 12 }}>AI Multi-Stage Scanning</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>A three-agent LangChain pipeline downloads your code into a secure subprocess sandbox, runs Bandit & Semgrep SAST tools, then classifies findings across the full OWASP Top 10.</p>
            </div>
            
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, position: 'relative' }}>
              <div style={{ position: 'absolute', top: -16, left: 32, background: 'var(--accent)', color: 'white', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>3</div>
              <GitPullRequest size={32} color="#eab308" style={{ marginBottom: 20, marginTop: 10 }} />
              <h3 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: 12 }}>Auto-Remediation</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>For severe vulnerabilities, the AI automatically generates a patch, verifies it in the sandbox, and opens a Pull Request for you.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section style={{ padding: 'clamp(60px, 8vw, 100px) clamp(20px, 5vw, 48px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 16 }}>Enterprise-Grade Security</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: 600, margin: '0 auto' }}>Built to meet the highest compliance standards for modern software teams.</p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {[
              { icon: Shield, color: '#3b82f6', title: 'Hardened Security Gates', desc: 'Enforce strict deployment policies. Block PRs automatically if Critical or High severity vulnerabilities are detected.' },
              { icon: Lock, color: '#f59e0b', title: 'Private Repo Support', desc: 'Securely connect your GitHub account via OAuth to scan both public and private repositories with zero code exposure.' },
              { icon: Server, color: '#ec4899', title: 'On-Premise & Cloud Run', desc: 'Deploy the FastAPI backend on Google Cloud Run or in your own VPC to ensure zero unauthorized data leakage.' },
              { icon: Check, color: '#10b981', title: 'Secret Scanning', desc: 'Deterministic pre-scanning catches leaked AWS keys, JWT secrets, and database URIs before they reach production.' }

            ].map(f => (
              <div key={f.title} style={{ padding: 24, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-card)', display: 'flex', gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <f.icon size={24} color={f.color} />
                </div>
                <div>
                  <h4 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: 8, fontWeight: 700 }}>{f.title}</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Under the Hood (Architecture) */}
      <section style={{ padding: 'clamp(60px, 8vw, 100px) clamp(20px, 5vw, 48px)', background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 16 }}>Powered by Multi-Agent AI</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: 700, margin: '0 auto' }}>ResilioCheck AI uses a LangChain multi-agent architecture to autonomously classify, decide, and remediate code vulnerabilities natively.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            <div style={{ display: 'flex', gap: 24, padding: 32, border: '1px solid var(--border)', borderRadius: 12, background: 'linear-gradient(to right, rgba(234, 88, 12, 0.05), transparent)' }}>
              <div style={{ flexShrink: 0, width: 48, height: 48, background: 'var(--accent)', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>A1</div>
              <div>
                <h4 style={{ color: 'var(--accent)', fontSize: '1.2rem', marginBottom: 8, fontWeight: 700 }}>OWASP Classification Agent</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>Analyzes raw code against the latest OWASP Top 10 framework. It detects deep semantic vulnerabilities like SQL Injection, Broken Access Control, and Insecure Design that static scanners miss.</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 24, padding: 32, border: '1px solid var(--border)', borderRadius: 12, background: 'linear-gradient(to right, rgba(16, 185, 129, 0.05), transparent)' }}>
              <div style={{ flexShrink: 0, width: 48, height: 48, background: '#10b981', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>A2</div>
              <div>
                <h4 style={{ color: '#10b981', fontSize: '1.2rem', marginBottom: 8, fontWeight: 700 }}>Gate Decision Agent</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>Enforces strict numeric policies dynamically. If a PR contains ≥ 1 Critical or ≥ 3 High vulnerabilities, this agent automatically triggers a <code>BLOCKED</code> state in your CI/CD pipeline.</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 24, padding: 32, border: '1px solid var(--border)', borderRadius: 12, background: 'linear-gradient(to right, rgba(168, 85, 247, 0.05), transparent)' }}>
              <div style={{ flexShrink: 0, width: 48, height: 48, background: '#a855f7', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>A3</div>
              <div>
                <h4 style={{ color: '#a855f7', fontSize: '1.2rem', marginBottom: 8, fontWeight: 700 }}>Patch Generator & Sandbox</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>Generates a targeted fix for the highest severity issue. The patched file is written to a hardened Docker container, validated for syntax dynamically across Node.js, Python, PHP, or Ruby, and finally pushed as a Pull Request.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Research CTA Section */}
      <section style={{ padding: 'clamp(60px, 8vw, 100px) clamp(20px, 5vw, 48px)', background: 'var(--bg-card)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.2)', padding: '6px 14px', borderRadius: 20, color: '#14b8a6', fontSize: '0.8rem', fontWeight: 600, marginBottom: 24 }}>
            <Brain size={14} /> University Research Project — Open Access
          </div>
          <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-1px', marginBottom: 20, lineHeight: 1.2 }}>
            Try ResilioCheck AI <span style={{ color: 'var(--accent)' }}>Free Today</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: 1.7, marginBottom: 48, maxWidth: 650, margin: '0 auto 48px' }}>
            ResilioCheck AI is a fully functional research prototype developed as a final-year university project.
            Scan any public GitHub repository — no credit card, no subscription, no limits.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 48 }}>
            {[
              { icon: Lock, color: '#3b82f6', title: 'No Sign-Up Required', desc: 'Register a free account in seconds with just an email address.' },
              { icon: Check, color: '#10b981', title: 'Full Feature Access', desc: 'Every feature — SAST scanning, AI analysis, and patch generation — is fully available.' },
              { icon: Shield, color: 'var(--accent)', title: 'Private Repo Support', desc: 'Connect your GitHub account via OAuth to scan private repositories too.' },
            ].map(f => (
              <div key={f.title} style={{ padding: 24, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'left' }}>
                <f.icon size={28} color={f.color} style={{ marginBottom: 12 }} />
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{f.title}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent)', color: 'white', padding: '14px 32px', borderRadius: 8, fontSize: '1rem', fontWeight: 700, textDecoration: 'none' }}>
              <Zap size={18} /> Create Free Account
            </Link>
            <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '14px 32px', borderRadius: 8, fontSize: '1rem', fontWeight: 600, textDecoration: 'none' }}>
              Sign In to Dashboard
            </Link>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '20px 20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>© 2026 ResilioCheck AI. All rights reserved.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {[
            { label: 'Privacy Policy', path: '/privacy' },
            { label: 'Terms of Service', path: '/terms' },
            { label: 'Security Disclosure', path: '/security' }
          ].map(l => (
            <Link key={l.label} href={l.path} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{l.label}</Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
