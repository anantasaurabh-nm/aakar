'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  LayoutGrid,
  List,
  RefreshCw,
  Filter,
  Check,
  FileSpreadsheet,
  FileText,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Menu,
} from 'lucide-react';
import type { ColumnFilter, FilterOperator, SDUIAction, TableColumn, TableSectionSchema } from '@erp/shared-contracts';
import type { z } from 'zod';
import { fetchDataSource } from '@/lib/data-source-registry';
import { fetchFormSection } from '@/lib/form-registry';
import { getSubmitTarget } from '@/lib/action-registry';
import { exportToCsv, exportToXlsx } from '@/lib/table-export';
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

const OPERATOR_SYMBOLS: Record<FilterOperator, string> = {
  contains: '⊆',
  not_contains: '⊄',
  eq: '=',
  neq: '≠',
  starts_with: '⇥',
  ends_with: '⇤',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
};

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: 'Contains',
  not_contains: 'Does not contain',
  eq: 'Equals',
  neq: 'Not equals',
  starts_with: 'Starts with',
  ends_with: 'Ends with',
  gt: 'Greater than',
  lt: 'Less than',
  gte: 'Greater or equal',
  lte: 'Less or equal',
};

const OPERATORS_BY_TYPE: Record<string, FilterOperator[]> = {
  text: ['contains', 'not_contains', 'eq', 'neq', 'starts_with', 'ends_with'],
  link: ['contains', 'not_contains', 'eq', 'neq', 'starts_with', 'ends_with'],
  avatar: ['contains', 'not_contains', 'eq', 'neq', 'starts_with', 'ends_with'],
  tags: ['contains', 'not_contains', 'eq', 'neq'],
  number: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte'],
  date: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte'],
  datetime: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte'],
  boolean: ['eq', 'neq'],
  badge: ['contains', 'eq', 'neq'],
};

function ColumnsSplitIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  );
}

/** Direct column header menu popover matching screenshot with operator dropdown, direct search, and sort buttons */
function ColumnHeaderMenu({
  column,
  currentFilter,
  onFilterChange,
  currentSort,
  onSort,
}: {
  column: TableColumn;
  currentFilter?: ColumnFilter;
  onFilterChange: (filter?: ColumnFilter) => void;
  currentSort?: 'asc' | 'desc';
  onSort: (dir: 'asc' | 'desc') => void;
}) {
  const [open, setOpen] = useState(false);
  const operators = OPERATORS_BY_TYPE[column.type] ?? ['contains', 'not_contains', 'eq', 'neq'];
  const [operator, setOperator] = useState<FilterOperator>(currentFilter?.operator ?? operators[0] ?? 'contains');
  const [filterValue, setFilterValue] = useState(currentFilter?.value !== undefined ? String(currentFilter.value) : '');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentFilter) {
      setOperator(currentFilter.operator);
      setFilterValue(String(currentFilter.value));
    } else {
      setFilterValue('');
    }
  }, [currentFilter]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (open && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const hasActiveFilter = Boolean(currentFilter && String(currentFilter.value).trim().length > 0);

  function handleInputChange(val: string) {
    setFilterValue(val);
    if (val.trim().length > 0) {
      onFilterChange({ field: column.key, operator, value: val });
    } else {
      onFilterChange(undefined);
    }
  }

  function handleOperatorChange(op: FilterOperator) {
    setOperator(op);
    if (filterValue.trim().length > 0) {
      onFilterChange({ field: column.key, operator: op, value: filterValue });
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} ref={menuRef} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          border: 'none',
          background: hasActiveFilter || open ? 'var(--badge-primary-bg)' : 'transparent',
          color: hasActiveFilter || open ? 'var(--accent-indigo)' : 'var(--text-tertiary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 3,
          borderRadius: 4,
          cursor: 'pointer',
        }}
        title={`Filter and sort ${column.label}`}
      >
        <Menu size={13} />
        {hasActiveFilter && (
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-indigo)', position: 'absolute', top: 1, right: 1 }} />
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 60,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.14), 0 4px 12px rgba(15, 23, 42, 0.08)',
            padding: 16,
            minWidth: 260,
            cursor: 'default',
          }}
        >
          {/* Operator dropdown */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <select
              value={operator}
              onChange={(e) => handleOperatorChange(e.target.value as FilterOperator)}
              style={{
                width: '100%',
                padding: '9px 28px 9px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontSize: 13.5,
                fontWeight: 700,
                appearance: 'none',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {operators.map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_SYMBOLS[op]} {OPERATOR_LABELS[op]}
                </option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-tertiary)' }} />
          </div>

          {/* Filter search input */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
            <input
              value={filterValue}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={`Filter ${column.label}...`}
              autoFocus
              style={{
                width: '100%',
                padding: '9px 12px 9px 34px',
                borderRadius: 10,
                border: '2px solid var(--accent-indigo)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '10px 0' }} />

          {/* Sort Ascending */}
          <button
            onClick={() => {
              onSort('asc');
              setOpen(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 6px',
              border: 'none',
              background: currentSort === 'asc' ? 'var(--badge-primary-bg)' : 'transparent',
              color: 'var(--accent-indigo)',
              fontWeight: 700,
              fontSize: 13.5,
              borderRadius: 8,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <ArrowUp size={15} strokeWidth={2.5} />
            <span>Sort Ascending</span>
          </button>

          {/* Sort Descending */}
          <button
            onClick={() => {
              onSort('desc');
              setOpen(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 6px',
              border: 'none',
              background: currentSort === 'desc' ? 'var(--badge-primary-bg)' : 'transparent',
              color: 'var(--accent-indigo)',
              fontWeight: 700,
              fontSize: 13.5,
              borderRadius: 8,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <ArrowDown size={15} strokeWidth={2.5} />
            <span>Sort Descending</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function DataTable({ section }: { section: TableSection }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const isDetailView = Boolean(section.config.detailView);
  const [moduleId, entityKey]: [string | undefined, string | undefined] =
    isDetailView && section.data?.source ? (section.data.source.split('.') as [string, string]) : [undefined, undefined];

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(section.config.pageSize || 10);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [formState, setFormState] = useState<{ open: boolean; section?: Record<string, unknown> }>({ open: false });

  const [viewState, setViewState] = useState<{ mode: 'list' } | { mode: 'record'; recordId?: string }>({ mode: 'list' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const [view, setView] = useState<'table' | 'card'>('table');

  // Popover menus
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);

  const viewMenuRef = useRef<HTMLDivElement>(null);
  const columnsMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (viewMenuOpen && viewMenuRef.current && !viewMenuRef.current.contains(target)) {
        setViewMenuOpen(false);
      }
      if (columnsMenuOpen && columnsMenuRef.current && !columnsMenuRef.current.contains(target)) {
        setColumnsMenuOpen(false);
      }
      if (filterMenuOpen && filterMenuRef.current && !filterMenuRef.current.contains(target)) {
        setFilterMenuOpen(false);
      }
      if (downloadMenuOpen && downloadMenuRef.current && !downloadMenuRef.current.contains(target)) {
        setDownloadMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [viewMenuOpen, columnsMenuOpen, filterMenuOpen, downloadMenuOpen]);

  function closeAllPopovers() {
    setViewMenuOpen(false);
    setColumnsMenuOpen(false);
    setFilterMenuOpen(false);
    setDownloadMenuOpen(false);
  }

  const hasDataSource = Boolean(section.data?.source);
  const sortState = sorting[0];
  const queryParams = {
    ...filters,
    search: search || undefined,
    page,
    pageSize,
    ...(sortState ? { sortBy: sortState.id, sortDir: sortState.desc ? 'desc' : 'asc' } : {}),
    ...(columnFilters.length > 0 ? { filters: JSON.stringify(columnFilters) } : {}),
  };
  const queryKey = ['ds', section.data?.source, queryParams];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await fetchDataSource(section.data!.source, { ...section.data?.params, ...queryParams });
      if (Array.isArray(result)) {
        return { items: result, page: 1, pageSize: result.length, total: result.length } satisfies Paginated;
      }
      return result as Paginated;
    },
    enabled: hasDataSource,
    placeholderData: (previousData) => previousData,
  });

  const rows: Record<string, unknown>[] = hasDataSource
    ? (data?.items ?? [])
    : ((section.state?.rows as Record<string, unknown>[] | undefined) ?? []);
  const total = hasDataSource ? (data?.total ?? 0) : rows.length;

  const visibleColumns = section.config.columns.filter((c) => !hiddenColumns.has(c.key));

  const columnHelper = createColumnHelper<Record<string, unknown>>();
  const columns = useMemo(
    () =>
      visibleColumns.map((col) =>
        columnHelper.accessor((row) => row[col.key], {
          id: col.key,
          header: col.label,
          enableSorting: col.sortable !== false,
          cell: (ctx) => <Cell type={col.type} value={ctx.getValue()} row={ctx.row.original} />,
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
    getSortedRowModel: getSortedRowModel(),
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
        if (isDetailView) return;
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
        return;
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

  function toggleColumn(key: string) {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
        // Continue on failure
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Declarative section toolbar items
  const createActionItem = (section.toolbar ?? []).find((item) => item.action?.type === 'create');
  const otherActionItems = (section.toolbar ?? []).filter(
    (item) => item.type === 'action' && item.action?.type !== 'create' && item.id !== 'refresh',
  );
  const filterItems = (section.toolbar ?? []).filter((item) => item.type === 'filter');

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Single Unified Top Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        {/* Left Side: New button, Status Dropdown, other actions, and Search */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {/* New Action Button */}
          {createActionItem && (
            <button
              onClick={() => createActionItem.action && handleAction(createActionItem.action)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent-indigo-dark)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {createActionItem.label ?? 'New'}
            </button>
          )}

          {/* Status / Filter Dropdown (Show: All as default) */}
          {filterItems.map((item) => {
            if (!item.field) return null;
            const value = filters[item.field] ?? String(item.defaultValue ?? '');
            const options = item.options ?? [];
            return (
              <div key={item.id} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <select
                  value={value}
                  onChange={(e) => {
                    setFilters((prev) => ({ ...prev, [item.field!]: e.target.value }));
                    setPage(1);
                  }}
                  style={{
                    padding: '8px 28px 8px 12px',
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
                <ChevronDown size={14} style={{ position: 'absolute', right: 9, pointerEvents: 'none', color: 'var(--text-tertiary)' }} />
              </div>
            );
          })}

          {/* Other custom section actions (if any) */}
          {otherActionItems.map((item) => (
            <button
              key={item.id}
              onClick={() => item.action && handleAction(item.action)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {item.label ?? item.id}
            </button>
          ))}

          {/* Search: Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Search:</span>
            <div style={{ position: 'relative', width: 200 }}>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter table..."
                style={{
                  width: '100%',
                  padding: '7px 32px 7px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>
        </div>

        {/* Center: Pagination Pill */}
        {hasDataSource && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '5px 14px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              fontSize: 13,
            }}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontWeight: 700,
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  paddingRight: 16,
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <ChevronDown size={12} style={{ position: 'absolute', right: 2, pointerEvents: 'none', color: 'var(--text-tertiary)' }} />
            </div>

            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              {total === 0 ? '0' : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)}`} of {total}
            </span>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                }}
                disabled={page <= 1}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: page <= 1 ? 'default' : 'pointer',
                  color: page <= 1 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 2,
                }}
                title="Previous page"
              >
                <ChevronLeft size={15} />
              </button>

              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {page}/{totalPages}
              </span>

              <button
                onClick={() => {
                  setPage((p) => Math.min(totalPages, p + 1));
                }}
                disabled={page >= totalPages}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: page >= totalPages ? 'default' : 'pointer',
                  color: page >= totalPages ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 2,
                }}
                title="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Right Side: Grouped Tool Buttons (View, Columns, Filter, Export, Refresh) */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            padding: 3,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          {/* 1. View Mode Button & Popover (Screenshot 3) */}
          <div style={{ position: 'relative' }} ref={viewMenuRef}>
            <button
              onClick={() => {
                const next = !viewMenuOpen;
                closeAllPopovers();
                setViewMenuOpen(next);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 9px',
                borderRadius: 8,
                border: 'none',
                background: viewMenuOpen || view === 'table' ? 'var(--badge-primary-bg)' : 'transparent',
                color: viewMenuOpen || view === 'table' ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              title="Switch View"
            >
              {view === 'table' ? <List size={16} /> : <LayoutGrid size={16} />}
            </button>

            {viewMenuOpen && (
              <div style={dropdownMenuStyle}>
                <button
                  onClick={() => {
                    setView('card');
                    setViewMenuOpen(false);
                  }}
                  style={{ ...dropdownMenuItemStyle, color: 'var(--text-primary)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <LayoutGrid size={16} />
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>View cards</span>
                  </div>
                  {view === 'card' && <Check size={16} style={{ color: 'var(--accent-indigo)' }} />}
                </button>
                <button
                  onClick={() => {
                    setView('table');
                    setViewMenuOpen(false);
                  }}
                  style={{ ...dropdownMenuItemStyle, color: 'var(--text-primary)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <List size={16} />
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>View table</span>
                  </div>
                  {view === 'table' && <Check size={16} style={{ color: 'var(--accent-indigo)' }} />}
                </button>
              </div>
            )}
          </div>

          {/* 2. Visible Columns Button & Popover (Screenshot 4) */}
          <div style={{ position: 'relative' }} ref={columnsMenuRef}>
            <button
              onClick={() => {
                const next = !columnsMenuOpen;
                closeAllPopovers();
                setColumnsMenuOpen(next);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 9px',
                borderRadius: 8,
                border: 'none',
                background: columnsMenuOpen ? 'var(--surface)' : 'transparent',
                color: columnsMenuOpen ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              title="Visible Columns"
            >
              <ColumnsSplitIcon size={16} />
            </button>

            {columnsMenuOpen && (
              <div style={{ ...dropdownMenuStyle, minWidth: 220, maxHeight: 380, overflowY: 'auto', padding: '14px 16px' }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  VISIBLE COLUMNS
                </div>
                <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 10 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {section.config.columns.map((col) => {
                    const isVisible = !hiddenColumns.has(col.key);
                    return (
                      <div
                        key={col.key}
                        onClick={() => toggleColumn(col.key)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '5px 4px',
                          cursor: 'pointer',
                          userSelect: 'none',
                          borderRadius: 6,
                        }}
                      >
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            border: isVisible ? 'none' : '1.5px solid var(--border)',
                            background: isVisible ? 'var(--accent-indigo)' : 'var(--surface)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            flexShrink: 0,
                          }}
                        >
                          {isVisible && <Check size={13} strokeWidth={3} />}
                        </div>
                        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)' }}>{col.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 3. Column Filter Button & Popover (Screenshot 5) */}
          <div style={{ position: 'relative' }} ref={filterMenuRef}>
            <button
              onClick={() => {
                const next = !filterMenuOpen;
                closeAllPopovers();
                setFilterMenuOpen(next);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 9px',
                borderRadius: 8,
                border: 'none',
                background: filterMenuOpen || columnFilters.length > 0 ? 'var(--badge-primary-bg)' : 'transparent',
                color: filterMenuOpen || columnFilters.length > 0 ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                cursor: 'pointer',
                position: 'relative',
              }}
              title="Column Filter"
            >
              <Filter size={16} />
              {columnFilters.length > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -3,
                    background: 'var(--accent-indigo)',
                    color: '#fff',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 4px',
                    lineHeight: '12px',
                  }}
                >
                  {columnFilters.length}
                </span>
              )}
            </button>

            <ColumnFilterPanel
              columns={section.config.columns}
              value={columnFilters}
              onChange={(f) => {
                setColumnFilters(f);
                setPage(1);
              }}
              isOpen={filterMenuOpen}
              onToggle={(open) => setFilterMenuOpen(open)}
            />
          </div>

          {/* 4. Download / Export Button & Popover */}
          <div style={{ position: 'relative' }} ref={downloadMenuRef}>
            <button
              onClick={() => {
                const next = !downloadMenuOpen;
                closeAllPopovers();
                setDownloadMenuOpen(next);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 9px',
                borderRadius: 8,
                border: 'none',
                background: downloadMenuOpen ? 'var(--surface)' : 'transparent',
                color: downloadMenuOpen ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              title="Download / Export"
            >
              <Download size={16} />
            </button>

            {downloadMenuOpen && (
              <div style={dropdownMenuStyle}>
                <button
                  onClick={() => {
                    exportRows('csv');
                    setDownloadMenuOpen(false);
                  }}
                  style={{ ...dropdownMenuItemStyle, color: 'var(--text-primary)' }}
                >
                  <FileText size={16} style={{ color: 'var(--text-secondary)' }} />
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>Download as CSV</span>
                </button>
                <button
                  onClick={() => {
                    exportRows('xlsx');
                    setDownloadMenuOpen(false);
                  }}
                  style={{ ...dropdownMenuItemStyle, color: 'var(--text-primary)' }}
                >
                  <FileSpreadsheet size={16} style={{ color: 'var(--accent-emerald)' }} />
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>Download as XLS</span>
                </button>
              </div>
            )}
          </div>

          {/* 5. Refresh Button */}
          <button
            onClick={invalidateSource}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 9px',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Main Table Surface */}
      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          {/* Bulk Selection Bar if records are selected */}
          {selectedIds.size > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 16px',
                background: 'var(--badge-primary-bg)',
                borderBottom: '1px solid var(--badge-primary-border)',
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--accent-indigo)' }}>{selectedIds.size} record(s) selected</span>
              <button
                onClick={bulkDelete}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--accent-red)',
                  background: 'var(--surface)',
                  color: 'var(--accent-red)',
                  fontWeight: 600,
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
              >
                Delete Selected
              </button>
            </div>
          )}

          {/* Table Content Area */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {hasDataSource && isLoading && !data && <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading…</div>}
            {hasDataSource && isError && <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Couldn&apos;t load this table right now.</div>}
            {(!hasDataSource || (!isLoading && !isError) || data) && rows.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>No records found.</div>
            )}

            {/* Card View Layout */}
            {(!hasDataSource || (!isLoading && !isError) || data) && rows.length > 0 && view === 'card' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, padding: 16 }}>
                {rows.map((row) => (
                  <div
                    key={String(row.id)}
                    onClick={isDetailView ? () => setViewState({ mode: 'record', recordId: String(row.id) }) : undefined}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 16,
                      cursor: isDetailView ? 'pointer' : 'default',
                      background: 'var(--surface)',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    }}
                  >
                    {visibleColumns.map((col) => (
                      <div key={col.key} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {col.label}
                        </div>
                        <div style={{ fontSize: 13.5, marginTop: 2 }}>
                          <Cell type={col.type} value={row[col.key]} row={row} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Table View Layout (matching Screenshot with direct column menu) */}
            {(!hasDataSource || (!isLoading && !isError) || data) && rows.length > 0 && view === 'table' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {isDetailView && (
                        <th style={{ width: 36, padding: '12px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <input
                              type="checkbox"
                              checked={rows.length > 0 && selectedIds.size === rows.length}
                              onChange={toggleSelectAll}
                              style={{ cursor: 'pointer' }}
                            />
                          </div>
                        </th>
                      )}
                      {hg.headers.map((header) => {
                        const colDef = visibleColumns.find((c) => c.key === header.id);
                        const canSort = header.column.getCanSort();
                        const isSorted = header.column.getIsSorted();
                        const currentFilter = columnFilters.find((cf) => cf.field === header.id);

                        return (
                          <th
                            key={header.id}
                            style={{
                              textAlign: 'left',
                              padding: '12px 14px',
                              borderBottom: '1px solid var(--border)',
                              color: 'var(--text-primary)',
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              whiteSpace: 'nowrap',
                              userSelect: 'none',
                            }}
                          >
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              {/* Direct Column Header Filter & Sort Popover */}
                              {colDef && (
                                <ColumnHeaderMenu
                                  column={colDef}
                                  currentFilter={currentFilter}
                                  onFilterChange={(newFilter) => {
                                    setColumnFilters((prev) => {
                                      const rest = prev.filter((cf) => cf.field !== header.id);
                                      return newFilter ? [...rest, newFilter] : rest;
                                    });
                                    setPage(1);
                                  }}
                                  currentSort={isSorted || undefined}
                                  onSort={(dir) => {
                                    setSorting([{ id: header.id, desc: dir === 'desc' }]);
                                    setPage(1);
                                  }}
                                />
                              )}

                              {/* Clickable Column Label */}
                              <span
                                onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                                style={{ cursor: canSort ? 'pointer' : 'default' }}
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                              </span>

                              {/* Direct Column Sort Icon */}
                              {canSort && (
                                <span
                                  onClick={header.column.getToggleSortingHandler()}
                                  style={{
                                    color: isSorted ? 'var(--accent-indigo)' : 'var(--text-tertiary)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isSorted === 'asc' ? (
                                    <ArrowUp size={13} strokeWidth={2.5} />
                                  ) : isSorted === 'desc' ? (
                                    <ArrowDown size={13} strokeWidth={2.5} />
                                  ) : (
                                    <ChevronsUpDown size={13} />
                                  )}
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                      {!isDetailView && (section.config.rowActions?.length ?? 0) > 0 && (
                        <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }} />
                      )}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={isDetailView ? () => setViewState({ mode: 'record', recordId: String(row.original.id) }) : undefined}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        cursor: isDetailView ? 'pointer' : 'default',
                        transition: 'background-color 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--surface-2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {isDetailView && (
                        <td style={{ padding: '12px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(String(row.original.id))}
                            onChange={() => toggleSelectRow(String(row.original.id))}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                      )}
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} style={{ padding: '12px 14px', color: 'var(--text-primary)' }}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                      {!isDetailView && (section.config.rowActions?.length ?? 0) > 0 && (
                        <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {section.config.rowActions!.map((rowAction) => (
                            <button
                              key={rowAction.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAction(rowAction.action as SDUIAction, row.original);
                              }}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--accent-indigo)',
                                fontWeight: 600,
                                fontSize: 12.5,
                                cursor: 'pointer',
                                marginLeft: 10,
                              }}
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
        </div>
      </div>

      {/* Modal for legacy core admin forms */}
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

const dropdownMenuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  right: 0,
  zIndex: 50,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
  padding: 6,
  minWidth: 170,
};

const dropdownMenuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
};

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

function Cell({ type, value, row: _row }: { type: string; value: unknown; row?: Record<string, unknown> }) {
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
