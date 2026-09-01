import { Module } from '@nestjs/common';
import { RoleAdminService } from './domain/role-admin.service';
import { UserRolesController } from './user-roles.controller';

@Module({
  providers: [RoleAdminService],
  controllers: [UserRolesController],
  exports: [RoleAdminService],
})
export class UserRolesModule {}
