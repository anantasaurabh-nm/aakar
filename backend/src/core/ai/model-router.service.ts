import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AiModelConfig } from '@prisma/client';
import {
  LLMProviderError,
  type AIRequestLogEntry,
  type LLMRequest,
  type LLMResponse,
  type ModelProfileName,
} from '@erp/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { getProviderAdapter } from './providers/provider.factory';

export class ModelNotConfiguredError extends Error {
  constructor(profile: ModelProfileName) {
    super(`AI model profile "${profile}" is not configured`);
  }
}

/**
 * Resolves a logical profile (light/reasoning) to its configured `active`
 * config and executes the call, independent of any specific vendor (AI
 * Models PRD §11). On failure, retries once against the profile's
 * `fallback` config if one is configured (§16 Model Fallback).
 */
@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger('ModelRouter');

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  private resolveConfig(profile: ModelProfileName, status: 'active' | 'fallback') {
    return this.prisma.aiModelConfig.findFirst({ where: { profile, status } });
  }

  async isConfigured(profile: ModelProfileName): Promise<boolean> {
    return Boolean(await this.resolveConfig(profile, 'active'));
  }

  async generate(profile: ModelProfileName, request: LLMRequest): Promise<LLMResponse> {
    const active = await this.resolveConfig(profile, 'active');
    if (!active) throw new ModelNotConfiguredError(profile);

    try {
      return await this.callConfig(active, profile, request);
    } catch (err) {
      const fallback = await this.resolveConfig(profile, 'fallback');
      if (!fallback) throw err;
      this.logger.warn(`Primary config failed for profile "${profile}" — retrying with fallback`);
      return await this.callConfig(fallback, profile, request);
    }
  }

  private async callConfig(config: AiModelConfig, profile: ModelProfileName, request: LLMRequest): Promise<LLMResponse> {
    const requestId = randomUUID();
    const started = Date.now();
    const secret = this.crypto.decrypt(config.encryptedApiKey);
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
