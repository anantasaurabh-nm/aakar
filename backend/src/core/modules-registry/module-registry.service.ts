import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ModuleDiscoveryEntry, Surface } from '@erp/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { MODULE_MANIFESTS } from './module-manifests';

const VALID_SURFACES: Surface[] = ['app', 'admin'];
const ENABLED_CACHE_TTL_MS = 30_000;

@Injectable()
export class ModuleRegistryService implements OnModuleInit {
  private readonly logger = new Logger('ModuleRegistry');
  private enabledCache: { at: number; ids: Set<string> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    for (const manifest of MODULE_MANIFESTS) {
      await this.upsertIfNew(manifest, 'enabled');
    }
    this.logger.log(`Synced ${MODULE_MANIFESTS.length} core module manifests into the registry`);
  }

  /** Registers a manifest only if this id isn't already known — never resets an admin's status choice. */
  async upsertIfNew(
    manifest: { id: string; name: string; version: string; description?: string; type: 'native' | 'connector' | 'hybrid'; surfaces: Surface[]; icon: string },
    defaultStatus: 'enabled' | 'discovered',
  ) {
    const unknownSurface = manifest.surfaces.find((s) => !VALID_SURFACES.includes(s));
    if (unknownSurface) {
      throw new BadRequestException(
        `Module "${manifest.id}" declares unknown surface "${unknownSurface}"`,
      );
    }
    const existing = await this.prisma.moduleRegistryEntry.findUnique({ where: { id: manifest.id } });
    if (existing) {
      await this.prisma.moduleRegistryEntry.update({
        where: { id: manifest.id },
        data: {
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          type: manifest.type,
          surfaces: manifest.surfaces,
          icon: manifest.icon,
          // status is intentionally left untouched so an admin's
          // enable/disable choice survives a restart/redeploy.
        },
      });
      return existing;
    }
    return this.prisma.moduleRegistryEntry.create({
      data: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        type: manifest.type,
        surfaces: manifest.surfaces,
        icon: manifest.icon,
        status: defaultStatus,
      },
    });
  }

  async discoverBySurface(surface: Surface): Promise<ModuleDiscoveryEntry[]> {
    const rows = await this.prisma.moduleRegistryEntry.findMany({
      where: { status: 'enabled', surfaces: { has: surface } },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      description: r.description ?? undefined,
    }));
  }

  async listAll() {
    return this.prisma.moduleRegistryEntry.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    return this.prisma.moduleRegistryEntry.findUnique({ where: { id } });
  }

  /** Enable/disable is privileged — callers must independently check `module.manage`. */
  async setStatus(id: string, status: 'discovered' | 'installed' | 'enabled' | 'disabled') {
    this.enabledCache = null;
    return this.prisma.moduleRegistryEntry.update({ where: { id }, data: { status } });
  }

  private async loadEnabledIds(): Promise<Set<string>> {
    if (this.enabledCache && Date.now() - this.enabledCache.at < ENABLED_CACHE_TTL_MS) {
      return this.enabledCache.ids;
    }
    const rows = await this.prisma.moduleRegistryEntry.findMany({
      where: { status: 'enabled' },
      select: { id: true },
    });
    const ids = new Set(rows.map((r) => r.id));
    this.enabledCache = { at: Date.now(), ids };
    return ids;
  }

  async isEnabled(id: string): Promise<boolean> {
    const ids = await this.loadEnabledIds();
    return ids.has(id);
  }
}
