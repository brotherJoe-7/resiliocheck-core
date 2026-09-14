'use client';
import Sidebar from '../../components/Sidebar';
import { BookOpen, Code, Terminal, Server, Shield, Zap, RefreshCw, Key } from 'lucide-react';

const sections = [
  { id: 'introduction', label: 'Introduction', icon: BookOpen },
  { id: 'getting-started', label: 'Getting Started', icon: Zap },
  { id: 'agents', label: 'AI Agents & Gates', icon: Shield },
  { id: 'integrations', label: 'CI/CD & Webhooks', icon: RefreshCw },
  { id: 'api-reference', label: 'API Reference', icon: Code },
  { id: 'security-model', label: 'Security Model', icon: Key },
];

export default function DashboardDocumentationPage() {
  return (
    <div>
      <Sidebar />
      <main className="rc-main">
        {/* Page Header */}
        <div className="rc-page-hdr">
          <div>
            <div className="rc-page-title">Platform Documentation</div>
            <div className="rc-page-sub">Comprehensive guide to integrating and utilizing ResilioCheck AI</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 40, alignItems: 'flex-start' }}>
          
          {/* Table of Contents Sidebar */}
          <aside style={{ position: 'sticky', top: 32, background: 'var(--bg-card)', padding: '20px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 16, paddingLeft: 8 }}>Contents</div>
            {sections.map(s => (
              <a key={s.id} href={`#${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 4, borderRadius: 6, fontSize: '0.85rem', color: 'var(--text-primary)', textDecoration: 'none', transition: 'all 0.15s' }} className="rc-nav-item">
                <s.icon size={16} />
                {s.label}
              </a>
            ))}
          </aside>

          {/* Documentation Content */}
          <div style={{ paddingBottom: 100 }}>
            <section id="introduction" style={{ marginBottom: 64 }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>Introduction</h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
                ResilioCheck AI is a next-generation autonomous security platform. Unlike traditional static analysis tools that rely on rigid regex rules, ResilioCheck utilizes a <strong>Multi-Agent Large Language Model (LLM) architecture</strong> to dynamically understand code context, detect complex vulnerabilities, and automatically generate pull requests to fix them before they reach production.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 24 }}>
                <div style={{ padding: 16, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>No False Positives</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Agents verify vulnerabilities in a secure sandbox before alerting you.</div>
                </div>
                <div style={{ padding: 16, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>Auto-Remediation</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Directly generates and opens Pull Requests on GitHub.</div>
                </div>
              </div>
            </section>

            <section id="getting-started" style={{ marginBottom: 64 }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>Getting Started</h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
                To perform your first scan, navigate to the Dashboard and ensure your GitHub account is connected if you wish to scan private repositories.
              </p>
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}># 1. Start the API backend (Local Development)</div>
                <div style={{ color: 'var(--text-primary)', marginBottom: 16 }}>uvicorn backend.main:app --reload --port 8000</div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}># 2. Start the Frontend Application</div>
                <div style={{ color: 'var(--text-primary)' }}>cd frontend && npm run dev</div>
              </div>
            </section>

            <section id="agents" style={{ marginBottom: 64 }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>AI Agents & Security Gates</h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
                The platform orchestrates a network of specialised AI agents. Each agent acts as a security gate in your CI/CD pipeline, voting on whether the code is safe to deploy.
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                {[
                  { title: 'XSS Prevention Agent', badge: 'STANDARD', desc: 'Analyzes frontend payloads and templating engines for malicious script injection vectors (e.g., untrusted innerHTML, improper React sanitisation).' },
                  { title: 'SQL Injection Guard', badge: 'BLOCK ALL', desc: 'Detects unsanitised database queries and ORM misuse. Capable of understanding complex string interpolations and tracking taint flows across files.' },
                  { title: 'Dependency Audit Agent', badge: 'BLOCK CRITICAL', desc: 'Scans package manifests (package.json, requirements.txt, go.mod) against the latest CVE databases to block the inclusion of known vulnerable libraries.' },
                  { title: 'Secrets Detection Agent', badge: 'BLOCK ALL', desc: 'A zero-tolerance gate that uses high-entropy pattern matching combined with LLM context-awareness to prevent hardcoded API keys, JWT tokens, and cloud credentials from being committed.' },
                ].map(a => (
                  <div key={a.title} style={{ padding: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <Shield size={24} color="var(--accent)" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <strong style={{ color: 'var(--text-primary)', fontSize: '1.05rem' }}>{a.title}</strong>
                        <span style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: 4, background: 'rgba(234,88,12,0.1)', color: 'var(--accent)', fontWeight: 700 }}>{a.badge}</span>
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{a.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section id="integrations" style={{ marginBottom: 64 }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>CI/CD & Webhook Integration</h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
                Automate your security posture by integrating ResilioCheck directly into your GitHub Actions pipeline.
              </p>
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-primary)', overflowX: 'auto', whiteSpace: 'pre' }}>{`- name: ResilioCheck Autonomous Scan
  uses: actions/github-script@v6
  with:
    script: |
      const payload = {
        repo_url: context.payload.repository.html_url,
        branch: context.ref.replace('refs/heads/', '')
      };
      
      const res = await fetch('https://resiliocheck.yourdomain.com/api/scan', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${process.env.RESILIO_API_KEY}\`
        },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (data.gate === 'BLOCKED') {
        core.setFailed(\`Security gate failed! Critical vulnerabilities found.\`);
      }`}</div>
            </section>

            <section id="api-reference" style={{ marginBottom: 64 }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>REST API Reference</h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
                Interact programmatically with the ResilioCheck orchestration layer. All endpoints (except public Auth) require a Bearer JWT token.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { method: 'POST', path: '/api/auth/register', desc: 'Create a new user account. First registered user receives SuperAdmin privileges.' },
                  { method: 'POST', path: '/api/auth/login', desc: 'Authenticate using email/password and receive an access token.' },
                  { method: 'GET', path: '/api/auth/github/oauth-url', desc: 'Retrieve the GitHub OAuth consent URL for connecting private repositories.' },
                  { method: 'POST', path: '/api/scan', desc: 'Trigger an asynchronous repository analysis. Returns the scan ID and verdict.' },
                  { method: 'POST', path: '/api/scans/{id}/apply-patch', desc: 'Approves an AI-generated patch and automatically creates a GitHub PR.' },
                  { method: 'GET', path: '/api/agents', desc: 'Retrieve telemetry and live operational status of all background LLM agents.' },
                  { method: 'POST', path: '/api/agents/{id}/toggle', desc: 'Toggle the active state (Enabled/Disabled) of a specific security agent.' },
                  { method: 'GET', path: '/api/admin/users', desc: 'SuperAdmin only: List and manage all registered users.' },
                ].map(e => (
                  <div key={e.path} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <span style={{ 
                      background: e.method === 'GET' ? 'rgba(20,184,166,0.15)' : 'rgba(234,88,12,0.15)', 
                      color: e.method === 'GET' ? '#14b8a6' : 'var(--accent)', 
                      fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem', 
                      padding: '4px 10px', borderRadius: 4, minWidth: 55, textAlign: 'center' 
                    }}>
                      {e.method}
                    </span>
                    <div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 6, fontWeight: 700 }}>{e.path}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{e.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section id="security-model">
              <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>Platform Security Model</h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
                ResilioCheck is built with a zero-trust architecture. We process untrusted code, which means the platform itself is hardened against adversarial attacks.
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {[
                  { title: 'Zero Code Retention', desc: 'Private repositories are cloned ephemerally to memory-backed filesystems and immediately wiped after the analysis is complete.' },
                  { title: 'Ephemeral OAuth Tokens', desc: 'GitHub access tokens are never stored in the database. They are exchanged during the session and discarded.' },
                  { title: 'SSRF & Traversal Protection', desc: 'Strict URL validation prevents Server-Side Request Forgery. All ZIP archives are rigorously sanitised against CWE-22 (Path Traversal) before extraction.' },
                  { title: 'Airgapped Validation Sandbox', desc: 'AI-generated patches are compiled and validated inside a hardened Docker container with zero network access and dropped capabilities.' },
                ].map(s => (
                  <div key={s.title} style={{ padding: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--accent)', fontSize: '1.05rem' }}>{s.title}</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}
