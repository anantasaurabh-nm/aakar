import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  SDUI_SCHEMA_VERSION,
  ProviderIdSchema,
  ModelProfileNameSchema,
  type ModelProfileName,
} from '@erp/shared-contracts';
import type { AiModelConfig, AiModelConfigStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../core/auth/authenticated-user.interface';
import { PermissionsGuard } from '../../core/rbac/permissions.guard';
import { RequirePermissions } from '../../core/rbac/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/crypto/crypto.service';
import { AVAILABLE_PROVIDERS } from '../../core/ai/providers/provider.factory';

const StatusSchema = z.enum(['active', 'fallback', 'disabled']);
const ProfileFieldSchema = z.union([ModelProfileNameSchema, z.literal('')]);

const ModelConfigBodySchema = z.object({
  provider: ProviderIdSchema,
  model: z.string().min(1),
  // Blank/omitted means "keep the existing key" on update — see FormFieldSchema.secret.
  apiKey: z.string().optional(),
  profile: ProfileFieldSchema.optional(),
  status: StatusSchema.default('disabled'),
  timeoutMs: z.coerce.number().int().positive().default(30000),
});

const PROVIDER_OPTIONS = AVAILABLE_PROVIDERS.map((p) => ({ label: p, value: p }));
const PROFILE_OPTIONS = [
  { label: 'Unassigned', value: '' },
  { label: 'Light Model', value: 'light' },
  { label: 'Reasoning Model', value: 'reasoning' },
];
const STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Fallback', value: 'fallback' },
  { label: 'Disabled', value: 'disabled' },
];
const PROFILE_LABEL: Record<ModelProfileName, string> = { light: 'Light Model', reasoning: 'Reasoning Model' };
const STATUS_LABEL: Record<AiModelConfigStatus, string> = { active: 'Active', fallback: 'Fallback', disabled: 'Disabled' };

/**
 * AI model configuration as a Settings surface (DoersOS AI Models PRD §8,
 * §16, §32): a list of provider/model/key configs, each optionally assigned
 * to a profile (light/reasoning) with a status (active/fallback/disabled —
 * NOT the generic entity-engine record lifecycle, which has no meaning for
 * platform-level AI configuration, §30). At most one active and one
 * fallback config per profile is enforced here, in application code.
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiConfigurationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  @Get('ui/pages/admin/ai-configuration')
  @RequirePermissions('ai.config.read')
  async getPage() {
    const rows = await this.prisma.aiModelConfig.findMany({ orderBy: { createdAt: 'asc' } });
    const groups = [...rows.map((row) => this.configGroup(row)), this.newConfigGroup()];

    return {
      schema: SDUI_SCHEMA_VERSION,
      brand: { name: 'AI Configuration', icon: 'ai' },
      navigation: { items: [] },
      page: {
        id: 'ai-configuration',
        title: 'AI Configuration',
        sections: [
          {
            id: 'ai-settings',
            label: 'Settings',
            type: 'settings',
            toolbar: [],
            config: { tabs: [{ id: 'models', label: 'Models & Providers', groups }] },
          },
        ],
      },
    };
  }

  private configGroup(row: AiModelConfig) {
    const statusLabel = STATUS_LABEL[row.status];
    return {
      id: row.id,
      label: `${row.provider} — ${row.model}`,
      subtitle: row.profile ? `${PROFILE_LABEL[row.profile]} · ${statusLabel}` : statusLabel,
      badge: statusLabel,
      fields: [
        { name: 'id', label: 'id', type: 'hidden', required: false, defaultValue: row.id },
        { name: 'provider', label: 'Provider', type: 'select', required: true, defaultValue: row.provider, options: PROVIDER_OPTIONS },
        { name: 'model', label: 'Model', type: 'text', required: true, defaultValue: row.model, placeholder: 'e.g. google/gemini-2.5-flash' },
        {
          name: 'apiKey',
          label: 'API Key',
          type: 'password',
          secret: true,
          required: false,
          placeholder: 'API key configured — leave blank to keep it',
        },
        { name: 'profile', label: 'Profile', type: 'select', required: false, defaultValue: row.profile ?? '', options: PROFILE_OPTIONS },
        { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: row.status, options: STATUS_OPTIONS },
        { name: 'timeoutMs', label: 'Timeout (ms)', type: 'number', required: false, defaultValue: row.timeoutMs },
      ],
      submitAction: { type: 'submit' as const, target: 'ai.model-config.update' },
      deleteAction: {
        type: 'submit' as const,
        target: 'ai.model-config.delete',
        confirm: { message: `Delete the ${row.provider} — ${row.model} config?` },
      },
    };
  }

  private newConfigGroup() {
    return {
      id: 'new-model-config',
      label: 'Add Model Config',
      isCreate: true,
      fields: [
        { name: 'provider', label: 'Provider', type: 'select', required: true, defaultValue: AVAILABLE_PROVIDERS[0], options: PROVIDER_OPTIONS },
        { name: 'model', label: 'Model', type: 'text', required: true, placeholder: 'e.g. google/gemini-2.5-flash' },
        { name: 'apiKey', label: 'API Key', type: 'password', secret: true, required: true, placeholder: 'Enter API key' },
        { name: 'profile', label: 'Profile', type: 'select', required: false, defaultValue: '', options: PROFILE_OPTIONS },
        { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'disabled', options: STATUS_OPTIONS },
        { name: 'timeoutMs', label: 'Timeout (ms)', type: 'number', required: false, defaultValue: 30000 },
      ],
      submitAction: { type: 'submit' as const, target: 'ai.model-config.create' },
    };
  }

  /** At most one active + one fallback config per profile — enforced here, not as a DB constraint. */
  private async assertNoConflict(profile: ModelProfileName | null, status: AiModelConfigStatus, excludeId?: string) {
    if (!profile || status === 'disabled') return;
    const conflict = await this.prisma.aiModelConfig.findFirst({
      where: { profile, status, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (conflict) {
      throw new BadRequestException(
        `Another config is already set as "${STATUS_LABEL[status]}" for ${PROFILE_LABEL[profile]} — change it first.`,
      );
    }
  }

  private assertProfileForStatus(profile: ModelProfileName | null, status: AiModelConfigStatus) {
    if ((status === 'active' || status === 'fallback') && !profile) {
      throw new BadRequestException(`Assign a profile before marking a config "${STATUS_LABEL[status]}".`);
    }
  }

  @Post('actions/ai-model-configs')
  @RequirePermissions('ai.config.write')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ModelConfigBodySchema)) body: z.infer<typeof ModelConfigBodySchema>,
  ) {
    if (!body.apiKey) throw new BadRequestException('API key is required');
    const profile = body.profile || null;
    this.assertProfileForStatus(profile, body.status);
    await this.assertNoConflict(profile, body.status);

    return this.prisma.aiModelConfig.create({
      data: {
        provider: body.provider,
        model: body.model,
        encryptedApiKey: this.crypto.encrypt(body.apiKey),
        profile,
        status: body.status,
        timeoutMs: body.timeoutMs,
        updatedBy: user.id,
      },
      select: { id: true, provider: true, model: true, profile: true, status: true, timeoutMs: true, updatedAt: true },
    });
  }

  @Put('actions/ai-model-configs/:id')
  @RequirePermissions('ai.config.write')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ModelConfigBodySchema)) body: z.infer<typeof ModelConfigBodySchema>,
  ) {
    const existing = await this.prisma.aiModelConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Model config not found');
    const profile = body.profile || null;
    this.assertProfileForStatus(profile, body.status);
    await this.assertNoConflict(profile, body.status, id);
    const encryptedApiKey = body.apiKey ? this.crypto.encrypt(body.apiKey) : existing.encryptedApiKey;

    return this.prisma.aiModelConfig.update({
      where: { id },
      data: {
        provider: body.provider,
        model: body.model,
        encryptedApiKey,
        profile,
        status: body.status,
        timeoutMs: body.timeoutMs,
        updatedBy: user.id,
      },
      select: { id: true, provider: true, model: true, profile: true, status: true, timeoutMs: true, updatedAt: true },
    });
  }

  @Delete('actions/ai-model-configs/:id')
  @RequirePermissions('ai.config.write')
  async remove(@Param('id') id: string) {
    await this.prisma.aiModelConfig.delete({ where: { id } });
    return { ok: true };
  }
}
