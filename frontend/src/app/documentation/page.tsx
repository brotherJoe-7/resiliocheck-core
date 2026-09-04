import Link from 'next/link';
import { Check } from 'lucide-react';
import Navbar from '../components/Navbar';


const sections = [
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'api', label: 'API Reference' },
  { id: 'cli', label: 'CLI Usage' },
  { id: 'cicd', label: 'CI/CD Integration' },
  { id: 'agents', label: 'Agents' },
  { id: 'security', label: 'Security Model' },
];

export default function DocumentationPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#09090b' }}>
        <Navbar activeItem="Documentation" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        {/* Sidebar */}
        <aside style={{ position: 'sticky', top: 60, height: 'fit-content', padding: '40px 0', borderRight: '1px solid #18181b' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 16 }}>Documentation</div>
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`} style={{ display: 'block', padding: '8px 16px', marginBottom: 4, borderRadius: 6, fontSize: '0.85rem', color: '#a1a1aa', textDecoration: 'none', transition: 'color 0.15s' }}>
              {s.label}
            </a>
          ))}
        </aside>

        {/* Content */}
        <main style={{ padding: '48px 48px 80px' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>Documentation</h1>
          <p style={{ color: '#a1a1aa', marginBottom: 48 }}>Everything you need to integrate ResilioCheck AI into your workflow.</p>

          <section id="quickstart" style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #27272a' }}>Quick Start</h2>
            <p style={{ color: '#a1a1aa', marginBottom: 16 }}>Get up and running in under 5 minutes.</p>
            <div style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 8, padding: '20px 24px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              <div style={{ color: '#71717a', marginBottom: 8 }}># 1. Start the backend</div>
              <div style={{ color: '#e4e4e7', marginBottom: 16 }}>uvicorn backend.main:app --reload --port 8000</div>
              <div style={{ color: '#71717a', marginBottom: 8 }}># 2. Start the frontend</div>
              <div style={{ color: '#e4e4e7', marginBottom: 16 }}>cd frontend && npm run dev</div>
              <div style={{ color: '#71717a', marginBottom: 8 }}># 3. Open the dashboard</div>
              <div style={{ color: '#ea580c' }}>http://localhost:3000</div>
            </div>
          </section>

          <section id="api" style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #27272a' }}>API Reference</h2>
            {[
              { method: 'POST', path: '/api/auth/register', desc: 'Create a new user account. The first account is automatically SuperAdmin.' },
              { method: 'POST', path: '/api/auth/login', desc: 'Authenticate and receive a JWT access token.' },
              { method: 'GET', path: '/api/auth/me', desc: 'Get the currently authenticated user\'s profile.' },
              { method: 'POST', path: '/api/scan', desc: 'Submit a GitHub repository URL for a full AI security scan.' },
              { method: 'GET', path: '/api/agents', desc: 'Fetch the live status of all autonomous agents.' },
              { method: 'POST', path: '/api/agents/{id}/toggle', desc: 'Enable or disable a specific agent.' },
              { method: 'GET', path: '/api/gates', desc: 'Retrieve configuration and status of all security gates.' },
              { method: 'GET', path: '/api/admin/users', desc: 'SuperAdmin only: list all platform users.' },
            ].map(e => (
              <div key={e.path} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 0', borderBottom: '1px solid #1c1c1e' }}>
                <span style={{ background: e.method === 'GET' ? 'rgba(20,184,166,0.15)' : 'rgba(234,88,12,0.15)', color: e.method === 'GET' ? '#14b8a6' : '#ea580c', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.72rem', padding: '3px 8px', borderRadius: 4, minWidth: 48, textAlign: 'center' }}>{e.method}</span>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#e4e4e7', marginBottom: 4 }}>{e.path}</div>
                  <div style={{ fontSize: '0.82rem', color: '#71717a' }}>{e.desc}</div>
                </div>
              </div>
            ))}
          </section>

          <section id="cicd" style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #27272a' }}>CI/CD Integration (GitHub Actions)</h2>
            <p style={{ color: '#a1a1aa', marginBottom: 16 }}>Add this step to your <code style={{ background: '#18181b', padding: '2px 6px', borderRadius: 4 }}>.github/workflows/ci.yml</code>:</p>
            <div style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 8, padding: '20px 24px', fontFamily: 'monospace', fontSize: '0.82rem', color: '#e4e4e7', whiteSpace: 'pre' }}>{`- name: ResilioCheck AI Scan
  uses: actions/github-script@v6
  with:
    script: |
      const res = await fetch('https://your-backend.render.com/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: context.payload.repository.html_url })
      });
      const data = await res.json();
      if (data.secret_findings?.length > 0) {
        core.setFailed('Secrets detected in commit!');
      }`}</div>
          </section>

          <section id="security" style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #27272a' }}>Security Model</h2>
            {[
              { title: 'SSRF Protection', desc: 'All repository URLs are validated against a strict allowlist — only https://github.com/ URLs are accepted. This prevents Server-Side Request Forgery attacks against internal infrastructure.' },
              { title: 'Archive Size Cap', desc: 'Downloaded repository archives are capped at 100 MB to prevent memory-exhaustion DoS attacks from adversarially large repositories.' },
              { title: 'Path Traversal Prevention', desc: 'Every ZIP entry is sanitised before extraction (CWE-22) — malicious paths like ../../etc/passwd are silently skipped.' },
              { title: 'Hardened Docker Sandbox', desc: 'AI-generated patches are validated in a container with zero network access, a read-only filesystem, dropped capabilities, and a 512 MB memory limit.' },
            ].map(s => (
              <div key={s.title} style={{ marginBottom: 20, padding: '20px', background: '#111113', border: '1px solid #27272a', borderRadius: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: '#ea580c' }}><Check size={16} /> {s.title}</div>
                <div style={{ fontSize: '0.85rem', color: '#a1a1aa', lineHeight: 1.7 }}>{s.desc}</div>
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}
