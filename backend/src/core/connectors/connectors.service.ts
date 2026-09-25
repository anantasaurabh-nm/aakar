import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { ProviderRegistry } from './providers/provider.registry';
import { ConnectorProvider } from './providers/provider.interface';
import type {
  CoreConnectionSummary,
  CreateConnectionInput,
  UpdateConnectionInput,
  TestConnectionResult,
  ConnectionAuthType,
  ConnectionStatus,
  ConnectionScope,
  UserConnectorCatalogItem,
} from '@erp/shared-contracts';

export interface DecryptedConnection {
  id: string;
  tenantId: string;
  provider: string;
  name: string;
  authType: ConnectionAuthType;
  baseUrl?: string | null;
  credentials: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: ConnectionStatus;
}

export interface HttpClientOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface ConnectorHttpClient {
  get<T = unknown>(path: string, options?: HttpClientOptions): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, options?: HttpClientOptions): Promise<T>;
  put<T = unknown>(path: string, body?: unknown, options?: HttpClientOptions): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown, options?: HttpClientOptions): Promise<T>;
  delete<T = unknown>(path: string, options?: HttpClientOptions): Promise<T>;
}

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly providerRegistry: ProviderRegistry,
  ) {}

  /**
   * Returns all available connector providers registered in the system.
   */
  getAvailableProviders(): ConnectorProvider[] {
    return this.providerRegistry.getAll();
  }

  /**
   * Looks up a registered provider by its identifier.
   */
  getProvider(id: string): ConnectorProvider | undefined {
    return this.providerRegistry.get(id);
  }

  /**
   * Helper to mask sensitive keys for client display (e.g. "shpat_••••••••3a9f").
   */
  maskSecret(secret?: string): string {
    if (!secret || typeof secret !== 'string') return '••••••••';
    const trimmed = secret.trim();
    if (trimmed.length <= 8) return '••••••••';

    // Check common prefixes (e.g. shpat_, sk_live_, ghp_, xoxb-)
    const prefixMatch = trimmed.match(/^([a-zA-Z0-9_-]{2,8}_)/);
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      const suffix = trimmed.slice(-4);
      return `${prefix}••••••••${suffix}`;
    }

    const first3 = trimmed.slice(0, 3);
    const last4 = trimmed.slice(-4);
    return `${first3}••••••••${last4}`;
  }

  /**
   * Generates a preview string from the credentials payload without exposing secrets.
   */
  private generateMaskedPreview(credentials: Record<string, unknown>, providerId: string): string {
    if (!credentials || typeof credentials !== 'object') return '••••••••';

    const provider = this.providerRegistry.get(providerId);
    if (provider?.maskPreview) {
      try {
        return provider.maskPreview(credentials);
      } catch {
        // Fallback to default masking
      }
    }

    // Default fallback heuristics
    for (const [key, val] of Object.entries(credentials)) {
      if (typeof val === 'string' && val.length > 0) {
        if (key.toLowerCase().includes('key') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) {
          return this.maskSecret(val);
        }
      }
    }

    return '••••••••';
  }

  /**
   * List all connections for a tenant (returning safe masked summaries only).
   */
  async listConnections(tenantId: string, provider?: string): Promise<CoreConnectionSummary[]> {
    const where: { tenantId: string; provider?: string } = { tenantId };
    if (provider) where.provider = provider.toLowerCase().trim();

    const rows = await this.prisma.coreConnection.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      name: r.name,
      description: r.description,
      scope: (r.scope as ConnectionScope) || 'user',
      authType: r.authType as ConnectionAuthType,
      baseUrl: r.baseUrl,
      maskedPreview: r.maskedPreview,
      status: r.status as ConnectionStatus,
      lastTestedAt: r.lastTestedAt?.toISOString(),
      lastTestedStatus: r.lastTestedStatus,
      lastUsedAt: r.lastUsedAt?.toISOString(),
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /**
   * Get safe masked connection summary by ID.
   */
  async getConnection(tenantId: string, id: string): Promise<CoreConnectionSummary> {
    const r = await this.prisma.coreConnection.findFirst({
      where: { id, tenantId },
    });

    if (!r) throw new NotFoundException(`Connection not found: ${id}`);

    return {
      id: r.id,
      provider: r.provider,
      name: r.name,
      description: r.description,
      scope: (r.scope as ConnectionScope) || 'user',
      authType: r.authType as ConnectionAuthType,
      baseUrl: r.baseUrl,
      maskedPreview: r.maskedPreview,
      status: r.status as ConnectionStatus,
      lastTestedAt: r.lastTestedAt?.toISOString(),
      lastTestedStatus: r.lastTestedStatus,
      lastUsedAt: r.lastUsedAt?.toISOString(),
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  /**
   * INTERNAL ONLY: Resolves and decrypts the raw connection credentials.
   * Never expose the return value of this method directly to HTTP endpoints or SDUI.
   */
  async getDecryptedCredentials(tenantId: string, providerOrId: string): Promise<DecryptedConnection> {
    const r = await this.prisma.coreConnection.findFirst({
      where: {
        tenantId,
        OR: [{ id: providerOrId }, { provider: providerOrId }],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!r) {
      throw new NotFoundException(`Connection not configured for provider/id: ${providerOrId}`);
    }

    let credentials: Record<string, unknown> = {};
    try {
      const jsonStr = this.crypto.decrypt(r.encryptedCredentials);
      credentials = JSON.parse(jsonStr);
    } catch (err) {
      this.logger.error(`Failed to decrypt credentials for connection ${r.id}: ${err}`);
      throw new Error(`Credential decryption error for connection ${r.id}`);
    }

    return {
      id: r.id,
      tenantId: r.tenantId,
      provider: r.provider,
      name: r.name,
      authType: r.authType as ConnectionAuthType,
      baseUrl: r.baseUrl,
      credentials,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      status: r.status as ConnectionStatus,
    };
  }

  /**
   * Create a new connection in the vault.
   */
  async createConnection(
    tenantId: string,
    input: CreateConnectionInput,
    userId?: string,
  ): Promise<CoreConnectionSummary> {
    const providerId = input.provider.toLowerCase().trim();
    const provider = this.providerRegistry.get(providerId);
    if (!provider) {
      throw new BadRequestException(`Unknown connector provider: "${input.provider}"`);
    }

    const existing = await this.prisma.coreConnection.findUnique({
      where: {
        tenantId_provider_name: {
          tenantId,
          provider: providerId,
          name: input.name.trim(),
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `A connection with name "${input.name}" already exists for provider "${provider.name}".`,
      );
    }

    const rawCredentials = input.credentials ?? {};

    // Validate required fields declared by the provider
    for (const field of provider.fields) {
      if (field.required) {
        const val = rawCredentials[field.key];
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
          throw new BadRequestException(`Field "${field.label}" is required for ${provider.name}.`);
        }
      }
    }

    const baseUrl =
      input.baseUrl?.trim() ||
      (typeof rawCredentials.serverUrl === 'string' && rawCredentials.serverUrl.trim()) ||
      provider.defaultBaseUrl ||
      null;
    const encryptedCredentials = this.crypto.encrypt(JSON.stringify(rawCredentials));
    const maskedPreview = this.generateMaskedPreview(rawCredentials, provider.id);

    const scope = ((input as any).scope as ConnectionScope) || 'user';
    const description = (input as any).description ? String((input as any).description).trim() : null;

    const r = await this.prisma.coreConnection.create({
      data: {
        tenantId,
        provider: provider.id,
        name: input.name.trim(),
        description,
        scope,
        authType: (input.authType as any) || 'api_key',
        baseUrl,
        encryptedCredentials,
        maskedPreview,
        status: 'active',
        metadata: input.metadata as any,
        createdBy: userId,
      },
    });

    this.logger.log(`Created connection ${r.id} (${r.provider} - "${r.name}") for tenant ${tenantId}`);

    return this.getConnection(tenantId, r.id);
  }

  /**
   * Update an existing connection.
   */
  async updateConnection(
    tenantId: string,
    id: string,
    input: UpdateConnectionInput,
    userId?: string,
  ): Promise<CoreConnectionSummary> {
    const existing = await this.prisma.coreConnection.findFirst({
      where: { id, tenantId },
    });

    if (!existing) throw new NotFoundException(`Connection not found: ${id}`);

    const provider = this.providerRegistry.get(existing.provider);
    const data: Record<string, unknown> = {};

    if (input.name !== undefined) data.name = input.name.trim();
    if ((input as any).description !== undefined) {
      data.description = (input as any).description ? String((input as any).description).trim() : null;
    }
    if ((input as any).scope !== undefined) {
      data.scope = (input as any).scope;
    }
    if (input.baseUrl !== undefined) {
      data.baseUrl = input.baseUrl ? input.baseUrl.trim() : null;
    }
    if (input.status !== undefined) data.status = input.status;
    if (input.metadata !== undefined) data.metadata = input.metadata;

    // If new credentials were provided, merge with existing secret fields if blank
    if (input.credentials && Object.keys(input.credentials).length > 0) {
      let existingCreds: Record<string, unknown> = {};
      try {
        existingCreds = JSON.parse(this.crypto.decrypt(existing.encryptedCredentials));
      } catch {
        existingCreds = {};
      }

      const mergedCredentials: Record<string, unknown> = { ...existingCreds };
      for (const [k, v] of Object.entries(input.credentials)) {
        const isMaskedValue = typeof v === 'string' && v.includes('•');
        // If blank secret on edit or contains bullet mask characters, retain existing value
        if (v === '' || v === undefined || v === null || isMaskedValue) {
          const fieldDef = provider?.fields.find((f) => f.key === k);
          if (!fieldDef?.secret && !isMaskedValue) {
            delete mergedCredentials[k];
          }
        } else {
          mergedCredentials[k] = v;
        }
      }

      data.encryptedCredentials = this.crypto.encrypt(JSON.stringify(mergedCredentials));
      data.maskedPreview = this.generateMaskedPreview(mergedCredentials, existing.provider);
      if (input.baseUrl === undefined && typeof mergedCredentials.serverUrl === 'string' && mergedCredentials.serverUrl.trim()) {
        data.baseUrl = mergedCredentials.serverUrl.trim();
      }
    }

    await this.prisma.coreConnection.update({
      where: { id },
      data,
    });

    this.logger.log(`Updated connection ${id} for tenant ${tenantId}`);
    return this.getConnection(tenantId, id);
  }

  /**
   * Delete a connection.
   */
  async deleteConnection(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.coreConnection.findFirst({
      where: { id, tenantId },
    });

    if (!existing) throw new NotFoundException(`Connection not found: ${id}`);

    await this.prisma.coreConnection.delete({ where: { id } });
    this.logger.log(`Deleted connection ${id} for tenant ${tenantId}`);
  }

  /**
   * Performs an active connectivity probe to verify credentials and endpoint availability.
   * Delegates directly to the provider's native test implementation.
   */
  async testConnection(tenantId: string, id: string): Promise<TestConnectionResult> {
    const conn = await this.getDecryptedCredentials(tenantId, id);
    const provider = this.providerRegistry.get(conn.provider);

    if (!provider) {
      return {
        success: false,
        message: `Cannot test connection: provider "${conn.provider}" is not recognized.`,
      };
    }

    const effectiveBaseUrl =
      (conn.credentials?.serverUrl as string) ||
      conn.baseUrl ||
      provider.defaultBaseUrl ||
      '';
    const result = await provider.test(conn.credentials, effectiveBaseUrl);

    const statusLabel = result.success
      ? `ok (${result.latencyMs ?? 0}ms)`
      : `Failed: ${result.message}`;
    await this.recordTestResult(id, statusLabel);

    return {
      success: result.success,
      latencyMs: result.latencyMs,
      statusCode: result.statusCode,
      message: result.message,
    };
  }

  /**
   * Tests connection credentials live. If an ID is supplied, merges unsaved form
   * fields with existing decrypted credentials. If no ID is supplied (e.g. creating
   * a new connection), directly tests the payload fields.
   */
  async testLiveCredentials(
    tenantId: string,
    payload: Record<string, unknown>,
    id?: string,
  ): Promise<TestConnectionResult> {
    let providerId = String(payload.provider || '').trim().toLowerCase();
    let existingCreds: Record<string, unknown> = {};
    let existingBaseUrl: string | undefined;

    if (id) {
      try {
        const decrypted = await this.getDecryptedCredentials(tenantId, id);
        providerId = providerId || decrypted.provider;
        existingCreds = decrypted.credentials ?? {};
        existingBaseUrl = decrypted.baseUrl || undefined;
      } catch {
        // Continue with payload credentials if decryption fails or not found
      }
    }

    if (!providerId) {
      return { success: false, message: 'Provider must be specified to test connection.' };
    }

    const provider = this.providerRegistry.get(providerId);
    if (!provider) {
      return { success: false, message: `Provider "${providerId}" is not recognized.` };
    }

    // Merge in-flight payload credentials with existing credentials
    const mergedCreds: Record<string, unknown> = { ...existingCreds };
    for (const f of provider.fields) {
      const val = payload[`${provider.id}_${f.key}`] ?? payload[f.key];
      if (val !== undefined && val !== null && val !== '') {
        // If val is a masked bullet string, keep existing decrypted secret
        if (typeof val === 'string' && val.includes('•')) {
          // preserve existingCreds[f.key]
        } else {
          mergedCreds[f.key] = val;
        }
      }
    }

    const effectiveBaseUrl =
      (mergedCreds.serverUrl as string) ||
      (payload[`${provider.id}_baseUrl`] as string) ||
      (payload.baseUrl as string) ||
      existingBaseUrl ||
      provider.defaultBaseUrl ||
      '';

    const result = await provider.test(mergedCreds, effectiveBaseUrl);

    if (id) {
      const statusLabel = result.success
        ? `ok (${result.latencyMs ?? 0}ms)`
        : `Failed: ${result.message}`;
      await this.recordTestResult(id, statusLabel);
    }

    return {
      success: result.success,
      latencyMs: result.latencyMs,
      statusCode: result.statusCode,
      message: result.message,
    };
  }

  private async recordTestResult(id: string, status: string): Promise<void> {
    try {
      await this.prisma.coreConnection.update({
        where: { id },
        data: {
          lastTestedAt: new Date(),
          lastTestedStatus: status,
        },
      });
    } catch {
      // Ignore background write errors
    }
  }

  /**
   * Factory returning a pre-configured HTTP client ready to call the external service.
   * Automatically delegates authentication injection to the provider.
   */
  async getHttpClient(
    tenantId: string,
    providerOrId: string,
    defaultOptions?: HttpClientOptions,
    userId?: string,
  ): Promise<ConnectorHttpClient> {
    let connCredentials: Record<string, unknown> = {};
    let targetBaseUrl = '';
    let providerName = '';

    // If a userId is supplied, attempt to resolve user-delegated credentials first
    if (userId) {
      const catalog = await this.prisma.coreConnection.findFirst({
        where: {
          tenantId,
          OR: [{ id: providerOrId }, { provider: providerOrId }],
        },
        orderBy: { createdAt: 'desc' },
      });

      if (catalog) {
        providerName = catalog.provider;
        const userConn = await this.prisma.userConnection.findFirst({
          where: { tenantId, userId, connectionId: catalog.id },
        });

        if (userConn && userConn.status === 'active') {
          try {
            const userCreds = JSON.parse(this.crypto.decrypt(userConn.encryptedCredentials));
            const catalogCreds = JSON.parse(this.crypto.decrypt(catalog.encryptedCredentials));
            connCredentials = { ...catalogCreds, ...userCreds };
            targetBaseUrl = (connCredentials.serverUrl as string) || catalog.baseUrl || '';
          } catch {
            // fallback to catalog
          }
        } else if (catalog.scope === 'user') {
          throw new ForbiddenException(
            `You have not connected your personal account to "${catalog.name}". Please open Settings → Connectors to link your account.`,
          );
        }
      }
    }

    if (!providerName || Object.keys(connCredentials).length === 0) {
      const conn = await this.getDecryptedCredentials(tenantId, providerOrId);
      providerName = conn.provider;
      connCredentials = conn.credentials;
      targetBaseUrl = (conn.credentials?.serverUrl as string) || conn.baseUrl || '';
    }

    const provider = this.providerRegistry.get(providerName);
    const baseUrl = (targetBaseUrl || provider?.defaultBaseUrl || '').replace(/\/+$/, '');

    const request = async <T = unknown>(
      method: string,
      path: string,
      body?: unknown,
      options?: HttpClientOptions,
    ): Promise<T> => {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const urlStr = baseUrl ? `${baseUrl}${cleanPath}` : path;
      const url = new URL(urlStr);
      const timeoutMs = options?.timeoutMs ?? defaultOptions?.timeoutMs ?? 15000;

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        ...(defaultOptions?.headers ?? {}),
        ...(options?.headers ?? {}),
      };

      if (body && typeof body === 'object' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      if (provider) {
        provider.decorateRequest(connCredentials, { url, headers, method });
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url.toString(), {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          throw new Error(
            `Connector request failed [${providerName}] ${method} ${path}: HTTP ${response.status} ${response.statusText} ${errBody ? `— ${errBody}` : ''}`,
          );
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return (await response.json()) as T;
        }
        return (await response.text()) as unknown as T;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`Connector request timed out after ${timeoutMs}ms: [${providerName}] ${method} ${path}`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    };

    return {
      get: <T = unknown>(path: string, options?: HttpClientOptions) => request<T>('GET', path, undefined, options),
      post: <T = unknown>(path: string, body?: unknown, options?: HttpClientOptions) => request<T>('POST', path, body, options),
      put: <T = unknown>(path: string, body?: unknown, options?: HttpClientOptions) => request<T>('PUT', path, body, options),
      patch: <T = unknown>(path: string, body?: unknown, options?: HttpClientOptions) => request<T>('PATCH', path, body, options),
      delete: <T = unknown>(path: string, options?: HttpClientOptions) => request<T>('DELETE', path, undefined, options),
    };
  }

  /**
   * Returns all connectors available in the catalog for a user, indicating whether the
   * user has connected their personal account or if it is workspace-managed (Claude.ai style).
   */
  async listUserConnectors(tenantId: string, userId: string): Promise<UserConnectorCatalogItem[]> {
    const catalog = await this.prisma.coreConnection.findMany({
      where: { tenantId, status: 'active' },
      orderBy: { name: 'asc' },
    });

    const userConns = await this.prisma.userConnection.findMany({
      where: { tenantId, userId },
    });

    const userConnMap = new Map(userConns.map((u) => [u.connectionId, u]));

    return catalog.map((cat) => {
      const provider = this.providerRegistry.get(cat.provider);
      const userConn = userConnMap.get(cat.id);
      const isTenantScope = cat.scope === 'tenant';
      const isConnected = isTenantScope ? true : Boolean(userConn && userConn.status === 'active');

      return {
        id: cat.id,
        provider: cat.provider,
        name: cat.name,
        description: cat.description || provider?.description || null,
        scope: (cat.scope as ConnectionScope) || 'user',
        authType: cat.authType as ConnectionAuthType,
        baseUrl: cat.baseUrl,
        icon: provider?.icon || 'cpu',
        fields: provider?.fields || [],
        isConnected,
        userConnectionId: userConn?.id || null,
        maskedPreview: isTenantScope ? cat.maskedPreview : (userConn?.maskedPreview || null),
        status: isTenantScope ? (cat.status as ConnectionStatus) : (userConn?.status as ConnectionStatus || 'inactive'),
        lastTestedStatus: isTenantScope ? cat.lastTestedStatus : (userConn?.lastTestedStatus || null),
        lastTestedAt: isTenantScope ? cat.lastTestedAt?.toISOString() : (userConn?.lastTestedAt?.toISOString() || null),
      };
    });
  }

  /**
   * Connects a user's personal credentials to a catalog connector.
   * Performs a live diagnostic test with the user's credentials before encrypting and storing.
   */
  async connectUser(
    tenantId: string,
    userId: string,
    connectionId: string,
    credentials: Record<string, unknown>,
  ): Promise<UserConnectorCatalogItem> {
    const catalog = await this.prisma.coreConnection.findFirst({
      where: { id: connectionId, tenantId, status: 'active' },
    });

    if (!catalog) {
      throw new NotFoundException(`Connector not found or is inactive: ${connectionId}`);
    }

    const provider = this.providerRegistry.get(catalog.provider);
    if (!provider) {
      throw new BadRequestException(`Provider "${catalog.provider}" is not recognized.`);
    }

    // Merge in catalog baseUrl / transport if not specified in user credentials
    let catalogCreds: Record<string, unknown> = {};
    try {
      catalogCreds = JSON.parse(this.crypto.decrypt(catalog.encryptedCredentials));
    } catch {
      catalogCreds = {};
    }

    const mergedCreds = { ...catalogCreds, ...credentials };
    const effectiveBaseUrl = catalog.baseUrl || String(mergedCreds.serverUrl || '').trim();

    // Verify connection credentials live before saving
    const testResult = await provider.test(mergedCreds, effectiveBaseUrl);
    if (!testResult.success) {
      throw new BadRequestException(`Connection verification failed: ${testResult.message}`);
    }

    const statusLabel = `ok (${testResult.latencyMs ?? 0}ms)`;
    const encryptedCredentials = this.crypto.encrypt(JSON.stringify(credentials));
    const maskedPreview = this.generateMaskedPreview(credentials, catalog.provider);

    const userConn = await this.prisma.userConnection.upsert({
      where: {
        tenantId_userId_connectionId: {
          tenantId,
          userId,
          connectionId,
        },
      },
      create: {
        tenantId,
        userId,
        connectionId,
        encryptedCredentials,
        maskedPreview,
        status: 'active',
        lastTestedAt: new Date(),
        lastTestedStatus: statusLabel,
      },
      update: {
        encryptedCredentials,
        maskedPreview,
        status: 'active',
        lastTestedAt: new Date(),
        lastTestedStatus: statusLabel,
      },
    });

    this.logger.log(`User ${userId} connected to connector ${catalog.name} (${catalog.id})`);

    return {
      id: catalog.id,
      provider: catalog.provider,
      name: catalog.name,
      description: catalog.description || provider.description || null,
      scope: (catalog.scope as ConnectionScope) || 'user',
      authType: catalog.authType as ConnectionAuthType,
      baseUrl: catalog.baseUrl,
      icon: provider.icon || 'cpu',
      fields: provider.fields,
      isConnected: true,
      userConnectionId: userConn.id,
      maskedPreview,
      status: 'active',
      lastTestedStatus: statusLabel,
      lastTestedAt: userConn.lastTestedAt?.toISOString(),
    };
  }

  /**
   * Disconnects a user's personal credentials from a connector.
   */
  async disconnectUser(tenantId: string, userId: string, connectionId: string): Promise<void> {
    await this.prisma.userConnection.deleteMany({
      where: { tenantId, userId, connectionId },
    });
    this.logger.log(`User ${userId} disconnected from connector ${connectionId}`);
  }

  /**
   * Re-tests a user's personal connection on demand.
   */
  async testUserConnection(
    tenantId: string,
    userId: string,
    connectionId: string,
  ): Promise<TestConnectionResult> {
    const catalog = await this.prisma.coreConnection.findFirst({
      where: { id: connectionId, tenantId, status: 'active' },
    });

    if (!catalog) {
      throw new NotFoundException(`Connector not found: ${connectionId}`);
    }

    const userConn = await this.prisma.userConnection.findFirst({
      where: { tenantId, userId, connectionId },
    });

    if (!userConn) {
      throw new NotFoundException(`No personal connection found for connector "${catalog.name}".`);
    }

    const provider = this.providerRegistry.get(catalog.provider);
    if (!provider) {
      throw new BadRequestException(`Provider "${catalog.provider}" is not recognized.`);
    }

    let userCreds: Record<string, unknown> = {};
    let catalogCreds: Record<string, unknown> = {};
    try {
      userCreds = JSON.parse(this.crypto.decrypt(userConn.encryptedCredentials));
      catalogCreds = JSON.parse(this.crypto.decrypt(catalog.encryptedCredentials));
    } catch {
      return { success: false, message: 'Failed to decrypt credentials.' };
    }

    const mergedCreds = { ...catalogCreds, ...userCreds };
    const effectiveBaseUrl = catalog.baseUrl || String(mergedCreds.serverUrl || '').trim();
    const result = await provider.test(mergedCreds, effectiveBaseUrl);

    const statusLabel = result.success
      ? `ok (${result.latencyMs ?? 0}ms)`
      : `Failed: ${result.message}`;

    await this.prisma.userConnection.update({
      where: { id: userConn.id },
      data: {
        lastTestedAt: new Date(),
        lastTestedStatus: statusLabel,
        status: result.success ? 'active' : 'error',
      },
    });

    return result;
  }
}
