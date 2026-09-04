'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DashboardConfig, DashboardSectionSchema } from '@erp/shared-contracts';
import type { z } from 'zod';
import { fetchDataSource } from '@/lib/data-source-registry';
import { Toolbar } from './Toolbar';
import { DonutChart, AreaChart } from './charts';

type DashboardSection = z.infer<typeof DashboardSectionSchema>;

const ACCENT_COLORS: Record<string, string> = {
  indigo: 'var(--accent-indigo)',
  pink: 'var(--accent-pink)',
  emerald: 'var(--accent-emerald)',
  amber: 'var(--accent-amber)',
  cyan: 'var(--accent-cyan)',
};

export function Dashboard({ section }: { section: DashboardSection }) {
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const item of section.toolbar) {
      if (item.type === 'filter' && item.field && item.defaultValue !== undefined) {
        initial[item.field] = String(item.defaultValue);
      }
    }
    return initial;
  });
  const queryClient = useQueryClient();

  const hasDataSource = Boolean(section.data?.source);
  const queryKey = ['ds', section.data?.source, filters];

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey,
    queryFn: () => fetchDataSource(section.data!.source, { ...section.data?.params, ...filters }),
    enabled: hasDataSource,
    placeholderData: (previousData) => previousData,
  });

  const config: DashboardConfig = hasDataSource
    ? ((data as DashboardConfig) ?? { cards: [], charts: [] })
    : ((section.state as DashboardConfig | undefined) ?? section.config);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar
        items={section.toolbar}
        filters={filters}
        onFilterChange={(field, value) => setFilters((prev) => ({ ...prev, [field]: value }))}
        search=""
        onSearchChange={() => { }}
        onAction={(action) => {
          if (action.type === 'refresh') queryClient.invalidateQueries({ queryKey: ['ds', section.data?.source] });
        }}
      />
      <div style={{ padding: '4px 8px', overflowY: 'auto' }}>
        {hasDataSource && isLoading && <SkeletonCards />}
        {hasDataSource && isError && <ErrorState />}
        {(!hasDataSource || (!isLoading && !isError)) && (
          <>
            {config.cards.length === 0 && config.charts.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 8 }}>
                  {config.cards.map((card) => (
                    <div
                      key={card.id}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderLeft: `4px solid ${ACCENT_COLORS[card.accent ?? 'indigo']}`,
                        borderRadius: 'var(--radius-md)',
                        padding: 18,
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                          {card.label}
                        </span>
                        {card.delta && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: card.deltaTone === 'negative' ? 'var(--accent-red)' : 'var(--accent-emerald)' }}>
                            {card.delta}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{card.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 8 }}>
                  {config.charts.map((chart) => (
                    <div key={chart.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 18, boxShadow: 'var(--shadow-sm)' }}>
                      <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>{chart.title}</h3>
                      {chart.type === 'donut' ? <DonutChart series={chart.series} /> : <AreaChart series={chart.series} />}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ height: 90, borderRadius: 12, background: 'var(--surface-2)' }} />
      ))}
    </div>
  );
}

function ErrorState() {
  return <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>Couldn't load this dashboard right now.</div>;
}

function EmptyState() {
  return <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>Nothing to show yet.</div>;
}
