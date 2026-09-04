import Link from 'next/link';
import { Check } from 'lucide-react';
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
      <Navbar activeItem="Pricing" />

      {/* Pricing Hero */}
      <div style={{ flex: 1, padding: '80px 48px' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 800, color: '#ea580c', letterSpacing: '-1px', marginBottom: 16 }}>
            Autonomous Security Pricing
          </h1>
          <p style={{ fontSize: '1rem', color: '#a1a1aa', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
            Scale your DevSecOps pipeline with AI-driven threat detection. Transparent pricing for teams of all sizes.
          </p>
        </div>

        {/* Pricing Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 1000, margin: '0 auto' }}>
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
      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #27272a', padding: '20px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.75rem', color: '#52525b' }}>© 2024 ResilioCheck AI. All rights reserved.</div>
        <div style={{ display: 'flex', gap: 24, fontSize: '0.75rem', color: '#52525b' }}>
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
