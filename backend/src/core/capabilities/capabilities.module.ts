import { Global, Module } from '@nestjs/common';
import { CapabilityRegistry } from './capability-registry.service';
import { CapabilitiesController } from './capabilities.controller';

@Global()
@Module({
  controllers: [CapabilitiesController],
  providers: [CapabilityRegistry],
  exports: [CapabilityRegistry],
})
export class CapabilitiesModule {}
