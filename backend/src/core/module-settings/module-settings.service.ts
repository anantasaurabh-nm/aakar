import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorsService } from '../connectors/connectors.service';
import { getSettingsForModule, loadModuleOnDisk } from '../entity-engine/module-schema-loader';
import type { FormConfig, SDUIFormField } from '@erp/shared-contracts';

@Injectable()
export class ModuleSettingsService {
  private readonly logger = new Logger(ModuleSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectorsService: ConnectorsService,
  ) {}

  /**
   * Resolves a setting value: checks user-scope first, then falls back to global-scope.
   */
  async get(tenantId: string, moduleId: string, key: string, userId?: string): Promise<unknown> {
    if (userId) {
      const userSetting = await this.prisma.moduleSetting.findFirst({
        where: { tenantId, moduleId, userId, key },
      });
      if (userSetting && userSetting.value !== null && userSetting.value !== undefined) {
        return userSetting.value;
      }
    }

    const globalSetting = await this.prisma.moduleSetting.findFirst({
      where: { tenantId, moduleId, userId: null, key },
    });
    if (globalSetting && globalSetting.value !== null && globalSetting.value !== undefined) {
      return globalSetting.value;
    }

    // Fallback to defaultValue defined in manifest if any
    const settingsDef = getSettingsForModule(moduleId);
    const fieldDef = settingsDef?.fields.find((f) => f.key === key);
    return fieldDef?.defaultValue ?? null;
  }

  /**
   * Resolves all active settings for a module (user overrides merged over global settings).
   */
  async getAll(tenantId: string, moduleId: string, userId?: string): Promise<Record<string, unknown>> {
    const settingsDef = getSettingsForModule(moduleId);
    const result: Record<string, unknown> = {};

    // 1. Start with defaults
    if (settingsDef) {
      for (const f of settingsDef.fields) {
        if (f.defaultValue !== undefined) {
          result[f.key] = f.defaultValue;
        }
      }
    }

    // 2. Load global settings
    const globalSettings = await this.prisma.moduleSetting.findMany({
      where: { tenantId, moduleId, userId: null },
    });
    for (const gs of globalSettings) {
      result[gs.key] = gs.value;
    }

    // 3. Merge user settings if userId provided
    if (userId) {
      const userSettings = await this.prisma.moduleSetting.findMany({
        where: { tenantId, moduleId, userId },
      });
      for (const us of userSettings) {
        result[us.key] = us.value;
      }
    }

    return result;
  }

  /**
   * Resolves the pre-authenticated Connector / MCP HTTP Client for a module setting.
   */
  async getConnectionClient(tenantId: string, moduleId: string, key: string, userId?: string) {
    const connectionId = (await this.get(tenantId, moduleId, key, userId)) as string;
    if (!connectionId || typeof connectionId !== 'string') {
      return null;
    }
    return this.connectorsService.getHttpClient(tenantId, connectionId);
  }

  /**
   * Resolves the CoreConnection record for a module setting.
   */
  async getConnection(tenantId: string, moduleId: string, key: string, userId?: string) {
    const connectionId = (await this.get(tenantId, moduleId, key, userId)) as string;
    if (!connectionId || typeof connectionId !== 'string') {
      return null;
    }
    return this.prisma.coreConnection.findFirst({
      where: { id: connectionId, tenantId },
    });
  }

  /**
   * Builds the declarative SDUI FormConfig for a module's settings view.
   */
  async getSettingsFormConfig(
    tenantId: string,
    moduleId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<FormConfig | null> {
    const mod = loadModuleOnDisk(moduleId);
    if (!mod) {
      throw new NotFoundException(`Module "${moduleId}" not found.`);
    }

    const settingsDef = mod.manifest.settings;
    if (!settingsDef || !settingsDef.fields || settingsDef.fields.length === 0) {
      return null;
    }

    // Fetch all active connections for this tenant to hydrate "connection" fields
    const activeConnections = await this.prisma.coreConnection.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });

    const currentValues = await this.getAll(tenantId, moduleId, userId);
    const sduiFields: SDUIFormField[] = [];

    for (const field of settingsDef.fields) {
      const isUserScope = field.scope === 'user';
      const isUserAccess = field.access === 'user';

      // If field requires admin access and current user is not admin, disable it or hide it
      const isReadOnly = !isUserAccess && !isAdmin;
      const activeValue = currentValues[field.key] ?? field.defaultValue;

      if (field.type === 'connection') {
        const providerFilter = field.provider && field.provider !== 'any' ? field.provider.toLowerCase() : null;
        const matchingConnections = providerFilter
          ? activeConnections.filter((c) => c.provider.toLowerCase() === providerFilter)
          : activeConnections;

        const options = [
          { label: '-- Select a Connection --', value: '' },
          ...matchingConnections.map((c) => ({
            label: `${c.name} (${c.provider.toUpperCase()}) - ${c.status.toUpperCase()}`,
            value: c.id,
          })),
        ];

        sduiFields.push({
          name: field.key,
          label: `${field.label}${isUserScope ? ' (Personal Preference)' : ''}`,
          type: 'select',
          required: field.required ?? false,
          defaultValue: String(activeValue ?? ''),
          helpText:
            field.helpText ||
            (matchingConnections.length === 0
              ? `No ${providerFilter ? providerFilter.toUpperCase() : ''} connections configured yet. Visit Admin Hub > Connectors to create one.`
              : undefined),
          disabled: isReadOnly,
          secret: false,
          options,
        });
      } else if (field.type === 'switch') {
        sduiFields.push({
          name: field.key,
          label: `${field.label}${isUserScope ? ' (Personal)' : ''}`,
          type: 'switch',
          required: field.required ?? false,
          defaultValue: Boolean(activeValue ?? false),
          helpText: field.helpText,
          disabled: isReadOnly,
          secret: false,
        });
      } else if (field.type === 'number') {
        sduiFields.push({
          name: field.key,
          label: `${field.label}${isUserScope ? ' (Personal)' : ''}`,
          type: 'number',
          required: field.required ?? false,
          defaultValue: typeof activeValue === 'number' ? activeValue : Number(activeValue ?? 0),
          helpText: field.helpText,
          disabled: isReadOnly,
          secret: false,
        });
      } else if (field.type === 'select') {
        sduiFields.push({
          name: field.key,
          label: `${field.label}${isUserScope ? ' (Personal)' : ''}`,
          type: 'select',
          required: field.required ?? false,
          defaultValue: String(activeValue ?? ''),
          helpText: field.helpText,
          options: field.options ?? [],
          disabled: isReadOnly,
          secret: false,
        });
      } else if (field.type === 'textarea') {
        sduiFields.push({
          name: field.key,
          label: `${field.label}${isUserScope ? ' (Personal)' : ''}`,
          type: 'textarea',
          required: field.required ?? false,
          defaultValue: String(activeValue ?? ''),
          helpText: field.helpText,
          placeholder: field.placeholder,
          disabled: isReadOnly,
          secret: false,
        });
      } else {
        // default text / password
        sduiFields.push({
          name: field.key,
          label: `${field.label}${isUserScope ? ' (Personal)' : ''}`,
          type: field.type === 'password' ? 'password' : 'text',
          required: field.required ?? false,
          defaultValue: String(activeValue ?? ''),
          helpText: field.helpText,
          placeholder: field.placeholder,
          disabled: isReadOnly,
          secret: field.type === 'password',
        });
      }
    }

    return {
      id: `${moduleId}-settings-form`,
      title: settingsDef.title || `${mod.manifest.name} Settings`,
      description:
        settingsDef.description ||
        `Configure integration bindings, external connectors, and operational parameters for ${mod.manifest.name}.`,
      fields: sduiFields,
      submitAction: {
        type: 'submit',
        target: `/api/actions/${moduleId}/settings`,
        label: 'Save Settings',
      },
    };
  }

  /**
   * Updates settings values for a module according to their declared scope and permissions.
   */
  async updateSettings(
    tenantId: string,
    moduleId: string,
    values: Record<string, unknown>,
    userId: string,
    isAdmin: boolean,
  ) {
    const settingsDef = getSettingsForModule(moduleId);
    if (!settingsDef) {
      throw new NotFoundException(`No settings declared for module "${moduleId}".`);
    }

    for (const [key, val] of Object.entries(values)) {
      const fieldDef = settingsDef.fields.find((f) => f.key === key);
      if (!fieldDef) continue;

      const isUserScope = fieldDef.scope === 'user';
      const isUserAccess = fieldDef.access === 'user';

      if (!isUserAccess && !isAdmin) {
        throw new ForbiddenException(`Only administrators can modify the global setting "${fieldDef.label}".`);
      }

      const targetUserId = isUserScope ? userId : null;

      const existing = await this.prisma.moduleSetting.findFirst({
        where: {
          tenantId,
          moduleId,
          userId: targetUserId,
          key,
        },
      });

      if (existing) {
        await this.prisma.moduleSetting.update({
          where: { id: existing.id },
          data: { value: val as any },
        });
      } else {
        await this.prisma.moduleSetting.create({
          data: {
            tenantId,
            moduleId,
            userId: targetUserId,
            key,
            value: val as any,
          },
        });
      }
    }

    this.logger.log(`Updated settings for module "${moduleId}" (tenant: ${tenantId}, user: ${userId})`);
    return { success: true, message: 'Settings saved successfully.' };
  }
}
