'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  Check,
  AlertTriangle,
  Info,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  Smartphone,
  X,
  Zap,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { isPushNotificationSupported, subscribeToPushNotifications } from '@/lib/push-notifications';
import { getSubmitTarget } from '@/lib/action-registry';
import { useUiStore } from '@/lib/ui-store';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: 'informational' | 'action_required' | 'warning' | 'success' | 'error' | 'system';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  sourceModule?: string | null;
  sourceEntity?: string | null;
  sourceId?: string | null;
  actions?: Array<{ id: string; label: string; action?: string; url?: string }> | null;
  readAt?: string | null;
  createdAt: string;
}

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [pushStatusMsg, setPushStatusMsg] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  // 1. Fetch live unread count
  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => apiClient.get('data/notifications/unread-count'),
    refetchInterval: 15000,
  });

  const unreadCount = unreadData?.count ?? 0;

  // 2. Fetch recent notifications
  const { data: listData, isLoading } = useQuery<{ items: NotificationItem[]; total: number; unread: number }>({
    queryKey: ['notifications', 'list', filter],
    queryFn: () =>
      apiClient.get(`data/notifications?limit=25${filter === 'unread' ? '&unreadOnly=true' : ''}`),
    enabled: open,
  });

  const items = listData?.items ?? [];

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  // Mutations: Mark single read
  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`actions/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Mutations: Mark all read
  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.post('actions/notifications/mark-all-read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleEnablePush = async () => {
    setPushStatusMsg('Requesting push permission…');
    const res = await subscribeToPushNotifications();
    setPushStatusMsg(res.message || (res.success ? 'Push enabled!' : 'Failed to enable push'));
    setTimeout(() => setPushStatusMsg(null), 4000);
  };

  const handleItemClick = (item: NotificationItem) => {
    if (!item.readAt) {
      markReadMutation.mutate(item.id);
    }
    const firstAction = item.actions?.[0];
    if (firstAction?.url) {
      setOpen(false);
      router.push(firstAction.url);
    } else if ((item as any).link) {
      setOpen(false);
      router.push((item as any).link);
    } else if (item.sourceModule) {
      setOpen(false);
      const url = `/app/${item.sourceModule}${item.sourceId ? `?record=${item.sourceId}` : ''}`;
      router.push(url);
    }
  };

  const handleTriggerTestAlert = async () => {
    try {
      useUiStore.getState().pushToast('Dispatching test alert…');
      const target = getSubmitTarget('notifications.test-sample');
      await target.execute({});
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      useUiStore.getState().pushToast('Test alert triggered! Click the notification to test deep linking.', 'success');
    } catch (err) {
      useUiStore.getState().pushToast(err instanceof Error ? err.message : 'Failed to trigger test alert', 'error');
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'action_required':
        return <AlertTriangle size={15} color="#f59e0b" />;
      case 'warning':
        return <AlertTriangle size={15} color="#f97316" />;
      case 'success':
        return <CheckCircle2 size={15} color="#10b981" />;
      case 'error':
        return <ShieldAlert size={15} color="#ef4444" />;
      case 'system':
        return <ShieldAlert size={15} color="#8b5cf6" />;
      default:
        return <Info size={15} color="#3b82f6" />;
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          border: 'none',
          background: open ? 'var(--surface-3)' : 'transparent',
          color: unreadCount > 0 || open ? 'var(--accent-indigo)' : 'var(--text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          transition: 'all 0.15s ease',
        }}
        title="Notifications"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 8,
              background: '#ef4444',
              color: '#ffffff',
              fontSize: 10,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 0 2px var(--surface)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 380,
            maxHeight: 520,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.22), 0 4px 12px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface-2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: 'var(--badge-primary-bg)',
                    color: 'var(--accent-indigo)',
                  }}
                >
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-indigo)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: 6,
                  }}
                  title="Mark all notifications as read"
                >
                  <CheckCheck size={14} />
                  <span>Mark all read</span>
                </button>
              )}
            </div>
          </div>

          {/* Push alert opt-in bar */}
          {isPushNotificationSupported() && (
            <div
              style={{
                padding: '8px 14px',
                background: 'rgb(from var(--accent-indigo) r g b / 0.08)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <Smartphone size={13} style={{ color: 'var(--accent-indigo)' }} />
                <span>Desktop & PWA Push Alerts</span>
              </div>
              <button
                onClick={handleEnablePush}
                style={{
                  background: 'var(--accent-indigo)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {pushStatusMsg ?? 'Enable Push'}
              </button>
            </div>
          )}

          {/* Filter Tabs */}
          <div
            style={{
              display: 'flex',
              padding: '6px 12px',
              gap: 6,
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                fontWeight: filter === 'all' ? 700 : 500,
                background: filter === 'all' ? 'var(--surface-3)' : 'transparent',
                color: filter === 'all' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                fontWeight: filter === 'unread' ? 700 : 500,
                background: filter === 'unread' ? 'var(--surface-3)' : 'transparent',
                color: filter === 'unread' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
            >
              Unread only
            </button>
          </div>

          {/* List Content */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 340 }}>
            {isLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                Loading notifications…
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    background: 'var(--surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px auto',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  <Bell size={20} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                  No notifications
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {filter === 'unread' ? 'You are all caught up!' : 'No notifications received yet.'}
                </div>
              </div>
            ) : (
              items.map((item) => {
                const isUnread = !item.readAt;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    style={{
                      padding: '12px 14px',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      borderBottom: '1px solid var(--border)',
                      background: isUnread ? 'rgb(from var(--accent-indigo) r g b / 0.04)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isUnread
                        ? 'rgb(from var(--accent-indigo) r g b / 0.08)'
                        : 'var(--surface-2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isUnread
                        ? 'rgb(from var(--accent-indigo) r g b / 0.04)'
                        : 'transparent';
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: 'var(--surface-2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      {getTypeIcon(item.type)}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: isUnread ? 700 : 500,
                          color: 'var(--text-primary)',
                          marginBottom: 2,
                        }}
                      >
                        {item.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          lineHeight: 1.4,
                          wordBreak: 'break-word',
                        }}
                      >
                        {item.body}
                      </div>

                      {/* Optional Action Button */}
                      {item.actions && item.actions.length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                          {item.actions.map((act) => (
                            <button
                              key={act.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!item.readAt) markReadMutation.mutate(item.id);
                                if (act.url) {
                                  setOpen(false);
                                  router.push(act.url);
                                }
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '3px 8px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--surface-2)',
                                color: 'var(--text-primary)',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              <span>{act.label}</span>
                              <ExternalLink size={11} />
                            </button>
                          ))}
                        </div>
                      )}

                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--text-tertiary)',
                          marginTop: 4,
                        }}
                      >
                        {timeAgo(item.createdAt)}
                      </div>
                    </div>

                    {isUnread && (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: 'var(--accent-indigo)',
                          flexShrink: 0,
                          marginTop: 6,
                        }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
            }}
          >
            <button
              onClick={handleTriggerTestAlert}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-indigo)',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
              title="Dispatch a live sample notification to test in-app and push delivery"
            >
              <Zap size={13} style={{ color: '#f59e0b' }} />
              Trigger Test Alert
            </button>
            <button
              onClick={() => {
                setOpen(false);
                router.push('/admin/notifications');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Settings & Channels →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
