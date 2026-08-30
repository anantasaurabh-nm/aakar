'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { ModuleDiscoveryEntry } from '@erp/shared-contracts';
import { fetchDataSource } from '@/lib/data-source-registry';
import { resolveIcon } from '@/lib/icon-registry';

/**
 * Bespoke Home "Apps" presentation (finetune-1 §1) — not a DataTable
 * variant. Apps discovery is always a small, plain array, so search is a
 * simple client-side filter over the already-fetched list rather than a
 * paginated server round-trip.
 */
export function AppsGrid() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ds', 'apps'],
    queryFn: () => fetchDataSource('apps') as Promise<ModuleDiscoveryEntry[]>,
  });

  const apps = data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((app) => app.name.toLowerCase().includes(q) || (app.description ?? '').toLowerCase().includes(q));
  }, [apps, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px 0' }}>
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-tertiary)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apps…"
            style={{
              width: '100%',
              padding: '8px 10px 8px 30px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
              fontSize: 13,
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {isLoading && <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading…</div>}
        {isError && <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Couldn't load apps right now.</div>}
        {!isLoading && !isError && filtered.length === 0 && (
          <div style={{ padding: 24, color: 'var(--text-secondary)' }}>No apps found.</div>
        )}
        {!isLoading && !isError && filtered.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            {filtered.map((app) => {
              const Icon = resolveIcon(app.icon);
              return (
                <div
                  key={app.id}
                  className="app-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/app/${app.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') router.push(`/app/${app.id}`);
                  }}
                  style={{
                    borderRadius: 16,
                    padding: 20,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'var(--accent-indigo)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{app.name}</div>
                    {app.description && (
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{app.description}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
