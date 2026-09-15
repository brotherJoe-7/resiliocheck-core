'use client';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { Hourglass, Zap, AlertTriangle, Eye, EyeOff, Shield, CheckCircle2, Lock } from 'lucide-react';


function LoginPageInner() {
  const { login, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = (() => {
    const n = searchParams.get('next') || '/dashboard';
    return n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard';
  })();

  useEffect(() => {
    if (!authLoading && token) router.replace(nextPath);
  }, [authLoading, token, router, nextPath]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row-reverse', background: 'var(--bg-base)' }}>

      {/* ── LEFT PANEL: Branding ── */}
      <div className="rc-auth-left-panel" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 48px',
        background: 'linear-gradient(135deg, #0d0d0f 0%, #141417 40%, rgba(234,88,12,0.06) 100%)',
        borderLeft: '1px solid var(--border)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glow blobs */}
        <div style={{
          position: 'absolute', top: '20%', left: '10%',
          width: 300, height: 300, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(234,88,12,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '15%', right: '5%',
          width: 200, height: 200, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(234,88,12,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 420, width: '100%' }}>
          {/* Logo */}
          <div style={{ marginBottom: 48 }}>
            <Image
              src="/logo.jpg"
              alt="ResilioCheck AI"
              width={200}
              height={48}
              style={{ objectFit: 'contain', width: 'auto', height: 48 }}
              priority
            />
          </div>

          <h1 style={{
            fontSize: 'clamp(2rem, 3vw, 2.8rem)',
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            marginBottom: 20,
          }}>
            Autonomous<br />
            <span style={{ color: 'var(--accent)' }}>Security</span> for<br />
            Modern Code.
          </h1>

          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.7, marginBottom: 48 }}>
            AI-powered vulnerability scanning, secret detection, and automated patch generation — all in one platform.
          </p>

          {/* Feature bullets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { icon: Shield, label: 'OWASP Top 10 detection with AI analysis' },
              { icon: Lock, label: 'Secrets scanner with zero code retention' },
              { icon: CheckCircle2, label: 'Auto-patch generation via GitHub PR' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(234,88,12,0.1)', border: '1px solid rgba(234,88,12,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={15} color="var(--accent)" />
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL (visually left): Form ── */}
      <div style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '60px 48px',
        background: 'var(--bg-base)',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>
              Welcome back
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Sign in to your ResilioCheck workspace
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="rc-input"
                style={{ fontSize: '0.95rem', padding: '12px 16px' }}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="rc-input"
                  style={{ fontSize: '0.95rem', padding: '12px 16px', paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                marginBottom: 20, padding: '12px 16px',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8, fontSize: '0.85rem', color: '#f87171',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <AlertTriangle size={16} /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rc-btn-primary"
              style={{ width: '100%', justifyContent: 'center', fontSize: '1rem', padding: '13px 20px' }}
            >
              {loading ? <><Hourglass size={16} /> Signing in...</> : <><Zap size={16} /> Sign In</>}
            </button>
          </form>

          <div style={{ marginTop: 28, textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Don&apos;t have an account?{' '}
            <Link href="/register" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              Create one →
            </Link>
          </div>

          <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
            <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.78rem' }}>
              ← Back to ResilioCheck AI
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg-base)' }} />}>
      <LoginPageInner />
    </Suspense>
  );
}
