'use client';
import { apiJson, TOKEN_KEY, USER_KEY, UNAUTHORIZED_EVENT } from '@/app/utils/apiClient';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface AuthUser {
  email: string;
  full_name: string;
  role: string;
}

interface AuthResponse {
  access_token: string;
  token_type: string;
  role: string;
  email: string;
  full_name: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, full_name: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }, []);

  useEffect(() => {
    // Restore the persisted session (localStorage is an external system).
    let restored: { token: string; user: AuthUser } | null = null;
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedToken && storedUser) restored = { token: storedToken, user: JSON.parse(storedUser) };
    } catch {
      restored = null;
    }
    const apply = () => {
      if (restored) {
        setToken(restored.token);
        setUser(restored.user);
      } else {
        clearSession();
      }
      setLoading(false);
    };
    // Defer to the next tick so the state update is not synchronous inside the effect body.
    const timer = setTimeout(apply, 0);

    // Backend rejected the token (expired / server restarted) -> drop session.
    const onUnauthorized = () => clearSession();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    };
  }, [clearSession]);

  function persist(data: AuthResponse) {
    const u = { email: data.email, full_name: data.full_name, role: data.role };
    setToken(data.access_token);
    setUser(u);
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  }

  async function login(email: string, password: string) {
    const data = await apiJson<AuthResponse>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    persist(data);
  }

  async function register(email: string, password: string, full_name: string) {
    const data = await apiJson<AuthResponse>('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name }),
    });
    persist(data);
  }

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout: clearSession, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
