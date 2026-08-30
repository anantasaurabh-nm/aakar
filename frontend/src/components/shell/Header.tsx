'use client';

import { useRouter } from 'next/navigation';
import { Bell, PenSquare, Search, Settings, Sparkles } from 'lucide-react';
import type { SDUIBrand, SDUINavigation } from '@erp/shared-contracts';
import { resolveIcon } from '@/lib/icon-registry';
import { useUiStore } from '@/lib/ui-store';
import { UserMenu } from './UserMenu';

export function Header({ brand, navigation }: { brand: SDUIBrand; navigation: SDUINavigation }) {
  const router = useRouter();
  const setAiPanelOpen = useUiStore((s) => s.setAiPanelOpen);
  const aiPanelOpen = useUiStore((s) => s.aiPanelOpen);
  const Icon = resolveIcon(brand.icon);

  return (
    <header
      style={{
        height: 'var(--header-height)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <div
          onClick={() => router.push('/')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--accent-indigo-dark)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Icon size={18} />
        </div>
        <h1 style={{ fontSize: 17, fontWeight: 800, margin: 0, whiteSpace: 'nowrap' }}>{brand.name}</h1>

        {navigation.items.length > 0 && (
          <nav style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
            {navigation.items.map((item) => (
              <span
                key={item.id}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  background: 'var(--surface-2)',
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </span>
            ))}
          </nav>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ position: 'relative', display: 'none' }}>
          <Search size={14} />
        </div>
        <IconButton label="Notifications" onClick={() => {}}>
          <Bell size={17} />
        </IconButton>
        <IconButton label="Compose" onClick={() => {}}>
          <PenSquare size={17} />
        </IconButton>
        <button
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
          aria-label="DOERS Copilot"
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: aiPanelOpen ? 'var(--accent-indigo)' : 'linear-gradient(135deg, rgba(236,72,153,0.18), rgba(99,102,241,0.18))',
            color: aiPanelOpen ? '#fff' : 'var(--accent-indigo)',
          }}
        >
          <Sparkles size={17} />
        </button>
        <IconButton label="Settings" onClick={() => {}}>
          <Settings size={17} />
        </IconButton>
        <UserMenu />
      </div>
    </header>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}
