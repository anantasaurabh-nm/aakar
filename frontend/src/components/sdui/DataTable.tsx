'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Download, LayoutGrid, List, RefreshCw } from 'lucide-react';
import type { ColumnFilter, SDUIAction, TableSectionSchema } from '@erp/shared-contracts';
import type { z } from 'zod';
import { fetchDataSource } from '@/lib/data-source-registry';
import { fetchFormSection } from '@/lib/form-registry';
import { getSubmitTarget } from '@/lib/action-registry';
import { exportToCsv, exportToXlsx } from '@/lib/table-export';
import { Toolbar, type ToolbarColumn } from './Toolbar';
import { ColumnFilterPanel } from './ColumnFilterPanel';
import { RecordView } from './RecordView';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { DynamicForm } from './DynamicForm';
import { useUiStore } from '@/lib/ui-store';

type TableSection = z.infer<typeof TableSectionSchema>;

interface Paginated {
  items: Record<string, unknown>[];
  page: number;
  pageSize: number;
  total: number;
}

export function DataTable({ section }: { section: TableSection }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  // `detailView` sections are guaranteed by the schema-driven entity engine's
  // getPage() to have data.source === "${module}.${entityKey}" — never true
  // for the bespoke Core admin tables (Users/AI Configuration/Module
  // Management), which keep the legacy rowActions/Modal path below untouched.
  const isDetailView = Boolean(section.config.detailView);
  const [moduleId, entityKey]: [string | undefined, string | undefined] =
    isDetailView && section.data?.source ? (section.data.source.split('.') as [string, string]) : [undefined, undefined];

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [formState, setFormState] = useState<{ open: boolean; section?: Record<string, unknown> }>({ open: false });

  const [viewState, setViewState] = useState<{ mode: 'list' } | { mode: 'record'; recordId?: string }>({ mode: 'list' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const [view, setView] = useState<'table' | 'card'>('table');

  const hasDataSource = Boolean(section.data?.source);
  const sortState = sorting[0];
  const queryParams = {
    ...filters,
    search: search || undefined,
    page,
    pageSize: section.config.pageSize,
    ...(isDetailView && sortState ? { sortBy: sortState.id, sortDir: sortState.desc ? 'desc' : 'asc' } : {}),
    ...(isDetailView && columnFilters.length > 0 ? { filters: JSON.stringify(columnFilters) } : {}),
  };
  const queryKey = ['ds', section.data?.source, queryParams];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await fetchDataSource(section.data!.source, { ...section.data?.params, ...queryParams });
      // Some data sources (e.g. discovery endpoints) return a plain array
      // rather than the {items,page,pageSize,total} envelope — normalize.
      if (Array.isArray(result)) {
        return { items: result, page: 1, pageSize: result.length, total: result.length } satisfies Paginated;
      }
      return result as Paginated;
    },
    enabled: hasDataSource,
  });

  const rows: Record<string, unknown>[] = hasDataSource
    ? (data?.items ?? [])
    : ((section.state?.rows as Record<string, unknown>[] | undefined) ?? []);
  const total = hasDataSource ? (data?.total ?? 0) : rows.length;
  const pageSize = section.config.pageSize;

  const visibleColumns = section.config.columns.filter((c) => !hiddenColumns.has(c.key));

  const columnHelper = createColumnHelper<Record<string, unknown>>();
  const columns = useMemo(
    () =>
      visibleColumns.map((col) =>
        columnHelper.accessor((row) => row[col.key], {
          id: col.key,
          header: col.label,
          enableSorting: col.sortable,
          cell: (ctx) => <Cell type={col.type} value={ctx.getValue()} />,
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleColumns.map((c) => c.key).join(',')],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  function invalidateSource() {
    if (section.data?.source) queryClient.invalidateQueries({ queryKey: ['ds', section.data.source] });
  }

  async function openForm(target: string, row?: Record<string, unknown>) {
    const formSection = await fetchFormSection(target, row ? { id: row.id } : undefined);
    setFormState({ open: true, section: formSection as Record<string, unknown> });
  }

  async function handleAction(action: SDUIAction, row?: Record<string, unknown>) {
    switch (action.type) {
      case 'refresh':
        invalidateSource();
        return;
      case 'create':
        if (isDetailView) {
          setViewState({ mode: 'record' });
          return;
        }
        if (action.target) await openForm(action.target);
        return;
      case 'edit':
        if (isDetailView) return; // detailView tables have no rowActions — unreachable
        if (action.target && row) await openForm(action.target, row);
        return;
      case 'delete': {
        if (!action.target || !row) return;
        const confirmed = window.confirm(action.confirm?.message ?? 'Are you sure?');
        if (!confirmed) return;
        try {
          const submitTarget = getSubmitTarget(action.target);
          await submitTarget.execute({ id: row.id });
          pushToast('Deleted successfully.');
          for (const source of submitTarget.invalidates) queryClient.invalidateQueries({ queryKey: ['ds', source] });
        } catch (err) {
          pushToast(err instanceof Error ? err.message : 'Failed to delete', 'error');
        }
        return;
      }
      case 'submit': {
        if (!action.target) return;
        if (action.confirm && !window.confirm(action.confirm.message)) return;
        try {
          const submitTarget = getSubmitTarget(action.target);
          const result = await submitTarget.execute(row ? { id: row.id } : {});
          pushToast(summarizeSubmitResult(result) ?? 'Updated successfully.');
          for (const source of submitTarget.invalidates) queryClient.invalidateQueries({ queryKey: ['ds', source] });
        } catch (err) {
          pushToast(err instanceof Error ? err.message : 'Failed to update', 'error');
        }
        return;
      }
      default:
        return; // unsupported action types fail safely
    }
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => String(r.id)))));
  }

  function toggleSelectRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    if (!moduleId || !entityKey) return;
    if (!window.confirm(`Delete ${selectedIds.size} record(s)? This cannot be undone.`)) return;
    const target = getSubmitTarget(`${moduleId}.${entityKey}.delete`);
    let succeeded = 0;
    for (const id of selectedIds) {
      try {
        await target.execute({ id });
        succeeded++;
      } catch {
        // one failure (e.g. already deleted) must not abort the rest
      }
    }
    pushToast(`Deleted ${succeeded} of ${selectedIds.size} record(s).`, succeeded === selectedIds.size ? 'success' : 'error');
    setSelectedIds(new Set());
    for (const source of target.invalidates) queryClient.invalidateQueries({ queryKey: ['ds', source] });
  }

  async function exportRows(format: 'csv' | 'xlsx') {
    const filename = section.id ?? 'export';
    if (!hasDataSource) {
      if (format === 'csv') exportToCsv(visibleColumns, rows, filename);
      else await exportToXlsx(visibleColumns, rows, filename);
      return;
    }
    const result = await fetchDataSource(section.data!.source, { ...section.data?.params, ...queryParams, page: 1, pageSize: 10000 });
    const allRows = Array.isArray(result) ? result : ((result as Paginated).items ?? []);
    if (format === 'csv') exportToCsv(visibleColumns, allRows, filename);
    else await exportToXlsx(visibleColumns, allRows, filename);
  }

  const toolbarColumns: ToolbarColumn[] = section.config.columns.map((c) => ({
    key: c.key,
    label: c.label,
    visible: !hiddenColumns.has(c.key),
  }));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (isDetailView && viewState.mode === 'record' && moduleId && entityKey) {
    return (
      <RecordView
        module={moduleId}
        entity={entityKey}
        recordId={viewState.recordId}
        onClose={() => setViewState({ mode: 'list' })}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar
        items={section.toolbar}
        filters={filters}
        onFilterChange={(field, value) => {
          setFilters((prev) => ({ ...prev, [field]: value }));
          setPage(1);
        }}
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onAction={(action) => handleAction(action)}
        columns={toolbarColumns}
        onToggleColumn={(key) =>
          setHiddenColumns((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
      />

      {isDetailView && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'inline-flex', gap: 2, background: 'var(--surface-2)', borderRadius: 8, padding: 3 }}>
            <button onClick={() => setView('table')} title="Table view" style={viewToggleStyle(view === 'table')}>
              <List size={14} />
            </button>
            <button onClick={() => setView('card')} title="Card view" style={viewToggleStyle(view === 'card')}>
              <LayoutGrid size={14} />
            </button>
          </div>
          <ColumnFilterPanel columns={section.config.columns} value={columnFilters} onChange={(f) => { setColumnFilters(f); setPage(1); }} />
          <button onClick={() => exportRows('csv')} title="Export CSV" style={chromeButtonStyle}>
            <Download size={14} /> CSV
          </button>
          <button onClick={() => exportRows('xlsx')} title="Export XLSX" style={chromeButtonStyle}>
            <Download size={14} /> XLSX
          </button>
          <button onClick={invalidateSource} title="Refresh" style={chromeButtonStyle}>
            <RefreshCw size={14} />
          </button>
          {selectedIds.size > 0 && (
            <>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{selectedIds.size} selected</span>
              <button onClick={bulkDelete} style={{ ...chromeButtonStyle, color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}>
                Delete Selected
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {hasDataSource && isLoading && <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading…</div>}
        {hasDataSource && isError && <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Couldn't load this table right now.</div>}
        {(!hasDataSource || (!isLoading && !isError)) && rows.length === 0 && (
          <div style={{ padding: 24, color: 'var(--text-secondary)' }}>No records found.</div>
        )}
        {(!hasDataSource || (!isLoading && !isError)) && rows.length > 0 && isDetailView && view === 'card' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, padding: '16px 0' }}>
            {rows.map((row) => (
              <div
                key={String(row.id)}
                onClick={() => setViewState({ mode: 'record', recordId: String(row.id) })}
                style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, cursor: 'pointer', background: 'var(--surface)' }}
              >
                {visibleColumns.map((col) => (
                  <div key={col.key} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{col.label}</div>
                    <div style={{ fontSize: 13.5 }}>
                      <Cell type={col.type} value={row[col.key]} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {(!hasDataSource || (!isLoading && !isError)) && rows.length > 0 && (!isDetailView || view === 'table') && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {isDetailView && (
                    <th style={{ width: 32, padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && selectedIds.size === rows.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                  )}
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-tertiary)',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        cursor: header.column.getCanSort() ? 'pointer' : 'default',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && ' ▲'}
                      {header.column.getIsSorted() === 'desc' && ' ▼'}
                    </th>
                  ))}
                  {!isDetailView && (section.config.rowActions?.length ?? 0) > 0 && <th />}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={isDetailView ? () => setViewState({ mode: 'record', recordId: String(row.original.id) }) : undefined}
                  style={{ borderBottom: '1px solid var(--border-subtle)', cursor: isDetailView ? 'pointer' : 'default' }}
                >
                  {isDetailView && (
                    <td style={{ padding: '10px 4px' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(String(row.original.id))}
                        onChange={() => toggleSelectRow(String(row.original.id))}
                      />
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ padding: '10px 12px' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  {!isDetailView && (section.config.rowActions?.length ?? 0) > 0 && (
                    <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {section.config.rowActions!.map((rowAction) => (
                        <button
                          key={rowAction.id}
                          onClick={() => handleAction(rowAction.action as SDUIAction, row.original)}
                          style={{ border: 'none', background: 'transparent', color: 'var(--accent-indigo)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', marginLeft: 10 }}
                        >
                          {rowAction.label}
                        </button>
                      ))}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {hasDataSource && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: '10px 20px', borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
          <span>
            {total === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
          </span>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={pagerButtonStyle}>
            <ChevronLeft size={14} />
          </button>
          <span>
            {page}/{totalPages}
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={pagerButtonStyle}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {!isDetailView && formState.open && formState.section && (
        <Modal title={String(formState.section.label ?? 'Form')} onClose={() => setFormState({ open: false })}>
          <DynamicForm
            config={formState.section.config as never}
            onCancel={() => setFormState({ open: false })}
            onSuccess={(invalidates) => {
              setFormState({ open: false });
              for (const source of invalidates) queryClient.invalidateQueries({ queryKey: ['ds', source] });
            }}
          />
        </Modal>
      )}
    </div>
  );
}

const pagerButtonStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  borderRadius: 6,
  padding: 4,
  cursor: 'pointer',
  display: 'inline-flex',
};

const chromeButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
};

function viewToggleStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    background: active ? 'var(--accent-indigo)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
  };
}

function summarizeSubmitResult(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.discovered)) {
    return r.discovered.length > 0
      ? `Discovered ${r.discovered.length} module(s): ${r.discovered.join(', ')}`
      : 'No new modules found.';
  }
  if (r.restartRequired) return 'Installed — restart required to activate.';
  if (typeof r.status === 'string') return `Status: ${r.status}`;
  return null;
}

function Cell({ type, value }: { type: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;

  switch (type) {
    case 'badge':
      return <Badge>{String(value)}</Badge>;
    case 'boolean':
      return <Badge tone={value ? 'success' : 'neutral'}>{value ? 'Yes' : 'No'}</Badge>;
    case 'date':
      return <span>{String(value)}</span>;
    case 'datetime':
      return <span>{new Date(String(value)).toLocaleString()}</span>;
    case 'tags':
      return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(Array.isArray(value) ? value : [value]).map((v) => (
            <Badge key={String(v)} tone="neutral">
              {String(v)}
            </Badge>
          ))}
        </div>
      );
    default:
      return <span>{String(value)}</span>;
  }
}
