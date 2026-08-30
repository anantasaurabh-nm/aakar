'use client';

import { useState } from 'react';
import { Search, SlidersHorizontal, RefreshCw } from 'lucide-react';
import type { SDUIAction, SDUIToolbarItem } from '@erp/shared-contracts';

export interface ToolbarColumn {
  key: string;
  label: string;
  visible: boolean;
}

export interface ToolbarProps {
  items: SDUIToolbarItem[];
  filters: Record<string, string>;
  onFilterChange: (field: string, value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onAction: (action: SDUIAction) => void;
  columns?: ToolbarColumn[];
  onToggleColumn?: (key: string) => void;
}

/**
 * Declarative toolbar renderer (SDUI PRD §9). Every capability shown here
 * comes from the section's own toolbar contract — nothing is hardcoded per
 * app.
 */
export function Toolbar({ items, filters, onFilterChange, search, onSearchChange, onAction, columns, onToggleColumn }: ToolbarProps) {
  const [columnsOpen, setColumnsOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      {items.map((item) => {
        switch (item.type) {
          case 'action': {
            const primary = item.action?.type === 'create' || item.action?.type === 'submit';
            const isRefresh = item.action?.type === 'refresh';
            return (
              <button
                key={item.id}
                onClick={() => item.action && onAction(item.action)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: primary ? 'none' : '1px solid var(--border)',
                  background: primary ? 'var(--accent-indigo-dark)' : 'var(--surface)',
                  color: primary ? '#fff' : 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {isRefresh && <RefreshCw size={14} />}
                {item.label ?? item.id}
              </button>
            );
          }

          case 'search':
            return (
              <div key={item.id} style={{ position: 'relative', minWidth: 220 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-tertiary)' }} />
                <input
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={item.placeholder ?? 'Search…'}
                  style={{
                    padding: '8px 10px 8px 30px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    width: '100%',
                  }}
                />
              </div>
            );

          case 'filter': {
            if (!item.field) return null;
            const value = filters[item.field] ?? String(item.defaultValue ?? '');
            const options = item.options ?? [];
            return (
              <div key={item.id} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <select
                  value={value}
                  onChange={(e) => onFilterChange(item.field!, e.target.value)}
                  style={{
                    padding: '7px 28px 7px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontWeight: 600,
                    appearance: 'none',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Show: All</option>
                  {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span style={{ position: 'absolute', right: 10, pointerEvents: 'none', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}>
                  ▾
                </span>
              </div>
            );
          }

          case 'columns':
            return (
              <div key={item.id} style={{ position: 'relative' }}>
                <button
                  onClick={() => setColumnsOpen((v) => !v)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer' }}
                >
                  <SlidersHorizontal size={14} /> Columns
                </button>
                {columnsOpen && columns && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '110%',
                      left: 0,
                      zIndex: 20,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      boxShadow: 'var(--shadow-md)',
                      padding: 8,
                      minWidth: 180,
                    }}
                  >
                    {columns.map((col) => (
                      <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={col.visible} onChange={() => onToggleColumn?.(col.key)} />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );

          default:
            // Unknown/unhandled toolbar types fail safely by rendering nothing.
            return null;
        }
      })}
    </div>
  );
}
