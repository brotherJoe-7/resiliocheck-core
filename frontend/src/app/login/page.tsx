'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      {/* Background glow */}
      <div style={{ position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 500, height: 300, background: 'radial-gradient(ellipse, rgba(234,88,12,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
      
      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #ea580c, #dc2626)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>⚡</div>
            <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fafafa', letterSpacing: '-0.02em' }}>ResilioCheck AI</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#71717a' }}>Sign in to your workspace</div>
        </div>

        {/* Card */}
        <div style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 16, padding: '36px 32px' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fafafa', marginBottom: 24, marginTop: 0 }}>Welcome back</h1>
          
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#a1a1aa', marginBottom: 8 }}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="rc-input"
                style={{ fontSize: '0.9rem' }}
              />
            </div>
            
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#a1a1aa', marginBottom: 8 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="rc-input"
                style={{ fontSize: '0.9rem' }}
              />
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: '0.82rem', color: '#f87171' }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rc-btn-primary"
              style={{ width: '100%', justifyContent: 'center', fontSize: '0.95rem', padding: '12px 20px' }}
            >
              {loading ? '⏳ Signing in...' : '⚡ Sign In'}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: '0.82rem', color: '#71717a' }}>
            Don&apos;t have an account?{' '}
            <Link href="/register" style={{ color: '#ea580c', textDecoration: 'none', fontWeight: 600 }}>Create one →</Link>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: '0.75rem', color: '#52525b' }}>
          <Link href="/" style={{ color: '#52525b', textDecoration: 'none' }}>← Back to ResilioCheck AI</Link>
        </div>
      </div>
    </div>
  );
}
