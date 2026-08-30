import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import type { SessionUser } from '@erp/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../rbac/permissions.service';
import type { JwtPayload } from './authenticated-user.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async validateCredentials(identifier: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [{ email: identifier }, { username: identifier }],
      },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return user;
  }

  async issueToken(user: { id: string; tenantId: string; email: string; username: string; role: JwtPayload['role'] }) {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      username: user.username,
      role: user.role,
    };
    return this.jwtService.signAsync(payload);
  }

  async toSessionUser(user: {
    id: string;
    tenantId: string;
    email: string;
    username: string;
    role: JwtPayload['role'];
    avatarUrl: string | null;
  }): Promise<SessionUser> {
    const permissions = await this.permissionsService.getPermissionsForRole(user.role);
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      username: user.username,
      role: user.role,
      permissions,
      avatarUrl: user.avatarUrl,
    };
  }
}
