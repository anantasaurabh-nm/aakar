import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ConnectorsService } from '../../core/connectors/connectors.service';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../core/auth/authenticated-user.interface';
import { PermissionsGuard } from '../../core/rbac/permissions.guard';
import { RequirePermissions } from '../../core/rbac/require-permissions.decorator';
import type { CoreConnectionSummary, SDUIFormField } from '@erp/shared-contracts';
import { SDUI_SCHEMA_VERSION } from '@erp/shared-contracts';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  /**
   * Declarative SDUI Administrative Page: /admin/connectors
   */
  @Get('ui/pages/admin/connectors')
  @RequirePermissions('connectors.read')
  async getPage(@CurrentUser() user: AuthenticatedUser) {
    const connections = await this.connectorsService.listConnections(user.tenantId);
    const activeCount = connections.filter((c) => c.status === 'active').length;
    const errorCount = connections.filter((c) => c.status === 'error' || c.lastTestedStatus?.startsWith('Failed')).length;

    return {
      schema: SDUI_SCHEMA_VERSION,
      brand: {
        name: 'Connectors & Integrations',
        icon: 'sparkles',
      },
      navigation: {
        items: [
          {
            id: 'nav-perspectives',
            label: 'Perspectives',
            icon: 'layout',
            items: [
              {
                id: 'persp-all',
                label: 'All Connections',
                icon: 'modules',
                badge: String(connections.length),
                action: { type: 'navigate', target: '#all-connections' },
              },
              {
                id: 'persp-active',
                label: 'Active & Verified',
                icon: 'check',
                badge: String(activeCount),
                action: { type: 'navigate', target: '#all-connections' },
              },
              {
                id: 'persp-issues',
                label: 'Needs Attention',
                icon: 'alert-triangle',
                badge: errorCount > 0 ? String(errorCount) : undefined,
                action: { type: 'navigate', target: '#all-connections' },
              },
            ],
          },
          {
            id: 'nav-quick-actions',
            label: 'Quick Actions',
            icon: 'sparkles',
            items: [
              {
                id: 'act-new-conn',
                label: 'Add New Connection',
                icon: 'sparkles',
                action: { type: 'create', target: 'connectors.connection.form' },
              },
              {
                id: 'act-refresh',
                label: 'Reload Connections',
                icon: 'clock',
                action: { type: 'refresh' },
              },
            ],
          },
          {
            id: 'nav-bridges',
            label: 'Admin Hub',
            icon: 'shield',
            items: [
              {
                id: 'bridge-ai',
                label: 'AI Configuration',
                icon: 'ai',
                action: { type: 'navigate', target: '/admin/ai-configuration' },
              },
              {
                id: 'bridge-modules',
                label: 'Installed Modules',
                icon: 'modules',
                action: { type: 'navigate', target: '/admin/module-management' },
              },
              {
                id: 'bridge-home',
                label: 'Dashboard Hub',
                icon: 'home',
                action: { type: 'navigate', target: '/' },
              },
            ],
          },
        ],
      },
      page: {
        id: 'admin-connectors',
        title: 'Connectors & Integrations Vault',
        subtitle: 'Manage remote service credentials, API tokens, and external integration links securely.',
        sections: [
          {
            id: 'all-connections',
            type: 'table',
            label: 'Configured Connections',
            data: { source: 'connectors.connection' },
            toolbar: [
              {
                id: 'create',
                label: 'Add Connection',
                type: 'action',
                action: { type: 'create', target: 'connectors.connection.form' },
              },
              { id: 'search', type: 'search' },
              { id: 'columns', type: 'columns' },
              {
                id: 'refresh',
                label: 'Refresh',
                type: 'action',
                action: { type: 'refresh' },
              },
            ],
            config: {
              columns: [
                {
                  key: 'name',
                  label: 'Connection Name',
                  type: 'text',
                  sortable: true,
                },
                {
                  key: 'provider',
                  label: 'Service / Provider',
                  type: 'badge',
                  sortable: true,
                },
                {
                  key: 'maskedPreview',
                  label: 'Configured Credentials',
                  type: 'text',
                },
                {
                  key: 'status',
                  label: 'Status',
                  type: 'badge',
                  sortable: true,
                },
                {
                  key: 'lastTestedStatus',
                  label: 'Diagnostic Status',
                  type: 'text',
                },
                {
                  key: 'updatedAt',
                  label: 'Last Modified',
                  type: 'datetime',
                  sortable: true,
                },
              ],
              rowActions: [
                {
                  id: 'view',
                  label: 'View / Edit',
                  action: { type: 'edit', target: 'connectors.connection.form' },
                },
                {
                  id: 'test',
                  label: 'Test Connection',
                  action: { type: 'submit', target: 'connectors.connection.test' },
                },
                {
                  id: 'delete',
                  label: 'Delete',
                  action: { type: 'delete', target: 'connectors.connection.delete' },
                },
              ],
              selectable: true,
              pageSize: 50,
              density: 'comfortable',
              detailView: true,
            },
          },
        ],
      },
    };
  }

  /**
   * SDUI Form view endpoint used by RecordView (New Connection / Edit Connection)
   */
  @Get('ui/views/connectors/connection/form')
  @RequirePermissions('connectors.read')
  async getConnectionForm(
    @CurrentUser() user: AuthenticatedUser,
    @Query('id') id?: string,
  ) {
    let existing: CoreConnectionSummary | null = null;
    let decryptedCredentials: Record<string, unknown> | null = null;
    if (id) {
      existing = await this.connectorsService.getConnection(user.tenantId, id);
      try {
        const decrypted = await this.connectorsService.getDecryptedCredentials(user.tenantId, id);
        decryptedCredentials = decrypted.credentials ?? {};
      } catch {
        decryptedCredentials = null;
      }
    }

    const providers = this.connectorsService.getAvailableProviders();
    const providerOptions = providers.map((p) => ({
      label: `${p.name} — ${p.description}`,
      value: p.id,
    }));

    // Dynamic layout groups for each registered provider
    const providerGroups = providers.map((p) => ({
      id: `group_${p.id}`,
      title: `${p.name} Credentials & Setup`,
      description: p.description,
      columns: p.fields.length > 1 ? 2 : 1,
      fields: p.fields.map((f) => `${p.id}_${f.key}`),
      showWhen: {
        field: 'provider',
        operator: 'eq' as const,
        value: p.id,
      },
    }));

    // Dynamic fields for each registered provider
    const providerFields: SDUIFormField[] = [];
    for (const p of providers) {
      for (const f of p.fields) {
        let fieldDefaultVal = f.defaultValue ?? '';
        if (existing?.provider === p.id && decryptedCredentials) {
          fieldDefaultVal = f.secret ? '' : String(decryptedCredentials[f.key] ?? '');
        }

        providerFields.push({
          name: `${p.id}_${f.key}`,
          label: f.label,
          type: f.type as any,
          required: f.required ?? false,
          secret: f.secret ?? false,
          placeholder: f.placeholder,
          helpText: f.helpText,
          defaultValue: fieldDefaultVal,
          options: f.options,
          showWhen: {
            field: 'provider',
            operator: 'eq',
            value: p.id,
          },
        });
      }
    }

    const formGroups = [
      {
        id: 'general',
        title: 'Connection Details',
        description: 'Choose your integration vendor and give this connection a descriptive label',
        columns: 2,
        fields: ['name', 'provider'],
      },
      ...providerGroups,
      ...(existing
        ? [
            {
              id: 'status_group',
              title: 'Operational Status & Health',
              description: 'Enable or pause integrations and review diagnostic probe health',
              columns: 3,
              fields: ['status', 'lastTestedStatus', 'lastTestedAt'],
            },
          ]
        : []),
    ];

    const allFields: SDUIFormField[] = [
      {
        name: 'id',
        label: 'ID',
        type: 'hidden',
        defaultValue: existing?.id,
        required: false,
        secret: false,
      },
      {
        name: 'name',
        label: 'Connection Name',
        type: 'text',
        required: true,
        placeholder: 'e.g. Production Trello or Main Stripe Store',
        defaultValue: existing?.name ?? '',
        secret: false,
      },
      {
        name: 'provider',
        label: 'Service / Provider',
        type: 'select',
        required: true,
        defaultValue: existing?.provider ?? (providers[0]?.id || 'custom'),
        options: providerOptions,
        secret: false,
      },
      ...providerFields,
      ...(existing
        ? [
            {
              name: 'status',
              label: 'Status',
              type: 'select' as const,
              required: false,
              defaultValue: existing.status,
              options: [
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
                { label: 'Error', value: 'error' },
              ],
              secret: false,
            },
            {
              name: 'lastTestedStatus',
              label: 'Diagnostic Test Status',
              type: 'text' as const,
              required: false,
              defaultValue: existing.lastTestedStatus || 'Not tested yet',
              secret: false,
            },
            {
              name: 'lastTestedAt',
              label: 'Last Probed At',
              type: 'datetime' as const,
              required: false,
              defaultValue: existing.lastTestedAt ? new Date(existing.lastTestedAt).toISOString() : '',
              secret: false,
            },
          ]
        : []),
    ];

    // Pre-populate initial record values for edit mode
    const recordValues: Record<string, unknown> = {
      id: existing?.id,
      name: existing?.name,
      provider: existing?.provider,
      status: existing?.status,
      lastTestedStatus: existing?.lastTestedStatus || 'Not tested yet',
      lastTestedAt: existing?.lastTestedAt ? new Date(existing.lastTestedAt).toISOString() : '',
    };
    if (existing && decryptedCredentials) {
      const activeProvider = this.connectorsService.getProvider(existing.provider);
      for (const [k, v] of Object.entries(decryptedCredentials)) {
        const fieldDef = activeProvider?.fields.find((f) => f.key === k);
        if (fieldDef?.secret || fieldDef?.type === 'password') {
          const masked = this.connectorsService.maskSecret(String(v));
          recordValues[`${existing.provider}_${k}`] = masked;
          recordValues[k] = masked;
        } else {
          recordValues[`${existing.provider}_${k}`] = v;
          recordValues[k] = v;
        }
      }
    }

    return {
      id: 'connection-form',
      label: existing ? `Edit Connection (${existing.name})` : 'New Connection',
      type: 'form',
      toolbar: [
        { id: 'cancel', type: 'action', label: 'Cancel', action: { type: 'cancel' } },
        {
          id: 'test',
          type: 'action',
          label: 'Test Connection',
          action: { type: 'submit', target: 'connectors.connection.test' },
        },
        { id: 'save', type: 'action', label: 'Save', action: { type: 'submit' } },
      ],
      config: {
        layout: {
          type: 'grid',
          columns: 2,
          groups: formGroups,
        },
        fields: allFields,
        submitAction: {
          type: 'submit',
          target: existing ? 'connectors.connection.update' : 'connectors.connection.create',
        },
      },
      record: existing ? recordValues : undefined,
    };
  }

  @Get('ui/views/connectors/connection-form')
  @RequirePermissions('connectors.read')
  async getConnectionFormAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Query('id') id?: string,
  ) {
    return this.getConnectionForm(user, id);
  }

  /**
   * Data source for connections table: connectors.connection & connectors
   */
  @Get('data/connectors')
  @RequirePermissions('connectors.read')
  async listData(
    @CurrentUser() user: AuthenticatedUser,
    @Query('provider') provider?: string,
  ) {
    const items = await this.connectorsService.listConnections(user.tenantId, provider);
    return {
      items,
      total: items.length,
      page: 1,
      pageSize: 50,
    };
  }

  @Get('data/connectors/connection')
  @RequirePermissions('connectors.read')
  async listDataConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Query('provider') provider?: string,
  ) {
    return this.listData(user, provider);
  }

  /**
   * Mutation: Create a connection
   */
  @Post('actions/connectors/create')
  @RequirePermissions('connectors.manage')
  async createConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    const name = String(body.name || '').trim();
    const providerId = String(body.provider || '').trim().toLowerCase();

    if (!name) throw new BadRequestException('Connection name is required');
    if (!providerId) throw new BadRequestException('Provider is required');

    const provider = this.connectorsService.getProvider(providerId);
    if (!provider) {
      throw new BadRequestException(`Unknown connector provider: "${providerId}"`);
    }

    // Extract credentials for this provider (supporting either prefixed or flat key names)
    const credentials: Record<string, unknown> = {};
    for (const f of provider.fields) {
      const val = body[`${provider.id}_${f.key}`] ?? body[f.key];
      if (val !== undefined && val !== null && val !== '') {
        credentials[f.key] = val;
      }
    }

    const baseUrl = body[`${provider.id}_baseUrl`] || body.baseUrl || provider.defaultBaseUrl;

    return this.connectorsService.createConnection(
      user.tenantId,
      {
        name,
        provider: provider.id,
        authType: 'api_key',
        baseUrl: baseUrl ? String(baseUrl).trim() : undefined,
        credentials,
        metadata: {},
      },
      user.id,
    );
  }

  @Post('actions/connectors')
  @RequirePermissions('connectors.manage')
  async createConnectionAlias1(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.createConnection(user, body);
  }

  @Post('actions/connectors/connection')
  @RequirePermissions('connectors.manage')
  async createConnectionAlias2(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.createConnection(user, body);
  }

  /**
   * Mutation: Update a connection
   */
  @Patch('actions/connectors/:id')
  @RequirePermissions('connectors.manage')
  async updateConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const existing = await this.connectorsService.getConnection(user.tenantId, id);
    const provider = this.connectorsService.getProvider(existing.provider);

    const updateInput: Record<string, unknown> = {};
    if (body.name !== undefined) updateInput.name = String(body.name).trim();
    if (body.status !== undefined) updateInput.status = body.status;

    const baseUrlVal = body[`${existing.provider}_baseUrl`] ?? body.baseUrl;
    if (baseUrlVal !== undefined) {
      updateInput.baseUrl = String(baseUrlVal).trim();
    }

    if (provider) {
      const credentials: Record<string, unknown> = {};
      let hasCredUpdates = false;
      for (const f of provider.fields) {
        const val = body[`${provider.id}_${f.key}`] ?? body[f.key];
        if (val !== undefined && val !== null) {
          // Ignore if it's blank or if it contains bullet mask characters
          if (f.secret && (val === '' || (typeof val === 'string' && val.includes('•')))) {
            continue;
          }
          credentials[f.key] = val;
          hasCredUpdates = true;
        }
      }
      if (hasCredUpdates) {
        updateInput.credentials = credentials;
      }
    }

    return this.connectorsService.updateConnection(user.tenantId, id, updateInput, user.id);
  }

  @Patch('actions/connectors/connection/:id')
  @RequirePermissions('connectors.manage')
  async updateConnectionAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.updateConnection(user, id, body);
  }

  /**
   * Mutation: Delete a connection
   */
  @Delete('actions/connectors/:id')
  @RequirePermissions('connectors.manage')
  async deleteConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.connectorsService.deleteConnection(user.tenantId, id);
    return { success: true, message: 'Connection deleted successfully' };
  }

  @Delete('actions/connectors/connection/:id')
  @RequirePermissions('connectors.manage')
  async deleteConnectionAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.deleteConnection(user, id);
  }

  /**
   * Mutation: Test connection live
   */
  @Post('actions/connectors/:id/test')
  @RequirePermissions('connectors.read')
  async testConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.connectorsService.testConnection(user.tenantId, id);
  }

  @Post('actions/connectors/connection/:id/test')
  @RequirePermissions('connectors.read')
  async testConnectionAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.testConnection(user, id);
  }

  /**
   * Mutation: Test connection live (either by id or using in-flight form credentials)
   */
  @Post('actions/connectors/test')
  @RequirePermissions('connectors.read')
  async testConnectionLive(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    const id = body.id ? String(body.id).trim() : undefined;
    return this.connectorsService.testLiveCredentials(user.tenantId, body, id);
  }

  @Post('actions/connectors/connection/test')
  @RequirePermissions('connectors.read')
  async testConnectionLiveAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.testConnectionLive(user, body);
  }
}
