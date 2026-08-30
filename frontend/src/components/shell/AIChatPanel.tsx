'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Send, Sparkles, X } from 'lucide-react';
import { validateSDUIResponse, type ChatMessage, type ChatResponse } from '@erp/shared-contracts';
import { apiClient } from '@/lib/api-client';
import { useUiStore } from '@/lib/ui-store';
import { SDUISectionRenderer } from '@/components/sdui/SDUISectionRenderer';

interface DisplayMessage extends ChatMessage {
  response?: ChatResponse;
}

export function AIChatPanel() {
  const open = useUiStore((s) => s.aiPanelOpen);
  const setOpen = useUiStore((s) => s.setAiPanelOpen);
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  if (!open) return null;

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const userMessage: DisplayMessage = { id: crypto.randomUUID(), role: 'user', content: text, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);
    try {
      const response = await apiClient.post<ChatResponse>('ai/chat', { message: text });
      if (response.invalidate) {
        for (const source of response.invalidate) queryClient.invalidateQueries({ queryKey: ['ds', source] });
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
        position: 'fixed',
        top: 'var(--header-height)',
        right: 0,
        bottom: 0,
        width: 360,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 90,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
          <Sparkles size={16} color="var(--accent-indigo)" />
          DOERS Copilot
        </div>
        <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, marginTop: 40 }}>
            Ask questions, query live records, or request an action.
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
            {m.response?.mode === 'ui' && <InlineSDUI raw={m.response.ui} />}
          </div>
        ))}
        {sending && <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Thinking…</div>}
      </div>

      <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
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
            onClick={send}
            disabled={sending}
            style={{ border: 'none', background: 'var(--accent-indigo)', color: '#fff', borderRadius: 10, width: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function InlineSDUI({ raw }: { raw: unknown }) {
  const result = validateSDUIResponse(raw);
  if (!result.ok) return null;
  return (
    <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {result.page.page.sections.map((section) => (
        <div key={section.id} style={{ minHeight: 160 }}>
          <SDUISectionRenderer section={section} />
        </div>
      ))}
    </div>
  );
}
