import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { StructuredQuery, CapabilityResult, ColumnFilter, QuerySelectField, QueryJoin } from '@erp/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../rbac/permissions.service';
import { ModuleRegistryService } from '../modules-registry/module-registry.service';
import { tableName, ident, isValidIdentifier } from '../entity-engine/sql-ident.util';
import { operatorToSql } from '../entity-engine/entity-repository.service';
import { AiFlowLoggerService } from '../ai/ai-flow-logger.service';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

interface ResolvedEntityRef {
  module: string;
  entity: string;
  alias: string;
  sqlTable: Prisma.Sql;
  isCustomTable: boolean;
  hasTenant: boolean;
  tenantColumn?: string;
  requiredPermission: string;
}

@Injectable()
export class SafeQueryService {
  private readonly logger = new Logger('SafeQueryEngine');

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly moduleRegistry: ModuleRegistryService,
    private readonly aiLogger: AiFlowLoggerService,
  ) {}

  /**
   * Intelligently normalizes raw LLM output or loose parameters into a valid StructuredQuery AST.
   * Automatically infers missing joins and resolves entity/field aliases.
   */
  normalizeQuery(rawInput: any): StructuredQuery {
    let input = rawInput;

    if (typeof input === 'string') {
      const sql = input.trim();
      const fromMatch = sql.match(/from\s+([a-zA-Z0-9_-]+)/i);
      const joinMatch = sql.match(/join\s+([a-zA-Z0-9_-]+)/i);
      const whereMatch = sql.match(/where\s+(.+?)(?:group|order|limit|$)/i);
      const selectMatch = sql.match(/select\s+(.+?)\s+from/i);

      let parsedWhere: any[] = [];
      if (whereMatch) {
        const whereClause = whereMatch[1].trim();
        const roleMatch = whereClause.match(/role\s*(?:=|ILIKE|LIKE)\s*['"]?([a-zA-Z0-9_-]+)['"]?/i);
        if (roleMatch) {
          parsedWhere.push({ field: 'user.role', operator: 'eq', value: roleMatch[1].toUpperCase() });
        }
      }

      input = {
        from: fromMatch ? fromMatch[1] : 'users',
        joins: joinMatch ? [{ table: joinMatch[1] }] : [],
        select: selectMatch ? selectMatch[1].split(',').map((s) => s.trim()) : ['*'],
        where: parsedWhere,
      };
    } else if (input && typeof input.query === 'string') {
      const sql = input.query.trim();
      const fromMatch = sql.match(/from\s+([a-zA-Z0-9_-]+)/i);
      const joinMatch = sql.match(/join\s+([a-zA-Z0-9_-]+)/i);
      const whereMatch = sql.match(/where\s+(.+?)(?:group|order|limit|$)/i);
      const selectMatch = sql.match(/select\s+(.+?)\s+from/i);

      let parsedWhere: any[] = [];
      if (whereMatch) {
        const whereClause = whereMatch[1].trim();
        const roleMatch = whereClause.match(/role\s*(?:=|ILIKE|LIKE)\s*['"]?([a-zA-Z0-9_-]+)['"]?/i);
        if (roleMatch) {
          parsedWhere.push({ field: 'user.role', operator: 'eq', value: roleMatch[1].toUpperCase() });
        }
      }

      input = {
        title: input.title,
        from: fromMatch ? fromMatch[1] : 'users',
        joins: joinMatch ? [{ table: joinMatch[1] }] : [],
        select: selectMatch ? selectMatch[1].split(',').map((s: string) => s.trim()) : ['*'],
        where: parsedWhere,
      };
    }

    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Invalid query specification: must be an object');
    }

    // 1. Resolve Primary Entity
    let primary = input.primaryEntity || input.from || input.table || input.entity;
    if (Array.isArray(primary)) primary = primary[0];
    let primaryModule = 'user-management';
    let primaryEntity = 'user';
    let primaryAlias = 'user';

    if (typeof primary === 'string') {
      const p = primary.toLowerCase().trim();
      if (p.includes('user')) {
        primaryModule = 'user-management';
        primaryEntity = 'user';
        primaryAlias = 'user';
      } else if (p.includes('role')) {
        primaryModule = 'user-roles';
        primaryEntity = 'role';
        primaryAlias = 'role';
      } else if (p.includes('task') || p.includes('todo')) {
        primaryModule = 'todo';
        primaryEntity = 'task';
        primaryAlias = 'task';
      } else if (p.includes('.')) {
        const [m, e] = p.split('.');
        primaryModule = m;
        primaryEntity = e;
        primaryAlias = e;
      } else {
        primaryModule = p;
        primaryEntity = p;
        primaryAlias = p;
      }
    } else if (primary && typeof primary === 'object') {
      primaryModule = primary.module || (primary.entity?.includes('user') ? 'user-management' : primary.entity || 'user-management');
      primaryEntity = primary.entity || (primaryModule.includes('user') ? 'user' : 'task');
      primaryAlias = primary.alias || primaryEntity;
    }

    if (primaryEntity === 'users') primaryEntity = 'user';
    if (primaryEntity === 'roles') primaryEntity = 'role';
    if (primaryEntity === 'todos' || primaryEntity === 'todo') {
      primaryModule = 'todo';
      primaryEntity = 'task';
    }
    if (primaryAlias === 'users') primaryAlias = 'user';
    if (primaryAlias === 'todos' || primaryAlias === 'todo') primaryAlias = 'task';
    if (primaryAlias === 'roles') primaryAlias = 'role';

    // 2. Resolve Joins
    let rawJoins = Array.isArray(input.joins) ? input.joins : Array.isArray(input.join) ? input.join : [];
    if (input.join && typeof input.join === 'object' && !Array.isArray(input.join)) {
      rawJoins = [input.join];
    }
    if (input.joins && typeof input.joins === 'object' && !Array.isArray(input.joins)) {
      rawJoins = [input.joins];
    }
    const joins: QueryJoin[] = rawJoins.map((j: any) => {
      let joinMod = j.module;
      let joinEnt = j.entity;
      let joinAlias = j.alias;

      if (!joinMod || !joinEnt) {
        if (typeof j === 'string') {
          joinEnt = j.includes('task') || j.includes('todo') ? 'task' : j;
          joinMod = joinEnt === 'task' ? 'todo' : joinEnt;
          joinAlias = 'task';
        } else if (j.table || j.from) {
          const t = String(j.table || j.from).toLowerCase();
          joinEnt = t.includes('task') || t.includes('todo') ? 'task' : t;
          joinMod = joinEnt === 'task' ? 'todo' : joinEnt;
          joinAlias = j.alias || (joinEnt === 'task' ? 'task' : joinEnt);
        }
      }

      if (joinEnt === 'task' && !joinMod) joinMod = 'todo';
      if (joinEnt === 'user' && !joinMod) joinMod = 'user-management';
      if (joinEnt === 'role' && !joinMod) joinMod = 'user-roles';

      if (joinEnt === 'users') joinEnt = 'user';
      if (joinEnt === 'roles') joinEnt = 'role';
      if (joinEnt === 'todos' || joinEnt === 'todo') {
        joinMod = 'todo';
        joinEnt = 'task';
      }

      if (!joinAlias || joinAlias === 'todos' || joinAlias === 'todo' || joinAlias === 'tasks') joinAlias = joinEnt;
      if (joinAlias === 'users') joinAlias = 'user';
      if (joinAlias === 'roles') joinAlias = 'role';

      const leftField = j.on?.left || j.on?.user_id || `${primaryAlias}.id`;
      const rightField = j.on?.right || j.on?.task_user_id || `${joinAlias || joinEnt}.created_by`;

      let joinWhere: ColumnFilter[] | undefined = undefined;
      if (Array.isArray(j.where)) {
        joinWhere = j.where.filter((w: any) => w && w.field && w.operator);
      } else if (j.where && typeof j.where === 'object') {
        if (j.where.field && j.where.operator) {
          joinWhere = [j.where];
        } else {
          joinWhere = Object.entries(j.where).map(([f, v]: [string, any]) => {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              const opKey = Object.keys(v)[0];
              return {
                field: f,
                operator: (opKey as any) || 'eq',
                value: v[opKey],
              };
            }
            return {
              field: f,
              operator: 'eq' as const,
              value: v as string | number | boolean,
            };
          });
        }
      }

      return {
        module: joinMod || 'todo',
        entity: joinEnt || 'task',
        alias: joinAlias || joinEnt || 'task',
        type: j.type === 'LEFT' ? 'LEFT' : 'INNER',
        on: { left: leftField, right: rightField },
        ...(joinWhere && joinWhere.length > 0 ? { where: joinWhere } : {}),
      };
    });

    // 3. Resolve Select Fields
    const rawSelect = Array.isArray(input.select) && input.select.length > 0 ? input.select : ['user.username', 'user.email', 'user.role', 'COUNT(task.id) as pending_tasks'];
    const select: QuerySelectField[] = rawSelect.map((s: any) => {
      if (typeof s === 'string') {
        const text = s.trim();
        if (text === '*' || text.endsWith('.*')) {
          const prefix = text.includes('.') ? text.split('.')[0] : primaryAlias;
          return { field: text, label: prefix === 'task' ? 'Task Details' : 'Details', type: 'text' as const };
        }
        const countMatch = text.match(/count\(([^)]+)\)(?:\s+as\s+([a-zA-Z0-9_]+))?/i);
        if (countMatch) {
          const field = countMatch[1].trim();
          const label = countMatch[2] ? countMatch[2].replace(/_/g, ' ') : 'Count';
          return { field, label, aggregate: 'COUNT' as const, type: 'badge' as const };
        }
        const sumMatch = text.match(/sum\(([^)]+)\)(?:\s+as\s+([a-zA-Z0-9_]+))?/i);
        if (sumMatch) {
          const field = sumMatch[1].trim();
          const label = sumMatch[2] ? sumMatch[2].replace(/_/g, ' ') : 'Sum';
          return { field, label, aggregate: 'SUM' as const, type: 'number' as const };
        }
        const asMatch = text.match(/^([a-zA-Z0-9_.]+)\s+as\s+([a-zA-Z0-9_]+)$/i);
        if (asMatch) {
          const field = asMatch[1];
          const label = asMatch[2].replace(/_/g, ' ');
          return { field, label, type: label.toLowerCase().includes('role') ? 'badge' : 'text' };
        }
        const fieldName = text;
        const shortLabel = fieldName.split('.').pop()?.replace(/_/g, ' ') || fieldName;
        return {
          field: fieldName,
          label: shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1),
          type: shortLabel.toLowerCase().includes('role') ? 'badge' : 'text',
        };
      }
      return {
        field: s.field || 'id',
        label: s.label || s.field || 'Field',
        aggregate: s.aggregate,
        type: s.type || (s.aggregate ? 'badge' : 'text'),
      };
    });

    // 4. Resolve Where Filters
    let where: ColumnFilter[] = [];
    if (Array.isArray(input.where)) {
      where = input.where.filter((w: any) => w && w.field && w.operator);
    } else if (input.where && typeof input.where === 'object') {
      if (input.where.field && input.where.operator) {
        where = [input.where];
      } else {
        where = Object.entries(input.where).map(([f, v]: [string, any]) => {
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            const opKey = Object.keys(v)[0];
            return {
              field: f,
              operator: (opKey as any) || 'eq',
              value: v[opKey],
            };
          }
          return {
            field: f,
            operator: 'eq' as const,
            value: v as string | number | boolean,
          };
        });
      }
    }

    // 5. Automatic Join Inference for Referenced Tables
    const allFieldReferences: string[] = [
      ...select.map((s) => s.field),
      ...where.map((w) => w.field),
      ...(Array.isArray(input.groupBy) ? input.groupBy : []),
      ...(Array.isArray(input.orderBy) ? input.orderBy.map((o: any) => (typeof o === 'string' ? o : o.field || '')) : []),
    ];

    const referencesEntity = (prefix: string) =>
      allFieldReferences.some((f) => f.toLowerCase().startsWith(`${prefix}.`));

    // Infer Task Join if tasks/todos are referenced and not joined
    if (
      primaryEntity !== 'task' &&
      !joins.some((j) => j.entity === 'task' || j.alias === 'task') &&
      (referencesEntity('task') || referencesEntity('tasks') || referencesEntity('todo') || referencesEntity('todos'))
    ) {
      joins.push({
        module: 'todo',
        entity: 'task',
        alias: 'task',
        type: 'INNER',
        on: { left: `${primaryAlias}.id`, right: 'task.created_by' },
      });
    }

    // Infer Role Join if roles are referenced and not joined
    if (
      primaryEntity !== 'role' &&
      !joins.some((j) => j.entity === 'role' || j.alias === 'role') &&
      (referencesEntity('role') || referencesEntity('roles'))
    ) {
      joins.push({
        module: 'user-roles',
        entity: 'role',
        alias: 'role',
        type: 'INNER',
        on: { left: `${primaryAlias}.role`, right: 'role.key' },
      });
    }

    // Infer User Join if user is referenced and not joined
    if (
      primaryEntity !== 'user' &&
      !joins.some((j) => j.entity === 'user' || j.alias === 'user') &&
      (referencesEntity('user') || referencesEntity('users'))
    ) {
      joins.push({
        module: 'user-management',
        entity: 'user',
        alias: 'user',
        type: 'INNER',
        on: { left: `${primaryAlias}.created_by`, right: 'user.id' },
      });
    }

    // 6. Normalize status filters (e.g. "pending" -> record_status != "approved")
    where = where.map((w) => {
      const fieldLower = w.field.toLowerCase();
      if (
        (fieldLower.endsWith('.status') || fieldLower.endsWith('.state') || fieldLower === 'status') &&
        typeof w.value === 'string' &&
        w.value.toLowerCase() === 'pending'
      ) {
        return {
          field: w.field.replace(/\.(status|state)$/, '.record_status'),
          operator: 'neq' as const,
          value: 'approved',
        };
      }
      return w;
    });

    // 7. Resolve Group By
    let groupBy: string[] | undefined = Array.isArray(input.groupBy) ? input.groupBy : undefined;
    const hasAggregate = select.some((s) => Boolean(s.aggregate));
    if (hasAggregate && (!groupBy || groupBy.length === 0)) {
      groupBy = select.filter((s) => !s.aggregate && s.field !== '*' && !s.field.endsWith('.*')).map((s) => s.field);
    }

    // 8. Resolve Order By
    let orderBy: { field: string; direction: 'asc' | 'desc' }[] | undefined = undefined;
    if (Array.isArray(input.orderBy)) {
      orderBy = input.orderBy.map((o: any) => ({
        field: typeof o === 'string' ? o : o.field || 'id',
        direction: typeof o === 'object' && o.direction && String(o.direction).toLowerCase() === 'desc' ? 'desc' : 'asc',
      }));
    } else if (hasAggregate) {
      const aggCol = select.find((s) => Boolean(s.aggregate));
      if (aggCol) {
        orderBy = [{ field: aggCol.label.replace(/[^a-zA-Z0-9_]/g, '_'), direction: 'desc' }];
      }
    }

    return {
      title: input.title || 'Cross-Entity Query Results',
      primaryEntity: { module: primaryModule, entity: primaryEntity, alias: primaryAlias },
      joins,
      select,
      where,
      groupBy,
      orderBy,
      limit: typeof input.limit === 'number' ? input.limit : 50,
    };
  }

  /**
   * Resolves module + entity to physical Postgres table and standard required permission.
   */
  private resolveEntity(module: string, entity: string, alias?: string): ResolvedEntityRef {
    const cleanModule = module.toLowerCase().trim();
    const cleanEntity = entity.toLowerCase().trim();
    const resolvedAlias = (alias || cleanEntity || cleanModule).toLowerCase().replace(/[^a-z0-9_]/g, '_');

    if (!isValidIdentifier(resolvedAlias)) {
      throw new BadRequestException(`Invalid table alias "${resolvedAlias}"`);
    }

    if (cleanModule === 'user-management' && (cleanEntity === 'user' || cleanEntity === 'users')) {
      return {
        module: 'user-management',
        entity: 'user',
        alias: resolvedAlias,
        sqlTable: Prisma.sql`"users"`,
        isCustomTable: true,
        hasTenant: true,
        tenantColumn: 'tenantId',
        requiredPermission: 'user.read',
      };
    }

    if (cleanModule === 'user-roles' && (cleanEntity === 'role' || cleanEntity === 'roles')) {
      return {
        module: 'user-roles',
        entity: 'role',
        alias: resolvedAlias,
        sqlTable: Prisma.sql`"role_definitions"`,
        isCustomTable: true,
        hasTenant: false,
        requiredPermission: 'user.read',
      };
    }

    // Default schema-driven business module table (e.g. todo_task, inventory_item)
    const tblName = tableName(cleanModule, cleanEntity);
    return {
      module: cleanModule,
      entity: cleanEntity,
      alias: resolvedAlias,
      sqlTable: ident(tblName),
      isCustomTable: false,
      hasTenant: true,
      tenantColumn: 'tenant_id',
      requiredPermission: `${cleanModule}.${cleanEntity}.read`,
    };
  }

  /**
   * Resolves field expression e.g. "user.username" or "created_by" into qualified SQL column.
   * Tolerates 1-part, 2-part, or 3-part references, wildcards (*), and maps aliases automatically.
   */
  private resolveFieldSql(fieldExpr: string, defaultAlias: string, aliasMap?: Map<string, string>): Prisma.Sql {
    const cleanExpr = fieldExpr.trim();
    const parts = cleanExpr.split('.');
    // 3 parts: e.g. "user-management.user.username" or "todo.task.*"
    if (parts.length === 3) {
      const [, ent, colName] = parts;
      let cleanAlias = ent.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
      if (aliasMap && aliasMap.has(cleanAlias)) {
        cleanAlias = aliasMap.get(cleanAlias)!;
      }
      const trimmedCol = colName.trim();
      if (trimmedCol === '*' || trimmedCol === 'users' || trimmedCol === 'todos' || trimmedCol === 'tasks' || trimmedCol === 'roles') {
        if (!isValidIdentifier(cleanAlias)) {
          throw new BadRequestException(`Invalid table alias "${cleanAlias}"`);
        }
        return Prisma.sql`${ident(cleanAlias)}.*`;
      }
      let finalCol = trimmedCol;
      if (cleanAlias === 'user' || cleanAlias === 'users') {
        if (finalCol === 'user' || finalCol === 'users') finalCol = 'username';
        if (finalCol === 'tenant_id') finalCol = 'tenantId';
        if (finalCol === 'is_active') finalCol = 'isActive';
        if (finalCol === 'created_at') finalCol = 'createdAt';
        if (finalCol === 'updated_at') finalCol = 'updatedAt';
        if (finalCol === 'last_login_at') finalCol = 'lastLoginAt';
      } else if (cleanAlias === 'task' || cleanAlias === 'tasks') {
        if (finalCol === 'task' || finalCol === 'tasks' || finalCol === 'todo' || finalCol === 'todos') finalCol = 'title';
        if (finalCol === 'status' || finalCol === 'state') finalCol = 'record_status';
      } else if (cleanAlias === 'role' || cleanAlias === 'roles') {
        if (finalCol === 'role' || finalCol === 'roles') finalCol = 'name';
      }
      if (!isValidIdentifier(cleanAlias) || !isValidIdentifier(finalCol)) {
        throw new BadRequestException(`Invalid field reference "${fieldExpr}"`);
      }
      return Prisma.sql`${ident(cleanAlias)}.${ident(finalCol)}`;
    }

    // 2 parts: e.g. "user.username" or "task.*"
    if (parts.length === 2) {
      const [tableAlias, colName] = parts;
      let cleanAlias = tableAlias.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
      if (aliasMap && aliasMap.has(cleanAlias)) {
        cleanAlias = aliasMap.get(cleanAlias)!;
      }
      const trimmedCol = colName.trim();
      if (trimmedCol === '*' || trimmedCol === 'users' || trimmedCol === 'todos' || trimmedCol === 'tasks' || trimmedCol === 'roles') {
        if (!isValidIdentifier(cleanAlias)) {
          throw new BadRequestException(`Invalid table alias "${cleanAlias}"`);
        }
        return Prisma.sql`${ident(cleanAlias)}.*`;
      }
      let finalCol = trimmedCol;
      if (cleanAlias === 'user' || cleanAlias === 'users') {
        if (finalCol === 'user' || finalCol === 'users') finalCol = 'username';
        if (finalCol === 'tenant_id') finalCol = 'tenantId';
        if (finalCol === 'is_active') finalCol = 'isActive';
        if (finalCol === 'created_at') finalCol = 'createdAt';
        if (finalCol === 'updated_at') finalCol = 'updatedAt';
        if (finalCol === 'last_login_at') finalCol = 'lastLoginAt';
      } else if (cleanAlias === 'task' || cleanAlias === 'tasks') {
        if (finalCol === 'task' || finalCol === 'tasks' || finalCol === 'todo' || finalCol === 'todos') finalCol = 'title';
        if (finalCol === 'status' || finalCol === 'state') finalCol = 'record_status';
      } else if (cleanAlias === 'role' || cleanAlias === 'roles') {
        if (finalCol === 'role' || finalCol === 'roles') finalCol = 'name';
      }
      if (!isValidIdentifier(cleanAlias) || !isValidIdentifier(finalCol)) {
        throw new BadRequestException(`Invalid field reference "${fieldExpr}"`);
      }
      return Prisma.sql`${ident(cleanAlias)}.${ident(finalCol)}`;
    }

    // 1 part: e.g. "username" or "*"
    if (parts.length === 1) {
      let finalCol = parts[0].trim();
      let resolvedDefault = defaultAlias;
      if (aliasMap && aliasMap.has(resolvedDefault)) {
        resolvedDefault = aliasMap.get(resolvedDefault)!;
      }
      if (finalCol === '*') {
        if (!isValidIdentifier(resolvedDefault)) {
          throw new BadRequestException(`Invalid default table alias "${resolvedDefault}"`);
        }
        return Prisma.sql`${ident(resolvedDefault)}.*`;
      }
      if (finalCol === 'users' || finalCol === 'user') {
        const userAlias = aliasMap?.get('user') || 'user';
        return Prisma.sql`${ident(userAlias)}.*`;
      }
      if (finalCol === 'todos' || finalCol === 'tasks' || finalCol === 'task') {
        const taskAlias = aliasMap?.get('task') || 'task';
        return Prisma.sql`${ident(taskAlias)}.*`;
      }
      if (finalCol === 'roles' || finalCol === 'role') {
        const roleAlias = aliasMap?.get('role') || 'role';
        return Prisma.sql`${ident(roleAlias)}.*`;
      }
      if (resolvedDefault === 'user' || resolvedDefault === 'users') {
        if (finalCol === 'user' || finalCol === 'users') finalCol = 'username';
        if (finalCol === 'tenant_id') finalCol = 'tenantId';
        if (finalCol === 'is_active') finalCol = 'isActive';
        if (finalCol === 'created_at') finalCol = 'createdAt';
        if (finalCol === 'updated_at') finalCol = 'updatedAt';
        if (finalCol === 'last_login_at') finalCol = 'lastLoginAt';
      } else if (resolvedDefault === 'task' || resolvedDefault === 'tasks') {
        if (finalCol === 'task' || finalCol === 'tasks' || finalCol === 'todo' || finalCol === 'todos') finalCol = 'title';
        if (finalCol === 'status' || finalCol === 'state') finalCol = 'record_status';
      } else if (resolvedDefault === 'role' || resolvedDefault === 'roles') {
        if (finalCol === 'role' || finalCol === 'roles') finalCol = 'name';
      }
      if (!isValidIdentifier(finalCol)) {
        throw new BadRequestException(`Invalid column name "${finalCol}"`);
      }
      return Prisma.sql`${ident(resolvedDefault)}.${ident(finalCol)}`;
    }

    throw new BadRequestException(`Malformed field expression "${fieldExpr}"`);
  }

  /**
   * Strictly validates that the authenticated user has read permissions for
   * every single table participating in the query (primary and all joins).
   */
  async validatePermissions(query: StructuredQuery, user: AuthenticatedUser): Promise<void> {
    const entitiesToCheck: { module: string; entity: string }[] = [
      { module: query.primaryEntity.module, entity: query.primaryEntity.entity },
      ...query.joins.map((j) => ({ module: j.module, entity: j.entity })),
    ];

    for (const item of entitiesToCheck) {
      const resolved = this.resolveEntity(item.module, item.entity);

      // 1. Verify module is enabled in registry
      const isEnabled = await this.moduleRegistry.isEnabled(resolved.module);
      if (!isEnabled) {
        throw new ForbiddenException(`Module "${resolved.module}" is disabled`);
      }

      // 2. Verify user has active permission
      const hasPerm = await this.permissionsService.hasPermission(user.role, resolved.requiredPermission);
      if (!hasPerm) {
        throw new ForbiddenException(
          `Permission denied: Your role (${user.role}) lacks read access to ${resolved.module}.${resolved.entity} (${resolved.requiredPermission})`,
        );
      }
    }
  }

  /**
   * Compiles the StructuredQuery AST into a secure parameterized SQL query
   * with automatic tenant isolation and executes it against PostgreSQL.
   */
  async execute(rawInput: unknown, user: AuthenticatedUser): Promise<CapabilityResult> {
    const query = this.normalizeQuery(rawInput);

    // 1. Multi-Entity RBAC validation
    await this.validatePermissions(query, user);

    const primary = this.resolveEntity(query.primaryEntity.module, query.primaryEntity.entity, query.primaryEntity.alias);
    const primaryAliasSql = ident(primary.alias);

    // Build alias normalization map (e.g. users -> user, tasks -> task, todo -> task)
    const aliasMap = new Map<string, string>();
    const registerAliasKeys = (entRef: ResolvedEntityRef) => {
      aliasMap.set(entRef.alias, entRef.alias);
      aliasMap.set(entRef.entity, entRef.alias);
      aliasMap.set(entRef.module, entRef.alias);
      if (entRef.entity === 'user') {
        aliasMap.set('u', entRef.alias);
        aliasMap.set('usr', entRef.alias);
        aliasMap.set('user', entRef.alias);
        aliasMap.set('users', entRef.alias);
        aliasMap.set('user_management', entRef.alias);
        aliasMap.set('user-management', entRef.alias);
      }
      if (entRef.entity === 'role') {
        aliasMap.set('r', entRef.alias);
        aliasMap.set('role', entRef.alias);
        aliasMap.set('roles', entRef.alias);
        aliasMap.set('user_roles', entRef.alias);
        aliasMap.set('user-roles', entRef.alias);
      }
      if (entRef.entity === 'task') {
        aliasMap.set('t', entRef.alias);
        aliasMap.set('tsk', entRef.alias);
        aliasMap.set('task', entRef.alias);
        aliasMap.set('tasks', entRef.alias);
        aliasMap.set('todo', entRef.alias);
        aliasMap.set('todos', entRef.alias);
        aliasMap.set('todo_task', entRef.alias);
        aliasMap.set('todo_tasks', entRef.alias);
      }
    };

    registerAliasKeys(primary);
    for (const j of query.joins) {
      const joinResolved = this.resolveEntity(j.module, j.entity, j.alias);
      registerAliasKeys(joinResolved);
    }

    // 2. Build SELECT clause
    const selectSqlParts: Prisma.Sql[] = query.select.map((s) => {
      const isWildcard =
        s.field.trim() === '*' ||
        s.field.trim().endsWith('.*') ||
        s.field.trim() === 'users' ||
        s.field.trim() === 'todos' ||
        s.field.trim() === 'tasks' ||
        s.field.trim() === 'roles';
      const fieldSql = this.resolveFieldSql(s.field, primary.alias, aliasMap);
      if (isWildcard) {
        return fieldSql;
      }
      const colAliasStr = s.label.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const colAlias = ident(colAliasStr);
      if (s.aggregate) {
        const aggFunc = s.aggregate.toUpperCase();
        switch (aggFunc) {
          case 'COUNT':
            return Prisma.sql`COUNT(${fieldSql})::bigint AS ${colAlias}`;
          case 'SUM':
            return Prisma.sql`SUM(${fieldSql})::numeric AS ${colAlias}`;
          case 'AVG':
            return Prisma.sql`AVG(${fieldSql})::numeric AS ${colAlias}`;
          case 'MIN':
            return Prisma.sql`MIN(${fieldSql}) AS ${colAlias}`;
          case 'MAX':
            return Prisma.sql`MAX(${fieldSql}) AS ${colAlias}`;
          default:
            throw new BadRequestException(`Unsupported aggregate function "${aggFunc}"`);
        }
      }
      return Prisma.sql`${fieldSql} AS ${colAlias}`;
    });

    // 3. Build FROM and JOIN clauses with strict tenant isolation
    const fromClause = Prisma.sql`FROM ${primary.sqlTable} AS ${primaryAliasSql}`;

    const joinSqlParts: Prisma.Sql[] = query.joins.map((j) => {
      const joinResolved = this.resolveEntity(j.module, j.entity, j.alias);
      const joinAliasSql = ident(joinResolved.alias);
      const joinType = j.type === 'LEFT' ? Prisma.raw('LEFT JOIN') : Prisma.raw('INNER JOIN');

      const leftField = this.resolveFieldSql(j.on.left, primary.alias, aliasMap);
      const rightField = this.resolveFieldSql(j.on.right, joinResolved.alias, aliasMap);

      const joinConditions: Prisma.Sql[] = [Prisma.sql`${leftField} = ${rightField}`];

      if (joinResolved.hasTenant && joinResolved.tenantColumn) {
        joinConditions.push(Prisma.sql`${joinAliasSql}.${ident(joinResolved.tenantColumn)} = ${user.tenantId}`);
      }

      if (!joinResolved.isCustomTable) {
        joinConditions.push(Prisma.sql`${joinAliasSql}.record_status != 'deleted'`);
      }

      if (j.where && j.where.length > 0) {
        for (const cf of j.where) {
          const cfFieldSql = this.resolveFieldSql(cf.field, joinResolved.alias, aliasMap);
          joinConditions.push(operatorToSql(cfFieldSql, cf.operator, cf.value));
        }
      }

      return Prisma.sql`${joinType} ${joinResolved.sqlTable} AS ${joinAliasSql} ON ${Prisma.join(joinConditions, ' AND ')}`;
    });

    // 4. Build WHERE clause with primary tenant isolation
    const whereConditions: Prisma.Sql[] = [];

    if (primary.hasTenant && primary.tenantColumn) {
      whereConditions.push(Prisma.sql`${primaryAliasSql}.${ident(primary.tenantColumn)} = ${user.tenantId}`);
    }

    if (!primary.isCustomTable) {
      whereConditions.push(Prisma.sql`${primaryAliasSql}.record_status != 'deleted'`);
    }

    if (query.where && query.where.length > 0) {
      for (const cf of query.where) {
        const cfFieldSql = this.resolveFieldSql(cf.field, primary.alias, aliasMap);
        whereConditions.push(operatorToSql(cfFieldSql, cf.operator, cf.value));
      }
    }

    const whereClause = whereConditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(whereConditions, ' AND ')}` : Prisma.empty;

    // 5. Build GROUP BY clause
    const groupByClause =
      query.groupBy && query.groupBy.length > 0
        ? Prisma.sql`GROUP BY ${Prisma.join(
            query.groupBy.map((g) => this.resolveFieldSql(g, primary.alias, aliasMap)),
            ', ',
          )}`
        : Prisma.empty;

    // 6. Build ORDER BY clause
    const orderByClause =
      query.orderBy && query.orderBy.length > 0
        ? Prisma.sql`ORDER BY ${Prisma.join(
            query.orderBy.map((o) => {
              const dir = o.direction.toLowerCase() === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC');
              if (o.field.includes('.')) {
                const fieldSql = this.resolveFieldSql(o.field, primary.alias, aliasMap);
                return Prisma.sql`${fieldSql} ${dir}`;
              }
              const cleanField = o.field.toLowerCase().replace(/[^a-z0-9_]/g, '_');
              return Prisma.sql`${ident(cleanField)} ${dir}`;
            }),
            ', ',
          )}`
        : Prisma.empty;

    // 7. Limit (capped at 200)
    const limitNum = Math.min(Math.max(query.limit || 50, 1), 200);
    const limitClause = Prisma.sql`LIMIT ${limitNum}`;

    // 8. Assemble Full Safe Query
    const fullQuery = Prisma.sql`
      SELECT ${Prisma.join(selectSqlParts, ', ')}
      ${fromClause}
      ${joinSqlParts.length > 0 ? Prisma.join(joinSqlParts, ' ') : Prisma.empty}
      ${whereClause}
      ${groupByClause}
      ${orderByClause}
      ${limitClause}
    `;

    this.logger.log(`Compiled SQL: ${fullQuery.sql}`);
    this.logger.log(`SQL values: ${JSON.stringify(fullQuery.values)}`);
    this.logger.debug(`Executing safe semantic query: ${query.title || 'Cross-Entity Query'}`);

    this.aiLogger.logStep('SQL_QUERY_COMPILATION', {
      title: query.title,
      primaryEntity: query.primaryEntity,
      joins: query.joins,
      compiledSql: fullQuery.sql,
      sqlValues: fullQuery.values,
    });

    const rawRows = await this.prisma.$queryRaw<Record<string, unknown>[]>(fullQuery);

    // 9. Format serializable values (BigInt -> Number, Date -> ISO string)
    const rows = rawRows.map((r) => {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === 'bigint') {
          obj[k] = Number(v);
        } else if (v instanceof Date) {
          obj[k] = v.toISOString();
        } else {
          obj[k] = v;
        }
      }
      return obj;
    });

    this.aiLogger.logStep('SQL_QUERY_EXECUTION', {
      title: query.title,
      returnedRowCount: rows.length,
      sampleRows: rows.slice(0, 3),
    });

    return {
      module: 'core',
      entity: 'query',
      operation: 'query',
      rows,
      total: rows.length,
      querySpec: query,
      message: query.title ? `${query.title} (${rows.length} records)` : `Found ${rows.length} matching records.`,
    };
  }
}
