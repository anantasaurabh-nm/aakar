import {
  AppWindow,
  Bot,
  Boxes,
  CheckSquare,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Controlled icon registry (SDUI PRD §5). The server sends an opaque icon
 * key; unknown keys resolve to a safe default instead of failing.
 */
const REGISTRY: Record<string, LucideIcon> = {
  'doers-os': ShieldCheck,
  todo: CheckSquare,
  users: Users,
  modules: Boxes,
  ai: Bot,
  app: AppWindow,
};

export function resolveIcon(key?: string): LucideIcon {
  if (!key) return LayoutGrid;
  return REGISTRY[key] ?? LayoutGrid;
}

export { Sparkles };
