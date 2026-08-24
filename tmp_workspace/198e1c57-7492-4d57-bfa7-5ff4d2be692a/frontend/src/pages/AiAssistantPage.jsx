import React, { useState, useRef, useEffect, useCallback } from 'react';
import ProtectedLayout from '../components/ProtectedLayout';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';

const ROLE_CONFIG = {
  admin: {
    title: 'School AI Assistant',
    subtitle: 'Query administrative data, reports, and analytics using natural language.',
    greeting: (name) => `Hello ${name}! I can help you analyse student performance, attendance trends, payroll, and more. What would you like to know?`,
    contextType: 'school administration',
    badgeLabel: 'ADMIN AI',
    placeholder: 'Ask anything about your school data...',
  },
  superadmin: {
    title: 'Platform AI Assistant',
    subtitle: 'Query global platform metrics and multi-tenant analytics.',
    greeting: (name) => `Hello ${name}! I have access to platform-wide data across all schools. Ask me about revenue, tenant performance, or system metrics.`,
    contextType: 'global platform',
    badgeLabel: 'PLATFORM AI',
    placeholder: 'Ask about platform metrics, tenants, revenue...',
  },
  teacher: {
    title: 'Teacher AI Assistant',
    subtitle: 'Get insights on your classes, student performance, and attendance.',
    greeting: (name) => `Hello ${name}! I can help you analyse your students' performance, flag at-risk students, and summarise class attendance. What do you need?`,
    contextType: 'teacher dashboard',
    badgeLabel: 'TEACHER AI',
    placeholder: 'Ask about your students, classes, attendance...',
  },
  student: {
    title: 'Student AI Assistant',
    subtitle: 'Ask about your grades, attendance, and academic standing.',
    greeting: (name) => `Hello ${name}! I can help you understand your attendance record, check your academic progress, and explain your transcript. What would you like to know?`,
    contextType: 'student portal',
    badgeLabel: 'STUDENT AI',
    placeholder: 'Ask about your grades, attendance...',
  },
  parent: {
    title: 'Parent AI Assistant',
    subtitle: "Ask questions about your child's academic progress and school activities.",
    greeting: (name) => `Hello ${name}! I can help you understand your child's attendance, academic performance, and payment status. Just ask me anything.`,
    contextType: 'parent portal',
    badgeLabel: 'PARENT AI',
    placeholder: "Ask about your child's progress...",
  },
};

// ── Defined OUTSIDE the main component so React never re-mounts them ──
function MessageBubble({ m, isMobile }) {
  return (
    <div style={{
      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
      maxWidth: isMobile ? '92%' : '85%',
      display: 'flex', flexDirection: 'column',
      alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600, padding: '0 4px' }}>
        {m.role === 'user' ? 'You' : 'Gemini AI'}
      </div>
      <div style={{
        background: m.role === 'user' ? 'var(--color-gold)' : 'var(--color-bg-card)',
        color: m.role === 'user' ? '#000' : 'var(--color-text-primary)',
        border: m.role === 'user' ? 'none' : '1px solid var(--color-border)',
        padding: isMobile ? '12px 14px' : '12px 16px', borderRadius: '16px',
        borderBottomRightRadius: m.role === 'user' ? '4px' : '16px',
        borderBottomLeftRadius: m.role === 'user' ? '16px' : '4px',
        lineHeight: 1.65, fontSize: isMobile ? '14px' : '14.5px', 
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word',
        boxShadow: m.role === 'user' ? '0 4px 12px rgba(245,158,11,0.2)' : '0 2px 8px rgba(0,0,0,0.05)',
      }}>
        {m.content}
      </div>
    </div>
  );
}

export default function AiAssistantPage() {
  const { user } = useAuth();
  const config = ROLE_CONFIG[user?.role] || ROLE_CONFIG.admin;
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [messages, setMessages] = useState([
    { role: 'ai', content: config.greeting(user?.name?.split(' ')[0] || 'there') }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setLoading(true);

    setTimeout(() => inputRef.current?.focus(), 50);

    try {
      const { data } = await API.post('/ai/query', {
        query: userMsg,
        contextType: config.contextType,
        contextData: { role: user?.role, name: user?.name },
      });
      if (data.success) {
        setMessages(prev => [...prev, { role: 'ai', content: data.data.answer }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: data.message || 'Sorry, I encountered an error. Please try again.' }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'ai', content: 'Connection error while reaching the AI service. Please check that the Gemini API key is configured.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, config, user]);

  if (isMobile) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: 'var(--color-bg-primary)', display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>{config.title}</h1>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>{config.subtitle}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ background: 'var(--color-gold)', color: '#000', padding: '3px 10px', borderRadius: '20px', fontSize: '9px', fontWeight: 800 }}>
              {config.badgeLabel}
            </div>
            <button
              onClick={() => window.history.back()}
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px', display: 'flex', flexDirection: 'column', gap: '18px', background: 'var(--color-bg-primary)', minHeight: 0 }}>
          {messages.map((m, i) => <MessageBubble key={i} m={m} isMobile={true} />)}
          {loading && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '16px', borderBottomLeftRadius: '4px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
              <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
              Gemini is thinking...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div style={{ padding: '12px 16px 20px', background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', gap: '10px', position: 'relative' }}
            onClick={e => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="text"
              className="form-input"
              placeholder={config.placeholder}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { handleSubmit(e); } }}
              style={{
                flex: 1,
                padding: '12px 90px 12px 16px',
                borderRadius: '30px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-primary)',
                fontSize: '14px',
              }}
              disabled={loading}
              autoComplete="off"
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !input.trim()}
              style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', borderRadius: '24px', padding: '0 16px', fontWeight: 700, height: '36px', minWidth: '70px' }}
            >
              {loading ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <ProtectedLayout>
      <div style={{ height: 'calc(100dvh - 80px)', display: 'flex', flexDirection: 'column', gap: '0' }}>
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', flexShrink: 0 }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>{config.title}</h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', margin: '4px 0 0 0' }}>{config.subtitle}</p>
          </div>
          <div style={{ background: 'var(--color-gold)', color: '#000', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px' }}>
            {config.badgeLabel}
          </div>
        </div>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', minHeight: 0 }}>
          
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px', background: 'var(--color-bg-primary)', minHeight: 0 }}>
            {messages.map((m, i) => <MessageBubble key={i} m={m} isMobile={false} />)}
            {loading && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '16px', borderBottomLeftRadius: '4px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
                Gemini is thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={{ padding: '14px 20px 18px', background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', gap: '10px', position: 'relative' }}
              onClick={e => e.stopPropagation()}
            >
              <input
                ref={inputRef}
                type="text"
                className="form-input"
                placeholder={config.placeholder}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { handleSubmit(e); } }}
                style={{
                  flex: 1,
                  padding: '13px 120px 13px 18px',
                  borderRadius: '30px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-primary)',
                  fontSize: '15px',
                }}
                disabled={loading}
                autoComplete="off"
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || !input.trim()}
                style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', borderRadius: '24px', padding: '0 20px', fontWeight: 700, height: '40px', minWidth: '80px' }}
              >
                {loading ? '...' : 'Send'}
              </button>
            </form>
            <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '10px' }}>
              AI responses are generated by Gemini. Verify critical information on your dashboard.
            </div>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}
