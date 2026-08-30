import type { LLMResponse } from '@erp/shared-contracts';
import type { LLMProvider, ProviderCallParams } from './provider.interface';
import { callProviderJson } from './provider-http.util';

export class GeminiProvider implements LLMProvider {
  async generate({ apiKey, model, request, timeoutMs }: ProviderCallParams): Promise<LLMResponse> {
    const system = request.messages.find((m) => m.role === 'system')?.content;
    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 800,
        ...(request.jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    };
    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }

    const json = await callProviderJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );

    const candidates = json.candidates as
      | Array<{ content?: { parts?: Array<{ text?: string }> } }>
      | undefined;
    const text = candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const usage = json.usageMetadata as
      | { promptTokenCount?: number; candidatesTokenCount?: number }
      | undefined;

    return {
      text,
      usage: usage && {
        inputTokens: usage.promptTokenCount,
        outputTokens: usage.candidatesTokenCount,
      },
    };
  }
}
