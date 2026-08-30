import { Global, Module } from '@nestjs/common';
import { ModuleRegistryService } from './module-registry.service';
import { ModuleEnabledGuard } from './module-enabled.guard';
import { ModuleDiscoveryService } from './module-discovery.service';

@Global()
@Module({
  providers: [ModuleRegistryService, ModuleEnabledGuard, ModuleDiscoveryService],
  exports: [ModuleRegistryService, ModuleEnabledGuard, ModuleDiscoveryService],
})
export class ModuleRegistryModule {}
