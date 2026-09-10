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
  Zap,
  Loader2,
} from 'lucide-react';
import type { FormConfig, TableSection, SDUIFormField } from '@erp/shared-contracts';
import { evalFieldCondition } from '@erp/shared-contracts';
import dynamic from 'next/dynamic';
import { fetchFormSection } from '@/lib/form-registry';
import { getSubmitTarget } from '@/lib/action-registry';
import { lifecycleFor, TRANSITION_TARGET_SUFFIX, type RecordStatus } from '@/lib/record-lifecycle';
import { DynamicForm, FieldDisplay } from './DynamicForm';
import { RolePermissionMatrix, type PermissionModuleGroup } from './RolePermissionMatrix';
import { Badge } from '@/components/ui/Badge';
import { useUiStore } from '@/lib/ui-store';
import type { ComputedRecordWorkflow } from '@erp/shared-contracts';

const DataTable = dynamic(() => import('./DataTable').then((m) => m.DataTable), { ssr: false });

interface FormSectionResponse {
  label: string;
  config: FormConfig;
  record?: Record<string, unknown>;
  permissionModules?: PermissionModuleGroup[];
  relatedSections?: TableSection[];
  workflow?: ComputedRecordWorkflow;
  toolbar?: Array<{
    id: string;
    type?: string;
    label: string;
    action?: { type: string; target?: string };
  }>;
}

function getStatusTone(status?: string): 'neutral' | 'primary' | 'success' | 'danger' | 'warning' {
  switch (status?.toLowerCase()) {
    case 'draft':
      return 'neutral';
    case 'submitted':
      return 'primary';
    case 'approved':
    case 'active':
    case 'ok':
      return 'success';
    case 'cancelled':
    case 'error':
      return 'danger';
    case 'inactive':
      return 'warning';
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
  const [isTesting, setIsTesting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const formTarget = `${module}.${entity}.form`;
  const formQueryKey = ['form', formTarget, recordId ?? 'new'];

  const { data, isLoading, error } = useQuery<FormSectionResponse>({
    queryKey: formQueryKey,
    queryFn: () => fetchFormSection(formTarget, recordId ? { id: recordId } : undefined) as Promise<FormSectionResponse>,
    placeholderData: (previousData) => previousData,
  });

  const handleTestConnection = async () => {
    setIsTesting(true);
    pushToast('Probing connection with remote provider…');
    try {
      const target = getSubmitTarget('connectors.connection.test');
      const payload: Record<string, unknown> = {
        id: recordId,
        provider: data?.record?.provider,
        ...(data?.record ?? {}),
      };
      const res = await target.execute(payload);
      const resObj = (res ?? {}) as Record<string, unknown>;
      const latency = typeof resObj.latencyMs === 'number' ? ` (${resObj.latencyMs}ms)` : '';
      if (resObj.success) {
        pushToast(`✓ ${resObj.message || 'Connection verified successfully!'}${latency}`, 'success');
      } else {
        pushToast(`✕ ${resObj.message || 'Connection test failed'}${latency}`, 'error');
      }
      queryClient.invalidateQueries({ queryKey: formQueryKey });
      queryClient.invalidateQueries({ queryKey: ['ds', 'connectors.connection'] });
      queryClient.invalidateQueries({ queryKey: ['ds', 'connectors'] });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Connection test request failed', 'error');
    } finally {
      setIsTesting(false);
    }
  };

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

  // Only business records with approval workflows use lifecycles.
  // Configuration entities (connectors, user-roles, settings) do NOT have workflow transitions.
  const hasWorkflow = Boolean(data.workflow) || (
    module !== 'connectors' &&
    module !== 'user-roles' &&
    module !== 'settings' &&
    typeof data.record?.record_status === 'string'
  );

  const rawStatus = data.record?.record_status ?? data.record?.status;
  const status = typeof rawStatus === 'string' ? rawStatus : undefined;
  const defaultLifecycle = hasWorkflow ? lifecycleFor(status) : null;

  // If server computed custom Level 4 workflow, use it; otherwise fallback to defaultLifecycle
  const customWf = hasWorkflow ? data.workflow : null;
  const forwardAction = customWf?.forwardAction
    ? {
        label: customWf.forwardAction.label,
        to: customWf.forwardAction.to as RecordStatus,
        disabled: customWf.forwardAction.disabled,
        disabledReason: customWf.forwardAction.disabledReason,
        confirm: customWf.forwardAction.confirm,
      }
    : defaultLifecycle?.forward
    ? {
        label: defaultLifecycle.forward.label,
        to: defaultLifecycle.forward.to,
        disabled: false as boolean | undefined,
        disabledReason: undefined as string | undefined,
        confirm: undefined as boolean | string | undefined,
      }
    : undefined;

  const sideActions = customWf
    ? customWf.sideActions.map((s) => ({
        label: s.label,
        to: s.to as RecordStatus,
        confirm: s.confirm,
        disabled: s.disabled,
        disabledReason: s.disabledReason,
      }))
    : defaultLifecycle?.sideActions
    ? defaultLifecycle.sideActions.map((s) => ({
        label: s.label,
        to: s.to,
        confirm: s.confirm,
        disabled: false as boolean | undefined,
        disabledReason: undefined as string | undefined,
      }))
    : [];

  const primarySideAction = sideActions.length > 0 ? sideActions[0] : undefined;
  const canEditRecord = customWf ? (customWf.canEdit ?? defaultLifecycle?.canEdit ?? true) : (defaultLifecycle?.canEdit ?? true);

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
            canEditRecord && (
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

          {/* Test Connection Button (for connectors module or whenever form provides a test action) */}
          {(module === 'connectors' || data?.toolbar?.some((t) => t.id === 'test' || t.id === 'test-connection')) && (
            <button
              key="test-connection-btn"
              type="button"
              disabled={isTesting}
              onClick={handleTestConnection}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: isTesting ? 'var(--surface-3)' : 'var(--surface)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: 13,
                cursor: isTesting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              title="Test live connection probe with remote service"
            >
              {isTesting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Zap size={14} style={{ color: '#f59e0b' }} />
              )}
              <span>{isTesting ? 'Probing…' : 'Test Connection'}</span>
            </button>
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

            {/* Print & PDF Buttons: Only for printable document/workflow modules */}
            {hasWorkflow && (
              <>
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
              </>
            )}
          </div>
        )}

        {/* Right: Status badge & Status Change Button with Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!isNew && status && <Badge tone={getStatusTone(status)}>{status.toUpperCase()}</Badge>}

          {!isNew && !editing && (
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} ref={dropdownRef}>
              {/* Primary Forward Action (e.g. Submit, Approve, Reopen as Draft) */}
              {forwardAction ? (
                <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
                  <button
                    onClick={() => {
                      if (forwardAction.disabled) {
                        pushToast(forwardAction.disabledReason || 'Action not allowed', 'error');
                        return;
                      }
                      runTransition(forwardAction.to, forwardAction.label, forwardAction.confirm);
                    }}
                    disabled={forwardAction.disabled}
                    title={forwardAction.disabled ? forwardAction.disabledReason : undefined}
                    style={{
                      padding: '8px 14px',
                      border: 'none',
                      borderRadius: sideActions.length > 0 ? '8px 0 0 8px' : 8,
                      background: forwardAction.disabled ? 'var(--text-tertiary)' : 'var(--accent-indigo-dark)',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: forwardAction.disabled ? 'not-allowed' : 'pointer',
                      opacity: forwardAction.disabled ? 0.65 : 1,
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    {forwardAction.label}
                  </button>

                  {/* Dropdown Chevron Trigger for Side Actions */}
                  {sideActions.length > 0 && (
                    <button
                      onClick={() => setDropdownOpen((prev) => !prev)}
                      style={{
                        padding: '8px 8px',
                        border: 'none',
                        borderLeft: '1px solid rgba(255, 255, 255, 0.25)',
                        borderRadius: '0 8px 8px 0',
                        background: forwardAction.disabled ? 'var(--text-tertiary)' : 'var(--accent-indigo-dark)',
                        color: '#fff',
                        cursor: 'pointer',
                        opacity: forwardAction.disabled ? 0.65 : 1,
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
                      onClick={() => {
                        if (primarySideAction.disabled) {
                          pushToast(primarySideAction.disabledReason || 'Action not allowed', 'error');
                          return;
                        }
                        runTransition(primarySideAction.to, primarySideAction.label, primarySideAction.confirm);
                      }}
                      disabled={primarySideAction.disabled}
                      title={primarySideAction.disabled ? primarySideAction.disabledReason : undefined}
                      style={{
                        padding: '8px 14px',
                        border: '1px solid var(--border)',
                        borderRadius: sideActions.length > 1 ? '8px 0 0 8px' : 8,
                        background: 'var(--surface)',
                        color:
                          primarySideAction.to === 'cancelled' || primarySideAction.to === 'deleted'
                            ? 'var(--accent-red)'
                            : 'var(--text-primary)',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: primarySideAction.disabled ? 'not-allowed' : 'pointer',
                        opacity: primarySideAction.disabled ? 0.65 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {primarySideAction.to === 'cancelled' && <XCircle size={14} />}
                      {primarySideAction.to === 'deleted' && <Trash2 size={14} />}
                      {primarySideAction.label}
                    </button>

                    {sideActions.length > 1 && (
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
              {dropdownOpen && sideActions.length > 0 && (
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
                  {sideActions.map((action) => {
                    const isDanger = action.to === 'deleted' || action.to === 'cancelled';
                    return (
                      <button
                        key={action.to}
                        disabled={action.disabled}
                        title={action.disabled ? action.disabledReason : undefined}
                        onClick={() => {
                          if (action.disabled) {
                            pushToast(action.disabledReason || 'Action not allowed', 'error');
                            return;
                          }
                          runTransition(action.to, action.label, action.confirm);
                        }}
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
                          cursor: action.disabled ? 'not-allowed' : 'pointer',
                          opacity: action.disabled ? 0.5 : 1,
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          if (!action.disabled) {
                            e.currentTarget.style.backgroundColor = isDanger ? 'var(--badge-danger-bg)' : 'var(--surface-2)';
                          }
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

        {/* Visual Workflow Stepper Pipeline Banner */}
        {!isNew && customWf?.stepper && customWf.stepper.steps.length > 0 && (
          <div
            className="no-print"
            style={{
              marginBottom: 24,
              padding: '16px 20px',
              borderRadius: 12,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>
                  Workflow Pipeline
                </span>
                <span style={{ color: 'var(--border)' }}>&bull;</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {customWf.stateLabel}
                </span>
              </div>
              {forwardAction?.disabled && forwardAction.disabledReason && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--accent-amber, #d97706)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(217, 119, 6, 0.1)',
                    padding: '3px 10px',
                    borderRadius: 6,
                  }}
                >
                  <span>⚠️</span> {forwardAction.disabledReason}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
              {customWf.stepper.steps.map((step, idx, arr) => {
                const isCompleted = step.status === 'completed';
                const isCurrent = step.status === 'current';
                const isCancelled = step.status === 'cancelled';

                const nodeBg = isCompleted
                  ? 'var(--accent-emerald, #10b981)'
                  : isCurrent
                  ? 'var(--accent-indigo-dark, #4f46e5)'
                  : isCancelled
                  ? 'var(--accent-red, #ef4444)'
                  : 'var(--surface)';
                const nodeColor = isCompleted || isCurrent || isCancelled ? '#ffffff' : 'var(--text-tertiary)';
                const borderColor = isCompleted || isCurrent || isCancelled ? 'transparent' : 'var(--border)';

                return (
                  <div key={step.key} style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 110 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: nodeBg,
                            color: nodeColor,
                            border: `1px solid ${borderColor}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 700,
                            boxShadow: isCurrent ? '0 0 0 3px rgba(99, 102, 241, 0.2)' : 'none',
                          }}
                        >
                          {isCompleted ? '✓' : isCancelled ? '✕' : idx + 1}
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: isCurrent ? 700 : 600,
                            color: isCurrent ? 'var(--text-primary)' : isCompleted ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                          }}
                        >
                          {step.label}
                        </span>
                      </div>
                      {(step.performedBy || step.performedAt) && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 32, marginTop: 2 }}>
                          {step.performedBy && <span>by {step.performedBy} </span>}
                          {step.performedAt && <span>on {new Date(step.performedAt).toLocaleDateString()}</span>}
                        </div>
                      )}
                    </div>

                    {idx < arr.length - 1 && (
                      <div
                        style={{
                          flex: 1,
                          height: 2,
                          background: isCompleted ? 'var(--accent-emerald, #10b981)' : 'var(--border)',
                          margin: '0 8px',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
              if (!evalFieldCondition(group.showWhen, data.record)) return null;

              const visibleFields = group.fields
                .map((fieldName) => data.config.fields.find((f) => f.name === fieldName))
                .filter(
                  (f): f is SDUIFormField =>
                    Boolean(f && f.type !== 'hidden' && evalFieldCondition(f.showWhen, data.record)),
                );

              if (visibleFields.length === 0) return null;

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
                    {visibleFields.map((field) => (
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
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {data.config.fields
              .filter((f) => f.type !== 'hidden' && evalFieldCondition(f.showWhen, data.record))
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
