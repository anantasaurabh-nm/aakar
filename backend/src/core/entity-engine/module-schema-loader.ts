import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import {
  ModuleManifestSchema,
  ModuleEntitySchemaSchema,
  ModuleWorkflowDefinitionSchema,
  type ModuleManifest,
  type ModuleEntitySchema,
  type ModuleWorkflowDefinition,
} from '@erp/shared-contracts';
import { MODULES_DIR } from './modules-dir';

const logger = new Logger('ModuleSchemaLoader');

export interface DiscoveredModule {
  manifest: ModuleManifest;
  schema: ModuleEntitySchema | null;
  views?: Record<string, unknown>;
  capabilities?: Array<Record<string, unknown>>;
  workflows?: Record<string, ModuleWorkflowDefinition>;
}

/** Scans public_html/modules/*\/module.json (+ optional schema.json and optional ui/views/*.json). Invalid entries are logged and skipped. */
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

    const views: Record<string, unknown> = {};
    const viewsDir = path.join(dir, 'ui', 'views');
    if (existsSync(viewsDir)) {
      for (const viewEntry of readdirSync(viewsDir, { withFileTypes: true })) {
        if (viewEntry.isFile() && viewEntry.name.endsWith('.json')) {
          const viewKey = viewEntry.name.slice(0, -5);
          try {
            const rawView = JSON.parse(readFileSync(path.join(viewsDir, viewEntry.name), 'utf8'));
            views[viewKey] = rawView;
          } catch (err) {
            logger.warn(`Skipping invalid view "${viewEntry.name}" in "${entry.name}": ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }

    const capabilitiesList: Array<Record<string, unknown>> = [];

    // 1. Declarative capabilities.json
    const capPath = path.join(dir, 'capabilities.json');
    if (existsSync(capPath)) {
      try {
        const rawCap = JSON.parse(readFileSync(capPath, 'utf8'));
        if (Array.isArray(rawCap)) {
          capabilitiesList.push(...rawCap);
        }
      } catch (err) {
        logger.warn(`Skipping invalid capabilities.json in "${entry.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2. Code-based capabilities in capabilities/ (*.ts, *.js)
    const capDir = path.join(dir, 'capabilities');
    if (existsSync(capDir)) {
      for (const capEntry of readdirSync(capDir, { withFileTypes: true })) {
        if (capEntry.isFile() && (capEntry.name.endsWith('.ts') || capEntry.name.endsWith('.js')) && !capEntry.name.endsWith('.d.ts')) {
          try {
            const filePath = path.join(capDir, capEntry.name);
            const imported = require(filePath);
            const cap = imported.default || imported.capability || imported;
            if (cap && typeof cap === 'object' && (cap.id || capEntry.name.replace(/\.[^.]+$/, ''))) {
              if (!cap.id) cap.id = `${entry.name}.${capEntry.name.replace(/\.[^.]+$/, '')}`;
              if (!cap.module) cap.module = entry.name;
              capabilitiesList.push(cap);
            }
          } catch (err) {
            logger.warn(`Failed loading capability file "${capEntry.name}" in "${entry.name}": ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }

    // 3. Declarative workflows in workflows/ (*.workflow.json or *.json)
    const workflows: Record<string, ModuleWorkflowDefinition> = {};
    const workflowsDir = path.join(dir, 'workflows');
    if (existsSync(workflowsDir)) {
      for (const wfEntry of readdirSync(workflowsDir, { withFileTypes: true })) {
        if (wfEntry.isFile() && wfEntry.name.endsWith('.json')) {
          try {
            const rawWf = JSON.parse(readFileSync(path.join(workflowsDir, wfEntry.name), 'utf8'));
            const parsedWf = ModuleWorkflowDefinitionSchema.safeParse(rawWf);
            if (parsedWf.success) {
              const entityKey = parsedWf.data.entity;
              workflows[entityKey] = parsedWf.data;
            } else {
              logger.warn(`Skipping invalid workflow "${wfEntry.name}" in "${entry.name}": ${parsedWf.error.message}`);
            }
          } catch (err) {
            logger.warn(`Skipping invalid workflow file "${wfEntry.name}" in "${entry.name}": ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }

    found.push({
      manifest: manifestParsed.data,
      schema,
      ...(Object.keys(views).length > 0 ? { views } : {}),
      ...(capabilitiesList.length > 0 ? { capabilities: capabilitiesList } : {}),
      ...(Object.keys(workflows).length > 0 ? { workflows } : {}),
    });
  }
  return found;
}

export function loadModuleOnDisk(moduleId: string): DiscoveredModule | null {
  return discoverModulesOnDisk().find((m) => m.manifest.id === moduleId) ?? null;
}

export function getWorkflowForEntity(moduleId: string, entityKey: string): ModuleWorkflowDefinition | null {
  const mod = loadModuleOnDisk(moduleId);
  return mod?.workflows?.[entityKey] ?? null;
}

export function getSettingsForModule(moduleId: string) {
  const mod = loadModuleOnDisk(moduleId);
  return mod?.manifest.settings ?? null;
}

