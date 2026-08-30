import { Module } from '@nestjs/common';
import { AiConfigurationController } from './ai-configuration.controller';

@Module({
  controllers: [AiConfigurationController],
})
export class AiConfigurationModule {}
