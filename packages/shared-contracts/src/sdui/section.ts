import { z } from 'zod';
import { ToolbarSchema } from './toolbar';
import { DashboardConfigSchema } from './dashboard';
import { TableConfigSchema } from './table';
import { FormConfigSchema } from './form';

/**
 * Every section.type must map to a predefined client renderer.
 * This is the controlled registry of section types the server may request.
 * Adding a new type requires a client renderer + schema + security review (see SDUI PRD §7).
 */
export const SectionTypeSchema = z.enum(['dashboard', 'table', 'form']);
export type SectionType = z.infer<typeof SectionTypeSchema>;

export const BadgeTypeSchema = z.enum(['primary', 'success', 'warning', 'accent']);

export const DataSourceRefSchema = z.object({
  source: z.string(),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type SDUIDataSourceRef = z.infer<typeof DataSourceRefSchema>;

const BaseSectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: SectionTypeSchema,
  badge: z.union([z.string(), z.number()]).optional(),
  badgeType: BadgeTypeSchema.optional(),
  toolbar: ToolbarSchema.default([]),
  data: DataSourceRefSchema.optional(),
  state: z.record(z.unknown()).optional(),
});

export const DashboardSectionSchema = BaseSectionSchema.extend({
  type: z.literal('dashboard'),
  config: DashboardConfigSchema.default({ cards: [], charts: [] }),
});

export const TableSectionSchema = BaseSectionSchema.extend({
  type: z.literal('table'),
  config: TableConfigSchema,
});

export const FormSectionSchema = BaseSectionSchema.extend({
  type: z.literal('form'),
  config: FormConfigSchema,
});

export const SDUISectionSchema = z.discriminatedUnion('type', [
  DashboardSectionSchema,
  TableSectionSchema,
  FormSectionSchema,
]);
export type SDUISection = z.infer<typeof SDUISectionSchema>;

/**
 * A section that failed validation. The renderer shows a safe fallback
 * instead of taking down the entire page (SDUI PRD §17-18).
 */
export interface SDUIInvalidSection {
  id: string;
  label: string;
  invalid: true;
  reason: string;
}

export type SDUISectionOrInvalid = SDUISection | SDUIInvalidSection;

export function isInvalidSection(
  section: SDUISectionOrInvalid,
): section is SDUIInvalidSection {
  return (section as SDUIInvalidSection).invalid === true;
}

/**
 * Validate a raw list of sections, isolating failures per-section so one bad
 * section cannot crash the rest of the page.
 */
export function validateSections(raw: unknown[]): SDUISectionOrInvalid[] {
  return raw.map((entry) => {
    const parsed = SDUISectionSchema.safeParse(entry);
    if (parsed.success) return parsed.data;
    const id =
      typeof entry === 'object' && entry && 'id' in entry
        ? String((entry as Record<string, unknown>).id)
        : 'unknown';
    const label =
      typeof entry === 'object' && entry && 'label' in entry
        ? String((entry as Record<string, unknown>).label)
        : 'Unsupported section';
    return {
      id,
      label,
      invalid: true,
      reason: parsed.error.issues.map((i) => i.message).join('; '),
    };
  });
}
