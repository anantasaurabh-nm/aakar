'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { FormConfig } from '@erp/shared-contracts';
import { fetchFormSection } from '@/lib/form-registry';
import { getSubmitTarget } from '@/lib/action-registry';
import { lifecycleFor, TRANSITION_TARGET_SUFFIX, type RecordStatus } from '@/lib/record-lifecycle';
import { DynamicForm, FieldDisplay } from './DynamicForm';
import { Badge } from '@/components/ui/Badge';
import { useUiStore } from '@/lib/ui-store';

interface FormSectionResponse {
  label: string;
  config: FormConfig;
  record?: Record<string, unknown>;
}

/**
 * The in-place detail/edit/create pane a table's active row (or "New")
 * opens into — rendered inside the same Section Rotator pane DataTable
 * already owns, never a modal (finetune-1 §3/§4).
 */
export function RecordView({
  module,
  entity,
  recordId,
  onClose,
}: {
  module: string;
  entity: string;
  recordId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const isNew = !recordId;
  const [editing, setEditing] = useState(isNew);

  const formTarget = `${module}.${entity}.form`;
  const formQueryKey = ['record-form', module, entity, recordId];
  const { data, isLoading, isError } = useQuery({
    queryKey: formQueryKey,
    queryFn: () => fetchFormSection(formTarget, recordId ? { id: recordId } : undefined) as Promise<FormSectionResponse>,
  });

  if (isLoading) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading…</div>;
  if (isError || !data) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Couldn't load this record.</div>;

  const status = data.record?.record_status as string | undefined;
  const lifecycle = lifecycleFor(status);

  function invalidateAndSettle(invalidates: string[], close: boolean) {
    for (const source of invalidates) queryClient.invalidateQueries({ queryKey: ['ds', source] });
    queryClient.invalidateQueries({ queryKey: formQueryKey });
    if (close) onClose();
    else setEditing(false);
  }

  async function runTransition(to: RecordStatus, label: string, needsConfirm?: boolean) {
    if (needsConfirm && !window.confirm(`${label}? This cannot be undone from here.`)) return;
    try {
      const target = getSubmitTarget(`${module}.${entity}.${TRANSITION_TARGET_SUFFIX[to]}`);
      await target.execute({ id: recordId });
      pushToast(`${label} successful.`);
      invalidateAndSettle(target.invalidates, to === 'deleted');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : `Failed to ${label.toLowerCase()}`, 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <button onClick={onClose} style={backButtonStyle}>
          <ArrowLeft size={15} /> Back
        </button>
        <div style={{ flex: 1 }} />
        {!isNew && status && <Badge>{status}</Badge>}
        {!editing && lifecycle.canEdit && (
          <button onClick={() => setEditing(true)} style={secondaryButtonStyle}>
            Edit
          </button>
        )}
        {!isNew && lifecycle.forward && (
          <button onClick={() => runTransition(lifecycle.forward!.to, lifecycle.forward!.label)} style={primaryButtonStyle}>
            {lifecycle.forward.label}
          </button>
        )}
        {!editing &&
          lifecycle.sideActions.map((action) => (
            <button key={action.to} onClick={() => runTransition(action.to, action.label, action.confirm)} style={secondaryButtonStyle}>
              {action.label}
            </button>
          ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {editing ? (
          <DynamicForm
            config={data.config}
            onCancel={() => (isNew ? onClose() : setEditing(false))}
            onSuccess={(invalidates) => invalidateAndSettle(invalidates, isNew)}
          />
        ) : (
          <div>
            {data.config.fields
              .filter((f) => f.type !== 'hidden')
              .map((field) => (
                <div key={field.name} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    {field.label}
                  </div>
                  <FieldDisplay field={field} value={field.defaultValue} />
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

const backButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  padding: '6px 4px',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--accent-indigo-dark)',
  color: '#fff',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};
