'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Pencil,
  Check,
  ChevronDown,
  Trash2,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Printer,
  FileDown,
} from 'lucide-react';
import type { FormConfig, TableSection } from '@erp/shared-contracts';
import dynamic from 'next/dynamic';
import { fetchFormSection } from '@/lib/form-registry';
import { getSubmitTarget } from '@/lib/action-registry';
import { lifecycleFor, TRANSITION_TARGET_SUFFIX, type RecordStatus } from '@/lib/record-lifecycle';
import { DynamicForm, FieldDisplay } from './DynamicForm';
import { RolePermissionMatrix, type PermissionModuleGroup } from './RolePermissionMatrix';
import { Badge } from '@/components/ui/Badge';
import { useUiStore } from '@/lib/ui-store';

const DataTable = dynamic(() => import('./DataTable').then((m) => m.DataTable), { ssr: false });

interface FormSectionResponse {
  label: string;
  config: FormConfig;
  record?: Record<string, unknown>;
  permissionModules?: PermissionModuleGroup[];
  relatedSections?: TableSection[];
}

function getStatusTone(status?: string): 'neutral' | 'primary' | 'success' | 'danger' | 'warning' {
  switch (status?.toLowerCase()) {
    case 'draft':
      return 'neutral';
    case 'submitted':
      return 'primary';
    case 'approved':
      return 'success';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

/**
 * In-place record detail, edit, and lifecycle management pane (matching DoersOS Default Workflow).
 *
 * Left:
 *   - Back arrow icon (exits edit mode when editing, or closes view when viewing).
 *   - When NOT editing: Edit pencil icon (icon-only).
 *   - When EDITING: Save button with icon + 'Save' text.
 * Center:
 *   - Record navigation (Prev / Next) with counter (e.g. 1 / 5).
 *   - Print button.
 *   - Export to PDF button.
 * Right:
 *   - Status badge.
 *   - Status change button with dropdown.
 */
export function RecordView({
  module,
  entity,
  recordId,
  startInEditMode = false,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  recordIndex,
  totalRecords,
}: {
  module: string;
  entity: string;
  recordId?: string;
  startInEditMode?: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  recordIndex?: number;
  totalRecords?: number;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const isNew = !recordId;
  const [editing, setEditing] = useState(isNew || startInEditMode);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeRelatedTab, setActiveRelatedTab] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const formTarget = `${module}.${entity}.form`;
  const formQueryKey = ['form', formTarget, recordId ?? 'new'];

  const { data, isLoading, error } = useQuery<FormSectionResponse>({
    queryKey: formQueryKey,
    queryFn: () => fetchFormSection(formTarget, recordId ? { id: recordId } : undefined) as Promise<FormSectionResponse>,
    placeholderData: (previousData) => previousData,
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isLoading && !data) {
    return (
      <div style={{ padding: '32px 28px', color: 'var(--text-secondary)', fontSize: 14 }}>
        Loading record...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: '32px 28px', color: 'var(--accent-red)', fontSize: 14 }}>
        Failed to load record:{' '}
        {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const rawStatus = data.record?.record_status ?? data.record?.status;
  const status = typeof rawStatus === 'string' ? (rawStatus as RecordStatus) : undefined;
  const lifecycle = lifecycleFor(status);

  function invalidateAndSettle(invalidates: string[], close: boolean) {
    for (const source of invalidates) queryClient.invalidateQueries({ queryKey: ['ds', source] });
    queryClient.invalidateQueries({ queryKey: formQueryKey });
    if (close) onClose();
    else setEditing(false);
  }

  async function runTransition(to: RecordStatus, label: string, confirm?: boolean | string) {
    if (!recordId) return;
    if (confirm) {
      const msg = typeof confirm === 'string' ? confirm : `Are you sure you want to ${label.toLowerCase()} this record?`;
      if (!window.confirm(msg)) return;
    }

    try {
      const suffix = TRANSITION_TARGET_SUFFIX[to];
      const target = getSubmitTarget(`${module}.${entity}.${suffix}`);
      await target.execute({ id: recordId });
      pushToast(`${label} successful.`);
      setDropdownOpen(false);
      invalidateAndSettle(target.invalidates, to === 'deleted');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : `Failed to ${label.toLowerCase()}`, 'error');
    }
  }

  const primarySideAction = lifecycle.sideActions.length > 0 ? lifecycle.sideActions[0] : undefined;

  function handlePrint() {
    window.print();
  }

  function handleExportPdf() {
    const originalTitle = document.title;
    const recordTitle = String(data?.record?.title || data?.record?.name || recordId || 'record');
    const cleanEntity = entity.charAt(0).toUpperCase() + entity.slice(1);
    document.title = `${cleanEntity} - ${recordTitle}`;
    pushToast('Exporting to PDF — choose "Save as PDF" as destination.');
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1500);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Top Toolbar */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 12px 0px 12px',
          borderBottom: '0px solid var(--border)',
          background: 'transparent',
          position: 'relative',
        }}
      >
        {/* Left: Back arrow icon & Edit/Save button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Back: Only arrow icon */}
          <button
            key="back-btn"
            type="button"
            onClick={(e) => {
              e.preventDefault();
              if (editing && !isNew && !startInEditMode) {
                setEditing(false);
              } else {
                onClose();
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            title={editing && !isNew ? 'Cancel Editing' : 'Back'}
          >
            <ArrowLeft size={16} />
          </button>

          {/* When EDITING: Save button with icon + 'Save' text */}
          {editing ? (
            <button
              key="save-btn"
              type="submit"
              form="record-form"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent-indigo-dark)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)',
              }}
              title="Save changes"
            >
              <Check size={15} strokeWidth={2.5} />
              <span>Save</span>
            </button>
          ) : (
            /* When NOT editing: Edit button (pencil icon + 'Edit' text) */
            lifecycle.canEdit && (
              <button
                key="edit-btn"
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditing(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
                title="Edit record"
              >
                <Pencil size={15} />
                <span>Edit</span>
              </button>
            )
          )}
        </div>

        {/* Center: Single Unified Collection for Record Navigation, Print & Export to PDF */}
        {!isNew && !editing && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
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
            {/* Previous Record Button */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (hasPrev && onPrev) onPrev();
              }}
              disabled={!hasPrev}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: hasPrev ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                cursor: hasPrev ? 'pointer' : 'not-allowed',
                opacity: hasPrev ? 1 : 0.4,
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
              title={hasPrev ? 'Previous record' : 'No previous record'}
              onMouseEnter={(e) => {
                if (hasPrev) {
                  e.currentTarget.style.backgroundColor = 'var(--surface)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = hasPrev ? 'var(--text-secondary)' : 'var(--text-tertiary)';
              }}
            >
              <ChevronLeft size={16} />
            </button>

            {/* Paging Counter */}
            {recordIndex !== undefined && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  padding: '0 6px',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  minWidth: 44,
                  textAlign: 'center',
                }}
              >
                {recordIndex} {totalRecords ? `/ ${totalRecords}` : ''}
              </span>
            )}

            {/* Next Record Button */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (hasNext && onNext) onNext();
              }}
              disabled={!hasNext}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: hasNext ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                cursor: hasNext ? 'pointer' : 'not-allowed',
                opacity: hasNext ? 1 : 0.4,
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
              title={hasNext ? 'Next record' : 'No next record'}
              onMouseEnter={(e) => {
                if (hasNext) {
                  e.currentTarget.style.backgroundColor = 'var(--surface)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = hasNext ? 'var(--text-secondary)' : 'var(--text-tertiary)';
              }}
            >
              <ChevronRight size={16} />
            </button>

            {/* Subtle Divider */}
            <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 3px' }} />

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
              title="Print record"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--surface)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <Printer size={16} />
            </button>

            {/* Export to PDF Button */}
            <button
              type="button"
              onClick={handleExportPdf}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
              title="Export to PDF"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--surface)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <FileDown size={16} />
            </button>
          </div>
        )}

        {/* Right: Status badge & Status Change Button with Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!isNew && status && <Badge tone={getStatusTone(status)}>{status.toUpperCase()}</Badge>}

          {!isNew && !editing && (
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} ref={dropdownRef}>
              {/* Primary Forward Action (e.g. Submit, Approve, Reopen as Draft) */}
              {lifecycle.forward ? (
                <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
                  <button
                    onClick={() => runTransition(lifecycle.forward!.to, lifecycle.forward!.label)}
                    style={{
                      padding: '8px 14px',
                      border: 'none',
                      borderRadius: lifecycle.sideActions.length > 0 ? '8px 0 0 8px' : 8,
                      background: 'var(--accent-indigo-dark)',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    {lifecycle.forward.label}
                  </button>

                  {/* Dropdown Chevron Trigger for Side Actions */}
                  {lifecycle.sideActions.length > 0 && (
                    <button
                      onClick={() => setDropdownOpen((prev) => !prev)}
                      style={{
                        padding: '8px 8px',
                        border: 'none',
                        borderLeft: '1px solid rgba(255, 255, 255, 0.25)',
                        borderRadius: '0 8px 8px 0',
                        background: 'var(--accent-indigo-dark)',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="More actions"
                    >
                      <ChevronDown size={14} />
                    </button>
                  )}
                </div>
              ) : (
                /* No forward action (e.g. Approved state with only Cancel action) */
                primarySideAction && (
                  <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
                    <button
                      onClick={() => runTransition(primarySideAction.to, primarySideAction.label, primarySideAction.confirm)}
                      style={{
                        padding: '8px 14px',
                        border: '1px solid var(--border)',
                        borderRadius: lifecycle.sideActions.length > 1 ? '8px 0 0 8px' : 8,
                        background: 'var(--surface)',
                        color:
                          primarySideAction.to === 'cancelled' || primarySideAction.to === 'deleted'
                            ? 'var(--accent-red)'
                            : 'var(--text-primary)',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {primarySideAction.to === 'cancelled' && <XCircle size={14} />}
                      {primarySideAction.to === 'deleted' && <Trash2 size={14} />}
                      {primarySideAction.label}
                    </button>

                    {lifecycle.sideActions.length > 1 && (
                      <button
                        onClick={() => setDropdownOpen((prev) => !prev)}
                        style={{
                          padding: '8px 8px',
                          border: '1px solid var(--border)',
                          borderLeft: 'none',
                          borderRadius: '0 8px 8px 0',
                          background: 'var(--surface)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ChevronDown size={14} />
                      </button>
                    )}
                  </div>
                )
              )}

              {/* Status Action Dropdown Popover */}
              {dropdownOpen && lifecycle.sideActions.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    zIndex: 50,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                    padding: 6,
                    minWidth: 160,
                  }}
                >
                  {lifecycle.sideActions.map((action) => {
                    const isDanger = action.to === 'deleted' || action.to === 'cancelled';
                    return (
                      <button
                        key={action.to}
                        onClick={() => runTransition(action.to, action.label, action.confirm)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: 'transparent',
                          color: isDanger ? 'var(--accent-red)' : 'var(--text-primary)',
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = isDanger ? 'var(--badge-danger-bg)' : 'var(--surface-2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        {action.to === 'cancelled' && <XCircle size={14} />}
                        {action.to === 'deleted' && <Trash2 size={14} />}
                        {action.to === 'draft' && <RefreshCw size={14} />}
                        <span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body: Dynamic Form (when editing) or Field Values (when viewing) */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', margin: '6px 12px' }} className="record-view-pane">
        {/* Print-only formal record document header */}
        <div className="print-only" style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {module} &bull; {entity}
              </div>
              <h1 style={{ margin: '4px 0 0 0', fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
                {String(data.record?.title || data.record?.name || data.label || 'Record Details')}
              </h1>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Record ID: {recordId} &bull; Printed: {new Date().toLocaleDateString()}
              </div>
            </div>
            {status && (
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                }}
              >
                {status}
              </span>
            )}
          </div>
        </div>

        {editing ? (
          <DynamicForm
            formId="record-form"
            config={data.config}
            initialValues={data.record}
            onCancel={() => (isNew || startInEditMode ? onClose() : setEditing(false))}
            onSuccess={(invalidates) => invalidateAndSettle(invalidates, isNew || startInEditMode)}
            hideButtons={true}
          />
        ) : data.config.layout?.groups && data.config.layout.groups.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {data.config.layout.groups.map((group, gIdx) => {
              const groupCols = group.columns || data.config.layout?.columns || 2;
              return (
                <div
                  key={group.id || group.title || gIdx}
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '16px 20px',
                  }}
                >
                  {group.title && (
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: group.description ? 4 : 14,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {group.title}
                    </div>
                  )}
                  {group.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                      {group.description}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${groupCols}, minmax(0, 1fr))`,
                      gap: '16px 24px',
                    }}
                  >
                    {group.fields.map((fieldName) => {
                      const field = data.config.fields.find((f) => f.name === fieldName);
                      if (!field || field.type === 'hidden') return null;
                      return (
                        <div key={field.name}>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: 'var(--text-tertiary)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              marginBottom: 4,
                            }}
                          >
                            {field.label}
                          </div>
                          <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                            <FieldDisplay field={field} value={data.record?.[field.name]} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {data.config.fields
              .filter((f) => f.type !== 'hidden')
              .map((field) => (
                <div key={field.name}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: 4,
                    }}
                  >
                    {field.label}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                    <FieldDisplay field={field} value={data.record?.[field.name]} />
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Related Records Tabs (Master-Detail, e.g. Payroll, Leaves, Related Items) */}
        {data.relatedSections && data.relatedSections.length > 0 && !editing && !isNew && (
          <div style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            {/* Tab Navigation Header */}
            <div
              className="no-print"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                borderBottom: '1px solid var(--border)',
                marginBottom: 16,
                overflowX: 'auto',
              }}
            >
              {data.relatedSections.map((sec, idx) => {
                const isActive = activeRelatedTab === idx;
                return (
                  <button
                    key={sec.id || idx}
                    type="button"
                    onClick={() => setActiveRelatedTab(idx)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 16px',
                      border: 'none',
                      background: 'transparent',
                      borderBottom: isActive ? '2px solid var(--accent-indigo)' : '2px solid transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 600 : 500,
                      fontSize: 13.5,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                      marginBottom: -1,
                    }}
                  >
                    <span>{sec.label || `Related ${idx + 1}`}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Related Table / Section */}
            {data.relatedSections[activeRelatedTab] && (
              <div
                style={{
                  background: 'var(--surface-2)',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  overflow: 'hidden',
                  padding: 8,
                }}
              >
                <DataTable section={data.relatedSections[activeRelatedTab]} />
              </div>
            )}
          </div>
        )}

        {/* Permission Matrix below view/edit area */}
        {data.permissionModules && data.permissionModules.length > 0 && (
          <RolePermissionMatrix
            roleKey={String(data.record?.key || data.record?.id || '')}
            roleName={String(data.record?.name || '')}
            initialModules={data.permissionModules}
          />
        )}
      </div>
    </div>
  );
}
