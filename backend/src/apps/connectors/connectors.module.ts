import { Module } from '@nestjs/common';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsCoreModule } from '../../core/connectors/connectors.module';

@Module({
  imports: [ConnectorsCoreModule],
  controllers: [ConnectorsController],
})
export class ConnectorsAppModule {}
