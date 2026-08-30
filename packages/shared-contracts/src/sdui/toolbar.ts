import { z } from 'zod';
import { SDUIActionSchema } from './action';

export const ToolbarItemTypeSchema = z.enum([
  'action',
  'filter',
  'search',
  'sort',
  'columns',
  'pagination',
  'date-range',
  'view',
]);
export type ToolbarItemType = z.infer<typeof ToolbarItemTypeSchema>;

export const FilterOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type FilterOption = z.infer<typeof FilterOptionSchema>;

export const ToolbarItemSchema = z.object({
  id: z.string(),
  type: ToolbarItemTypeSchema,
  label: z.string().optional(),
  field: z.string().optional(),
  placeholder: z.string().optional(),
  options: z.array(FilterOptionSchema).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  action: SDUIActionSchema.optional(),
});
export type SDUIToolbarItem = z.infer<typeof ToolbarItemSchema>;

export const ToolbarSchema = z.array(ToolbarItemSchema);
export type SDUIToolbar = z.infer<typeof ToolbarSchema>;
