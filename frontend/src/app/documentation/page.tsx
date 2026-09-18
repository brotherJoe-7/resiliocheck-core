import { Check } from 'lucide-react';
import Navbar from '../components/Navbar';


const sections = [
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'api', label: 'API Reference' },
  { id: 'cli', label: 'CLI Usage' },
  { id: 'cicd', label: 'CI/CD Integration' },
  { id: 'agents', label: 'Agents & Gates' },
  { id: 'security', label: 'Security Model' },
];

export default function DocumentationPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-base)' }}>
        <Navbar activeItem="Documentation" />
      </div>

      <div className="rc-docs-layout" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        {/* Sidebar */}
        <aside style={{ position: 'sticky', top: 60, height: 'fit-content', padding: '40px 0', borderRight: '1px solid var(--bg-card-hover)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 16 }}>Documentation</div>
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`} style={{ display: 'block', padding: '8px 16px', marginBottom: 4, borderRadius: 6, fontSize: '0.85rem', color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.15s' }}>
              {s.label}
            </a>
          ))}
        </aside>

        {/* Content */}
        <main style={{ padding: '48px 48px 80px' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>Documentation</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 48 }}>Comprehensive guide to integrating and utilising ResilioCheck AI.</p>

          <section id="introduction" style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>Introduction</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
              ResilioCheck AI is a next-generation autonomous security platform. Unlike traditional static analysis tools that rely on rigid regex rules, ResilioCheck utilizes a <strong>Multi-Agent Large Language Model (LLM) architecture</strong> to dynamically understand code context, detect complex vulnerabilities, and automatically generate pull requests to fix them before they reach production.
            </p>
          </section>

          <section id="quickstart" style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>Quick Start</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>Get up and running in under 5 minutes.</p>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}># 1. Start the API backend</div>
              <div style={{ color: 'var(--text-primary)', marginBottom: 16 }}>uvicorn backend.main:app --reload --port 8000</div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}># 2. Start the Frontend Application</div>
              <div style={{ color: 'var(--text-primary)' }}>cd frontend && npm run dev</div>
            </div>
          </section>

          <section id="agents" style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>Agents & Security Gates</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>The platform orchestrates a network of specialised AI agents acting as security gates:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              {[
                { title: 'XSS Prevention', badge: 'Standard', desc: 'Analyzes frontend payloads for malicious script injection (e.g., untrusted innerHTML).' },
                { title: 'SQL Injection Guard', badge: 'Block All', desc: 'Detects unsanitised database queries and ORM misuse.' },
                { title: 'Dependency Audit', badge: 'Block Critical', desc: 'Scans package manifests for CVEs and outdated libraries.' },
                { title: 'Secrets Detection', badge: 'Block All', desc: 'Prevents hardcoded API keys, JWT tokens, and credentials from being shipped.' },
              ].map(a => (
                <div key={a.title} style={{ padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{a.title}</div>
                    <span style={{ fontSize: '0.6rem', padding: '3px 6px', borderRadius: 4, background: 'rgba(234,88,12,0.1)', color: 'var(--accent)', fontWeight: 700 }}>{a.badge}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{a.desc}</div>
                </div>
              ))}
            </div>
          </section>

          <section id="api" style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>API Reference</h2>
            {[
              { method: 'POST', path: '/api/auth/register', desc: 'Create a new user account. The first account is automatically SuperAdmin.' },
              { method: 'POST', path: '/api/auth/login', desc: 'Authenticate and receive a JWT access token.' },
              { method: 'GET', path: '/api/auth/github/oauth-url', desc: 'Retrieve the GitHub OAuth consent URL for connecting private repositories.' },
              { method: 'POST', path: '/api/scan', desc: 'Submit a GitHub repository URL for a full AI security scan.' },
              { method: 'POST', path: '/api/scans/{id}/apply-patch', desc: 'Approves an AI-generated patch and automatically creates a GitHub PR.' },
              { method: 'GET', path: '/api/agents', desc: 'Fetch the live status of all autonomous agents.' },
              { method: 'POST', path: '/api/agents/{id}/toggle', desc: 'Enable or disable a specific agent.' },
              { method: 'GET', path: '/api/admin/users', desc: 'SuperAdmin only: list all platform users.' },
            ].map(e => (
              <div key={e.path} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ background: e.method === 'GET' ? 'rgba(20,184,166,0.15)' : 'rgba(var(--accent-rgb, 234,88,12),0.15)', color: e.method === 'GET' ? '#14b8a6' : 'var(--accent)', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.72rem', padding: '3px 8px', borderRadius: 4, minWidth: 48, textAlign: 'center' }}>{e.method}</span>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 4, fontWeight: 700 }}>{e.path}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{e.desc}</div>
                </div>
              </div>
            ))}
          </section>

          <section id="cli" style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>CLI Usage (Command Prompt)</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>ResilioCheck provides a powerful Command Line Interface (CLI) for running deep autonomous security scans directly on your local machine using the Windows Command Prompt (or any other terminal). All the telemetry remains on your machine, leveraging the same advanced AI scanning engine.</p>
            
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>1. Install the CLI</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: '0.9rem' }}>Navigate to the `resiliocheck-core` directory in your command prompt and run the following pip command to install the CLI globally:</p>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                <div style={{ color: 'var(--text-primary)' }}>pip install -e .</div>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>2. Run a Local Scan</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: '0.9rem' }}>Once installed, you can analyze any local directory. The CLI will securely prompt you for your `GROQ_API_KEY` (and `GITHUB_TOKEN` for auto-PRs) if they are not already set in your `.env` file.</p>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}># Scan the current directory</div>
                <div style={{ color: 'var(--text-primary)', marginBottom: 16 }}>resiliocheck .</div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}># Scan a specific path with a limit on files</div>
                <div style={{ color: 'var(--text-primary)' }}>resiliocheck C:\path\to\your\project --max-files 1000</div>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>3. Uninstall the CLI</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: '0.9rem' }}>If you need to remove the CLI from your system, you can uninstall it effortlessly using pip in your command prompt:</p>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                <div style={{ color: 'var(--text-primary)' }}>pip uninstall resiliocheck-core -y</div>
              </div>
            </div>
          </section>

          <section id="cicd" style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>CI/CD Integration (GitHub Actions)</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>Automate your security posture by integrating ResilioCheck directly into your GitHub Actions pipeline.</p>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-primary)', whiteSpace: 'pre', overflowX: 'auto' }}>{`- name: ResilioCheck Autonomous Scan
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

          <section id="security" style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>Security Model</h2>
            {[
              { title: 'Private Repository OAuth', desc: 'Securely connect your GitHub account. Access tokens are used ephemerally during the scan and are never stored permanently, ensuring zero code exposure.' },
              { title: 'SSRF Protection', desc: 'All repository URLs are validated against a strict allowlist — only https://github.com/ URLs are accepted. This prevents Server-Side Request Forgery attacks against internal infrastructure.' },
              { title: 'Archive Size Cap', desc: 'Downloaded repository archives are capped at 100 MB to prevent memory-exhaustion DoS attacks from adversarially large repositories.' },
              { title: 'Path Traversal Prevention', desc: 'Every ZIP entry is sanitised before extraction (CWE-22) — malicious paths like ../../etc/passwd are silently skipped.' },
              { title: 'Hardened Docker Sandbox', desc: 'AI-generated patches are validated in a container with zero network access, a read-only filesystem, dropped capabilities, and a 512 MB memory limit.' },
            ].map(s => (
              <div key={s.title} style={{ marginBottom: 20, padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--accent)' }}><Check size={16} /> {s.title}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{s.desc}</div>
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}
