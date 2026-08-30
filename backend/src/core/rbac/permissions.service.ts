import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ROLE_PERMISSIONS } from './permission-catalog';

const CACHE_TTL_MS = 30_000;

/**
 * Resolves which permissions a role currently grants. Backed by the
 * `role_permissions` table so changes (including entity-engine-generated
 * permissions, see EntityRegistryService) take effect without a redeploy,
 * falling back to the built-in defaults only for a completely fresh install
 * (an empty table).
 */
@Injectable()
export class PermissionsService {
  private cache: { at: number; map: Map<Role, Set<string>> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async loadMap(): Promise<Map<Role, Set<string>>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.map;
    }
    const rows = await this.prisma.rolePermission.findMany();
    const map = new Map<Role, Set<string>>();
    if (rows.length === 0) {
      for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        map.set(role as Role, new Set(perms));
      }
    } else {
      for (const row of rows) {
        if (!map.has(row.role)) map.set(row.role, new Set());
        map.get(row.role)!.add(row.permission);
      }
    }
    this.cache = { at: Date.now(), map };
    return map;
  }

  async getPermissionsForRole(role: Role): Promise<string[]> {
    const map = await this.loadMap();
    return Array.from(map.get(role) ?? []);
  }

  async hasPermission(role: Role, permission: string): Promise<boolean> {
    const map = await this.loadMap();
    return map.get(role)?.has(permission) ?? false;
  }

  async hasAnyPermission(role: Role, permissions: string[]): Promise<boolean> {
    const map = await this.loadMap();
    const granted = map.get(role);
    if (!granted) return false;
    return permissions.some((p) => granted.has(p));
  }
}
