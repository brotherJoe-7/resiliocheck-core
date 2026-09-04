import Link from 'next/link';
import { Brain, Sparkles, LayoutGrid, Key, Settings, Ship } from 'lucide-react';
import Navbar from '../components/Navbar';
import type { LucideIcon } from 'lucide-react';

const features: { Icon: LucideIcon; title: string; desc: string }[] = [
  { Icon: Brain,       title: 'AI Static Analysis Engine',  desc: 'Powered by Groq Llama 3.3, the engine reads your source code across all major languages — Python, TypeScript, Go, Java, PHP — and identifies OWASP Top 10 vulnerabilities including SQLi, XSS, path traversal, and broken access control.' },
  { Icon: Key,         title: 'Regex-Based Secret Scanner', desc: 'A deterministic pre-scan layer runs before the AI, catching hardcoded credentials instantly using 16+ pattern matchers: AWS keys, GitHub tokens, Stripe secrets, JWTs, MongoDB URIs, Twilio, SendGrid, and more.' },
  { Icon: Ship,        title: 'Hardened Docker Sandbox',    desc: 'AI-generated patches are validated in an isolated, network-disabled Docker container. Zero capabilities, read-only filesystem, memory capped at 512MB — ensuring the fix itself cannot be weaponized.' },
  { Icon: LayoutGrid,  title: 'CI/CD Security Gates',       desc: 'Configurable blockers integrate directly into your pipeline. XSS Prevention and Dependency Audit gates can be set to Block Deploy, Alert Only, or Log Only, with strictness levels from Permissive to Strict.' },
  { Icon: Sparkles,    title: 'Autonomous Agent Fleet',     desc: 'Background agents run continuously: the Code Fixer auto-opens PRs for detected issues, the Secret Scanner monitors incoming commits in real-time, and the Patch Automator bumps vulnerable dependencies automatically.' },
  { Icon: Settings,    title: 'Super Admin Control Plane',  desc: 'A dedicated admin dashboard provides full visibility into platform usage — who has logged in, how many scans have been run, and team-wide role management with one-click access revocation.' },
];

export default function PlatformPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Navbar activeItem="Platform" />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{ display: 'inline-block', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1.5px', color: '#ea580c', textTransform: 'uppercase', marginBottom: 16 }}>The Platform</div>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, letterSpacing: '-0.03em' }}>
            Autonomous Security,<br />Built for Modern DevOps
          </h1>
          <p style={{ fontSize: '1.1rem', color: '#a1a1aa', maxWidth: 600, margin: '0 auto', lineHeight: 1.7 }}>
            ResilioCheck AI replaces manual code reviews with a multi-stage AI pipeline that finds, explains, and fixes vulnerabilities before they reach production.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {features.map(({ Icon, title, desc }) => (
            <div key={title} style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 12, padding: '28px 24px' }}>
              <div style={{ marginBottom: 12, color: '#ea580c' }}><Icon size={24} /></div>
              <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10 }}>{title}</div>
              <div style={{ fontSize: '0.85rem', color: '#a1a1aa', lineHeight: 1.7 }}>{desc}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 72 }}>
          <Link href="/register" style={{ background: '#ea580c', color: '#fff', borderRadius: 8, padding: '14px 32px', textDecoration: 'none', fontWeight: 700, fontSize: '1rem' }}>
            Start Scanning Free →
          </Link>
        </div>
      </div>
    </div>
  );
}
