import { Module, Global } from '@nestjs/common';
import { ConnectorsService } from './connectors.service';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ProviderRegistry } from './providers/provider.registry';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [ConnectorsService, CryptoService, ProviderRegistry],
  exports: [ConnectorsService, ProviderRegistry],
})
export class ConnectorsCoreModule {}
