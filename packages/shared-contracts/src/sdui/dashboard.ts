import { z } from 'zod';

export const DashboardCardSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  delta: z.string().optional(),
  deltaTone: z.enum(['positive', 'negative', 'neutral']).optional(),
  accent: z.enum(['indigo', 'pink', 'emerald', 'amber', 'cyan']).optional(),
  progress: z.number().min(0).max(100).optional(),
  progressLabel: z.string().optional(),
});
export type DashboardCard = z.infer<typeof DashboardCardSchema>;

export const ChartSeriesSchema = z.object({
  id: z.string(),
  label: z.string(),
  points: z.array(
    z.object({
      x: z.union([z.string(), z.number()]),
      y: z.number(),
    }),
  ),
});
export type ChartSeries = z.infer<typeof ChartSeriesSchema>;

export const DashboardChartSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['line', 'area', 'donut', 'bar']),
  series: z.array(ChartSeriesSchema),
});
export type DashboardChart = z.infer<typeof DashboardChartSchema>;

export const DashboardConfigSchema = z.object({
  cards: z.array(DashboardCardSchema).default([]),
  charts: z.array(DashboardChartSchema).default([]),
});
export type DashboardConfig = z.infer<typeof DashboardConfigSchema>;
