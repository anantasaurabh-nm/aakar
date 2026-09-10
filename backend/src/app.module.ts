import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './core/config/env.validation';
import { PrismaModule } from './core/prisma/prisma.module';
import { AuditModule } from './core/audit/audit.module';
import { ModuleRegistryModule } from './core/modules-registry/module-registry.module';
import { CapabilitiesModule } from './core/capabilities/capabilities.module';
import { EntityEngineModule } from './core/entity-engine/entity-engine.module';
import { QueryEngineModule } from './core/query-engine/query-engine.module';
import { RbacModule } from './core/rbac/rbac.module';
import { AuthModule } from './core/auth/auth.module';
import { AiModule } from './core/ai/ai.module';

import { HomeModule } from './apps/home/home.module';
import { UserManagementModule } from './apps/user-management/user-management.module';
import { UserRolesModule } from './apps/user-roles/user-roles.module';
import { ModuleManagementModule } from './apps/module-management/module-management.module';
import { AiConfigurationModule } from './apps/ai-configuration/ai-configuration.module';
import { ConnectorsCoreModule } from './core/connectors/connectors.module';
import { ConnectorsAppModule } from './apps/connectors/connectors.module';
import { ModuleSettingsModule } from './core/module-settings/module-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuditModule,
    ModuleRegistryModule,
    CapabilitiesModule,
    QueryEngineModule,
    RbacModule,
    AuthModule,
    AiModule,
    ConnectorsCoreModule,
    ModuleSettingsModule,
    HomeModule,
    UserManagementModule,
    UserRolesModule,
    ModuleManagementModule,
    AiConfigurationModule,
    ConnectorsAppModule,
    EntityEngineModule,
  ],
})
export class AppModule {}
