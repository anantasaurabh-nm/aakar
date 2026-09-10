'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Bell, ChevronDown, PenSquare, Search, Settings, Sparkles } from 'lucide-react';
import type { SDUIBrand, SDUINavigation, SDUINavigationItem } from '@erp/shared-contracts';
import { resolveIcon } from '@/lib/icon-registry';
import { useUiStore } from '@/lib/ui-store';
import { UserMenu } from './UserMenu';

function NavDropdownItem({
  item,
  currentPath,
  onAction,
}: {
  item: SDUINavigationItem;
  currentPath: string;
  onAction: (item: SDUINavigationItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const IconComponent = item.icon ? resolveIcon(item.icon) : null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const hasActiveChild = Boolean(
    item.items?.some(
      (sub) =>
        sub.action?.target &&
        (currentPath === sub.action.target ||
          (sub.action.target.startsWith('/app/') && currentPath.startsWith(sub.action.target))),
    ),
  );

  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          color: open || hasActiveChild
            ? 'var(--accent-indigo)'
            : hovered
            ? 'var(--text-primary)'
            : 'var(--text-secondary)',
          background: open || hasActiveChild
            ? 'var(--badge-primary-bg)'
            : hovered
            ? 'var(--surface-3)'
            : 'var(--surface-2)',
          border: open || hasActiveChild
            ? '1px solid rgb(from var(--accent-indigo) r g b / 0.25)'
            : '1px solid transparent',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap',
        }}
        title={item.label}
      >
        {IconComponent && (
          <IconComponent
            size={14}
            style={{
              color: open || hasActiveChild ? 'var(--accent-indigo)' : hovered ? 'var(--text-primary)' : 'var(--text-tertiary)',
              flexShrink: 0,
            }}
          />
        )}
        <span>{item.label}</span>
        <ChevronDown
          size={13}
          style={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
            color: 'var(--text-tertiary)',
          }}
        />
      </button>

      {open && item.items && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 100,
            minWidth: 200,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.14), 0 4px 12px rgba(15, 23, 42, 0.08)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {item.items.map((sub) => {
            const SubIcon = sub.icon ? resolveIcon(sub.icon) : null;
            const isSubActive =
              sub.action?.target &&
              (currentPath === sub.action.target ||
                (sub.action.target.startsWith('/app/') && currentPath.startsWith(sub.action.target)));

            return (
              <button
                key={sub.id}
                onClick={() => {
                  setOpen(false);
                  onAction(sub);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '7px 10px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: isSubActive ? 600 : 500,
                  color: isSubActive ? 'var(--accent-indigo)' : 'var(--text-primary)',
                  background: isSubActive ? 'var(--badge-primary-bg)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSubActive) e.currentTarget.style.background = 'var(--surface-2)';
                }}
                onMouseLeave={(e) => {
                  if (!isSubActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {SubIcon && (
                    <SubIcon
                      size={14}
                      style={{
                        color: isSubActive ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.label}</span>
                </div>
                {sub.badge !== undefined && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: 'var(--surface-3)',
                      color: 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    {sub.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NavLinkItem({
  item,
  currentPath,
  onAction,
}: {
  item: SDUINavigationItem;
  currentPath: string;
  onAction: (item: SDUINavigationItem) => void;
}) {
  if (item.items && item.items.length > 0) {
    return <NavDropdownItem item={item} currentPath={currentPath} onAction={onAction} />;
  }

  const [hovered, setHovered] = useState(false);
  const IconComponent = item.icon ? resolveIcon(item.icon) : null;
  const target = item.action?.target;
  const isExactActive = target ? currentPath === target : false;
  const isAppActive =
    target && target.startsWith('/app/')
      ? currentPath.startsWith(target)
      : isExactActive;

  return (
    <button
      key={item.id}
      onClick={() => onAction(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        color: isAppActive
          ? 'var(--accent-indigo)'
          : hovered
          ? 'var(--text-primary)'
          : 'var(--text-secondary)',
        background: isAppActive
          ? 'var(--badge-primary-bg)'
          : hovered
          ? 'var(--surface-3)'
          : 'var(--surface-2)',
        border: isAppActive
          ? '1px solid rgb(from var(--accent-indigo) r g b / 0.25)'
          : '1px solid transparent',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
      title={item.label}
    >
      {IconComponent && (
        <IconComponent
          size={14}
          style={{
            color: isAppActive ? 'var(--accent-indigo)' : hovered ? 'var(--text-primary)' : 'var(--text-tertiary)',
            flexShrink: 0,
          }}
        />
      )}
      <span>{item.label}</span>
      {item.badge !== undefined && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 6,
            background: 'var(--surface-3)',
            color: 'var(--text-secondary)',
            marginLeft: 2,
          }}
        >
          {item.badge}
        </span>
      )}
    </button>
  );
}

export function Header({ brand, navigation }: { brand: SDUIBrand; navigation: SDUINavigation }) {
  const router = useRouter();
  const pathname = usePathname();
  const setAiPanelOpen = useUiStore((s) => s.setAiPanelOpen);
  const aiPanelOpen = useUiStore((s) => s.aiPanelOpen);
  const setCopilotPage = useUiStore((s) => s.setCopilotPage);
  const Icon = resolveIcon(brand.icon);

  function handleNavAction(item: SDUINavigationItem) {
    const { action } = item;
    if (!action) return;

    if (action.confirm) {
      const ok = window.confirm(action.confirm.message);
      if (!ok) return;
    }

    if (action.type === 'navigate' && action.target) {
      if (action.target.startsWith('http://') || action.target.startsWith('https://')) {
        window.open(action.target, '_blank', 'noopener,noreferrer');
      } else if (action.target.startsWith('#')) {
        const targetId = action.target.slice(1);
        window.dispatchEvent(new CustomEvent('activate-section', { detail: { sectionId: targetId } }));
        const el = document.getElementById(targetId);
        el?.scrollIntoView({ behavior: 'smooth' });
      } else if (action.target.startsWith('/')) {
        router.push(action.target);
      } else {
        router.push(`/app/${action.target}`);
      }
    } else if (action.type === 'create' && action.target) {
      const parts = action.target.split('.');
      const sectionKey = parts.length === 3 ? `${parts[1]}-form` : action.target;
      window.dispatchEvent(new CustomEvent('activate-section', { detail: { sectionId: sectionKey } }));
    } else if (action.type === 'refresh') {
      window.location.reload();
    }
  }

  return (
    <header
      style={{
        position: 'relative',
        zIndex: 50,
        height: 'var(--header-height)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <div
          onClick={() => {
            setCopilotPage(null);
            router.push('/');
          }}
          style={{
            width: 26,
            height: 26,
            borderRadius: 4,
            background: 'var(--accent-indigo-dark)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Icon size={18} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 style={{ fontSize: 17, fontWeight: 800, margin: 0, whiteSpace: 'nowrap' }}>{brand.name}</h1>
          {brand.hasSettings && (
            <button
              onClick={() => {
                const modId = brand.moduleId || (pathname ? pathname.split('/')[2] : undefined);
                if (modId) {
                  router.push(`/app/${modId}?view=settings`);
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: pathname?.includes('view=settings') ? 'var(--badge-primary-bg)' : 'var(--surface-2)',
                color: pathname?.includes('view=settings') ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={`${brand.name} Settings`}
            >
              <Settings size={14} />
            </button>
          )}
        </div>

        {navigation.items.length > 0 && (
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
            {navigation.items.map((item) => (
              <NavLinkItem
                key={item.id}
                item={item}
                currentPath={pathname || ''}
                onAction={handleNavAction}
              />
            ))}
          </nav>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <div style={{ position: 'relative', display: 'none' }}>
          <Search size={14} />
        </div>
        <IconButton label="Notifications" onClick={() => { }}>
          <Bell size={17} />
        </IconButton>
        <IconButton label="Compose" onClick={() => { }}>
          <PenSquare size={17} />
        </IconButton>
        <IconButton label="Settings" onClick={() => { }}>
          <Settings size={17} />
        </IconButton>
        <button
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
          aria-label="DOERS Copilot"
          style={{
            width: 34,
            height: 34,
            borderRadius: '4px',
            border: aiPanelOpen ? '1px solid rgb(from var(--accent-indigo) r g b / 0.25)' : '1px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: aiPanelOpen ? 'rgb(from var(--accent-indigo) r g b / 0.15)' : 'transparent',
            color: aiPanelOpen ? 'var(--accent-indigo)' : 'var(--accent-indigo)',
          }}
        >
          <Sparkles size={17} />
        </button>

        <UserMenu />
      </div>
    </header>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}
