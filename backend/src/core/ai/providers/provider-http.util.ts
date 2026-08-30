import { LLMProviderError, type NormalizedErrorCategory } from '@erp/shared-contracts';

/**
 * Shared fetch wrapper that normalizes provider failures (AI Models PRD §17).
 * Raw provider errors never propagate to callers/users.
 */
export async function callProviderJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new LLMProviderError(categorizeStatus(res.status), `Provider responded with ${res.status}`);
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof LLMProviderError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LLMProviderError('timeout', 'Provider request timed out');
    }
    throw new LLMProviderError('unavailable', 'Provider request failed');
  } finally {
    clearTimeout(timer);
  }
}

function categorizeStatus(status: number): NormalizedErrorCategory {
  if (status === 401 || status === 403) return 'authentication_failure';
  if (status === 429) return 'rate_limited';
  if (status === 404 || status === 400) return 'invalid_model';
  if (status >= 500) return 'unavailable';
  return 'unknown';
}
