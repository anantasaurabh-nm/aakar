import type { LLMRequest, LLMResponse } from '@erp/shared-contracts';

export interface ProviderCallParams {
  apiKey: string;
  model: string;
  request: LLMRequest;
  timeoutMs: number;
}

/**
 * Common interface every provider adapter implements (AI Models PRD §27).
 * The rest of DoersOS never contains provider-specific API logic.
 */
export interface LLMProvider {
  generate(params: ProviderCallParams): Promise<LLMResponse>;
}
