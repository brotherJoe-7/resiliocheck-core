import Link from 'next/link';
import { Check, Shield, GitPullRequest, Code, Terminal, Server, Zap } from 'lucide-react';
import Navbar from './components/Navbar';

const PLANS = [
  {
    name: 'Community', desc: 'Essential security checks for open-source projects.',
    price: '$0', period: '/ forever', highlight: false,
    features: ['Public repo scanning', 'Basic vulnerability DB', 'Community support'],
    cta: 'Get Started', ctaPrimary: false,
  },
  {
    name: 'Pro', desc: 'Advanced AI analysis for growing engineering teams.',
    price: '$5', period: '/ user / month', highlight: true,
    features: ['Private repo scanning', 'Real-time AI threat detection', 'CI/CD pipeline integration', 'Priority email support'],
    cta: 'Start Free Trial', ctaPrimary: true,
  },
  {
    name: 'Enterprise', desc: 'Custom deployments for high-compliance environments.',
    price: 'Custom', period: '', highlight: false,
    features: ['On-premise / VPC deployment', 'Custom AI model training', 'Dedicated security account manager', '24/7 phone support & SLA'],
    cta: 'Contact Sales', ctaPrimary: false,
  },
];

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', flexDirection: 'column' }}>
      <Navbar activeItem="Platform" />

      {/* Hero Section */}
      <section style={{ padding: 'clamp(60px, 12vw, 120px) clamp(20px, 5vw, 48px)', textAlign: 'center', borderBottom: '1px solid #27272a', position: 'relative', overflow: 'hidden' }}>
        {/* Glow effect */}
        <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, background: 'radial-gradient(circle, rgba(234, 88, 12, 0.15) 0%, rgba(9, 9, 11, 0) 70%)', zIndex: 0, pointerEvents: 'none' }} />
        
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(234, 88, 12, 0.1)', border: '1px solid rgba(234, 88, 12, 0.2)', padding: '6px 14px', borderRadius: 20, color: '#ea580c', fontSize: '0.8rem', fontWeight: 600, marginBottom: 24 }}>
            <Zap size={14} /> Meet the new LangChain Multi-Agent Engine
          </div>
          <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 800, color: '#fafafa', letterSpacing: '-1.5px', lineHeight: 1.1, marginBottom: 24 }}>
            Autonomous Security for <span style={{ color: '#ea580c' }}>Modern Teams</span>
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 2vw, 1.25rem)', color: '#a1a1aa', lineHeight: 1.6, marginBottom: 40, maxWidth: 640, margin: '0 auto 40px' }}>
            Integrate AI-driven threat detection directly into your CI/CD pipeline. Detect secrets, classify OWASP vulnerabilities, and auto-remediate code issues in real-time.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#ea580c', color: 'white', padding: '14px 28px', borderRadius: 8, fontSize: '1rem', fontWeight: 700, textDecoration: 'none', transition: 'background 0.2s' }}>
              Start for Free
            </Link>
            <Link href="/docs" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#18181b', color: '#fafafa', border: '1px solid #27272a', padding: '14px 28px', borderRadius: 8, fontSize: '1rem', fontWeight: 600, textDecoration: 'none', transition: 'background 0.2s' }}>
              Read the Docs
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works (Onboarding) */}
      <section style={{ padding: 'clamp(60px, 8vw, 100px) clamp(20px, 5vw, 48px)', background: '#111113', borderBottom: '1px solid #27272a' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fafafa', marginBottom: 16 }}>How It Works</h2>
            <p style={{ color: '#a1a1aa', fontSize: '1.1rem', maxWidth: 600, margin: '0 auto' }}>Deploy a fully autonomous DevSecOps pipeline in just three steps.</p>
          </div>
          
          <div className="rc-grid-3" style={{ gap: 32 }}>
            <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: 12, padding: 32, position: 'relative' }}>
              <div style={{ position: 'absolute', top: -16, left: 32, background: '#ea580c', color: 'white', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>1</div>
              <Code size={32} color="#14b8a6" style={{ marginBottom: 20, marginTop: 10 }} />
              <h3 style={{ fontSize: '1.3rem', color: '#fafafa', marginBottom: 12 }}>Connect Your Repo</h3>
              <p style={{ color: '#a1a1aa', fontSize: '0.95rem', lineHeight: 1.6 }}>Link your GitHub repositories. Our system installs webhook listeners to monitor pull requests and commits in real-time.</p>
            </div>
            
            <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: 12, padding: 32, position: 'relative' }}>
              <div style={{ position: 'absolute', top: -16, left: 32, background: '#ea580c', color: 'white', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>2</div>
              <Terminal size={32} color="#a855f7" style={{ marginBottom: 20, marginTop: 10 }} />
              <h3 style={{ fontSize: '1.3rem', color: '#fafafa', marginBottom: 12 }}>AI Sandbox Scanning</h3>
              <p style={{ color: '#a1a1aa', fontSize: '0.95rem', lineHeight: 1.6 }}>The LangChain Multi-Agent engine pulls your code into a secure Docker sandbox to detect secrets and classify OWASP vulnerabilities.</p>
            </div>
            
            <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: 12, padding: 32, position: 'relative' }}>
              <div style={{ position: 'absolute', top: -16, left: 32, background: '#ea580c', color: 'white', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>3</div>
              <GitPullRequest size={32} color="#eab308" style={{ marginBottom: 20, marginTop: 10 }} />
              <h3 style={{ fontSize: '1.3rem', color: '#fafafa', marginBottom: 12 }}>Auto-Remediation</h3>
              <p style={{ color: '#a1a1aa', fontSize: '0.95rem', lineHeight: 1.6 }}>For severe vulnerabilities, the AI automatically generates a patch, verifies it in the sandbox, and opens a Pull Request for you.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section style={{ padding: 'clamp(60px, 8vw, 100px) clamp(20px, 5vw, 48px)', borderBottom: '1px solid #27272a' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fafafa', marginBottom: 16 }}>Enterprise-Grade Security</h2>
            <p style={{ color: '#a1a1aa', fontSize: '1.1rem', maxWidth: 600, margin: '0 auto' }}>Built to meet the highest compliance standards for modern software teams.</p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {[
              { icon: Shield, color: '#3b82f6', title: 'Hardened Security Gates', desc: 'Enforce strict deployment policies. Block PRs automatically if Critical or High severity vulnerabilities are detected.' },
              { icon: Server, color: '#ec4899', title: 'On-Premise & Cloud Run', desc: 'Deploy the FastAPI backend on Google Cloud Run or in your own VPC to ensure zero unauthorized data leakage.' },
              { icon: Check, color: '#10b981', title: 'Secret Scanning', desc: 'Deterministic pre-scanning catches leaked AWS keys, JWT secrets, and database URIs before they reach production.' }
            ].map(f => (
              <div key={f.title} style={{ padding: 24, border: '1px solid #27272a', borderRadius: 12, background: '#111113', display: 'flex', gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <f.icon size={24} color={f.color} />
                </div>
                <div>
                  <h4 style={{ color: '#fafafa', fontSize: '1.1rem', marginBottom: 8, fontWeight: 700 }}>{f.title}</h4>
                  <p style={{ color: '#a1a1aa', fontSize: '0.9rem', lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" style={{ padding: 'clamp(60px, 8vw, 100px) clamp(20px, 5vw, 48px)', background: '#111113' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#fafafa', letterSpacing: '-1px', marginBottom: 16 }}>
            Transparent Pricing
          </h2>
          <p style={{ fontSize: '1rem', color: '#a1a1aa', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
            Scale your DevSecOps pipeline with AI-driven threat detection. Plans for teams of all sizes.
          </p>
        </div>

        <div className="rc-grid-3" style={{ maxWidth: 1000, margin: '0 auto' }}>
          {PLANS.map(plan => (
            <div key={plan.name} style={{ background: '#141417', border: plan.highlight ? '1px solid #ea580c' : '1px solid #27272a', borderRadius: 10, padding: '32px 28px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {plan.highlight && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#ea580c', color: 'white', fontSize: '0.65rem', fontWeight: 700, padding: '4px 14px', borderRadius: 20, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Most Popular</div>
              )}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fafafa', marginBottom: 6 }}>{plan.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#a1a1aa', lineHeight: 1.5 }}>{plan.desc}</div>
              </div>
              <div style={{ margin: '24px 0', borderTop: '1px solid #27272a', paddingTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                  <span style={{ fontSize: plan.price === 'Custom' ? '2rem' : '2.8rem', fontWeight: 800, color: '#fafafa', lineHeight: 1 }}>{plan.price}</span>
                  {plan.period && <span style={{ fontSize: '0.78rem', color: '#71717a', marginBottom: 4 }}>{plan.period}</span>}
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', color: '#a1a1aa' }}>
                    <span style={{ color: '#14b8a6', fontSize: '0.9rem', flexShrink: 0 }}><Check size={16} /></span>
                    {f}
                  </div>
                ))}
              </div>
              <Link href="/register" style={{ display: 'flex', justifyContent: 'center', padding: '11px 20px', borderRadius: 6, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', background: plan.ctaPrimary ? '#ea580c' : 'transparent', color: plan.ctaPrimary ? 'white' : '#fafafa', border: plan.ctaPrimary ? 'none' : '1px solid #27272a', transition: 'opacity 0.15s' }}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ borderTop: '1px solid #27272a', padding: '20px 20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: '0.75rem', color: '#52525b' }}>© 2026 ResilioCheck AI. All rights reserved.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: '0.75rem', color: '#52525b' }}>
          {[
            { label: 'Privacy Policy', path: '/privacy' },
            { label: 'Terms of Service', path: '/terms' },
            { label: 'Security Disclosure', path: '/security' }
          ].map(l => (
            <Link key={l.label} href={l.path} style={{ color: '#52525b', textDecoration: 'none' }}>{l.label}</Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
