import { Injectable, Logger } from '@nestjs/common';
import { ConnectorProvider } from './provider.interface';
import { TrelloProvider } from './trello.provider';
import { StripeProvider } from './stripe.provider';
import { GithubProvider } from './github.provider';
import { SlackProvider } from './slack.provider';
import { OpenaiProvider } from './openai.provider';
import { CustomProvider } from './custom.provider';
import { McpProvider } from './mcp.provider';

@Injectable()
export class ProviderRegistry {
  private readonly logger = new Logger(ProviderRegistry.name);
  private readonly providers = new Map<string, ConnectorProvider>();

  constructor() {
    this.register(TrelloProvider);
    this.register(StripeProvider);
    this.register(GithubProvider);
    this.register(SlackProvider);
    this.register(OpenaiProvider);
    this.register(CustomProvider);
    this.register(McpProvider);
  }

  /**
   * Register a new connector provider.
   */
  register(provider: ConnectorProvider): void {
    if (!provider?.id) {
      throw new Error('Provider must have a non-empty id');
    }
    const key = provider.id.toLowerCase().trim();
    this.providers.set(key, provider);
    this.logger.log(`Registered connector provider: ${provider.name} (${provider.id})`);
  }

  /**
   * Retrieve all registered providers.
   */
  getAll(): ConnectorProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Find a provider by its unique identifier.
   */
  get(id?: string): ConnectorProvider | undefined {
    if (!id) return undefined;
    return this.providers.get(id.toLowerCase().trim());
  }

  /**
   * Check if a provider exists.
   */
  has(id: string): boolean {
    return this.providers.has(id.toLowerCase().trim());
  }
}
