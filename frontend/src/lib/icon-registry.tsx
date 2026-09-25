import {
  Activity,
  AppWindow,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  CheckSquare,
  Compass,
  Database,
  ExternalLink,
  FileText,
  Folder,
  Home,
  Layout,
  LayoutGrid,
  Layers,
  Mail,
  MessageSquare,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Zap,
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
  'user-management': Users,
  'user-roles': ShieldCheck,
  shield: ShieldCheck,
  roles: ShieldCheck,
  modules: Boxes,
  ai: Bot,
  app: AppWindow,
  sparkles: Sparkles,
  home: Home,
  notes: FileText,
  note: FileText,
  doc: FileText,
  'file-text': FileText,
  database: Database,
  datasources: Database,
  layout: Layout,
  views: Layout,
  settings: Settings,
  admin: Settings,
  layers: Layers,
  compass: Compass,
  folder: Folder,
  activity: Activity,
  'external-link': ExternalLink,
  'book-open': BookOpen,
  bell: Bell,
  notifications: Bell,
  'test-notifications': Bell,
  mail: Mail,
  email: Mail,
  'message-square': MessageSquare,
  'message-circle': MessageSquare,
  whatsapp: MessageSquare,
  smartphone: Smartphone,
  sms: Smartphone,
  push: Smartphone,
  send: Send,
  all: Send,
  zap: Zap,
};

export function resolveIcon(key?: string): LucideIcon {
  if (!key) return LayoutGrid;
  return REGISTRY[key] ?? LayoutGrid;
}

export { Sparkles };
