export const capability = {
  id: 'hello-datasources.critical-alerts',
  module: 'hello-datasources',
  entity: 'metric',
  description: 'Critical alerts requiring immediate attention (Loaded from TypeScript capability file)',
  requiredPermission: 'hello-datasources.metric.read',
  async execute(params: Record<string, unknown>, ctx: { user: any; repository: any; entityDef: any }) {
    const listFilters = {
      columnFilters: [{ field: 'priority', operator: 'eq', value: 'critical' }],
      ...params,
    };
    const page = await ctx.repository.list(
      'hello-datasources',
      'metric',
      ctx.entityDef,
      ctx.user.tenantId,
      listFilters,
    );
    return {
      module: 'hello-datasources',
      entity: 'metric',
      operation: 'list' as const,
      rows: page.items,
      total: page.total,
    };
  },
};
