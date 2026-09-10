'use client';

import { useState, useEffect, useRef } from 'react';
import { Filter, X, Plus, ChevronDown } from 'lucide-react';
import type { ColumnFilter, ColumnType, FilterOperator, TableColumn } from '@erp/shared-contracts';

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: 'Contains',
  not_contains: 'Does not contain',
  eq: '=',
  neq: '!=',
  starts_with: 'Starts with',
  ends_with: 'Ends with',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
};

const OPERATORS_BY_TYPE: Record<ColumnType, FilterOperator[]> = {
  text: ['contains', 'not_contains', 'eq', 'neq', 'starts_with', 'ends_with'],
  link: ['contains', 'not_contains', 'eq', 'neq', 'starts_with', 'ends_with'],
  avatar: ['contains', 'not_contains', 'eq', 'neq', 'starts_with', 'ends_with'],
  tags: ['contains', 'not_contains'],
  number: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte'],
  date: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte'],
  datetime: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte'],
  boolean: ['eq', 'neq'],
  badge: ['eq', 'neq'],
};

interface DraftFilter extends ColumnFilter {
  key: string;
}

function toDraft(filters: ColumnFilter[]): DraftFilter[] {
  if (filters.length === 0) return [];
  return filters.map((f, i) => ({ ...f, key: `${f.field}-${i}-${Math.random().toString(36).slice(2, 7)}` }));
}

/** Dynamic per-column-type filter builder (finetune-1 §2.3), matching reference screenshot 5. */
export function ColumnFilterPanel({
  columns,
  value,
  onChange,
  isOpen,
  onToggle,
}: {
  columns: TableColumn[];
  value: ColumnFilter[];
  onChange: (filters: ColumnFilter[]) => void;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isOpen !== undefined ? isOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (onToggle) onToggle(v);
    else setInternalOpen(v);
  };

  const [draft, setDraft] = useState<DraftFilter[]>(() => {
    if (value.length > 0) return toDraft(value);
    const first = columns[0];
    if (!first) return [];
    return [{ key: 'init', field: first.key, operator: OPERATORS_BY_TYPE[first.type][0] ?? 'contains', value: '' }];
  });

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      if (value.length > 0) {
        setDraft(toDraft(value));
      } else {
        const first = columns[0];
        if (first) {
          setDraft([{ key: `new-${Date.now()}`, field: first.key, operator: OPERATORS_BY_TYPE[first.type][0] ?? 'contains', value: '' }]);
        }
      }
    }
  }, [open, value, columns]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (open && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function addRow() {
    const first = columns[0];
    if (!first) return;
    const operator = OPERATORS_BY_TYPE[first.type][0] ?? 'contains';
    setDraft((prev) => [...prev, { key: `new-${Math.random().toString(36).slice(2, 7)}`, field: first.key, operator, value: '' }]);
  }

  function updateRow(key: string, patch: Partial<DraftFilter>) {
    setDraft((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setDraft((prev) => {
      const filtered = prev.filter((row) => row.key !== key);
      if (filtered.length === 0) {
        const first = columns[0];
        if (first) {
          return [{ key: `new-${Date.now()}`, field: first.key, operator: OPERATORS_BY_TYPE[first.type][0] ?? 'contains', value: '' }];
        }
      }
      return filtered;
    });
  }

  function apply() {
    onChange(draft.filter((row) => String(row.value).trim().length > 0).map(({ key: _key, ...rest }) => rest));
    setOpen(false);
  }

  function clear() {
    const first = columns[0];
    setDraft(first ? [{ key: `new-${Date.now()}`, field: first.key, operator: OPERATORS_BY_TYPE[first.type][0] ?? 'contains', value: '' }] : []);
    onChange([]);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      {isOpen === undefined && (
        <button
          onClick={() => setOpen(!open)}
          style={{
            ...iconButtonStyle,
            background: value.length > 0 || open ? 'var(--badge-primary-bg)' : 'var(--surface)',
            color: value.length > 0 || open ? 'var(--accent-indigo)' : 'var(--text-secondary)',
          }}
          title="Filters"
        >
          <Filter size={16} />
          {value.length > 0 && <span style={countBadgeStyle}>{value.length}</span>}
        </button>
      )}

      {open && (
        <div style={panelStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {draft.map((row) => {
              const column = columns.find((c) => c.key === row.field) ?? columns[0];
              const operators = column ? OPERATORS_BY_TYPE[column.type] : [];
              return (
                <div key={row.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: 140 }}>
                    <select
                      value={row.field}
                      onChange={(e) => {
                        const col = columns.find((c) => c.key === e.target.value);
                        updateRow(row.key, { field: e.target.value, operator: (col ? OPERATORS_BY_TYPE[col.type][0] : undefined) ?? row.operator });
                      }}
                      style={selectStyle}
                    >
                      {columns.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-tertiary)' }} />
                  </div>

                  <div style={{ position: 'relative', width: 130 }}>
                    <select
                      value={row.operator}
                      onChange={(e) => updateRow(row.key, { operator: e.target.value as FilterOperator })}
                      style={selectStyle}
                    >
                      {operators.map((op) => (
                        <option key={op} value={op}>
                          {OPERATOR_LABELS[op]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-tertiary)' }} />
                  </div>

                  {column?.type === 'boolean' ? (
                    <div style={{ position: 'relative', flex: 1 }}>
                      <select value={String(row.value)} onChange={(e) => updateRow(row.key, { value: e.target.value })} style={selectStyle}>
                        <option value="">Select...</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                      <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-tertiary)' }} />
                    </div>
                  ) : (
                    <input
                      value={String(row.value)}
                      onChange={(e) => updateRow(row.key, { value: e.target.value })}
                      placeholder="Filter value..."
                      style={inputStyle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') apply();
                      }}
                    />
                  )}

                  <button
                    onClick={() => removeRow(row.key)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--text-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 4,
                      borderRadius: 4,
                    }}
                    title="Remove filter"
                  >
                    <X size={15} />
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <button onClick={addRow} style={linkButtonStyle}>
              <Plus size={14} /> Add a Filter
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={clear} style={secondaryButtonStyle}>
                Clear Filters
              </button>
              <button onClick={apply} style={primaryButtonStyle}>
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconButtonStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px 9px',
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
};

const countBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -4,
  right: -4,
  background: 'var(--accent-indigo)',
  color: '#fff',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
  padding: '1px 5px',
  lineHeight: '12px',
};

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  right: 0,
  zIndex: 100,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.14), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
  padding: 16,
  minWidth: 440,
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 26px 7px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontWeight: 500,
  outline: 'none',
  appearance: 'none',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
};

const linkButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  padding: 0,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--accent-indigo-dark)',
  color: '#fff',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

