import type { CSSProperties } from 'react';

type Tone = 'primary' | 'success' | 'warning' | 'accent' | 'neutral' | 'danger';

const TONES: Record<Tone, CSSProperties> = {
  primary: { background: 'var(--badge-primary-bg)', color: 'var(--badge-primary-text)', borderColor: 'var(--badge-primary-border)' },
  success: { background: 'var(--badge-success-bg)', color: 'var(--badge-success-text)', borderColor: 'var(--badge-success-border)' },
  warning: { background: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', borderColor: 'var(--badge-warning-border)' },
  accent: { background: 'rgba(6, 182, 212, 0.12)', color: '#0e7490', borderColor: 'rgba(6, 182, 212, 0.3)' },
  neutral: { background: 'var(--surface-2)', color: 'var(--text-secondary)', borderColor: 'var(--border)' },
  danger: { background: 'rgba(239, 68, 68, 0.12)', color: '#b91c1c', borderColor: 'rgba(239, 68, 68, 0.3)' },
};

const VALUE_TONES: Record<string, Tone> = {
  SUPER_ADMIN: 'primary',
  TENANT_ADMIN: 'accent',
  MANAGER: 'success',
  STAFF: 'primary',
  VIEWER: 'warning',
  draft: 'neutral',
  submitted: 'accent',
  approved: 'success',
  cancelled: 'warning',
  deleted: 'danger',
  LOW: 'neutral',
  MEDIUM: 'primary',
  HIGH: 'warning',
  URGENT: 'danger',
  enabled: 'success',
  disabled: 'neutral',
  native: 'primary',
  connector: 'accent',
  hybrid: 'success',
  Active: 'success',
  Fallback: 'warning',
  Disabled: 'neutral',
};

export function Badge({ children, tone }: { children: React.ReactNode; tone?: Tone }) {
  const resolvedTone = tone ?? (typeof children === 'string' ? VALUE_TONES[children] : undefined) ?? 'neutral';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        border: '1px solid',
        whiteSpace: 'nowrap',
        ...TONES[resolvedTone],
      }}
    >
      {children}
    </span>
  );
}
