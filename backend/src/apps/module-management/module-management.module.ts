import { Module } from '@nestjs/common';
import { ModuleManagementController } from './module-management.controller';

@Module({
  controllers: [ModuleManagementController],
})
export class ModuleManagementModule {}
