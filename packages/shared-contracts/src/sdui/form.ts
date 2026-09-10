import { z } from 'zod';

export const FieldTypeSchema = z.enum([
  'text',
  'textarea',
  'number',
  'select',
  'multiselect',
  'date',
  'datetime',
  'checkbox',
  'switch',
  'tags',
  'password',
  'hidden',
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const FieldConditionOperatorSchema = z.enum([
  'eq',
  'neq',
  'in',
  'not_in',
  'truthy',
  'falsy',
]);
export type FieldConditionOperator = z.infer<typeof FieldConditionOperatorSchema>;

export const FieldConditionSchema = z.object({
  field: z.string(),
  operator: FieldConditionOperatorSchema.default('eq'),
  value: z.unknown().optional(),
});
export type SDUIFieldCondition = z.infer<typeof FieldConditionSchema>;

/**
 * Evaluates whether a field condition is satisfied given the current form or record values.
 */
export function evalFieldCondition(
  condition: SDUIFieldCondition | undefined,
  values: Record<string, unknown> | undefined,
): boolean {
  if (!condition) return true;
  if (!values) return false;

  const actual = values[condition.field];
  const target = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actual === target || String(actual ?? '') === String(target ?? '');
    case 'neq':
      return actual !== target && String(actual ?? '') !== String(target ?? '');
    case 'in':
      return Array.isArray(target) && target.some((v) => v === actual || String(v) === String(actual ?? ''));
    case 'not_in':
      return Array.isArray(target) && !target.some((v) => v === actual || String(v) === String(actual ?? ''));
    case 'truthy':
      return Boolean(actual && actual !== 'false' && actual !== '0');
    case 'falsy':
      return !actual || actual === 'false' || actual === '0';
    default:
      return true;
  }
}

export const FormFieldOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
  /**
   * Optional presets to automatically set on the form when this option is selected.
   * Example: { authType: 'bearer_token', baseUrl: 'https://api.stripe.com/v1' }
   */
  setValues: z.record(z.unknown()).optional(),
});
export type SDUIFormFieldOption = z.infer<typeof FormFieldOptionSchema>;

export const FormFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: FieldTypeSchema,
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(FormFieldOptionSchema).optional(),
  helpText: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  /**
   * Declarative conditional visibility rule: field is only shown if this rule evaluates to true.
   */
  showWhen: FieldConditionSchema.optional(),
  disabled: z.boolean().optional(),
  /**
   * A write-only value (e.g. an API key). The server never sends the real
   * value back — `defaultValue` is always empty and `placeholder` carries
   * the "already configured" hint instead. Left blank on submit means
   * "keep the existing value," so the client omits it from the request
   * body entirely rather than sending an empty string.
   */
  secret: z.boolean().default(false),
});
export type SDUIFormField = z.infer<typeof FormFieldSchema>;

export const FormGroupSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  columns: z.number().min(1).max(4).optional(),
  fields: z.array(z.string()),
  /**
   * Declarative conditional visibility rule for the entire group.
   */
  showWhen: FieldConditionSchema.optional(),
});
export type SDUIFormGroup = z.infer<typeof FormGroupSchema>;

export const FormLayoutSchema = z.object({
  type: z.enum(['stack', 'grid']).default('stack'),
  columns: z.number().min(1).max(4).default(1),
  groups: z.array(FormGroupSchema).optional(),
});
export type SDUIFormLayout = z.infer<typeof FormLayoutSchema>;

export const FormConfigSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(FormFieldSchema).default([]),
  submitAction: z.object({
    type: z.literal('submit'),
    target: z.string(),
    label: z.string().optional(),
  }),
  layout: FormLayoutSchema.optional(),
});
export type FormConfig = z.infer<typeof FormConfigSchema>;

