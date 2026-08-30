'use client';

import { useUiStore } from '@/lib/ui-store';

export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismissToast(t.id)}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            background: t.tone === 'error' ? 'var(--accent-red)' : '#111827',
            boxShadow: 'var(--shadow-md)',
            cursor: 'pointer',
            maxWidth: 320,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
