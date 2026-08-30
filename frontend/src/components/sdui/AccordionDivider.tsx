'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export interface AccordionDividerProps {
  label: string;
  isCollapsed?: boolean;
  onClick?: (() => void) | null;
  badge?: string | number;
  badgeType?: 'primary' | 'success' | 'warning' | 'accent';
}

export function AccordionDivider({ label, isCollapsed = true, onClick, badge, badgeType }: AccordionDividerProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Switch to section ${label}` : label}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: 32,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        background: 'var(--divider-bg)',
        transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
        borderTop: isCollapsed ? '1px solid var(--border-subtle)' : 'none',
        borderBottom: isCollapsed ? '1px solid var(--border-subtle)' : 'none',
        position: 'relative',
        zIndex: 10,
      }}
    >
      <div
        style={{
          flex: 1,
          height: hovered ? 2 : 1,
          background: hovered
            ? 'linear-gradient(to right, transparent, var(--accent-indigo), var(--accent-cyan))'
            : 'linear-gradient(to right, transparent, var(--border-subtle))',
          opacity: isCollapsed ? (hovered ? 0.9 : 0.45) : 0.8,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 18px',
          color: hovered || !isCollapsed ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {onClick && isCollapsed && (
          <ChevronDown size={13} style={{ color: hovered ? 'var(--accent-cyan)' : 'var(--accent-indigo)' }} />
        )}
        <span>{label}</span>
        {badge !== undefined && <Badge tone={badgeType}>{badge}</Badge>}
      </div>
      <div
        style={{
          flex: 1,
          height: hovered ? 2 : 1,
          background: hovered
            ? 'linear-gradient(to left, transparent, var(--accent-indigo), var(--accent-cyan))'
            : 'linear-gradient(to left, transparent, var(--border-subtle))',
          opacity: isCollapsed ? (hovered ? 0.9 : 0.45) : 0.8,
        }}
      />
    </div>
  );
}
