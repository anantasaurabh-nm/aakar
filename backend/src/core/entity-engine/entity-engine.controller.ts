import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  ColumnFilterSchema,
  SDUI_SCHEMA_VERSION,
  type ColumnFilter,
  type ComputedRecordWorkflow,
  type ComputedWorkflowAction,
} from '@erp/shared-contracts';
import type { RecordStatus } from '@prisma/client';

/** A malformed `filters` query string must never 500 the list endpoint — treat it as "no filters." */
function parseColumnFilters(raw: string | undefined): ColumnFilter[] {
  try {
    const parsed = ColumnFilterSchema.array().safeParse(JSON.parse(raw ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { ModuleEnabledGuard } from '../modules-registry/module-enabled.guard';
import { ModuleRegistryService } from '../modules-registry/module-registry.service';
import { PermissionsService } from '../rbac/permissions.service';
import { CapabilityRegistry } from '../capabilities/capability-registry.service';
import { EntityRegistryService, resolveUserToken } from './entity-registry.service';
import { EntityRepositoryService } from './entity-repository.service';
import { buildEntityRequestSchema } from './entity-request-schema.builder';
import { resolveRecordDateRange } from '../common/record-date.util';
import {
  columnsFromSchema,
  formFieldsFromSchema,
  firstSelectField,
  buildDashboardConfigFromInsights,
} from './table-section.builder';
import { loadModuleOnDisk, getWorkflowForEntity, getSettingsForModule } from './module-schema-loader';
import { ReferenceResolverService } from './reference-resolver.service';
import { ModuleSettingsService } from '../module-settings/module-settings.service';
import { NotificationsController } from '../../apps/notifications/notifications.controller';

@Controller()
@UseGuards(JwtAuthGuard, ModuleEnabledGuard)
export class EntityEngineController {
  constructor(
    private readonly entityRegistry: EntityRegistryService,
    private readonly entityRepository: EntityRepositoryService,
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly moduleRegistry: ModuleRegistryService,
    private readonly permissionsService: PermissionsService,
    private readonly referenceResolver: ReferenceResolverService,
    private readonly moduleSettingsService: ModuleSettingsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private async assertRead(user: AuthenticatedUser, module: string, entityKey: string) {
    await this.assertOperation(user, module, entityKey, 'read');
  }

  /**
   * Checked before request-body validation so an unauthorized caller learns
   * "forbidden," never the entity's field/validation requirements (which a
   * 400 raised by zod first would otherwise reveal).
   */
  private async assertOperation(user: AuthenticatedUser, module: string, entityKey: string, operation: string) {
    const allowed = await this.permissionsService.hasPermission(user.role, `${module}.${entityKey}.${operation}`);
    if (!allowed) throw new ForbiddenException(`Missing required permission: ${module}.${entityKey}.${operation}`);
  }

  @Get('ui/pages/app/:module')
  async getPage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('module') module: string,
    @Query('view') view?: string,
    @Query('record') record?: string,
  ) {
    if (module === 'notifications') {
      try {
        const notifCtrl = this.moduleRef.get(NotificationsController, { strict: false });
        if (notifCtrl) {
          return await notifCtrl.getAdminPage(user);
        }
      } catch {
        // continue to normal page resolution
      }
    }

    const registryEntry = await this.moduleRegistry.get(module);
    const entities = Object.entries(this.entitiesForModule(module));
    if (entities.length > 0) await this.assertRead(user, module, entities[0]![0]);
    const hasSettings = Boolean(getSettingsForModule(module));

    // Handle standard SDUI Settings View if requested
    if (view === 'settings' && hasSettings) {
      const roleUpper = user.role?.toUpperCase();
      const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'SYSTEM_ADMIN' || roleUpper === 'SUPER_ADMIN';
      const formConfig = await this.moduleSettingsService.getSettingsFormConfig(
        user.tenantId,
        module,
        user.id,
        isAdmin,
      );

      if (formConfig) {
        const modManifest = loadModuleOnDisk(module)?.manifest;
        const modName = modManifest?.name ?? registryEntry?.name ?? module;
        return {
          schema: SDUI_SCHEMA_VERSION,
          brand: {
            name: modName,
            icon: registryEntry?.icon ?? (modManifest as any)?.icon ?? 'settings',
            moduleId: module,
            hasSettings,
          },
          navigation: { items: [] },
          page: {
            id: `${module}-settings-view`,
            title: `${modName} Settings`,
            sections: [
              {
                id: `${module}-settings-form`,
                label: `${modName} Settings`,
                type: 'form',
                toolbar: [
                  { id: 'cancel', type: 'action', label: 'Cancel', action: { type: 'cancel' } },
                  { id: 'save', type: 'action', label: 'Save Settings', action: { type: 'submit' } },
                ],
                config: formConfig,
              },
            ],
          },
        };
      }
    }

    // Check if module defines a custom home view (e.g. ui/views/home.json)
    const moduleOnDisk = loadModuleOnDisk(module);
    if (moduleOnDisk?.views?.home) {
      const customHome = moduleOnDisk.views.home as Record<string, unknown>;
      const rawPage = (customHome.page ?? customHome) as Record<string, unknown>;
      const rawSections = (rawPage.sections ?? customHome.sections ?? []) as Array<Record<string, unknown>>;

      // Hydrate any form fields with dynamic options if they reference another entity
      const hydratedSections = await Promise.all(
        rawSections.map(async (sec) => {
          let updatedSec = { ...sec };
          if (updatedSec.type === 'form' && updatedSec.config && Array.isArray((updatedSec.config as any).fields)) {
            const fields = await Promise.all(
              (updatedSec.config as any).fields.map(async (f: any) => {
                let opts = f.options;
                if ((f.type === 'select' || f.type === 'reference') && f.entity && (!opts || opts.length === 0)) {
                  opts = await this.referenceResolver.getOptions(f.entity, user.tenantId, f.displayField);
                }
                const defaultValue = f.defaultValue ? resolveUserToken(f.defaultValue, user) : f.defaultValue;
                return { ...f, options: opts, defaultValue };
              }),
            );
            updatedSec = {
              ...updatedSec,
              config: {
                ...(updatedSec.config as any),
                fields,
              },
            };
          }

          if (updatedSec.data && (updatedSec.data as any).params && typeof (updatedSec.data as any).params === 'object') {
            const boundParams: Record<string, unknown> = {};
            for (const [k, v] of Object.entries((updatedSec.data as any).params)) {
              boundParams[k] = resolveUserToken(v, user);
            }
            updatedSec = {
              ...updatedSec,
              data: {
                ...(updatedSec.data as any),
                params: boundParams,
              },
            };
          }

          return updatedSec;
        }),
      );

      return {
        schema: SDUI_SCHEMA_VERSION,
        brand: {
          name: registryEntry?.name ?? (customHome.brand as any)?.name ?? module,
          icon: registryEntry?.icon ?? (customHome.brand as any)?.icon ?? module,
          moduleId: module,
          hasSettings,
        },
        navigation: (customHome.navigation as any) ?? { items: [] },
        page: {
          id: String(rawPage.id ?? module),
          title: String(rawPage.title ?? registryEntry?.name ?? module),
          sections: hydratedSections,
        },
      };
    }

    let sections = entities.flatMap(([entityKey, entity]) => [
      {
        id: `${entityKey}-insights`,
        label: 'Insights',
        type: 'dashboard' as const,
        toolbar: [
          {
            id: 'period',
            type: 'filter' as const,
            field: 'recordDate',
            options: [
              { label: 'Today', value: 'today' },
              { label: 'Yesterday', value: 'yesterday' },
              { label: 'Last 7 Days', value: 'last_7_days' },
              { label: 'Last 30 Days', value: 'last_30_days' },
              { label: 'This Week', value: 'this_week' },
              { label: 'This Month', value: 'this_month' },
              { label: 'All Time', value: 'all_time' },
            ],
            defaultValue: 'last_30_days',
          },
        ],
        data: { source: `${module}.${entityKey}.insights` },
        config: { cards: [], charts: [] },
      },
      {
        id: `${entityKey}-table`,
        label: entity.label ?? entityKey,
        type: 'table' as const,
        toolbar: [
          { id: 'new', type: 'action' as const, label: 'New', action: { type: 'create' as const, target: `${module}.${entityKey}.form` } },
          { id: 'search', type: 'search' as const },
          {
            id: 'status',
            type: 'filter' as const,
            field: 'status',
            options: [
              { label: 'Draft', value: 'draft' },
              { label: 'Submitted', value: 'submitted' },
              { label: 'Approved', value: 'approved' },
              { label: 'Cancelled', value: 'cancelled' },
            ],
          },
          { id: 'columns', type: 'columns' as const },
          { id: 'refresh', type: 'action' as const, label: 'Refresh', action: { type: 'refresh' as const } },
        ],
        data: { source: `${module}.${entityKey}` },
        state: record ? { initialRecordId: record } : undefined,
        config: {
          columns: columnsFromSchema(entity),
          selectable: true,
          pageSize: 50,
          density: 'comfortable' as const,
          detailView: true,
        },
      },
    ]);

    // If a specific record was requested, elevate the table/detail section first
    const orderedSections = (() => {
      if (!record) return sections;
      const tableIndex = sections.findIndex((s) => s.type === 'table');
      if (tableIndex <= 0) return sections;
      return [sections[tableIndex], ...sections.slice(0, tableIndex), ...sections.slice(tableIndex + 1)];
    })();

    return {
      schema: SDUI_SCHEMA_VERSION,
      brand: {
        name: registryEntry?.name ?? module,
        icon: registryEntry?.icon ?? module,
        moduleId: module,
        hasSettings,
      },
      navigation: { items: [] },
      page: { id: module, title: registryEntry?.name ?? module, sections: orderedSections },
    };
  }

  @Get('ui/views/:module/:entity/form')
  async getForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('module') module: string,
    @Param('entity') entityKey: string,
    @Query('id') id?: string,
  ) {
    await this.assertRead(user, module, entityKey);
    const entity = this.entityRegistry.getEntityDefinition(module, entityKey);
    const existing = id ? await this.entityRepository.getById(module, entityKey, user.tenantId, id) : undefined;

    const dynamicOptions: Record<string, { label: string; value: string }[]> = {};
    for (const [key, field] of Object.entries(entity.fields)) {
      if (field.type === 'reference' && field.entity) {
        dynamicOptions[key] = await this.referenceResolver.getOptions(field.entity, user.tenantId, field.displayField);
      }
    }

    // Check if module defines a custom form/detail view (e.g. ui/views/<entity>-form.json or ui/views/<entity>-detail.json)
    const moduleOnDisk = loadModuleOnDisk(module);
    const rawCustomView =
      (moduleOnDisk?.views?.[`${entityKey}-form`] as Record<string, unknown> | undefined) ||
      (moduleOnDisk?.views?.[`${entityKey}-detail`] as Record<string, unknown> | undefined) ||
      (moduleOnDisk?.views?.['form'] as Record<string, unknown> | undefined);

    const customView =
      rawCustomView && typeof rawCustomView === 'object' && (rawCustomView as any).page?.sections
        ? (rawCustomView as any).page.sections.find((s: any) => s.type === 'form') || rawCustomView
        : rawCustomView;

    // Resolve related sections (e.g. Master-Detail sub-tables like Payroll or Leaves)
    const relatedSections: any[] = [];
    const rawRelated = (customView?.relatedSections ?? (customView?.config as any)?.relatedSections ?? []) as Array<Record<string, unknown>>;
    if (existing && Array.isArray(rawRelated) && rawRelated.length > 0) {
      for (const rel of rawRelated) {
        if (!rel || typeof rel !== 'object') continue;
        const source = (rel.data as any)?.source;
        if (source && typeof source === 'string') {
          const [relMod, relEnt] = source.split('.');
          if (relMod && relEnt) {
            const allowed = await this.permissionsService.hasPermission(user.role, `${relMod}.${relEnt}.read`);
            if (!allowed) continue;
          }
        }

        // Bind $record.<field> and $currentuser tokens in params
        const boundParams: Record<string, unknown> = {};
        const relParams = (rel.data as any)?.params;
        if (relParams && typeof relParams === 'object') {
          for (const [k, v] of Object.entries(relParams)) {
            if (typeof v === 'string' && v.startsWith('$record.')) {
              const fieldName = v.slice(8);
              boundParams[k] = (existing as any)[fieldName] ?? '';
            } else {
              boundParams[k] = resolveUserToken(v, user);
            }
          }
        }

        // Auto-populate columns if omitted
        let relConfig = (rel.config as Record<string, unknown>) || {};
        if (!relConfig.columns && source && typeof source === 'string') {
          const [relMod, relEnt] = source.split('.');
          try {
            const targetEnt = this.entityRegistry.getEntityDefinition(relMod!, relEnt!);
            if (targetEnt) {
              relConfig = {
                ...relConfig,
                columns: columnsFromSchema(targetEnt),
              };
            }
          } catch {
            // Ignore if external or capability
          }
        }

        relatedSections.push({
          ...rel,
          data: {
            ...(rel.data as any),
            params: boundParams,
          },
          config: relConfig,
        });
      }
    }

    // Hydrate fields
    let fields = formFieldsFromSchema(entity, existing, dynamicOptions);
    if (customView && (customView.config as any)?.fields && Array.isArray((customView.config as any).fields)) {
      fields = await Promise.all(
        (customView.config as any).fields.map(async (f: any) => {
          let opts = f.options;
          if ((f.type === 'select' || f.type === 'reference') && f.entity && (!opts || opts.length === 0)) {
            opts = await this.referenceResolver.getOptions(f.entity, user.tenantId, f.displayField);
          } else if (dynamicOptions[f.name] && (!opts || opts.length === 0)) {
            opts = dynamicOptions[f.name];
          }
          return {
            ...f,
            defaultValue: existing?.[f.name] ?? (f.defaultValue ? resolveUserToken(f.defaultValue, user) : ''),
            options: opts,
          };
        }),
      );
    }

    const layout = (customView?.config as any)?.layout || customView?.layout;
    const submitTarget =
      (customView?.config as any)?.submitAction?.target ||
      (existing ? `${module}.${entityKey}.update` : `${module}.${entityKey}.create`);

    // Resolve custom Level 4 Workflow metadata if defined for this entity
    let computedWorkflow: ComputedRecordWorkflow | undefined = undefined;
    const workflow = getWorkflowForEntity(module, entityKey);
    if (workflow && existing) {
      const currentStatus = (existing.record_status as string) || workflow.initialStatus || 'draft';
      const stateConfig = workflow.states[currentStatus as keyof typeof workflow.states];
      if (stateConfig) {
        let forwardAction: ComputedWorkflowAction | undefined = undefined;
        const sideActions: ComputedWorkflowAction[] = [];

        for (const t of stateConfig.transitions || []) {
          let disabled = false;
          let disabledReason: string | undefined = undefined;

          // Check maker-checker: submitter/creator cannot approve their own submission
          if (t.makerChecker) {
            const creator = existing.created_by;
            const submitter = existing.submitted_by;
            if (user.id === creator || (submitter && user.id === submitter)) {
              disabled = true;
              disabledReason = 'Maker-checker rule: You cannot approve your own submission';
            }
          }

          // Check required roles
          if (!disabled && t.requiredRoles && t.requiredRoles.length > 0) {
            const allowedRoles = t.requiredRoles.map((r) => r.toUpperCase());
            if (!allowedRoles.includes(user.role.toUpperCase())) {
              disabled = true;
              disabledReason = `Requires role: ${t.requiredRoles.join(', ')}`;
            }
          }

          const actionItem: ComputedWorkflowAction = {
            label: t.label,
            to: t.to,
            actionType: t.actionType || 'side',
            confirm: t.confirm,
            disabled,
            disabledReason,
          };

          if (t.actionType === 'forward' && !forwardAction) {
            forwardAction = actionItem;
          } else {
            sideActions.push(actionItem);
          }
        }

        // Compute visual stepper pipeline
        const pipeline = workflow.pipeline || ['draft', 'submitted', 'approved'];
        const currentPipelineIndex = pipeline.indexOf(currentStatus);

        const steps = pipeline.map((stepKey, idx) => {
          let stepStatus: 'completed' | 'current' | 'upcoming' | 'cancelled' = 'upcoming';
          if (currentStatus === 'cancelled') {
            stepStatus = stepKey === currentStatus ? 'cancelled' : idx < currentPipelineIndex ? 'completed' : 'upcoming';
          } else if (idx < currentPipelineIndex) {
            stepStatus = 'completed';
          } else if (idx === currentPipelineIndex) {
            stepStatus = 'current';
          }

          let performedBy: string | null = null;
          let performedAt: string | null = null;
          if (stepKey === 'submitted') {
            performedBy = (existing.submitted_by as string) || (existing.created_by as string) || null;
            performedAt = (existing.submitted_at as string) || null;
          } else if (stepKey === 'approved') {
            performedBy = (existing.approved_by as string) || null;
            performedAt = (existing.approved_at as string) || null;
          } else if (stepKey === 'draft') {
            performedBy = (existing.created_by as string) || null;
            performedAt = (existing.created_at as string) || null;
          }

          const stepLabel = workflow.states[stepKey as keyof typeof workflow.states]?.label || stepKey.toUpperCase();
          return {
            key: stepKey,
            label: stepLabel,
            status: stepStatus,
            performedBy,
            performedAt,
          };
        });

        computedWorkflow = {
          workflowId: workflow.id,
          currentStatus,
          stateLabel: stateConfig.label,
          badgeTone: stateConfig.badgeTone || 'neutral',
          canEdit: stateConfig.canEdit ?? false,
          forwardAction,
          sideActions,
          stepper: {
            currentStepIndex: currentPipelineIndex >= 0 ? currentPipelineIndex : 0,
            steps,
          },
        };
      }
    }

    const customToolbar = (customView as any)?.toolbar || (entity as any)?.toolbar;
    const baseToolbar = [
      { id: 'cancel', type: 'action' as const, label: 'Cancel', action: { type: 'cancel' as const } },
      { id: 'save', type: 'action' as const, label: 'Save', action: { type: 'submit' as const } },
    ];
    const toolbar = customToolbar && Array.isArray(customToolbar) && customToolbar.length > 0
      ? [
          ...baseToolbar,
          ...customToolbar.filter((t: any) => t && t.id !== 'cancel' && t.id !== 'save'),
        ]
      : baseToolbar;

    return {
      id: `${module}-${entityKey}-form`,
      label: existing ? `Edit ${entity.label ?? entityKey}` : `New ${entity.label ?? entityKey}`,
      type: 'form' as const,
      toolbar,
      config: {
        fields,
        layout,
        submitAction: { type: 'submit' as const, target: submitTarget },
      },
      relatedSections: relatedSections.length > 0 ? relatedSections : undefined,
      record: existing,
      workflow: computedWorkflow,
    };
  }

  @Get('data/:module/:entity')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('module') module: string,
    @Param('entity') entityKey: string,
    @Query() query: Record<string, string>,
  ) {
    const range = resolveRecordDateRange(query.recordDate);
    const result = await this.capabilityRegistry.execute(
      `${module}.${entityKey}.list`,
      {
        ...query,
        search: query.search,
        status: query.status,
        originModule: query.originModule,
        originRecordId: query.originRecordId,
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
        recordDateStart: range?.start,
        recordDateEnd: range?.end,
        sortBy: query.sortBy,
        sortDir: query.sortDir === 'asc' ? 'asc' : query.sortDir === 'desc' ? 'desc' : undefined,
        columnFilters: parseColumnFilters(query.filters),
      },
      user,
    );
    return { items: result.rows ?? [], page: Number(query.page) || 1, pageSize: Number(query.pageSize) || 50, total: result.total ?? 0 };
  }

  @Get('data/:module/:entity/insights')
  async insights(
    @CurrentUser() user: AuthenticatedUser,
    @Param('module') module: string,
    @Param('entity') entityKey: string,
    @Query('recordDate') recordDate?: string,
  ) {
    await this.assertRead(user, module, entityKey);
    const entity = this.entityRegistry.getEntityDefinition(module, entityKey);
    const range = resolveRecordDateRange(recordDate ?? 'last_30_days');
    const insights = await this.entityRepository.insights(module, entityKey, user.tenantId, {
      recordDateStart: range?.start,
      recordDateEnd: range?.end,
      breakdownField: firstSelectField(entity),
    });
    return buildDashboardConfigFromInsights(entity, insights);
  }

  @Post('actions/:module/:entity')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('module') module: string,
    @Param('entity') entityKey: string,
    @Body() body: Record<string, unknown>,
  ) {
    const entity = this.entityRegistry.getEntityDefinition(module, entityKey);
    await this.assertOperation(user, module, entityKey, 'create');
    const parsed = buildEntityRequestSchema(entity).safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const result = await this.capabilityRegistry.execute(`${module}.${entityKey}.create`, parsed.data, user);
    return result.rows?.[0];
  }

  @Patch('actions/:module/:entity/:id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('module') module: string,
    @Param('entity') entityKey: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const entity = this.entityRegistry.getEntityDefinition(module, entityKey);
    await this.assertOperation(user, module, entityKey, 'update');
    const parsed = buildEntityRequestSchema(entity, { partial: true }).safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const result = await this.capabilityRegistry.execute(`${module}.${entityKey}.update`, { ...parsed.data, id }, user);
    return result.rows?.[0];
  }

  @Patch('actions/:module/:entity/:id/transition')
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('module') module: string,
    @Param('entity') entityKey: string,
    @Param('id') id: string,
    @Body('to') to: RecordStatus,
  ) {
    if (!to) throw new BadRequestException('Missing target status "to"');
    const result = await this.capabilityRegistry.execute(`${module}.${entityKey}.transition`, { id, to }, user);
    return result.rows?.[0];
  }

  @Delete('actions/:module/:entity/:id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('module') module: string,
    @Param('entity') entityKey: string,
    @Param('id') id: string,
  ) {
    const result = await this.capabilityRegistry.execute(`${module}.${entityKey}.transition`, { id, to: 'deleted' }, user);
    return result.rows?.[0];
  }

  private entitiesForModule(module: string) {
    return this.entityRegistry.entitiesForModule(module);
  }
}
