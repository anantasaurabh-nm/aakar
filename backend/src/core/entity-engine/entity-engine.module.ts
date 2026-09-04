import { Global, Module } from '@nestjs/common';
import { EntityTableService } from './entity-table.service';
import { EntityRepositoryService } from './entity-repository.service';
import { EntityRegistryService } from './entity-registry.service';
import { ReferenceResolverService } from './reference-resolver.service';
import { EntityEngineController } from './entity-engine.controller';

@Global()
@Module({
  providers: [EntityTableService, EntityRepositoryService, EntityRegistryService, ReferenceResolverService],
  controllers: [EntityEngineController],
  exports: [EntityRegistryService, EntityRepositoryService, ReferenceResolverService],
})
export class EntityEngineModule {}
