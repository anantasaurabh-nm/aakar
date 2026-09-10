import { z } from 'zod';
import { SDUIActionSchema } from './action';
import { SDUISectionSchema, validateSections, type SDUISectionOrInvalid } from './section';

export const SDUI_SCHEMA_VERSION = '1.0';

export const SDUIBrandSchema = z.object({
  name: z.string(),
  icon: z.string().optional(),
  moduleId: z.string().optional(),
  hasSettings: z.boolean().optional(),
});
export type SDUIBrand = z.infer<typeof SDUIBrandSchema>;

export interface SDUINavigationItem {
  id: string;
  label: string;
  icon?: string;
  badge?: string | number;
  action?: z.infer<typeof SDUIActionSchema>;
  items?: SDUINavigationItem[];
}

export const SDUINavigationItemSchema: z.ZodType<SDUINavigationItem> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string(),
    icon: z.string().optional(),
    badge: z.union([z.string(), z.number()]).optional(),
    action: SDUIActionSchema.optional(),
    items: z.array(SDUINavigationItemSchema).optional(),
  })
);

export const SDUINavigationSchema = z.object({
  items: z.array(SDUINavigationItemSchema).default([]),
});
export type SDUINavigation = z.infer<typeof SDUINavigationSchema>;

export const SDUIPageMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  sections: z.array(z.unknown()).default([]),
});

/** Raw wire schema — sections are validated individually afterwards. */
export const SDUIResponseSchema = z.object({
  schema: z.string(),
  brand: SDUIBrandSchema,
  navigation: SDUINavigationSchema.default({ items: [] }),
  page: SDUIPageMetaSchema,
});
export type SDUIResponseRaw = z.infer<typeof SDUIResponseSchema>;

export interface SDUIPage {
  schema: string;
  brand: SDUIBrand;
  navigation: SDUINavigation;
  page: {
    id: string;
    title: string;
    sections: SDUISectionOrInvalid[];
  };
}

export type SDUIValidationResult =
  | { ok: true; page: SDUIPage }
  | { ok: false; reason: string };

/**
 * Validate an incoming SDUI response. Rejects unsupported schema versions
 * and validates each section independently so one invalid section cannot
 * take down the whole page (SDUI PRD §17, §22).
 */
export function validateSDUIResponse(raw: unknown): SDUIValidationResult {
  const parsed = SDUIResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  if (!parsed.data.schema.startsWith('1.')) {
    return { ok: false, reason: `Unsupported SDUI schema version: ${parsed.data.schema}` };
  }
  const sections = validateSections(parsed.data.page.sections);
  return {
    ok: true,
    page: {
      schema: parsed.data.schema,
      brand: parsed.data.brand,
      navigation: parsed.data.navigation,
      page: {
        id: parsed.data.page.id,
        title: parsed.data.page.title,
        sections,
      },
    },
  };
}

export { SDUISectionSchema };
