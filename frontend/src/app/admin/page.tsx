'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ModuleDiscoveryEntry } from '@erp/shared-contracts';
import { fetchDataSource } from '@/lib/data-source-registry';
import { useRequireAuth } from '@/lib/use-require-auth';
import { AppShell } from '@/components/shell/AppShell';
import { resolveIcon } from '@/lib/icon-registry';

export default function AdminToolsLandingPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useRequireAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['ds', 'admin-tools'],
    queryFn: () => fetchDataSource('admin-tools') as Promise<ModuleDiscoveryEntry[]>,
    enabled: Boolean(user),
  });

  if (authLoading || !user) return null;

  return (
    <AppShell brand={{ name: 'Admin Tools', icon: 'modules' }} navigation={{ items: [] }}>
      <div style={{ padding: 24 }}>
        {isLoading && <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p style={{ color: 'var(--text-secondary)' }}>No admin tools are available to you.</p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {data?.map((tool) => {
            const Icon = resolveIcon(tool.icon);
            return (
              <button
                key={tool.id}
                onClick={() => router.push(`/admin/${tool.id}`)}
                style={{
                  textAlign: 'left',
                  padding: 20,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'var(--accent-indigo-dark)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Icon size={18} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{tool.name}</div>
                {tool.description && <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>{tool.description}</div>}
              </button>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
