import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * The only place raw text is ever spliced into SQL in this engine. Only
 * ever called with identifiers that already passed `IDENT_RE` validation
 * when their owning module/entity/field was registered — never with a
 * client-supplied value. Always double-quoted so a validated-but-reserved
 * word (`order`, `user`, `references`) can never break as a bare
 * identifier.
 */
export function ident(name: string): Prisma.Sql {
  if (!IDENT_RE.test(name)) {
    throw new BadRequestException(`Invalid identifier "${name}"`);
  }
  return Prisma.raw(`"${name}"`);
}

export function isValidIdentifier(name: string): boolean {
  return IDENT_RE.test(name);
}

export function tableName(moduleId: string, entity: string): string {
  return `${moduleId.replace(/-/g, '_')}_${entity.replace(/-/g, '_')}`;
}
