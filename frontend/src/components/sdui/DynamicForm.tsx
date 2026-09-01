'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { FormConfig, SDUIFormField } from '@erp/shared-contracts';
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

function buildSchema(fields: SDUIFormField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) shape[field.name] = fieldSchema(field);
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
export function DynamicForm({ config, initialValues, onCancel, onSuccess, hideButtons = false, hideCancel = false, formId }: DynamicFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const pushToast = useUiStore((s) => s.pushToast);
  const schema = buildSchema(config.fields);

  const defaultValues = Object.fromEntries(
    config.fields.map((f) => [f.name, initialValues?.[f.name] ?? f.defaultValue ?? '']),
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues });

  const onSubmit = async (values: Record<string, unknown>) => {
    setServerError(null);
    try {
      const target = getSubmitTarget(config.submitAction.target);
      // A blank secret field means "keep the existing value" — omit it
      // entirely rather than sending an empty string that would erase it.
      const payload = { ...values };
      for (const field of config.fields) {
        if (field.secret && !payload[field.name]) delete payload[field.name];
      }
      await target.execute(payload);
      pushToast('Saved successfully.');
      onSuccess(target.invalidates);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate>
      {config.fields
        .filter((f) => f.type !== 'hidden')
        .map((field) => {
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
            <div key={field.name} style={{ marginBottom: 16 }}>
              <label
                htmlFor={field.name}
                style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}
              >
                {field.label}
              </label>
              <FieldInput field={field} register={register} />
              {errors[field.name] && (
                <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 4 }}>
                  {String(errors[field.name]?.message ?? 'Invalid value')}
                </p>
              )}
            </div>
          );
        })}
      {config.fields
        .filter((f) => f.type === 'hidden')
        .map((field) => (
          <input key={field.name} type="hidden" {...register(field.name)} />
        ))}

      {serverError && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>
          {serverError}
        </div>
      )}

      {!hideButtons && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          {!hideCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 600, cursor: 'pointer' }}
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
          placeholder={field.placeholder}
          style={baseStyle}
          {...register(field.name)}
        />
      );
    default:
      return <input id={field.name} type="text" placeholder={field.placeholder} style={baseStyle} {...register(field.name)} />;
  }
}

/** Read-only counterpart to `FieldInput`, used by RecordView's detail view — same field-type awareness, no inputs. */
export function FieldDisplay({ field, value }: { field: SDUIFormField; value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
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
