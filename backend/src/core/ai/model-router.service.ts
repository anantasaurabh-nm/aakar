import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  LLMProviderError,
  type AIRequestLogEntry,
  type LLMRequest,
  type LLMResponse,
  type ModelProfileName,
} from '@erp/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialStoreService } from './credential-store.service';
import { getProviderAdapter } from './providers/provider.factory';

export class ModelNotConfiguredError extends Error {
  constructor(profile: ModelProfileName) {
    super(`AI model profile "${profile}" is not configured`);
  }
}

/**
 * Resolves a logical profile (light/reasoning) to a configured
 * provider/model and executes the call, independent of any specific
 * vendor (AI Models PRD §11).
 */
@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger('ModelRouter');

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialStoreService,
  ) {}

  async isConfigured(profile: ModelProfileName): Promise<boolean> {
    const config = await this.prisma.aiModelProfile.findUnique({ where: { profile } });
    return Boolean(config?.credentialName);
  }

  async generate(profile: ModelProfileName, request: LLMRequest): Promise<LLMResponse> {
    const requestId = randomUUID();
    const started = Date.now();
    const config = await this.prisma.aiModelProfile.findUnique({ where: { profile } });
    if (!config || !config.credentialName) {
      throw new ModelNotConfiguredError(profile);
    }

    const { secret } = await this.credentials.resolve(config.credentialName);
    const adapter = getProviderAdapter(config.provider);

    try {
      const response = await adapter.generate({
        apiKey: secret,
        model: config.model,
        request,
        timeoutMs: config.timeoutMs,
      });
      this.log({
        requestId,
        profile,
        provider: config.provider,
        model: config.model,
        latencyMs: Date.now() - started,
        status: 'success',
        usage: response.usage,
      });
      return response;
    } catch (err) {
      const category = err instanceof LLMProviderError ? err.category : 'unknown';
      this.log({
        requestId,
        profile,
        provider: config.provider,
        model: config.model,
        latencyMs: Date.now() - started,
        status: 'failure',
        errorCategory: category,
      });
      throw err;
    }
  }

  private log(entry: AIRequestLogEntry) {
    // Deliberately excludes prompts/secrets — only operational metadata (AI Models PRD §23).
    this.logger.log(JSON.stringify(entry));
  }
}
