'use client';

import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { evalFieldCondition, type FormConfig, type SDUIFormField } from '@erp/shared-contracts';
import { Lock, Zap, Loader2 } from 'lucide-react';
import { getSubmitTarget } from '@/lib/action-registry';
import { useUiStore } from '@/lib/ui-store';

function fieldSchema(field: SDUIFormField): z.ZodTypeAny {
  switch (field.type) {
    case 'number':
      return field.required ? z.coerce.number() : z.coerce.number().optional();
    case 'checkbox':
    case 'switch':
      return z.boolean().optional().default(Boolean(field.defaultValue));
    case 'hidden':
      return z.any().optional();
    default:
      return field.required
        ? z.string().min(1, `${field.label} is required`)
        : z.string().optional();
  }
}

function buildDynamicSchema(fields: SDUIFormField[], currentValues: Record<string, unknown>) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    // Hidden or showWhen=false fields are treated as optional in validation
    const isVisible = evalFieldCondition(field.showWhen, currentValues);
    if (!isVisible) {
      shape[field.name] = z.any().optional();
    } else {
      shape[field.name] = fieldSchema(field);
    }
  }
  return z.object(shape);
}

export interface DynamicFormProps {
  config: FormConfig;
  initialValues?: Record<string, unknown>;
  onCancel: () => void;
  onSuccess: (invalidates: string[]) => void;
  hideButtons?: boolean;
  /** Hides just the Cancel button (e.g. a Settings group has nothing to cancel back to) while keeping Save. */
  hideCancel?: boolean;
  formId?: string;
}

/** SDUI -> DynamicForm -> React Hook Form -> Zod -> API action (stack.md §9). */
export function DynamicForm({
  config,
  initialValues,
  onCancel,
  onSuccess,
  hideButtons = false,
  hideCancel = false,
  formId,
}: DynamicFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [testingGroup, setTestingGroup] = useState<string | null>(null);
  const [groupTestResult, setGroupTestResult] = useState<Record<string, { success: boolean; message: string; latencyMs?: number }>>({});
  const pushToast = useUiStore((s) => s.pushToast);

  const defaultValues = Object.fromEntries(
    config.fields.map((f) => {
      // Secret / password fields start empty in edit mode so masked bullets aren't saved back
      if (f.secret || f.type === 'password') {
        return [f.name, ''];
      }
      return [f.name, initialValues?.[f.name] ?? f.defaultValue ?? ''];
    }),
  );

  // Dynamic resolver that takes current values and marks hidden fields optional
  const dynamicResolver = useCallback(
    async (values: Record<string, unknown>, context: unknown, options: any) => {
      const activeSchema = buildDynamicSchema(config.fields, values);
      return zodResolver(activeSchema)(values, context, options);
    },
    [config.fields],
  );

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: dynamicResolver,
    defaultValues,
  });

  // Watch form values for live conditional visibility evaluation
  const formValues = watch();

  const onSubmit = async (values: Record<string, unknown>) => {
    setServerError(null);
    try {
      const target = getSubmitTarget(config.submitAction.target);
      const payload = { ...values };

      for (const field of config.fields) {
        // If field is conditionally hidden, omit its value if secret
        const isVisible = evalFieldCondition(field.showWhen, values);
        if (!isVisible && field.secret) {
          delete payload[field.name];
        }
        // Blank secret field or masked bullet string means "keep the existing value"
        const isSecret = field.secret || field.type === 'password';
        const val = payload[field.name];
        if (isSecret && (!val || (typeof val === 'string' && val.includes('•')))) {
          delete payload[field.name];
        }
      }

      await target.execute(payload);
      pushToast('Saved successfully.');
      onSuccess(target.invalidates);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const handleTestGroup = async (group: { id?: string; fields: string[] }) => {
    if (!group.id) return;
    const groupId = group.id;
    setTestingGroup(groupId);
    try {
      const providerId = groupId.replace(/^group_/, '');
      const currentVals = watch();
      const payload: Record<string, unknown> = {
        id: currentVals.id,
        provider: currentVals.provider || providerId,
        ...currentVals,
      };
      const target = getSubmitTarget('connectors.connection.test');
      const res = (await target.execute(payload)) as Record<string, unknown>;
      const isSuccess = Boolean(res.success);
      const msg = String(res.message || (isSuccess ? 'Connection verified successfully!' : 'Connection probe failed'));
      const latency = typeof res.latencyMs === 'number' ? res.latencyMs : undefined;

      setGroupTestResult((prev) => ({
        ...prev,
        [groupId]: { success: isSuccess, message: msg, latencyMs: latency },
      }));

      pushToast(
        `${isSuccess ? '✓' : '✕'} ${msg}${latency ? ` (${latency}ms)` : ''}`,
        isSuccess ? 'success' : 'error',
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Connection test request failed';
      setGroupTestResult((prev) => ({
        ...prev,
        [groupId]: { success: false, message: errorMsg },
      }));
      pushToast(errorMsg, 'error');
    } finally {
      setTestingGroup(null);
    }
  };

  const renderFieldItem = (field: SDUIFormField) => {
    const isToggle = field.type === 'switch' || field.type === 'checkbox';
    if (isToggle) {
      return (
        <div
          key={field.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 8,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            marginBottom: 10,
          }}
        >
          <label
            htmlFor={field.name}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              flex: 1,
              marginRight: 12,
            }}
          >
            {field.label}
          </label>
          <input
            id={field.name}
            type="checkbox"
            style={{
              width: 18,
              height: 18,
              accentColor: 'var(--accent-indigo)',
              cursor: 'pointer',
            }}
            {...register(field.name)}
          />
        </div>
      );
    }

    return (
      <div key={field.name} style={{ marginBottom: 14 }}>
        <label
          htmlFor={field.name}
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 6,
            color: 'var(--text-secondary)',
          }}
        >
          {field.label}
          {field.required && evalFieldCondition(field.showWhen, formValues) && (
            <span style={{ color: 'var(--accent-red)', marginLeft: 3 }}>*</span>
          )}
        </label>
        <FieldInput field={field} register={register} />
        {errors[field.name] && (
          <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 4 }}>
            {String(errors[field.name]?.message ?? 'Invalid value')}
          </p>
        )}
      </div>
    );
  };

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* If layout specifies groups, render styled card sections */}
      {config.layout?.groups && config.layout.groups.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {config.layout.groups.map((group, gIdx) => {
            if (!evalFieldCondition(group.showWhen, formValues)) return null;

            const visibleFields = group.fields
              .map((name) => config.fields.find((f) => f.name === name))
              .filter(
                (f): f is SDUIFormField =>
                  Boolean(f && f.type !== 'hidden' && evalFieldCondition(f.showWhen, formValues)),
              );

            if (visibleFields.length === 0) return null;

            const groupCols = group.columns || config.layout?.columns || 2;
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
                    gap: '12px 20px',
                  }}
                >
                  {visibleFields.map((field) => renderFieldItem(field))}
                </div>

                {/* Inline Live Test Probe for Provider Credentials */}
                {Boolean(group.id && group.id.startsWith('group_')) && (() => {
                  const groupId = group.id!;
                  const groupRes = groupTestResult[groupId];
                  return (
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 12,
                      }}
                    >
                      <button
                        type="button"
                        disabled={testingGroup === groupId}
                        onClick={() => handleTestGroup(group)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 14px',
                          borderRadius: 7,
                          border: '1px solid var(--border)',
                          background: testingGroup === groupId ? 'var(--surface-3)' : 'var(--surface)',
                          color: 'var(--text-primary)',
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: testingGroup === groupId ? 'not-allowed' : 'pointer',
                          transition: 'background-color 0.15s ease',
                        }}
                        title="Probe remote API endpoint using the credentials above"
                      >
                        {testingGroup === groupId ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Zap size={13} style={{ color: '#f59e0b' }} />
                        )}
                        <span>{testingGroup === groupId ? 'Testing probe…' : 'Test Connection'}</span>
                      </button>

                      {groupRes && (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: groupRes.success
                              ? 'rgba(34, 197, 94, 0.1)'
                              : 'rgba(239, 68, 68, 0.1)',
                            color: groupRes.success ? '#16a34a' : '#dc2626',
                            border: `1px solid ${
                              groupRes.success
                                ? 'rgba(34, 197, 94, 0.25)'
                                : 'rgba(239, 68, 68, 0.25)'
                            }`,
                          }}
                        >
                          <span>{groupRes.success ? '✓' : '✕'}</span>
                          <span>{groupRes.message}</span>
                          {groupRes.latencyMs ? (
                            <span style={{ opacity: 0.8 }}>({groupRes.latencyMs}ms)</span>
                          ) : null}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      ) : (
        /* Fallback: flat list of visible fields */
        config.fields
          .filter((f) => f.type !== 'hidden' && evalFieldCondition(f.showWhen, formValues))
          .map((field) => renderFieldItem(field))
      )}

      {/* Hidden fields */}
      {config.fields
        .filter((f) => f.type === 'hidden')
        .map((field) => (
          <input key={field.name} type="hidden" {...register(field.name)} />
        ))}

      {serverError && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(239,68,68,0.1)',
            color: '#b91c1c',
            fontSize: 13,
            marginTop: 12,
            marginBottom: 12,
          }}
        >
          {serverError}
        </div>
      )}

      {!hideButtons && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          {!hideCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent-indigo-dark)',
              color: '#fff',
              fontWeight: 600,
              cursor: isSubmitting ? 'default' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </form>
  );
}

export function FieldInput({ field, register }: { field: SDUIFormField; register: ReturnType<typeof useForm>['register'] }) {
  const baseStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text-primary)',
    fontSize: 14,
  };

  switch (field.type) {
    case 'textarea':
      return <textarea id={field.name} rows={4} placeholder={field.placeholder} style={baseStyle} {...register(field.name)} />;
    case 'select':
      return (
        <select id={field.name} style={baseStyle} {...register(field.name)}>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case 'checkbox':
    case 'switch':
      return <input id={field.name} type="checkbox" style={{ width: 18, height: 18, accentColor: 'var(--accent-indigo)' }} {...register(field.name)} />;
    case 'date':
      return <input id={field.name} type="date" style={baseStyle} {...register(field.name)} />;
    case 'datetime':
      return <input id={field.name} type="datetime-local" style={baseStyle} {...register(field.name)} />;
    case 'number':
      return <input id={field.name} type="number" style={baseStyle} {...register(field.name)} />;
    case 'password':
      return (
        <input
          id={field.name}
          type="password"
          autoComplete="new-password"
          placeholder={field.placeholder || (field.secret ? '•••••••• (leave blank to keep existing)' : undefined)}
          style={baseStyle}
          {...register(field.name)}
        />
      );
    default:
      if (field.secret) {
        return (
          <input
            id={field.name}
            type="password"
            autoComplete="new-password"
            placeholder={field.placeholder || '•••••••• (leave blank to keep existing)'}
            style={baseStyle}
            {...register(field.name)}
          />
        );
      }
      return <input id={field.name} type="text" placeholder={field.placeholder} style={baseStyle} {...register(field.name)} />;
  }
}

/** Read-only counterpart to `FieldInput`, used by RecordView's detail view — same field-type awareness, no inputs. */
export function FieldDisplay({ field, value }: { field: SDUIFormField; value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
  }

  // Sensitive credentials (masked for privacy and security)
  if (field.secret || field.type === 'password') {
    const raw = String(value).trim();
    if (!raw) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
    const isMasked = raw.includes('•');
    const displayVal = isMasked
      ? raw
      : raw.length > 8
      ? `${raw.slice(0, 3)}••••••••${raw.slice(-4)}`
      : '••••••••';

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'monospace',
          fontSize: 13,
          letterSpacing: '0.06em',
          background: 'var(--surface-3, rgba(255, 255, 255, 0.05))',
          padding: '3px 10px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
        title="Sensitive credential (masked for security)"
      >
        <Lock size={12} style={{ opacity: 0.7, flexShrink: 0 }} />
        <span>{displayVal}</span>
      </span>
    );
  }

  // Diagnostic test status badge
  if (field.name === 'lastTestedStatus') {
    const str = String(value);
    const isOk = str.startsWith('ok');
    const isFailed = str.startsWith('Failed');
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          borderRadius: 6,
          fontSize: 12.5,
          fontWeight: 600,
          background: isOk
            ? 'rgba(34, 197, 94, 0.1)'
            : isFailed
            ? 'rgba(239, 68, 68, 0.1)'
            : 'var(--surface-3)',
          color: isOk ? '#16a34a' : isFailed ? '#dc2626' : 'var(--text-secondary)',
          border: `1px solid ${
            isOk
              ? 'rgba(34, 197, 94, 0.25)'
              : isFailed
              ? 'rgba(239, 68, 68, 0.25)'
              : 'var(--border)'
          }`,
        }}
      >
        <span style={{ fontSize: 10 }}>{isOk ? '🟢' : isFailed ? '🔴' : '⚪'}</span>
        <span>{str}</span>
      </span>
    );
  }

  switch (field.type) {
    case 'checkbox':
    case 'switch':
      return <span>{value ? 'Yes' : 'No'}</span>;
    case 'select': {
      const opt = field.options?.find((o) => o.value === value);
      return <span>{opt?.label ?? String(value)}</span>;
    }
    case 'datetime':
      return <span>{new Date(String(value)).toLocaleString()}</span>;
    default:
      return <span style={{ whiteSpace: 'pre-wrap' }}>{String(value)}</span>;
  }
}
