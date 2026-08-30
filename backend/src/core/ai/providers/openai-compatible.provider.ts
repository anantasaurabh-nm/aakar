import type { LLMResponse } from '@erp/shared-contracts';
import type { LLMProvider, ProviderCallParams } from './provider.interface';
import { callProviderJson } from './provider-http.util';

/**
 * Shared adapter for every provider that speaks the OpenAI chat-completions
 * wire format (OpenAI itself, OpenRouter, Together, NVIDIA NIM).
 */
export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly extraHeaders: Record<string, string> = {},
  ) {}

  async generate({ apiKey, model, request, timeoutMs }: ProviderCallParams): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? 800,
    };
    if (request.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const json = await callProviderJson(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          ...this.extraHeaders,
        },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );

    const choices = json.choices as Array<{ message?: { content?: string } }> | undefined;
    const text = choices?.[0]?.message?.content ?? '';
    const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;

    return {
      text,
      usage: usage && {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
      },
    };
  }
}
