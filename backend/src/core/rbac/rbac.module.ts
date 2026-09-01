import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';
import { PermissionCatalogService } from './permission-catalog.service';

@Global()
@Module({
  providers: [PermissionsService, PermissionsGuard, PermissionCatalogService],
  exports: [PermissionsService, PermissionsGuard, PermissionCatalogService],
})
export class RbacModule {}
