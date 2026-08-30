import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Declares the permission(s) an endpoint requires. Any one of the listed
 * permissions is sufficient. This is enforced by PermissionsGuard on the
 * server — SDUI visibility must never substitute for this (stack.md §16).
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
