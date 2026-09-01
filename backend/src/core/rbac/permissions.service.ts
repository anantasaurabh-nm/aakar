import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ROLE_PERMISSIONS, type Role } from './permission-catalog';

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
  private cache: { at: number; map: Map<string, Set<string>> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Invalidates memory cache so role permission mutations take effect immediately. */
  invalidateCache(): void {
    this.cache = null;
  }

  private async loadMap(): Promise<Map<string, Set<string>>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.map;
    }
    const rows = await this.prisma.rolePermission.findMany();
    const map = new Map<string, Set<string>>();
    if (rows.length === 0) {
      for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        map.set(role, new Set(perms));
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

  async getPermissionsForRole(role: string): Promise<string[]> {
    const map = await this.loadMap();
    return Array.from(map.get(role) ?? []);
  }

  async getRolePermissionsMap(): Promise<Record<string, string[]>> {
    const map = await this.loadMap();
    const result: Record<string, string[]> = {};
    for (const [role, perms] of map.entries()) {
      result[role] = Array.from(perms);
    }
    return result;
  }

  async hasPermission(role: string, permission: string): Promise<boolean> {
    const map = await this.loadMap();
    return map.get(role)?.has(permission) ?? false;
  }

  async hasAnyPermission(role: string, permissions: string[]): Promise<boolean> {
    const map = await this.loadMap();
    const granted = map.get(role);
    if (!granted) return false;
    return permissions.some((p) => granted.has(p));
  }

  async updateRolePermissions(
    role: string,
    permissionsDelta: Record<string, boolean>,
  ): Promise<{ role: string; updatedCount: number }> {
    let updatedCount = 0;
    for (const [permission, grant] of Object.entries(permissionsDelta)) {
      if (grant) {
        await this.prisma.rolePermission.upsert({
          where: { role_permission: { role, permission } },
          create: { role, permission },
          update: {},
        });
        updatedCount++;
      } else {
        await this.prisma.rolePermission.deleteMany({
          where: { role, permission },
        });
        updatedCount++;
      }
    }
    this.invalidateCache();
    return { role, updatedCount };
  }
}
