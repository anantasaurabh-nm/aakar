'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Check, ChevronDown, Trash2, XCircle, RefreshCw } from 'lucide-react';
import type { FormConfig } from '@erp/shared-contracts';
import { fetchFormSection } from '@/lib/form-registry';
import { getSubmitTarget } from '@/lib/action-registry';
import { lifecycleFor, TRANSITION_TARGET_SUFFIX, type RecordStatus } from '@/lib/record-lifecycle';
import { DynamicForm, FieldDisplay } from './DynamicForm';
import { Badge } from '@/components/ui/Badge';
import { useUiStore } from '@/lib/ui-store';
import { transform } from 'zod/v4';

interface FormSectionResponse {
  label: string;
  config: FormConfig;
  record?: Record<string, unknown>;
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
}: {
  module: string;
  entity: string;
  recordId?: string;
  startInEditMode?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const isNew = !recordId;
  const [editing, setEditing] = useState(isNew || startInEditMode);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const formTarget = `${module}.${entity}.form`;
  const formQueryKey = ['record-form', module, entity, recordId];
  const { data, isLoading, isError } = useQuery({
    queryKey: formQueryKey,
    queryFn: () => fetchFormSection(formTarget, recordId ? { id: recordId } : undefined) as Promise<FormSectionResponse>,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  if (isLoading) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading…</div>;
  if (isError || !data) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Couldn&apos;t load this record.</div>;

  const status = data.record?.record_status as string | undefined;
  const lifecycle = lifecycleFor(status);

  function invalidateAndSettle(invalidates: string[], close: boolean) {
    for (const source of invalidates) queryClient.invalidateQueries({ queryKey: ['ds', source] });
    queryClient.invalidateQueries({ queryKey: formQueryKey });
    if (close) onClose();
    else setEditing(false);
  }

  async function runTransition(to: RecordStatus, label: string, needsConfirm?: boolean) {
    if (needsConfirm && !window.confirm(`${label}? This cannot be undone.`)) return;
    try {
      const target = getSubmitTarget(`${module}.${entity}.${TRANSITION_TARGET_SUFFIX[to]}`);
      await target.execute({ id: recordId });
      pushToast(`${label} successful.`);
      setDropdownOpen(false);
      invalidateAndSettle(target.invalidates, to === 'deleted');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : `Failed to ${label.toLowerCase()}`, 'error');
    }
  }

  const primarySideAction = lifecycle.sideActions.length > 0 ? lifecycle.sideActions[0] : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Top Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 12px 0px 12px',
          borderBottom: '0px solid var(--border)',
          background: 'transparent',
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', margin: '6px 12px' }} className="record-view-pane" >
        {editing ? (
          <DynamicForm
            formId="record-form"
            config={data.config}
            initialValues={data.record}
            onCancel={() => (isNew || startInEditMode ? onClose() : setEditing(false))}
            onSuccess={(invalidates) => invalidateAndSettle(invalidates, isNew || startInEditMode)}
            hideButtons={true}
          />
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
      </div>
    </div >
  );
}
