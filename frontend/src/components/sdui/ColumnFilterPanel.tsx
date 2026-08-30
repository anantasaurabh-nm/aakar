'use client';

import { useState } from 'react';
import { Filter, X } from 'lucide-react';
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
  return filters.map((f, i) => ({ ...f, key: `${f.field}-${i}-${Math.random().toString(36).slice(2, 7)}` }));
}

/** Dynamic per-column-type filter builder (finetune-1 §2.3), matching the reference screenshots' popover. */
export function ColumnFilterPanel({
  columns,
  value,
  onChange,
}: {
  columns: TableColumn[];
  value: ColumnFilter[];
  onChange: (filters: ColumnFilter[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftFilter[]>(() => toDraft(value));

  function openPanel() {
    setDraft(toDraft(value));
    setOpen(true);
  }

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
    setDraft((prev) => prev.filter((row) => row.key !== key));
  }

  function apply() {
    onChange(draft.filter((row) => String(row.value).length > 0).map(({ key: _key, ...rest }) => rest));
    setOpen(false);
  }

  function clear() {
    setDraft([]);
    onChange([]);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => (open ? setOpen(false) : openPanel())} style={iconButtonStyle} title="Filters">
        <Filter size={15} />
        {value.length > 0 && <span style={countBadgeStyle}>{value.length}</span>}
      </button>
      {open && (
        <div style={panelStyle}>
          {draft.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px' }}>No filters yet.</p>}
          {draft.map((row) => {
            const column = columns.find((c) => c.key === row.field) ?? columns[0];
            const operators = column ? OPERATORS_BY_TYPE[column.type] : [];
            return (
              <div key={row.key} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
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
                <select value={row.operator} onChange={(e) => updateRow(row.key, { operator: e.target.value as FilterOperator })} style={selectStyle}>
                  {operators.map((op) => (
                    <option key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </option>
                  ))}
                </select>
                {column?.type === 'boolean' ? (
                  <select value={String(row.value)} onChange={(e) => updateRow(row.key, { value: e.target.value })} style={selectStyle}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <input
                    value={String(row.value)}
                    onChange={(e) => updateRow(row.key, { value: e.target.value })}
                    placeholder="Filter value…"
                    style={inputStyle}
                  />
                )}
                <button onClick={() => removeRow(row.key)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                  <X size={14} />
                </button>
              </div>
            );
          })}
          <button onClick={addRow} style={linkButtonStyle}>
            + Add a Filter
          </button>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button onClick={clear} style={secondaryButtonStyle}>
              Clear Filters
            </button>
            <button onClick={apply} style={primaryButtonStyle}>
              Apply Filters
            </button>
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
  gap: 6,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
};

const countBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -6,
  background: 'var(--accent-indigo)',
  color: '#fff',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
  padding: '1px 5px',
};

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: '110%',
  right: 0,
  zIndex: 30,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  boxShadow: 'var(--shadow-md)',
  padding: 14,
  minWidth: 420,
};

const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  fontSize: 12.5,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  fontSize: 12.5,
};

const linkButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--accent-indigo)',
  fontWeight: 600,
  fontSize: 12.5,
  cursor: 'pointer',
  padding: 0,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  fontWeight: 600,
  fontSize: 12.5,
  cursor: 'pointer',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--accent-indigo-dark)',
  color: '#fff',
  fontWeight: 600,
  fontSize: 12.5,
  cursor: 'pointer',
};
