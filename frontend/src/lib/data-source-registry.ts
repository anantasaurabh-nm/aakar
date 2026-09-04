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

  'user-management.user': (params) => apiClient.get(`data/users${buildQuery(params ?? {})}`),
  users: (params) => apiClient.get(`data/users${buildQuery(params ?? {})}`),
  'users.insights': () => apiClient.get('data/users-insights'),

  'user-roles.role': (params) => apiClient.get(`data/roles${buildQuery(params ?? {})}`),
  'roles.insights': () => apiClient.get('data/roles-insights'),

  modules: (params) => apiClient.get(`data/modules${buildQuery(params ?? {})}`),
};

export class UnknownDataSourceError extends Error {
  constructor(source: string) {
    super(`Unknown or unapproved data source: ${source}`);
  }
}

export async function fetchDataSource(source: string, params?: Record<string, unknown>): Promise<unknown> {
  const fn = REGISTRY[source];
  if (fn) return fn(params);

  // Explicit capability-backed data source:
  // e.g. "capabilities.hello-datasources.system-health" -> data/capabilities/hello-datasources.system-health
  if (source.startsWith('capabilities.')) {
    const capId = source.slice('capabilities.'.length);
    return apiClient.get(`data/capabilities/${capId}${buildQuery(params ?? {})}`);
  }

  // Dynamic schema-driven entity data sources:
  // e.g. "hello-module.greeting" -> data/hello-module/greeting
  // e.g. "hello-module.greeting.insights" -> data/hello-module/greeting/insights
  const parts = source.split('.');
  if (parts.length === 3 && parts[2] === 'insights') {
    return apiClient.get(`data/${parts[0]}/${parts[1]}/insights${buildQuery(params ?? {})}`);
  }
  if (parts.length === 2) {
    return apiClient.get(`data/${parts[0]}/${parts[1]}${buildQuery(params ?? {})}`);
  }

  // Fallback: check if source maps directly to a registered capability
  try {
    return await apiClient.get(`data/capabilities/${source}${buildQuery(params ?? {})}`);
  } catch {
    throw new UnknownDataSourceError(source);
  }
}
