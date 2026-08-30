import type { LLMResponse } from '@erp/shared-contracts';
import type { LLMProvider, ProviderCallParams } from './provider.interface';
import { callProviderJson } from './provider-http.util';

export class AnthropicProvider implements LLMProvider {
  async generate({ apiKey, model, request, timeoutMs }: ProviderCallParams): Promise<LLMResponse> {
    const system = request.messages.find((m) => m.role === 'system')?.content;
    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const json = await callProviderJson(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          system,
          messages,
          max_tokens: request.maxTokens ?? 800,
        }),
      },
      timeoutMs,
    );

    const content = json.content as Array<{ type: string; text?: string }> | undefined;
    const text = content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') ?? '';
    const usage = json.usage as { input_tokens?: number; output_tokens?: number } | undefined;

    return {
      text,
      usage: usage && { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
    };
  }
}
