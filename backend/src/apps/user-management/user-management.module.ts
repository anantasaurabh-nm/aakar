import { Module } from '@nestjs/common';
import { UserAdminService } from './domain/user-admin.service';
import { UserManagementController } from './user-management.controller';

@Module({
  providers: [UserAdminService],
  controllers: [UserManagementController],
})
export class UserManagementModule {}
