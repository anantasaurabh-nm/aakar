'use client';

import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { SettingsSectionSchema, SettingsGroup } from '@erp/shared-contracts';
import type { z } from 'zod';
import { DynamicForm } from './DynamicForm';
import { Badge } from '@/components/ui/Badge';
import { getSubmitTarget } from '@/lib/action-registry';
import { useUiStore } from '@/lib/ui-store';

type SettingsSection = z.infer<typeof SettingsSectionSchema>;

/**
 * Settings surface (SDUI section type).
 *
 * Full-width top toolbar matching RecordView standard:
 *   - Left: Back button (square icon button) + Save button (with Check icon + 'Save' text).
 *   - Right: Status badge + Dropdown button to change status along with Delete.
 *
 * Underneath the toolbar:
 *   - Left rail: Vertical tab buttons.
 *   - Main pane: List of groups for the active tab or single-record form editor.
 */
export function SettingsView({ section }: { section: SettingsSection }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const tabs = section.config.tabs;
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const selectedGroup = activeTab?.groups.find((g) => g.id === selectedGroupId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  function selectTab(id: string) {
    setActiveTabId(id);
    setSelectedGroupId(null);
    setDropdownOpen(false);
  }

  function backToList() {
    setSelectedGroupId(null);
    setDropdownOpen(false);
  }

  function onSaved() {
    queryClient.invalidateQueries({ queryKey: ['ui'] });
    backToList();
  }

  async function onDelete(group: SettingsGroup) {
    if (!group.deleteAction) return;
    if (group.deleteAction.confirm && !window.confirm(group.deleteAction.confirm.message)) return;
    const id = group.fields.find((f) => f.name === 'id')?.defaultValue;
    try {
      const target = getSubmitTarget(group.deleteAction.target);
      await target.execute({ id });
      pushToast('Deleted successfully.');
      onSaved();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to delete', 'error');
    }
  }

  const statusField = selectedGroup?.fields.find((f) => f.name === 'status');
  const statusOptions = statusField?.options ?? [];
  const currentStatusValue = statusField?.defaultValue as string | undefined;
  const currentBadge =
    selectedGroup?.badge ??
    statusOptions.find((o) => o.value === currentStatusValue)?.label ??
    currentStatusValue;

  async function changeStatus(newStatus: string) {
    if (!selectedGroup) return;
    setDropdownOpen(false);
    if (newStatus === currentStatusValue) return;

    try {
      const target = getSubmitTarget(selectedGroup.submitAction.target);
      const payload: Record<string, unknown> = {};
      for (const f of selectedGroup.fields) {
        if (f.defaultValue !== undefined) {
          payload[f.name] = f.defaultValue;
        }
      }
      payload.status = newStatus;
      for (const f of selectedGroup.fields) {
        if (f.secret && !payload[f.name]) {
          delete payload[f.name];
        }
      }
      await target.execute(payload);
      const label = statusOptions.find((o) => o.value === newStatus)?.label ?? newStatus;
      pushToast(`Status changed to ${label}.`);
      onSaved();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to change status', 'error');
    }
  }

  if (!activeTab) return null;

  const formId = selectedGroup ? `settings-${selectedGroup.id}` : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* 1. Full-Width Top Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          minHeight: 58,
          flexShrink: 0,
        }}
      >
        {/* Left: Back button + Save button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selectedGroup ? (
            <>
              <button
                key="back-btn"
                type="button"
                onClick={backToList}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
                title="Back"
              >
                <ArrowLeft size={16} />
              </button>

              <button
                key="save-btn"
                type="submit"
                form={formId}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--accent-indigo-dark)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                }}
                title="Save changes"
              >
                <Check size={15} strokeWidth={2.5} />
                <span>Save</span>
              </button>
            </>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {activeTab.label}
            </span>
          )}
        </div>

        {/* Right: Status badge + Dropdown button to change status along with Delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {selectedGroup && (
            <>
              {currentBadge && <Badge>{currentBadge}</Badge>}

              {(!selectedGroup.isCreate || selectedGroup.deleteAction) && (
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen((prev) => !prev)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'var(--accent-indigo-dark)',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                    title="Change status or delete"
                  >
                    <span>Status</span>
                    <ChevronDown size={14} />
                  </button>

                  {dropdownOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        right: 0,
                        zIndex: 50,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                        padding: 6,
                        minWidth: 160,
                      }}
                    >
                      {statusOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => changeStatus(opt.value)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 6,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--surface-2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <span>{opt.label}</span>
                          {currentStatusValue === opt.value && <Check size={14} style={{ color: 'var(--accent-indigo)' }} />}
                        </button>
                      ))}

                      {selectedGroup.deleteAction && statusOptions.length > 0 && (
                        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                      )}

                      {selectedGroup.deleteAction && (
                        <button
                          key="delete-action"
                          type="button"
                          onClick={() => {
                            setDropdownOpen(false);
                            onDelete(selectedGroup);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 6,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--accent-red)',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--badge-danger-bg, rgba(239, 68, 68, 0.1))';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 2. Main Content Area: Vertical Tabs Rail + Content Panel */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left: Vertical Tab Rail */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            padding: '20px 12px',
            overflowY: 'auto',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                borderRadius: 8,
                border: 'none',
                marginBottom: 4,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
                background: tab.id === activeTab.id ? 'var(--accent-indigo)' : 'transparent',
                color: tab.id === activeTab.id ? '#fff' : 'var(--text-secondary)',
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: Content Pane */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 24 }}>
          {selectedGroup ? (
            <div style={{ maxWidth: 480 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {selectedGroup.label}
              </h3>
              {selectedGroup.description && (
                <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {selectedGroup.description}
                </p>
              )}
              <DynamicForm
                config={{ fields: selectedGroup.fields, submitAction: selectedGroup.submitAction }}
                hideButtons
                formId={formId}
                onCancel={backToList}
                onSuccess={onSaved}
              />
            </div>
          ) : (
            <div style={{ maxWidth: 560 }}>
              {activeTab.groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    textAlign: 'left',
                    padding: '14px 16px',
                    marginBottom: 8,
                    borderRadius: 10,
                    border: group.isCreate ? '1px dashed var(--border)' : '1px solid var(--border)',
                    background: 'var(--surface)',
                    cursor: 'pointer',
                  }}
                >
                  {group.isCreate && <Plus size={16} style={{ color: 'var(--accent-indigo)', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: group.isCreate ? 'var(--accent-indigo)' : 'var(--text-primary)',
                      }}
                    >
                      {group.label}
                    </div>
                    {group.subtitle && (
                      <div
                        style={{
                          fontSize: 12.5,
                          color: 'var(--text-secondary)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {group.subtitle}
                      </div>
                    )}
                  </div>
                  {group.badge && <Badge>{group.badge}</Badge>}
                  <ChevronRight size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                </button>
              ))}
              {activeTab.groups.length === 0 && (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13.5 }}>Nothing to configure here yet.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

