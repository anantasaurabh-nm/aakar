import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CapabilityDescriptor, CapabilityResult } from '@erp/shared-contracts';
import { PermissionsService } from '../rbac/permissions.service';
import { ModuleRegistryService } from '../modules-registry/module-registry.service';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

export type CapabilityHandler = (
  params: Record<string, unknown>,
  ctx: { user: AuthenticatedUser },
) => Promise<CapabilityResult>;

interface RegisteredCapability {
  descriptor: CapabilityDescriptor;
  handler: CapabilityHandler;
}

/**
 * Flat registry of concrete, named operations the AI Orchestrator discovers
 * and invokes (Architecture Amendment 01 §5) — replaces the earlier
 * per-module "Agent + Skills" model. Capabilities are generated
 * automatically for schema-driven entities (EntityRegistryService) and may
 * also be registered by custom code for domain logic generic CRUD can't
 * express.
 */
@Injectable()
export class CapabilityRegistry {
  private readonly capabilities = new Map<string, RegisteredCapability>();

  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly moduleRegistry: ModuleRegistryService,
  ) {}

  register(descriptor: CapabilityDescriptor, handler: CapabilityHandler): void {
    this.capabilities.set(descriptor.id, { descriptor, handler });
  }

  list(): CapabilityDescriptor[] {
    return Array.from(this.capabilities.values()).map((c) => c.descriptor);
  }

  /** Simple keyword match over id+description — sufficient discovery for V1 (Amendment 01 §11). */
  find(query: string): CapabilityDescriptor[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.list().filter((c) => {
      const haystack = `${c.id} ${c.description}`.toLowerCase();
      return terms.some((t) => haystack.includes(t));
    });
  }

  /**
   * Execution path: Orchestrator → Capability Registry → Authorization →
   * Module (Amendment 01 §5, §14). The model never reaches the database
   * directly.
   */
  async execute(id: string, params: Record<string, unknown>, user: AuthenticatedUser): Promise<CapabilityResult> {
    const capability = this.capabilities.get(id);
    if (!capability) throw new NotFoundException(`Unknown capability: ${id}`);

    const enabled = await this.moduleRegistry.isEnabled(capability.descriptor.module);
    if (!enabled) throw new NotFoundException(`Unknown capability: ${id}`);

    const allowed = await this.permissionsService.hasPermission(user.role, capability.descriptor.requiredPermission);
    if (!allowed) {
      throw new ForbiddenException(`Missing required permission: ${capability.descriptor.requiredPermission}`);
    }

    return capability.handler(params, { user });
  }
}
