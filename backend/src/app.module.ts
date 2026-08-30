import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './core/config/env.validation';
import { PrismaModule } from './core/prisma/prisma.module';
import { AuditModule } from './core/audit/audit.module';
import { ModuleRegistryModule } from './core/modules-registry/module-registry.module';
import { CapabilitiesModule } from './core/capabilities/capabilities.module';
import { EntityEngineModule } from './core/entity-engine/entity-engine.module';
import { RbacModule } from './core/rbac/rbac.module';
import { AuthModule } from './core/auth/auth.module';
import { AiModule } from './core/ai/ai.module';

import { HomeModule } from './apps/home/home.module';
import { UserManagementModule } from './apps/user-management/user-management.module';
import { ModuleManagementModule } from './apps/module-management/module-management.module';
import { AiConfigurationModule } from './apps/ai-configuration/ai-configuration.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuditModule,
    ModuleRegistryModule,
    CapabilitiesModule,
    EntityEngineModule,
    RbacModule,
    AuthModule,
    AiModule,
    HomeModule,
    UserManagementModule,
    ModuleManagementModule,
    AiConfigurationModule,
  ],
})
export class AppModule {}
