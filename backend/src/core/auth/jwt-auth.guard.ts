import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthenticatedUser, JwtPayload } from './authenticated-user.interface';

export const AUTH_COOKIE_NAME = 'doers_session';

/**
 * Resolves the trusted identity from the signed session cookie only.
 * Never trusts a client-supplied userId/tenantId/role in headers or body
 * (stack.md §17).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = request.cookies?.[AUTH_COOKIE_NAME];
    if (!token) throw new UnauthorizedException('Not authenticated');

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      request.user = {
        id: payload.sub,
        tenantId: payload.tenantId,
        email: payload.email,
        username: payload.username,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }
}
