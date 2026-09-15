'use client';
import { useState, useRef, useEffect } from 'react';
import { apiJson } from '@/app/utils/apiClient';
import { X, Send, Bot, User, Loader2, MessageSquare, Sparkles } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  scanId?: number | null;
}

const WELCOME: Message = {
  role: 'assistant',
  content: "Hi! I'm your **ResilioCheck AI Security Assistant** ✨\n\nI can help you:\n- Understand your scan results\n- Explain how to fix vulnerabilities\n- Answer security questions in plain language\n\nWhat would you like to know?"
};

function renderContent(text: string) {
  // Minimal markdown: bold, inline code, line breaks
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*|\n)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^\w+\n/, '');
      return <pre key={i} style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 6, padding: '10px 12px', fontSize: '0.75rem', overflowX: 'auto', margin: '6px 0', color: '#a8d8a8', border: '1px solid rgba(255,255,255,0.08)' }}><code>{code}</code></pre>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 3, padding: '1px 5px', fontSize: '0.8em', color: 'var(--accent)' }}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part === '\n') return <br key={i} />;
    // Handle bullet points
    if (part.startsWith('- ')) {
      return <span key={i} style={{ display: 'block', paddingLeft: 14 }}>{'• ' + part.slice(2)}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ChatPanel({ isOpen, onClose, scanId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg: Message = { role: 'user', content: text };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setLoading(true);

    try {
      const data = await apiJson<{ reply: string }>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: nextHistory,
          scan_id: scanId ?? null,
        }),
      });
      setMessages(h => [...h, { role: 'assistant', content: data.reply }]);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      setMessages(h => [...h, { role: 'assistant', content: `⚠️ ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(2px)',
            animation: 'fadeIn 0.2s ease',
          }}
        />
      )}

      {/* Side Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(420px, 95vw)',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-base)',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent), hsl(from var(--accent) h calc(s + 20) calc(l - 10)))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={16} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Security Assistant</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              Powered by ResilioCheck AI
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                gap: 10,
                alignItems: 'flex-start',
                animation: 'slideUp 0.2s ease',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: msg.role === 'user'
                  ? 'var(--accent)'
                  : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {msg.role === 'user' ? <User size={14} color="#fff" /> : <Bot size={14} color="#fff" />}
              </div>

              {/* Bubble */}
              <div style={{
                maxWidth: '80%',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-base)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                padding: '10px 14px',
                fontSize: '0.83rem',
                color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                lineHeight: 1.55,
              }}>
                {renderContent(msg.content)}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', animation: 'slideUp 0.2s ease' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #7c3aed, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={14} color="#fff" />
              </div>
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '12px 12px 12px 4px', padding: '10px 14px' }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Suggested prompts (shows only at start) */}
        {messages.length === 1 && (
          <div style={{ padding: '0 16px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['What does CRITICAL severity mean?', 'How do I fix SQL injection?', 'What is XSS?'].map(s => (
              <button
                key={s}
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
                style={{
                  background: 'var(--bg-base)', border: '1px solid var(--border)',
                  borderRadius: 20, padding: '4px 12px', fontSize: '0.72rem',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  transition: 'border-color 0.2s, color 0.2s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '12px 16px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-base)',
        }}>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-end',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '8px 10px 8px 14px',
            transition: 'border-color 0.2s',
          }}
            onFocusCapture={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)'}
            onBlurCapture={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about your security scan..."
              rows={1}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                resize: 'none', color: 'var(--text-primary)', fontSize: '0.85rem',
                lineHeight: 1.5, fontFamily: 'inherit', maxHeight: 100, overflowY: 'auto',
              }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 100) + 'px';
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg-base)',
                border: 'none', borderRadius: 8, padding: '6px 8px',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                color: input.trim() && !loading ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 6 }}>
            Press <kbd style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 3, padding: '0 4px', fontSize: '0.65rem' }}>Enter</kbd> to send · <kbd style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 3, padding: '0 4px', fontSize: '0.65rem' }}>Shift+Enter</kbd> for new line
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
