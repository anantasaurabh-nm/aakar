import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { ChatResponse } from '@erp/shared-contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrchestratorService } from './orchestrator.service';

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
});

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiChatController {
  constructor(private readonly orchestrator: OrchestratorService) {}

  @Post('chat')
  @HttpCode(200)
  async chat(
    @Body(new ZodValidationPipe(ChatRequestSchema)) body: { message: string },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChatResponse> {
    // The message is untrusted data, never an instruction to the platform
    // (AI Agent SDUI PRD §17.5) — the orchestrator only ever derives a
    // routing decision from it, subject to normal authorization.
    return this.orchestrator.handleMessage(body.message, user);
  }
}
