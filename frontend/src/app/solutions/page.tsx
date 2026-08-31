import Link from 'next/link';
import { Check, Rocket, Globe, Building2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const solutions: { tag: string; Icon: LucideIcon; headline: string; desc: string; points: string[] }[] = [
  {
    tag: 'Enterprise', Icon: Building2,
    headline: 'Secure at Scale, Across Every Team',
    desc: 'Large engineering organizations use ResilioCheck AI to enforce consistent security standards across hundreds of repositories and dozens of teams. Role-based access control, Super Admin oversight, and enterprise billing give your CISO full visibility into your security posture.',
    points: ['Unlimited private repo scanning', 'Super Admin control plane', 'RBAC with team-level permissions', 'Dedicated priority support SLA'],
  },
  {
    tag: 'Startups', Icon: Rocket,
    headline: 'Ship Fast Without Compromising Security',
    desc: "For fast-moving startups, ResilioCheck AI acts as a virtual security engineer — catching vulnerabilities, auto-remediating code, and ensuring you never accidentally ship a secret to GitHub. At $5/user/month, it's the most cost-effective security investment you can make.",
    points: ['Instant onboarding, no config required', 'Auto-remediation reduces security debt', 'CI/CD integration in under 5 minutes', 'Affordable Pro pricing'],
  },
  {
    tag: 'Open Source', Icon: Globe,
    headline: "Protect Your Community's Codebase",
    desc: "Maintainers of open source projects face unique security challenges — pull requests from unknown contributors, secret leaks in commit history, and dependency vulnerabilities. ResilioCheck AI's Community plan is free for public repositories.",
    points: ['Free for public GitHub repositories', 'Secret scanning on every PR', 'Dependency CVE detection', 'Community support forum'],
  },
];

export default function SolutionsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 48px', borderBottom: '1px solid #18181b' }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: '1rem', color: '#ea580c', textDecoration: 'none' }}>ResilioCheck AI</Link>
        <Link href="/login" style={{ background: '#ea580c', color: '#fff', borderRadius: 6, padding: '8px 18px', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}>Get Started →</Link>
      </nav>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{ display: 'inline-block', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1.5px', color: '#ea580c', textTransform: 'uppercase', marginBottom: 16 }}>Solutions</div>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.2rem)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, letterSpacing: '-0.03em' }}>
            Security for Every<br />Stage of Growth
          </h1>
          <p style={{ fontSize: '1.1rem', color: '#a1a1aa', lineHeight: 1.7 }}>
            Whether you&apos;re a solo maintainer or a 500-person engineering org, ResilioCheck AI has a plan built for how you work.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {solutions.map((s) => (
            <div key={s.tag} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, background: '#111113', border: '1px solid #27272a', borderRadius: 16, padding: '40px 36px', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(234,88,12,0.1)', border: '1px solid rgba(234,88,12,0.3)', borderRadius: 6, padding: '4px 12px', marginBottom: 20 }}>
                  <s.Icon size={16} color="#ea580c" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ea580c' }}>{s.tag}</span>
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 12, marginTop: 0 }}>{s.headline}</h2>
                <p style={{ fontSize: '0.9rem', color: '#a1a1aa', lineHeight: 1.8, marginTop: 0 }}>{s.desc}</p>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 16 }}>Includes</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {s.points.map(p => (
                    <li key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.9rem', color: '#e4e4e7' }}>
                      <Check size={16} color="#ea580c" /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 72 }}>
          <Link href="/" style={{ background: 'linear-gradient(135deg, #ea580c, #dc2626)', color: '#fff', borderRadius: 8, padding: '14px 32px', textDecoration: 'none', fontWeight: 700, fontSize: '1rem' }}>
            See Pricing →
          </Link>
        </div>
      </div>
    </div>
  );
}
