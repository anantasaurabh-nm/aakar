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
});
export type SDUIFormField = z.infer<typeof FormFieldSchema>;

export const FormConfigSchema = z.object({
  fields: z.array(FormFieldSchema).default([]),
  submitAction: z.object({
    type: z.literal('submit'),
    target: z.string(),
  }),
});
export type FormConfig = z.infer<typeof FormConfigSchema>;
