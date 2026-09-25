'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Plug, Sparkles, Shield, UserRound } from 'lucide-react';
import { useSession } from '@/lib/session';
import { fetchDataSource } from '@/lib/data-source-registry';
import { apiClient } from '@/lib/api-client';
import { useUiStore } from '@/lib/ui-store';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Badge } from '@/components/ui/Badge';

export function UserMenu() {
  const { data } = useSession();
  const user = data?.user;
  const open = useUiStore((s) => s.userMenuOpen);
  const setOpen = useUiStore((s) => s.setUserMenuOpen);
  const router = useRouter();
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);

  const { data: adminTools } = useQuery({
    queryKey: ['ds', 'admin-tools'],
    queryFn: () => fetchDataSource('admin-tools'),
    enabled: Boolean(user),
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [setOpen]);

  if (!user) return null;

  async function signOut() {
    await apiClient.post('auth/logout');
    queryClient.clear();
    router.push('/login');
  }

  const initials = user.username.slice(0, 2).toUpperCase();
  const showAdminTools = Array.isArray(adminTools) && adminTools.length > 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-pink))',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {initials}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{user.username}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '120%',
            right: 0,
            width: 280,
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: 16,
            zIndex: 100,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-pink))',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
              }}
            >
              {initials}
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{user.username}</div>
              <div style={{ marginTop: 2 }}>
                <Badge>{user.role}</Badge>
              </div>
            </div>
          </div>

          <ThemeToggle />

          <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0 6px' }} />

          {showAdminTools && (
            <MenuItem
              icon={<Shield size={16} />}
              label="Admin Hub"
              onClick={() => {
                setOpen(false);
                router.push('/admin');
              }}
            />
          )}
          <MenuItem
            icon={<Plug size={16} />}
            label="Connectors & Integrations"
            onClick={() => {
              setOpen(false);
              router.push('/admin/connectors');
            }}
          />
          <MenuItem
            icon={<Sparkles size={16} />}
            label="AI Configuration"
            onClick={() => {
              setOpen(false);
              router.push('/admin/ai-configuration');
            }}
          />

          <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
          <MenuItem icon={<LogOut size={16} />} label="Sign Out" onClick={signOut} danger />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '9px 8px',
        border: 'none',
        background: 'transparent',
        borderRadius: 8,
        fontSize: 13.5,
        fontWeight: 600,
        cursor: 'pointer',
        color: danger ? 'var(--accent-red)' : 'var(--text-primary)',
        textAlign: 'left',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
