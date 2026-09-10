import { existsSync } from 'node:fs';
import path from 'node:path';

function resolveModulesDir(): string {
  const candidate1 = path.resolve(process.cwd(), 'modules');
  if (existsSync(candidate1)) return candidate1;

  const candidate2 = path.resolve(process.cwd(), '..', 'modules');
  if (existsSync(candidate2)) return candidate2;

  const candidate3 = path.resolve(__dirname, '../../../../modules');
  if (existsSync(candidate3)) return candidate3;

  return candidate1;
}

export const MODULES_DIR = resolveModulesDir();

