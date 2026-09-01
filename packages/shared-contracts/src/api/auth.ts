import { z } from 'zod';

/**
 * Platform roles. Roles are a coarse grouping; the actual authorization
 * decision is always made against fine-grained permission strings
 * (e.g. "todo.read") resolved server-side — never trust a client-supplied role.
 */
export const SystemRoleEnum = z.enum([
  'SUPER_ADMIN', // platform admin — cross-tenant
  'TENANT_ADMIN', // admin within their own tenant
  'MANAGER',
  'STAFF',
  'VIEWER',
]);
export type SystemRole = z.infer<typeof SystemRoleEnum>;

export const RoleSchema = z.string().min(1);
export type Role = z.infer<typeof RoleSchema>;

export const LoginRequestSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * The server-trusted identity attached to every authenticated request.
 * Never derived from client-supplied headers/body (stack.md §17).
 */
export interface SessionUser {
  id: string;
  tenantId: string;
  email: string;
  username: string;
  role: Role;
  permissions: string[];
  avatarUrl?: string | null;
}

export interface LoginResponse {
  user: SessionUser;
}
