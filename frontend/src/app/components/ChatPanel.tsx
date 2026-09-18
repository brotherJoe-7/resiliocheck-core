'use client';
import { useState, useRef, useEffect } from 'react';
import { apiJson } from '@/app/utils/apiClient';
import { X, Send, Bot, User, Loader2, Sparkles, RotateCcw } from 'lucide-react';

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
  content: `Hello! I'm your **ResilioCheck Security Assistant** ✨

I can help you:
- Understand your scan results and what they mean
- Explain how to fix specific vulnerabilities
- Answer any security or DevOps questions

What would you like to know?`,
};

const SUGGESTED = [
  'What does CRITICAL severity mean?',
  'How do I fix SQL injection?',
  'What is XSS and why is it dangerous?',
];

// ---------- Markdown Renderer ----------

function parseMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on fenced code blocks first
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRe.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(...parseInlineBlocks(text.slice(last, match.index)));
    }
    const code = match[2].trim();
    nodes.push(
      <pre key={match.index} style={{
        background: 'rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8,
        padding: '12px 14px',
        fontSize: '0.75rem',
        overflowX: 'auto',
        margin: '10px 0',
        lineHeight: 1.6,
        color: '#aee8a0',
        fontFamily: '"Fira Mono", "Cascadia Code", monospace',
      }}>
        <code>{code}</code>
      </pre>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(...parseInlineBlocks(text.slice(last)));
  }
  return nodes;
}

function parseInlineBlocks(block: string): React.ReactNode[] {
  const lines = block.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line → spacing
    if (line.trim() === '') {
      nodes.push(<div key={`br-${i}`} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // Unordered list (- or *)
    if (/^[-*] /.test(line.trim())) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        items.push(
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4, lineHeight: 1.55 }}>
            <span style={{ color: 'var(--accent)', fontSize: '0.7rem', marginTop: 5, flexShrink: 0 }}>▸</span>
            <span>{parseInline(lines[i].trim().slice(2))}</span>
          </li>
        );
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} style={{ margin: '6px 0', paddingLeft: 18, listStyle: 'none' }}>
          {items}
        </ul>
      );
      continue;
    }

    // Ordered list (1. 2. etc)
    if (/^\d+\. /.test(line.trim())) {
      const items: React.ReactNode[] = [];
      let num = 1;
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
        items.push(
          <li key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, lineHeight: 1.55 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0, minWidth: 16 }}>{num}.</span>
            <span>{parseInline(lines[i].trim().replace(/^\d+\. /, ''))}</span>
          </li>
        );
        i++; num++;
      }
      nodes.push(<ol key={`ol-${i}`} style={{ margin: '6px 0', listStyle: 'none', padding: 0 }}>{items}</ol>);
      continue;
    }

    // Heading (### ## #)
    const hMatch = line.match(/^(#{1,3}) (.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const sizes = ['1rem', '0.93rem', '0.87rem'];
      nodes.push(
        <div key={i} style={{ fontWeight: 700, fontSize: sizes[level - 1], color: 'var(--text-primary)', margin: '10px 0 4px' }}>
          {parseInline(hMatch[2])}
        </div>
      );
      i++; continue;
    }

    // Normal paragraph
    nodes.push(
      <p key={i} style={{ margin: '3px 0', lineHeight: 1.6 }}>
        {parseInline(line)}
      </p>
    );
    i++;
  }
  return nodes;
}

function parseInline(text: string): React.ReactNode {
  // Bold (**text**), inline code (`code`), italic (*text*)
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 4,
          padding: '1px 6px',
          fontSize: '0.8em',
          color: 'var(--accent)',
          fontFamily: '"Fira Mono", monospace',
        }}>{part.slice(1, -1)}</code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i} style={{ color: 'var(--text-secondary)' }}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ---------- Chat Panel ----------

export default function ChatPanel({ isOpen, onClose, scanId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 350);
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function resetChat() {
    setMessages([WELCOME]);
    setInput('');
  }

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMsg: Message = { role: 'user', content: text };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setLoading(true);

    try {
      const data = await apiJson<{ reply: string }>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: nextHistory, scan_id: scanId ?? null }),
      });
      setMessages(h => [...h, { role: 'assistant', content: data.reply }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      setMessages(h => [...h, { role: 'assistant', content: `⚠️ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const showSuggested = messages.length === 1 && !loading;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(3px)',
            animation: 'rcFadeIn 0.2s ease',
          }}
        />
      )}

      {/* Panel */}
      <aside
        aria-label="AI Security Assistant"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(440px, 96vw)',
          zIndex: 1001,
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-12px 0 48px rgba(0,0,0,0.45)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-base)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
          }}>
            <Sparkles size={17} color="#fff" />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Security Assistant
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'rcPulse 2s infinite' }} />
              Powered by ResilioCheck AI
            </div>
          </div>

          <button
            onClick={resetChat}
            title="New conversation"
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={onClose}
            title="Close"
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Messages ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px 8px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 10, alignItems: 'flex-start', animation: 'rcSlideUp 0.22s ease' }}>

              {/* Avatar */}
              <div style={{
                width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                background: msg.role === 'user'
                  ? 'var(--accent)'
                  : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              }}>
                {msg.role === 'user'
                  ? <User size={14} color="#fff" />
                  : <Bot size={14} color="#fff" />
                }
              </div>

              {/* Bubble */}
              <div style={{
                maxWidth: '82%',
                padding: msg.role === 'user' ? '10px 14px' : '12px 16px',
                borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, var(--accent), hsl(from var(--accent) h s calc(l - 12)))'
                  : 'var(--bg-base)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                fontSize: '0.84rem',
                lineHeight: 1.55,
                boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
              }}>
                {msg.role === 'assistant'
                  ? <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{parseMarkdown(msg.content)}</div>
                  : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                }
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {loading && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', animation: 'rcSlideUp 0.2s ease' }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg, #7c3aed, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
                <Bot size={14} color="#fff" />
              </div>
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', padding: '12px 16px', display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0, 1, 2].map(d => (
                  <span key={d} style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: 'var(--accent)',
                    display: 'inline-block',
                    animation: `rcDot 1.2s ease-in-out ${d * 0.2}s infinite`,
                    opacity: 0.5,
                  }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Suggested Prompts ── */}
        {showSuggested && (
          <div style={{ padding: '4px 18px 10px', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {SUGGESTED.map(s => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  borderRadius: 20,
                  padding: '5px 13px',
                  fontSize: '0.73rem',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, color 0.2s, background 0.2s',
                  lineHeight: 1.3,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(var(--accent-rgb,99,102,241),0.07)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-base)';
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* ── Input Area ── */}
        <div style={{ padding: '10px 18px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg-base)', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex', gap: 8, alignItems: 'flex-end',
              background: 'var(--bg-surface)',
              border: '1.5px solid var(--border)',
              borderRadius: 14, padding: '10px 10px 10px 14px',
              transition: 'border-color 0.2s',
            }}
            onFocusCapture={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)'}
            onBlurCapture={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'}
          >
            <textarea
              ref={el => { (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el; (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el; }}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your scan or any security topic..."
              rows={1}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                resize: 'none', color: 'var(--text-primary)', fontSize: '0.86rem',
                lineHeight: 1.5, fontFamily: 'inherit',
                maxHeight: 120, overflowY: 'auto',
              }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              style={{
                width: 34, height: 34, borderRadius: 9, border: 'none', flexShrink: 0,
                background: input.trim() && !loading ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                color: input.trim() && !loading ? '#fff' : 'var(--text-muted)',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              {loading ? <Loader2 size={15} style={{ animation: 'rcSpin 1s linear infinite' }} /> : <Send size={15} />}
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 7, letterSpacing: '0.2px' }}>
            <kbd style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>Enter</kbd> to send &nbsp;·&nbsp;
            <kbd style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>Shift+Enter</kbd> for new line
          </div>
        </div>
      </aside>

      <style>{`
        @keyframes rcFadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes rcSlideUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes rcSpin    { to { transform:rotate(360deg) } }
        @keyframes rcPulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes rcDot     { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
      `}</style>
    </>
  );
}
