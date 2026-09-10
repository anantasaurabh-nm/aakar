import { z } from 'zod';

/** Controlled surface registry — the installer must reject unknown surfaces (Surfaces PRD §13). */
export const SurfaceSchema = z.enum(['app', 'admin']);
export type Surface = z.infer<typeof SurfaceSchema>;

export const ModuleTypeSchema = z.enum(['native', 'connector', 'hybrid']);
export type ModuleType = z.infer<typeof ModuleTypeSchema>;

/** `discovered` = manifest found on disk but not yet installed (schema not migrated). */
export const ModuleStatusSchema = z.enum(['discovered', 'installed', 'enabled', 'disabled', 'system']);
export type ModuleStatus = z.infer<typeof ModuleStatusSchema>;

export const ModulePermissionSchema = z.object({
  id: z.string(),
  description: z.string(),
});
export type ModulePermission = z.infer<typeof ModulePermissionSchema>;

export const ModuleSettingFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['connection', 'text', 'password', 'number', 'select', 'switch', 'textarea']),
  provider: z.string().optional(), // e.g. "mcp", "trello", "stripe", or "any"
  required: z.boolean().optional(),
  scope: z.enum(['global', 'user']).optional().default('global'),
  access: z.enum(['admin', 'user']).optional().default('admin'),
  defaultValue: z.unknown().optional(),
  helpText: z.string().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
});
export type ModuleSettingField = z.infer<typeof ModuleSettingFieldSchema>;

export const ModuleSettingsSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(ModuleSettingFieldSchema),
});
export type ModuleSettingsDefinition = z.infer<typeof ModuleSettingsSchema>;

/**
 * `module.json` manifest shape (Module System PRD v2 §31). Intentionally
 * minimal — a module optionally ships a sibling `schema.json` (Level 1) for
 * DoersOS Core to interpret at runtime; nothing about that needs declaring
 * here since there's no compiled code to wire up.
 */
export const ModuleManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Module id must be lowercase and URL-safe'),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  type: ModuleTypeSchema,
  surfaces: z.array(SurfaceSchema).min(1),
  dependencies: z.record(z.string()).optional(),
  optionalDependencies: z.record(z.string()).optional(),
  settings: ModuleSettingsSchema.optional(),
});
export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

/** Discovery card shown in /data/apps or /data/admin-tools. */
export interface ModuleDiscoveryEntry {
  id: string;
  name: string;
  icon: string;
  description?: string;
}
