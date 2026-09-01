import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ColumnFilterSchema, SDUI_SCHEMA_VERSION, type ColumnFilter } from '@erp/shared-contracts';
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
import { EntityRegistryService } from './entity-registry.service';
import { EntityRepositoryService } from './entity-repository.service';
import { buildEntityRequestSchema } from './entity-request-schema.builder';
import { resolveRecordDateRange } from '../common/record-date.util';
import {
  columnsFromSchema,
  formFieldsFromSchema,
  firstSelectField,
  buildDashboardConfigFromInsights,
} from './table-section.builder';

@Controller()
@UseGuards(JwtAuthGuard, ModuleEnabledGuard)
export class EntityEngineController {
  constructor(
    private readonly entityRegistry: EntityRegistryService,
    private readonly entityRepository: EntityRepositoryService,
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly moduleRegistry: ModuleRegistryService,
    private readonly permissionsService: PermissionsService,
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
  async getPage(@CurrentUser() user: AuthenticatedUser, @Param('module') module: string) {
    const registryEntry = await this.moduleRegistry.get(module);
    const entities = Object.entries(this.entitiesForModule(module));
    if (entities.length > 0) await this.assertRead(user, module, entities[0]![0]);

    const sections = entities.flatMap(([entityKey, entity]) => [
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
        config: {
          columns: columnsFromSchema(entity),
          selectable: true,
          pageSize: 50,
          density: 'comfortable' as const,
          detailView: true,
        },
      },
    ]);

    return {
      schema: SDUI_SCHEMA_VERSION,
      brand: { name: registryEntry?.name ?? module, icon: registryEntry?.icon ?? module },
      navigation: { items: [] },
      page: { id: module, title: registryEntry?.name ?? module, sections },
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

    return {
      id: `${module}-${entityKey}-form`,
      label: existing ? `Edit ${entity.label ?? entityKey}` : `New ${entity.label ?? entityKey}`,
      type: 'form' as const,
      toolbar: [
        { id: 'cancel', type: 'action' as const, label: 'Cancel', action: { type: 'cancel' as const } },
        { id: 'save', type: 'action' as const, label: 'Save', action: { type: 'submit' as const } },
      ],
      config: {
        fields: formFieldsFromSchema(entity, existing),
        submitAction: { type: 'submit' as const, target: existing ? `${module}.${entityKey}.update` : `${module}.${entityKey}.create` },
      },
      // Not part of FormConfig — RecordView reads this directly for the
      // record_status pill/lifecycle toolbar, which is metadata, not a
      // schema-defined field `formFieldsFromSchema` would ever include.
      record: existing,
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
