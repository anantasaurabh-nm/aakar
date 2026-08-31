import { z } from 'zod';
import { FormFieldSchema } from './form';

/**
 * One independently-saveable record within a settings tab's list (e.g. one
 * AI model config). Reuses the same field contract as `form.ts` — a group
 * is rendered exactly like a DynamicForm, just with current values already
 * inlined rather than fetched separately. A tab whose groups represent a
 * variable-size collection (not a handful of fixed, always-shown sections)
 * renders as a list you click into — see SettingsView's master-detail mode.
 */
export const SettingsGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  /** Shown under the label in the list row, e.g. "openrouter · google/gemini-2.5-flash". */
  subtitle: z.string().optional(),
  /** Small status badge shown in the list row, e.g. "Active" / "Fallback" / "Disabled". */
  badge: z.string().optional(),
  /** Marks the "+ Add new" entry — a blank template group whose submit target creates a new record. */
  isCreate: z.boolean().default(false),
  fields: z.array(FormFieldSchema).default([]),
  submitAction: z.object({
    type: z.literal('submit'),
    target: z.string(),
  }),
  /** Present only for existing (non-`isCreate`) records that can be removed. */
  deleteAction: z
    .object({
      type: z.literal('submit'),
      target: z.string(),
      confirm: z.object({ message: z.string() }).optional(),
    })
    .optional(),
});
export type SettingsGroup = z.infer<typeof SettingsGroupSchema>;

/** One entry in the settings page's vertical tab rail. */
export const SettingsTabSchema = z.object({
  id: z.string(),
  label: z.string(),
  groups: z.array(SettingsGroupSchema).default([]),
});
export type SettingsTab = z.infer<typeof SettingsTabSchema>;

export const SettingsConfigSchema = z.object({
  tabs: z.array(SettingsTabSchema).min(1),
});
export type SettingsConfig = z.infer<typeof SettingsConfigSchema>;
