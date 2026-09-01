import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LLMProviderError, type CapabilityDescriptor, type ChatResponse, type OrchestratorDecision } from '@erp/shared-contracts';
import { CapabilityRegistry } from '../capabilities/capability-registry.service';
import { EntityRegistryService } from '../entity-engine/entity-registry.service';
import { ResponsePlannerService } from './response-planner.service';
import { ModelRouterService, ModelNotConfiguredError } from './model-router.service';
import { classifyWithRules } from './rule-based-classifier';
import { AiFlowLoggerService } from './ai-flow-logger.service';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

import { buildClassifierPrompt } from './prompts';

/**
 * Never gives the model direct database access — it only ever produces a
 * capability id + parameters; execution always goes through
 * CapabilityRegistry.execute(), which independently re-checks module-enabled
 * status and permission (Architecture Amendment 01 §3, §17).
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger('AIOrchestrator');

  constructor(
    private readonly modelRouter: ModelRouterService,
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly responsePlanner: ResponsePlannerService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly aiLogger: AiFlowLoggerService,
  ) {}

  private async classify(message: string, user: AuthenticatedUser): Promise<OrchestratorDecision | null> {
    const capabilities = this.capabilityRegistry.list();
    if (capabilities.length === 0) return null;

    try {
      const configured = await this.modelRouter.isConfigured('light');
      if (!configured) {
        const ruleDecision = classifyWithRules(message, capabilities);
        this.aiLogger.logStep('CLASSIFICATION_RULE_BASED', {
          reason: 'Light model not configured',
          matched: Boolean(ruleDecision),
          decision: ruleDecision,
        });
        return ruleDecision;
      }

      const prompt = buildClassifierPrompt(capabilities, this.entityRegistry);
      this.aiLogger.logStep('MODEL_CALL_START', {
        profile: 'light',
        userRole: user.role,
        message,
        capabilitiesCount: capabilities.length,
      });

      const startTime = Date.now();
      const response = await this.modelRouter.generate('light', {
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: message },
        ],
        jsonMode: true,
        maxTokens: 450,
      });
      const latencyMs = Date.now() - startTime;

      this.aiLogger.logStep('MODEL_CALL_COMPLETE', {
        profile: 'light',
        latencyMs,
        rawOutput: response.text,
      });

      const parsed = JSON.parse(response.text) as Partial<OrchestratorDecision>;
      if (!parsed.capability) {
        const fallbackDecision = classifyWithRules(message, capabilities);
        this.aiLogger.logStep('CLASSIFICATION_FALLBACK', {
          reason: 'Model did not return valid capability',
          fallbackDecision,
        });
        return fallbackDecision;
      }

      const decision: OrchestratorDecision = {
        capability: parsed.capability,
        parameters: parsed.parameters ?? {},
        confidence: parsed.confidence ?? 0.8,
        needsConfirmation: parsed.needsConfirmation ?? false,
      };

      this.aiLogger.logStep('CLASSIFICATION_SUCCESS', {
        source: 'LLM_LIGHT',
        decision,
      });

      return decision;
    } catch (err) {
      this.aiLogger.logStep('MODEL_CALL_ERROR', {
        error: err instanceof Error ? err.message : String(err),
      });

      if (err instanceof ModelNotConfiguredError || err instanceof LLMProviderError) {
        this.logger.warn(`Falling back to rule-based classifier: ${err.message}`);
      } else {
        this.logger.warn('Falling back to rule-based classifier after parse failure');
      }

      const ruleDecision = classifyWithRules(message, capabilities);
      this.aiLogger.logStep('CLASSIFICATION_RULE_BASED', {
        reason: 'Error occurred during LLM classification',
        matched: Boolean(ruleDecision),
        decision: ruleDecision,
      });
      return ruleDecision;
    }
  }

  /**
   * Main entry point for the AI Chat endpoint.
   */
  async handleMessage(message: string, user: AuthenticatedUser): Promise<ChatResponse> {
    this.aiLogger.logStep('USER_INPUT', {
      user: { id: user.id, username: user.username, role: user.role, tenantId: user.tenantId },
      message,
    });

    const decision = await this.classify(message, user);
    if (!decision) {
      const fallbackTextResponse: ChatResponse = {
        mode: 'text',
        text: "I couldn't understand that request. Try asking to view records, see insights, create items, or ask questions about users and tasks.",
      };
      this.aiLogger.logStep('RESPONSE_PLANNING', {
        status: 'UNRECOGNIZED_INTENT',
        response: fallbackTextResponse,
      });
      return fallbackTextResponse;
    }

    try {
      this.aiLogger.logStep('CAPABILITY_EXECUTION_START', {
        capability: decision.capability,
        parameters: decision.parameters,
        userRole: user.role,
      });

      const execStartTime = Date.now();
      const result = await this.capabilityRegistry.execute(decision.capability, decision.parameters, user);
      const execDurationMs = Date.now() - execStartTime;

      this.aiLogger.logStep('CAPABILITY_EXECUTION_SUCCESS', {
        capability: decision.capability,
        executionDurationMs: execDurationMs,
        resultTotal: result.total,
        returnedRowsCount: result.rows?.length,
        operation: result.operation,
      });

      const plannedResponse = this.responsePlanner.plan(result);
      const uiAny = plannedResponse.ui as any;
      this.aiLogger.logStep('RESPONSE_PLANNING', {
        mode: plannedResponse.mode,
        text: plannedResponse.text,
        pageId: uiAny?.page?.id,
        sections: uiAny?.page?.sections?.map((s: any) => ({ id: s.id, label: s.label, type: s.type })),
      });

      return plannedResponse;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.aiLogger.logStep('CAPABILITY_EXECUTION_ERROR', {
        capability: decision.capability,
        error: errMsg,
      });

      if (err instanceof ForbiddenException) {
        return {
          mode: 'text',
          text: `Permission denied: ${err.message}`,
        };
      }
      if (err instanceof NotFoundException) {
        return {
          mode: 'text',
          text: `I couldn't find the requested module or capability: ${err.message}`,
        };
      }
      this.logger.error(`Error executing capability "${decision.capability}": ${errMsg}`);
      return {
        mode: 'text',
        text: `Sorry, an error occurred while processing that action: ${errMsg}`,
      };
    }
  }
}
