import { Global, Module } from '@nestjs/common';
import { EntityTableService } from './entity-table.service';
import { EntityRepositoryService } from './entity-repository.service';
import { EntityRegistryService } from './entity-registry.service';
import { EntityEngineController } from './entity-engine.controller';

@Global()
@Module({
  providers: [EntityTableService, EntityRepositoryService, EntityRegistryService],
  controllers: [EntityEngineController],
  exports: [EntityRegistryService, EntityRepositoryService],
})
export class EntityEngineModule {}
