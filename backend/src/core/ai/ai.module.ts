import { Global, Module } from '@nestjs/common';
import { CryptoService } from '../crypto/crypto.service';
import { CredentialStoreService } from './credential-store.service';
import { ModelRouterService } from './model-router.service';
import { ResponsePlannerService } from './response-planner.service';
import { OrchestratorService } from './orchestrator.service';
import { AiChatController } from './ai-chat.controller';

@Global()
@Module({
  providers: [
    CryptoService,
    CredentialStoreService,
    ModelRouterService,
    ResponsePlannerService,
    OrchestratorService,
  ],
  controllers: [AiChatController],
  exports: [CryptoService, CredentialStoreService, ModelRouterService, ResponsePlannerService, OrchestratorService],
})
export class AiModule {}
