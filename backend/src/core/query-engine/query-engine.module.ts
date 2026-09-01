import { Global, Module, OnModuleInit } from '@nestjs/common';
import { SafeQueryService } from './safe-query.service';
import { CapabilityRegistry } from '../capabilities/capability-registry.service';

@Global()
@Module({
  providers: [SafeQueryService],
  exports: [SafeQueryService],
})
export class QueryEngineModule implements OnModuleInit {
  constructor(
    private readonly safeQueryService: SafeQueryService,
    private readonly capabilityRegistry: CapabilityRegistry,
  ) {}

  onModuleInit() {
    this.capabilityRegistry.register(
      {
        id: 'core.query.execute',
        module: 'core',
        entity: 'query',
        requiredPermission: 'user.read', // Base entry permission; multi-table validation checks each table specifically
        description: 'Execute a safe cross-entity analytical query across platform tables with automated RBAC validation and tenant isolation',
      },
      async (params, { user }) => {
        return this.safeQueryService.execute(params.query || params, user);
      },
    );
  }
}
