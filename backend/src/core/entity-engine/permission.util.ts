import type { RecordStatus } from '@prisma/client';

/** Mirrors the semantics `todo.approve`/`todo.delete`/`todo.update` had before generalization. */
export function permissionForTransition(moduleId: string, entityKey: string, to: RecordStatus): string {
  if (to === 'approved') return `${moduleId}.${entityKey}.approve`;
  if (to === 'deleted') return `${moduleId}.${entityKey}.delete`;
  return `${moduleId}.${entityKey}.update`;
}
