'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useUiStore, type ThemePreference } from '@/lib/ui-store';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? theme : 'system';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: 3,
      }}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = currentTheme === value;
        return (
          <button
            key={value}
            onClick={() => setTheme(value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: 'none',
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              background: active ? 'var(--accent-indigo)' : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
