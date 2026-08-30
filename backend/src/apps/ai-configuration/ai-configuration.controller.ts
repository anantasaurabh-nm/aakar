import { BadRequestException, Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SDUI_SCHEMA_VERSION, ProviderIdSchema } from '@erp/shared-contracts';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../core/auth/authenticated-user.interface';
import { PermissionsGuard } from '../../core/rbac/permissions.guard';
import { RequirePermissions } from '../../core/rbac/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CredentialStoreService } from '../../core/ai/credential-store.service';
import { AVAILABLE_PROVIDERS } from '../../core/ai/providers/provider.factory';

const ProfileParamSchema = z.enum(['light', 'reasoning']);

const SaveModelSchema = z.object({
  provider: ProviderIdSchema,
  model: z.string().min(1),
  credentialName: z.string().min(1),
  timeoutMs: z.coerce.number().int().positive().default(30000),
});

const SaveConnectionSchema = z.object({
  provider: ProviderIdSchema,
  apiKey: z.string().min(1),
});

const providerOptions = AVAILABLE_PROVIDERS.map((p) => ({ label: p, value: p }));

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiConfigurationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialStoreService,
  ) {}

  @Get('ui/pages/admin/ai-configuration')
  @RequirePermissions('ai.config.read')
  getPage() {
    return {
      schema: SDUI_SCHEMA_VERSION,
      brand: { name: 'AI Configuration', icon: 'ai' },
      navigation: { items: [] },
      page: {
        id: 'ai-configuration',
        title: 'AI Configuration',
        sections: [
          {
            id: 'ai-models',
            label: 'Models',
            type: 'table',
            toolbar: [{ id: 'refresh', type: 'action', label: 'Refresh', action: { type: 'refresh' } }],
            data: { source: 'ai.models' },
            config: {
              columns: [
                { key: 'profile', label: 'Profile', type: 'badge', sortable: false },
                { key: 'provider', label: 'Provider', type: 'text', sortable: false },
                { key: 'model', label: 'Model', type: 'text', sortable: false },
                { key: 'credentialName', label: 'Credential', type: 'text', sortable: false },
              ],
              selectable: false,
              pageSize: 10,
              density: 'comfortable',
              rowActions: [{ id: 'edit', label: 'Edit', action: { type: 'edit', target: 'ai.model.form' } }],
            },
          },
          {
            id: 'ai-connections',
            label: 'Connections',
            type: 'table',
            toolbar: [
              { id: 'new', type: 'action', label: 'New Connection', action: { type: 'create', target: 'ai.connection.form' } },
            ],
            data: { source: 'ai.connections' },
            config: {
              columns: [
                { key: 'name', label: 'Name', type: 'text', sortable: true },
                { key: 'provider', label: 'Provider', type: 'text', sortable: true },
                { key: 'updatedAt', label: 'Updated', type: 'datetime', sortable: true },
              ],
              selectable: false,
              pageSize: 10,
              density: 'comfortable',
              rowActions: [
                { id: 'edit', label: 'Replace Key', action: { type: 'edit', target: 'ai.connection.form' } },
                { id: 'delete', label: 'Delete', action: { type: 'delete', target: 'ai.connection.delete' } },
              ],
            },
          },
        ],
      },
    };
  }

  @Get('ui/views/ai-configuration/model-form')
  @RequirePermissions('ai.config.read')
  async getModelForm(@Query('profile') profile: string) {
    const parsed = ProfileParamSchema.parse(profile);
    const existing = await this.prisma.aiModelProfile.findUnique({ where: { profile: parsed } });
    const connections = await this.credentials.list();
    return {
      id: 'ai-model-form',
      label: `${parsed} model`,
      type: 'form',
      toolbar: [
        { id: 'cancel', type: 'action', label: 'Cancel', action: { type: 'cancel' } },
        { id: 'save', type: 'action', label: 'Save', action: { type: 'submit' } },
      ],
      config: {
        fields: [
          { name: 'profile', label: 'profile', type: 'hidden', required: false, defaultValue: parsed },
          {
            name: 'provider',
            label: 'Provider',
            type: 'select',
            required: true,
            defaultValue: existing?.provider ?? providerOptions[0]?.value,
            options: providerOptions,
          },
          { name: 'model', label: 'Model', type: 'text', required: true, defaultValue: existing?.model ?? '' },
          {
            name: 'credentialName',
            label: 'Credential',
            type: 'select',
            required: true,
            defaultValue: existing?.credentialName ?? '',
            options: connections.map((c) => ({ label: `${c.name} (${c.provider})`, value: c.name })),
          },
          {
            name: 'timeoutMs',
            label: 'Timeout (ms)',
            type: 'number',
            required: false,
            defaultValue: existing?.timeoutMs ?? 30000,
          },
        ],
        submitAction: { type: 'submit', target: 'ai.model.save' },
      },
    };
  }

  @Get('ui/views/ai-configuration/connection-form')
  @RequirePermissions('ai.config.read')
  async getConnectionForm(@Query('name') name?: string) {
    return {
      id: 'ai-connection-form',
      label: name ? `Replace key for ${name}` : 'New Connection',
      type: 'form',
      toolbar: [
        { id: 'cancel', type: 'action', label: 'Cancel', action: { type: 'cancel' } },
        { id: 'save', type: 'action', label: 'Save', action: { type: 'submit' } },
      ],
      config: {
        fields: [
          { name: 'name', label: 'Name', type: 'text', required: true, defaultValue: name ?? '' },
          {
            name: 'provider',
            label: 'Provider',
            type: 'select',
            required: true,
            defaultValue: providerOptions[0]?.value,
            options: providerOptions,
          },
          { name: 'apiKey', label: 'API Key', type: 'text', required: true },
        ],
        submitAction: { type: 'submit', target: 'ai.connection.save' },
      },
    };
  }

  @Get('data/admin/ai-configuration/models')
  @RequirePermissions('ai.config.read')
  async listModels() {
    const rows = await this.prisma.aiModelProfile.findMany();
    const byProfile = new Map(rows.map((r) => [r.profile, r]));
    const profiles: Array<'light' | 'reasoning'> = ['light', 'reasoning'];
    return {
      items: profiles.map((profile) => {
        const row = byProfile.get(profile);
        return {
          profile,
          provider: row?.provider ?? null,
          model: row?.model ?? null,
          credentialName: row?.credentialName ?? null,
          timeoutMs: row?.timeoutMs ?? null,
        };
      }),
      page: 1,
      pageSize: 2,
      total: 2,
    };
  }

  @Get('data/admin/ai-configuration/connections')
  @RequirePermissions('ai.config.read')
  async listConnections() {
    const rows = await this.credentials.list();
    return {
      items: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
      page: 1,
      pageSize: rows.length,
      total: rows.length,
    };
  }

  @Put('actions/ai-configuration/models/:profile')
  @RequirePermissions('ai.config.write')
  async saveModel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profile') profileParam: string,
    @Body(new ZodValidationPipe(SaveModelSchema)) body: z.infer<typeof SaveModelSchema>,
  ) {
    const profile = ProfileParamSchema.parse(profileParam);
    // Validate the credential exists and belongs to the same provider before activating.
    const credential = await this.prisma.credential.findUnique({ where: { name: body.credentialName } });
    if (!credential) throw new BadRequestException('Credential not found');
    if (credential.provider !== body.provider) {
      throw new BadRequestException('Credential provider does not match selected provider');
    }

    return this.prisma.aiModelProfile.upsert({
      where: { profile },
      create: { profile, ...body, updatedBy: user.id },
      update: { ...body, updatedBy: user.id },
    });
  }

  @Put('actions/ai-configuration/connections/:name')
  @RequirePermissions('ai.config.write')
  async saveConnection(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(SaveConnectionSchema)) body: z.infer<typeof SaveConnectionSchema>,
  ) {
    await this.credentials.save(name, body.provider, body.apiKey);
    return { name, provider: body.provider };
  }

  @Delete('actions/ai-configuration/connections/:name')
  @RequirePermissions('ai.config.write')
  async deleteConnection(@Param('name') name: string) {
    await this.credentials.remove(name);
    return { ok: true };
  }
}
