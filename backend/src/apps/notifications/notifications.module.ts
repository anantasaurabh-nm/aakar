import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsCoreModule } from '../../core/notifications/notifications.module';
import { CapabilitiesModule } from '../../core/capabilities/capabilities.module';
import { RbacModule } from '../../core/rbac/rbac.module';
import { AuthModule } from '../../core/auth/auth.module';

@Module({
  imports: [NotificationsCoreModule, CapabilitiesModule, RbacModule, AuthModule],
  controllers: [NotificationsController],
})
export class NotificationsAppModule {}
