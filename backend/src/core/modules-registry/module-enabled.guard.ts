import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { ModuleRegistryService } from './module-registry.service';

/**
 * A disabled module's routes must genuinely disappear, not just be hidden
 * from discovery menus (Module System PRD v2 §37-38). 404 rather than 403:
 * from the caller's perspective a disabled module is absent, not "there but
 * forbidden" — that distinction shouldn't leak to an unauthorized caller.
 *
 * Reads the module id straight from the `:module` route param — every
 * schema-driven route goes through the generic entity engine controller, so
 * there's no need for a separate per-controller decorator.
 */
@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const moduleId = request.params?.module;
    if (!moduleId) return true;

    const enabled = await this.moduleRegistry.isEnabled(moduleId);
    if (!enabled) throw new NotFoundException('Not found');
    return true;
  }
}
