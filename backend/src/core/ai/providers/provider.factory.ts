import type { ProviderId } from '@erp/shared-contracts';
import type { LLMProvider } from './provider.interface';
import { OpenAICompatibleProvider } from './openai-compatible.provider';
import { GeminiProvider } from './gemini.provider';
import { AnthropicProvider } from './anthropic.provider';

/**
 * Controlled provider registry (AI Models PRD §29). A module cannot
 * register an arbitrary provider — only these adapters are callable.
 */
const REGISTRY: Record<ProviderId, LLMProvider> = {
  openai: new OpenAICompatibleProvider('https://api.openai.com/v1'),
  openrouter: new OpenAICompatibleProvider('https://openrouter.ai/api/v1', {
    'HTTP-Referer': 'https://doers-os.internal',
    'X-Title': 'DoersOS',
  }),
  together: new OpenAICompatibleProvider('https://api.together.xyz/v1'),
  nvidia: new OpenAICompatibleProvider('https://integrate.api.nvidia.com/v1'),
  gemini: new GeminiProvider(),
  anthropic: new AnthropicProvider(),
};

export function getProviderAdapter(providerId: ProviderId): LLMProvider {
  const adapter = REGISTRY[providerId];
  if (!adapter) {
    throw new Error(`Unknown or unregistered AI provider: ${providerId}`);
  }
  return adapter;
}

export const AVAILABLE_PROVIDERS: ProviderId[] = Object.keys(REGISTRY) as ProviderId[];
