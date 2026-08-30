import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { ModuleManifestSchema, ModuleEntitySchemaSchema, type ModuleManifest, type ModuleEntitySchema } from '@erp/shared-contracts';
import { MODULES_DIR } from './modules-dir';

const logger = new Logger('ModuleSchemaLoader');

export interface DiscoveredModule {
  manifest: ModuleManifest;
  schema: ModuleEntitySchema | null;
}

/** Scans public_html/modules/*\/module.json (+ optional schema.json). Invalid entries are logged and skipped. */
export function discoverModulesOnDisk(): DiscoveredModule[] {
  if (!existsSync(MODULES_DIR)) return [];

  const found: DiscoveredModule[] = [];
  for (const entry of readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(MODULES_DIR, entry.name);
    const manifestPath = path.join(dir, 'module.json');
    if (!existsSync(manifestPath)) continue;

    const manifestParsed = ModuleManifestSchema.safeParse(JSON.parse(readFileSync(manifestPath, 'utf8')));
    if (!manifestParsed.success) {
      logger.warn(`Skipping invalid manifest at ${manifestPath}: ${manifestParsed.error.message}`);
      continue;
    }
    if (manifestParsed.data.id !== entry.name) {
      logger.warn(`Skipping "${manifestPath}": manifest id "${manifestParsed.data.id}" must match its folder name "${entry.name}"`);
      continue;
    }

    let schema: ModuleEntitySchema | null = null;
    const schemaPath = path.join(dir, 'schema.json');
    if (existsSync(schemaPath)) {
      const schemaParsed = ModuleEntitySchemaSchema.safeParse(JSON.parse(readFileSync(schemaPath, 'utf8')));
      if (!schemaParsed.success) {
        logger.warn(`Skipping "${entry.name}": invalid schema.json — ${schemaParsed.error.message}`);
        continue;
      }
      schema = schemaParsed.data;
    }

    found.push({ manifest: manifestParsed.data, schema });
  }
  return found;
}

export function loadModuleOnDisk(moduleId: string): DiscoveredModule | null {
  return discoverModulesOnDisk().find((m) => m.manifest.id === moduleId) ?? null;
}
