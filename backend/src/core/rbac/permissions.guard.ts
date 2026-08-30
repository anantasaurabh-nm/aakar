import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from './require-permissions.decorator';
import { PermissionsService } from './permissions.service';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

/**
 * Backend authorization boundary. Every protected endpoint independently
 * verifies authentication + permission here — never trusts frontend/SDUI
 * visibility (stack.md §16.5, SDUI PRD §13).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) throw new UnauthorizedException('Authentication required');

    const allowed = await this.permissionsService.hasAnyPermission(user.role, required);
    if (!allowed) {
      throw new ForbiddenException(`Missing required permission: ${required.join(' or ')}`);
    }
    return true;
  }
}
