import { apiClient, buildQuery } from './api-client';

type DataSourceFn = (params?: Record<string, unknown>) => Promise<unknown>;

/**
 * Controlled data-source registry (SDUI PRD §11, §16). The server only ever
 * references a known source name — the client is solely responsible for
 * deciding which approved API that name maps to. Arbitrary server-provided
 * URLs are never executed.
 */
const REGISTRY: Record<string, DataSourceFn> = {
  'home.dashboard': () => apiClient.get('data/home/dashboard'),
  apps: () => apiClient.get('data/apps'),
  'admin-tools': () => apiClient.get('data/admin-tools'),

  'todo.task': (params) => apiClient.get(`data/todo/task${buildQuery(params ?? {})}`),
  'todo.task.insights': (params) => apiClient.get(`data/todo/task/insights${buildQuery(params ?? {})}`),

  users: (params) => apiClient.get(`data/users${buildQuery(params ?? {})}`),
  'users.insights': () => apiClient.get('data/users/insights'),

  modules: () => apiClient.get('data/modules'),

  'ai.models': () => apiClient.get('data/admin/ai-configuration/models'),
  'ai.connections': () => apiClient.get('data/admin/ai-configuration/connections'),
};

export class UnknownDataSourceError extends Error {
  constructor(source: string) {
    super(`Unknown or unapproved data source: ${source}`);
  }
}

export async function fetchDataSource(source: string, params?: Record<string, unknown>): Promise<unknown> {
  const fn = REGISTRY[source];
  if (!fn) throw new UnknownDataSourceError(source);
  return fn(params);
}
