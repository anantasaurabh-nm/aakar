import { Module, Global } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationProviderRegistry } from './providers/provider.registry';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, CryptoService, NotificationProviderRegistry],
  exports: [NotificationsService, NotificationProviderRegistry],
})
export class NotificationsCoreModule {}
