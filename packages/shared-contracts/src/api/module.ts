import { z } from 'zod';

/** Controlled surface registry — the installer must reject unknown surfaces (Surfaces PRD §13). */
export const SurfaceSchema = z.enum(['app', 'admin']);
export type Surface = z.infer<typeof SurfaceSchema>;

export const ModuleTypeSchema = z.enum(['native', 'connector', 'hybrid']);
export type ModuleType = z.infer<typeof ModuleTypeSchema>;

/** `discovered` = manifest found on disk but not yet installed (schema not migrated). */
export const ModuleStatusSchema = z.enum(['discovered', 'installed', 'enabled', 'disabled']);
export type ModuleStatus = z.infer<typeof ModuleStatusSchema>;

export const ModulePermissionSchema = z.object({
  id: z.string(),
  description: z.string(),
});
export type ModulePermission = z.infer<typeof ModulePermissionSchema>;

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
});
export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

/** Discovery card shown in /data/apps or /data/admin-tools. */
export interface ModuleDiscoveryEntry {
  id: string;
  name: string;
  icon: string;
  description?: string;
}
