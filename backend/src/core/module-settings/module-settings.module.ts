import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConnectorsCoreModule } from '../connectors/connectors.module';
import { ModuleSettingsService } from './module-settings.service';
import { ModuleSettingsController } from './module-settings.controller';

@Global()
@Module({
  imports: [PrismaModule, ConnectorsCoreModule],
  controllers: [ModuleSettingsController],
  providers: [ModuleSettingsService],
  exports: [ModuleSettingsService],
})
export class ModuleSettingsModule {}

