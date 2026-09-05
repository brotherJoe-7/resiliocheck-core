'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { Sparkles, Hourglass, Zap, AlertTriangle, Eye, EyeOff } from 'lucide-react';


export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      await register(email, password, fullName);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      
      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, background: '#ea580c', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', color: '#ffffff' }}><Zap size={16} /></div>
            <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fafafa', letterSpacing: '-0.02em' }}>ResilioCheck AI</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#71717a' }}>Create your account to get started</div>
        </div>

        <div style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 16, padding: '36px 32px' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fafafa', marginBottom: 24, marginTop: 0 }}>Create account</h1>
          
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#a1a1aa', marginBottom: 8 }}>Full Name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Sharon Grace Peters" required className="rc-input" />
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#a1a1aa', marginBottom: 8 }}>Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required className="rc-input" />
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#a1a1aa', marginBottom: 8 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" required className="rc-input" style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#a1a1aa', marginBottom: 8 }}>Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showConfirm ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required className="rc-input" style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}>
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: '0.82rem', color: '#f87171' }}>
                <AlertTriangle size={16} /> {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="rc-btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: '0.95rem', padding: '12px 20px' }}>
              {loading ? <><Hourglass size={16} /> Creating account...</> : <><Sparkles size={16} /> Create Account</>}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: '0.82rem', color: '#71717a' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: '#ea580c', textDecoration: 'none', fontWeight: 600 }}>Sign in →</Link>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: '0.75rem', color: '#52525b' }}>
          <Link href="/" style={{ color: '#52525b', textDecoration: 'none' }}>← Back to ResilioCheck AI</Link>
        </div>
      </div>
    </div>
  );
}
