'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Send, Sparkles, X } from 'lucide-react';
import type { ChatMessage, ChatResponse } from '@erp/shared-contracts';
import { apiClient } from '@/lib/api-client';
import { useUiStore } from '@/lib/ui-store';

interface DisplayMessage extends ChatMessage {
  response?: ChatResponse;
}

export function AIChatPanel() {
  const open = useUiStore((s) => s.aiPanelOpen);
  const setOpen = useUiStore((s) => s.setAiPanelOpen);
  const setCopilotPage = useUiStore((s) => s.setCopilotPage);
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  async function send(explicitText?: string) {
    const text = (explicitText ?? input).trim();
    if (!text || sending) return;
    setInput('');
    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);
    try {
      const response = await apiClient.post<ChatResponse>('ai/chat', { message: text });
      if (response.invalidate) {
        for (const source of response.invalidate) queryClient.invalidateQueries({ queryKey: ['ds', source] });
      }
      if (response.mode === 'ui' && response.ui) {
        setCopilotPage(response.ui);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.text ?? '',
          createdAt: new Date().toISOString(),
          response,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: "Sorry, I couldn't process that.", createdAt: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <aside
      style={{
        width: open ? 380 : 0,
        height: '100%',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderLeft: open ? '1px solid var(--border)' : '1px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        transition: 'width 0.28s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease',
        visibility: open ? 'visible' : 'hidden',
      }}
    >
      <div style={{ width: 380, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <Sparkles size={16} color="var(--accent-indigo)" />
            DOERS Copilot
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close AI panel"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              padding: 4,
              borderRadius: 6,
            }}
          >
            <X size={16} />
          </button>
        </div> */}

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.length === 0 && (
            <div
              style={{
                margin: 'auto 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '24px 12px',
              }}
            >
              {/* Icon Container matching preview */}
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 18,
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.14) 0%, rgba(139, 92, 246, 0.1) 100%)',
                  border: '1.5px solid rgba(99, 102, 241, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                  boxShadow: '0 8px 24px -4px rgba(99, 102, 241, 0.18)',
                }}
              >
                <Sparkles size={28} color="var(--accent-indigo)" strokeWidth={2.2} />
              </div>

              {/* Title */}
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  color: 'var(--text-primary)',
                  marginBottom: 6,
                }}
              >
                DOERS Copilot
              </div>

              {/* Subtitle */}
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: 'var(--text-secondary)',
                  maxWidth: 280,
                }}
              >
                Ask questions, query live records, inspect data, or request an action.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
              {m.content && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    fontSize: 13.5,
                    background: m.role === 'user' ? 'var(--accent-indigo)' : 'var(--surface-2)',
                    color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                  }}
                >
                  {m.content}
                </div>
              )}
            </div>
          ))}
          {sending && <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Thinking…</div>}
        </div>

        <div style={{ padding: '8px', borderTop: '0px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
              }}
              placeholder="Ask DOERS Copilot…"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 13.5 }}
            />
            <button
              onClick={() => send()}
              disabled={sending}
              aria-label="Send message"
              style={{ border: 'none', background: 'var(--accent-indigo)', color: '#fff', borderRadius: 10, width: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
