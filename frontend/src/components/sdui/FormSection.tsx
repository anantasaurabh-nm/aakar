'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X, Zap, Loader2 } from 'lucide-react';
import type { FormSectionSchema, SDUIAction, SDUIToolbarItem } from '@erp/shared-contracts';
import type { z } from 'zod';
import { DynamicForm } from './DynamicForm';
import { useUiStore } from '@/lib/ui-store';
import { getSubmitTarget } from '@/lib/action-registry';

type FormSectionType = z.infer<typeof FormSectionSchema>;

export function FormSection({ section }: { section: FormSectionType }) {
  const formId = `form-${section.id}`;
  const queryClient = useQueryClient();
  const router = useRouter();
  const pushToast = useUiStore((s) => s.pushToast);

  const getValuesRef = useRef<(() => Record<string, unknown>) | null>(null);
  const [isExecuting, setIsExecuting] = useState<string | null>(null);

  const handleCustomAction = async (target: string, itemId: string) => {
    setIsExecuting(itemId);
    pushToast('Running test probe…');
    try {
      const form = document.getElementById(formId) as HTMLFormElement | null;
      let liveValues: Record<string, unknown> = {};
      if (getValuesRef.current) {
        liveValues = getValuesRef.current();
      } else if (form) {
        liveValues = Object.fromEntries(new FormData(form).entries());
      }

      const submitTarget = getSubmitTarget(target);
      const payload = {
        ...(section.state ?? {}),
        ...liveValues,
      };
      const res = (await submitTarget.execute(payload)) as Record<string, unknown>;
      const isFailed = res && typeof res === 'object' && res.success === false;
      const message = (res && typeof res === 'object' && res.message) || 'Action completed successfully';
      if (isFailed) {
        pushToast(String(message), 'error');
      } else {
        pushToast(String(message), 'success');
      }
      for (const source of submitTarget.invalidates) {
        queryClient.invalidateQueries({ queryKey: ['ds', source] });
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Action execution failed', 'error');
    } finally {
      setIsExecuting(null);
    }
  };

  const handleAction = (action: SDUIAction) => {
    if (action.type === 'submit') {
      const form = document.getElementById(formId) as HTMLFormElement | null;
      if (form) form.requestSubmit();
    } else if (action.type === 'cancel') {
      const form = document.getElementById(formId) as HTMLFormElement | null;
      if (form) form.reset();
      if (useUiStore.getState().copilotPage) {
        useUiStore.getState().setCopilotPage(null);
      } else if (typeof window !== 'undefined' && window.location.search.includes('view=settings')) {
        const pathname = window.location.pathname;
        router.push(pathname);
      }
    }
  };

  const handleSuccess = (invalidates: string[]) => {
    for (const source of invalidates) {
      queryClient.invalidateQueries({ queryKey: ['ds', source] });
    }
    queryClient.invalidateQueries({ queryKey: ['ds'] });
    queryClient.invalidateQueries({ queryKey: ['ui'] });
    queryClient.invalidateQueries({ queryKey: ['data'] });
  };

  // If toolbar is provided in SDUI section, use it. Otherwise, default to [Cancel, Save].
  const toolbarItems: SDUIToolbarItem[] =
    section.toolbar && section.toolbar.length > 0
      ? section.toolbar
      : [
          { id: 'cancel', type: 'action', label: 'Cancel', action: { type: 'cancel' } },
          { id: 'save', type: 'action', label: 'Save', action: { type: 'submit' } },
        ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top Header & Toolbar - matches default new record toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px 12px 16px',
          background: 'transparent',
        }}
      >
        {toolbarItems.map((item) => {
          if (item.type === 'action') {
            const isCustomAction = Boolean(
              item.action?.target && item.action.target !== section.config.submitAction.target,
            );
            const isDefaultSubmit = item.action?.type === 'submit' && !isCustomAction;
            const isCancel = item.action?.type === 'cancel';
            const isPrimary = isDefaultSubmit && item.id !== 'cancel';
            const isBusy = isExecuting === item.id;
            const isTest = item.id.toLowerCase().includes('test') || item.label?.toLowerCase().includes('test');

            return (
              <button
                key={item.id}
                type={isDefaultSubmit ? 'submit' : 'button'}
                form={isDefaultSubmit ? formId : undefined}
                disabled={isBusy}
                onClick={() => {
                  if (isCustomAction && item.action?.target) {
                    handleCustomAction(item.action.target, item.id);
                  } else if (item.action) {
                    handleAction(item.action);
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 16px',
                  borderRadius: 8,
                  border: isPrimary ? 'none' : '1px solid var(--border)',
                  background: isPrimary ? 'var(--accent-indigo-dark)' : 'var(--surface)',
                  color: isPrimary ? '#fff' : 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: isBusy ? 'wait' : 'pointer',
                  boxShadow: isPrimary ? 'var(--shadow-sm)' : 'none',
                  opacity: isBusy ? 0.75 : 1,
                  transition: 'background-color 0.15s ease, transform 0.05s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isPrimary && !isBusy) e.currentTarget.style.backgroundColor = 'var(--surface-2)';
                }}
                onMouseLeave={(e) => {
                  if (!isPrimary && !isBusy) e.currentTarget.style.backgroundColor = 'var(--surface)';
                }}
              >
                {isBusy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isTest ? (
                  <Zap size={14} style={{ color: '#f59e0b' }} />
                ) : isDefaultSubmit ? (
                  <Check size={15} strokeWidth={2.5} />
                ) : isCancel ? (
                  <X size={14} />
                ) : null}
                <span>{isBusy ? 'Testing…' : item.label ?? item.id}</span>
              </button>
            );
          }
          return null;
        })}
      </div>

      {/* Form Body - card background separating toolbar and form-body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 20px 12px' }}>
        <div
          className="record-view-pane"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '24px 28px',
            boxShadow: 'var(--shadow-sm)',
            maxWidth: 860,
          }}
        >
          {section.config.title && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {section.config.title}
              </h2>
              {section.config.description && (
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {section.config.description}
                </p>
              )}
            </div>
          )}
          <DynamicForm
            formId={formId}
            config={section.config}
            initialValues={section.state ?? (section as any).config?.initialValues}
            onCancel={() => handleAction({ type: 'cancel' })}
            onSuccess={handleSuccess}
            getFormValuesRef={getValuesRef}
            hideButtons={true}
          />
        </div>
      </div>
    </div>
  );
}
