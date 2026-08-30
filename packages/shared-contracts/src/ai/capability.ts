import { z } from 'zod';

/**
 * A capability is a concrete, named operation the AI Orchestrator can
 * discover and invoke (Architecture Amendment 01 §4-5). Never an "agent"
 * with its own bespoke skill list — capabilities are flat and generated
 * automatically for schema-driven entities, with custom ones added only
 * when generated CRUD is insufficient.
 */
export interface CapabilityDescriptor {
  id: string; // "<module>.<entity>.<operation>" or "<module>.<skill>"
  module: string;
  entity?: string;
  description: string;
  requiredPermission: string;
}

/** What the orchestrator produces after matching user intent to a capability (Amendment 01 §10). */
export const OrchestratorDecisionSchema = z.object({
  capability: z.string(),
  parameters: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1).default(0.5),
  needsConfirmation: z.boolean().default(false),
});
export type OrchestratorDecision = z.infer<typeof OrchestratorDecisionSchema>;

/** Structured, UI-independent result of executing a capability (Amendment 01 §26). */
export interface CapabilityResult {
  module: string;
  entity?: string;
  operation: string;
  rows?: Record<string, unknown>[];
  total?: number;
  message?: string;
  /** Data-source ids the client should invalidate/refetch after a mutation. */
  invalidates?: string[];
}

export const ResponseModeSchema = z.enum(['text', 'data', 'action', 'ui']);
export type ResponseMode = z.infer<typeof ResponseModeSchema>;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

/** What the Response Planner hands back to AI Chat. */
export interface ChatResponse {
  mode: ResponseMode;
  text?: string;
  data?: Record<string, unknown>;
  ui?: unknown; // validated SDUIPage — kept as unknown here to avoid a circular import
  invalidate?: string[]; // data-source ids to refetch after a mutation
}
