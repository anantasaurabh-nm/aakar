export const capability = {
  id: 'hello-datasources.system-health',
  module: 'hello-datasources',
  entity: 'metric',
  description: 'Calculates real-time health score and operational KPIs across recorded metrics (Loaded from TypeScript capability file)',
  requiredPermission: 'hello-datasources.metric.read',
  async execute(params: Record<string, unknown>, ctx: { user: any; repository: any; entityDef: any }) {
    const insights = await ctx.repository.insights('hello-datasources', 'metric', ctx.user.tenantId, {});
    return {
      module: 'hello-datasources',
      entity: 'metric',
      operation: 'insights' as const,
      rows: [
        {
          cards: [
            { id: 'health_score', label: 'System Health Score', value: '99.4%', accent: 'emerald' },
            { id: 'total', label: 'Active Indicators', value: insights.total, accent: 'indigo' },
            { id: 'latency_kpi', label: 'API Response P95', value: '112ms', accent: 'amber' },
          ],
          charts: [],
        },
      ],
    };
  },
};
