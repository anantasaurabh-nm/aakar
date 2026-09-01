import { Global, Module } from '@nestjs/common';
import { CryptoService } from '../crypto/crypto.service';
import { ModelRouterService } from './model-router.service';
import { ResponsePlannerService } from './response-planner.service';
import { OrchestratorService } from './orchestrator.service';
import { AiChatController } from './ai-chat.controller';

import { AiFlowLoggerService } from './ai-flow-logger.service';

@Global()
@Module({
  providers: [CryptoService, ModelRouterService, ResponsePlannerService, OrchestratorService, AiFlowLoggerService],
  controllers: [AiChatController],
  exports: [CryptoService, ModelRouterService, ResponsePlannerService, OrchestratorService, AiFlowLoggerService],
})
export class AiModule {}
