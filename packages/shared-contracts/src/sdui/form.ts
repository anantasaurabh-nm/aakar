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

export const FormFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: FieldTypeSchema,
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  defaultValue: z.unknown().optional(),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
  helpText: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
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
});
export type SDUIFormGroup = z.infer<typeof FormGroupSchema>;

export const FormLayoutSchema = z.object({
  type: z.enum(['stack', 'grid']).default('stack'),
  columns: z.number().min(1).max(4).default(1),
  groups: z.array(FormGroupSchema).optional(),
});
export type SDUIFormLayout = z.infer<typeof FormLayoutSchema>;

export const FormConfigSchema = z.object({
  fields: z.array(FormFieldSchema).default([]),
  submitAction: z.object({
    type: z.literal('submit'),
    target: z.string(),
  }),
  layout: FormLayoutSchema.optional(),
});
export type FormConfig = z.infer<typeof FormConfigSchema>;
