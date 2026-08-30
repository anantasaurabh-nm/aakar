import { z } from 'zod';

/** Logical model profiles — the app depends on these, never on a vendor/model name directly. */
export const ModelProfileNameSchema = z.enum(['light', 'reasoning']);
export type ModelProfileName = z.infer<typeof ModelProfileNameSchema>;

/** Controlled provider registry (AI Models PRD §29). New providers require a platform adapter. */
export const ProviderIdSchema = z.enum([
  'openai',
  'gemini',
  'openrouter',
  'together',
  'anthropic',
  'nvidia',
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/** Skill/agent-declared complexity, mapped by the platform to a profile (§12). */
export const ComplexitySchema = z.enum(['low', 'high']);
export type Complexity = z.infer<typeof ComplexitySchema>;

export const COMPLEXITY_TO_PROFILE: Record<Complexity, ModelProfileName> = {
  low: 'light',
  high: 'reasoning',
};

/** Model IDs are intentionally free-form strings — catalogs change often (§7). */
export const ModelProfileConfigSchema = z.object({
  profile: ModelProfileNameSchema,
  provider: ProviderIdSchema,
  model: z.string().min(1),
  credential: z.string().min(1), // reference only — never the secret itself
  timeoutMs: z.number().int().positive().default(30000),
});
export type ModelProfileConfig = z.infer<typeof ModelProfileConfigSchema>;

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  maxTokens?: number;
  /** When set, the provider should be instructed to return strict JSON matching this shape. */
  jsonMode?: boolean;
}

export interface LLMUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMResponse {
  text: string;
  usage?: LLMUsage;
}

/** Normalized provider failure categories (§17). Raw provider errors are never surfaced to users. */
export const NormalizedErrorCategorySchema = z.enum([
  'timeout',
  'rate_limited',
  'unavailable',
  'invalid_model',
  'authentication_failure',
  'unknown',
]);
export type NormalizedErrorCategory = z.infer<typeof NormalizedErrorCategorySchema>;

export class LLMProviderError extends Error {
  constructor(
    public readonly category: NormalizedErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}

export interface AIRequestLogEntry {
  requestId: string;
  profile: ModelProfileName;
  provider: ProviderId;
  model: string;
  latencyMs: number;
  status: 'success' | 'failure';
  errorCategory?: NormalizedErrorCategory;
  usage?: LLMUsage;
}
