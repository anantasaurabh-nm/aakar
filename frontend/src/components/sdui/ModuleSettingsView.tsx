'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { DynamicForm } from './DynamicForm';
import type { FormConfig } from '@erp/shared-contracts';
import { useUiStore } from '@/lib/ui-store';

export function ModuleSettingsView({
  moduleId,
  moduleName,
}: {
  moduleId: string;
  moduleName: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const { data: formConfig, isLoading: configLoading, isError: configError } = useQuery<FormConfig>({
    queryKey: ['ui', 'views', moduleId, 'settings'],
    queryFn: () => apiClient.get(`ui/views/${moduleId}/settings`),
  });

  const { data: initialValues, isLoading: dataLoading } = useQuery<Record<string, unknown>>({
    queryKey: ['data', moduleId, 'settings'],
    queryFn: () => apiClient.get(`data/${moduleId}/settings`),
  });

  if (configLoading || dataLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading {moduleName} settings…
      </div>
    );
  }

  if (configError || !formConfig) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--accent-red)', marginBottom: 12 }}>
          <AlertCircle size={20} />
          <span style={{ fontWeight: 600 }}>No settings declared for {moduleName}</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 440, margin: '0 auto 16px' }}>
          This module does not declare a configurable settings schema in its manifest.
        </p>
        <button
          onClick={() => router.push(`/app/${moduleId}`)}
          style={{
            padding: '7px 16px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Back to {moduleName}
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 48px' }}>
      {/* Top Header & Back Navigation */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push(`/app/${moduleId}`)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 0',
            marginBottom: 8,
          }}
        >
          <ArrowLeft size={15} />
          <span>Back to {moduleName}</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'var(--badge-primary-bg)',
              color: 'var(--accent-indigo)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Settings size={18} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
              {formConfig.title || `${moduleName} Settings`}
            </h1>
            {formConfig.description && (
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                {formConfig.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Settings Card Surface */}
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
          padding: 24,
        }}
      >
        <DynamicForm
          config={formConfig}
          initialValues={initialValues ?? {}}
          onCancel={() => router.push(`/app/${moduleId}`)}
          onSuccess={() => {
            pushToast('Settings saved successfully', 'success');
            queryClient.invalidateQueries({ queryKey: ['data', moduleId, 'settings'] });
            queryClient.invalidateQueries({ queryKey: ['ui', 'views', moduleId, 'settings'] });
          }}
          hideCancel={false}
        />
      </div>
    </div>
  );
}
