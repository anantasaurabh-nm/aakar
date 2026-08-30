import { Role } from '@prisma/client';

/** The server-trusted identity attached to `request.user` by JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  email: string;
  username: string;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  username: string;
  role: Role;
}
