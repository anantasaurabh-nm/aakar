import { Controller, Get, UseGuards } from '@nestjs/common';
import { SDUI_SCHEMA_VERSION, type ModuleDiscoveryEntry } from '@erp/shared-contracts';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../core/auth/authenticated-user.interface';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ModuleRegistryService } from '../../core/modules-registry/module-registry.service';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'TENANT_ADMIN']);

@Controller()
@UseGuards(JwtAuthGuard)
export class HomeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRegistry: ModuleRegistryService,
  ) {}

  @Get('ui/pages/home')
  getHomePage() {
    return {
      schema: SDUI_SCHEMA_VERSION,
      brand: { name: 'DoersOS', icon: 'doers-os' },
      navigation: { items: [] },
      page: {
        id: 'home',
        title: 'DoersOS',
        sections: [
          {
            id: 'home-insights',
            label: 'Insights',
            type: 'dashboard',
            toolbar: [],
            data: { source: 'home.dashboard' },
            config: { cards: [], charts: [] },
          },
          {
            id: 'home-apps',
            label: 'Apps',
            type: 'table',
            toolbar: [],
            data: { source: 'apps' },
            config: {
              columns: [
                { key: 'name', label: 'App', type: 'text', sortable: true },
                { key: 'description', label: 'Description', type: 'text', sortable: false },
              ],
              selectable: false,
              pageSize: 50,
              density: 'comfortable',
              presentation: 'grid',
            },
          },
        ],
      },
    };
  }

  @Get('data/apps')
  async getApps(): Promise<ModuleDiscoveryEntry[]> {
    return this.moduleRegistry.discoverBySurface('app');
  }

  @Get('data/admin-tools')
  async getAdminTools(@CurrentUser() user: AuthenticatedUser): Promise<ModuleDiscoveryEntry[]> {
    // Discovery filtering only — every admin endpoint independently enforces
    // its own authorization regardless of what this list returns
    // (Module Surfaces PRD §7).
    if (!ADMIN_ROLES.has(user.role)) return [];
    return this.moduleRegistry.discoverBySurface('admin');
  }

  /**
   * Platform-level stats only — Home is Core and must not reach into a
   * specific module's data (that would be exactly the kind of cross-module
   * coupling this architecture exists to avoid).
   */
  @Get('data/home/dashboard')
  async getHomeDashboard(@CurrentUser() user: AuthenticatedUser) {
    const [users, apps, adminTools] = await Promise.all([
      this.prisma.user.count({ where: { tenantId: user.tenantId, isActive: true } }),
      this.moduleRegistry.discoverBySurface('app'),
      this.moduleRegistry.discoverBySurface('admin'),
    ]);

    return {
      cards: [
        { id: 'users', label: 'Active Users', value: users, accent: 'indigo' },
        { id: 'apps', label: 'Installed Apps', value: apps.length, accent: 'cyan' },
        { id: 'admin-tools', label: 'Admin Tools', value: adminTools.length, accent: 'emerald' },
      ],
      charts: [],
    };
  }
}
