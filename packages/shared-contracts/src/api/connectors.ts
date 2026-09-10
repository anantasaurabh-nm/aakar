import { z } from 'zod';

export const ConnectionAuthTypeSchema = z.enum([
  'api_key',
  'bearer_token',
  'basic_auth',
  'oauth2',
  'custom',
  'multi_key',
]);

export type ConnectionAuthType = z.infer<typeof ConnectionAuthTypeSchema>;

export const ConnectionStatusSchema = z.enum(['active', 'inactive', 'error']);
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

/**
 * Safe summary of a connection returned to the frontend / SDUI.
 * NEVER contains raw decrypted credentials.
 */
export const CoreConnectionSummarySchema = z.object({
  id: z.string(),
  provider: z.string(),
  name: z.string(),
  authType: ConnectionAuthTypeSchema,
  baseUrl: z.string().nullable().optional(),
  maskedPreview: z.string().nullable().optional(),
  status: ConnectionStatusSchema,
  lastTestedAt: z.string().nullable().optional(),
  lastTestedStatus: z.string().nullable().optional(),
  lastUsedAt: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type CoreConnectionSummary = z.infer<typeof CoreConnectionSummarySchema>;

export const CreateConnectionInputSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  name: z.string().min(1, 'Connection name is required'),
  authType: ConnectionAuthTypeSchema.default('api_key'),
  baseUrl: z.string().url('Must be a valid URL').or(z.string().min(1)).optional(),
  credentials: z.record(z.unknown()).optional().default({}),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type CreateConnectionInput = z.infer<typeof CreateConnectionInputSchema>;

export const UpdateConnectionInputSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().optional(),
  status: ConnectionStatusSchema.optional(),
  credentials: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateConnectionInput = z.infer<typeof UpdateConnectionInputSchema>;

export const TestConnectionResultSchema = z.object({
  success: z.boolean(),
  latencyMs: z.number().optional(),
  statusCode: z.number().optional(),
  message: z.string(),
});

export type TestConnectionResult = z.infer<typeof TestConnectionResultSchema>;
