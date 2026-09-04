import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LLMProviderError, type CapabilityDescriptor, type ChatResponse, type OrchestratorDecision } from '@erp/shared-contracts';
import { CapabilityRegistry } from '../capabilities/capability-registry.service';
import { EntityRegistryService } from '../entity-engine/entity-registry.service';
import { ResponsePlannerService } from './response-planner.service';
import { ModelRouterService, ModelNotConfiguredError } from './model-router.service';
import { classifyWithRules } from './rule-based-classifier';
import { AiFlowLoggerService } from './ai-flow-logger.service';
import { ReferenceResolverService } from '../entity-engine/reference-resolver.service';
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
    private readonly referenceResolver: ReferenceResolverService,
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

    // Generic Reference Resolution: Check if target entity has reference fields
    const [mod, ent] = decision.capability.split('.');
    let entityDef: import('@erp/shared-contracts').EntityDefinition | undefined;
    try {
      if (mod && ent) {
        entityDef = this.entityRegistry.getEntityDefinition(mod, ent);
      }
    } catch {
      // Non-schema capability or core action
    }

    if (entityDef) {
      const assigneeMatch = message.match(/\b(?:for|assigned to|assign to|in)\s+([a-zA-Z0-9_.-]+)\b/i);
      const nonPersonWords = new Set([
        'today', 'tomorrow', 'yesterday', 'this_week', 'this_month', 'last_week', 'last_month',
        'week', 'month', 'year', 'approval', 'review', 'me', 'my', 'all', 'user', 'users',
        'task', 'tasks', 'note', 'notes', 'general', 'engineering', 'urgent', 'high', 'medium', 'low',
        'draft', 'submitted', 'approved', 'cancelled', 'deleted',
      ]);

      if (assigneeMatch && !nonPersonWords.has(assigneeMatch[1].toLowerCase())) {
        const targetName = assigneeMatch[1];
        for (const [fieldKey, field] of Object.entries(entityDef.fields)) {
          if (field.type === 'reference' && field.entity) {
            const searchResult = await this.referenceResolver.searchReference(
              field.entity,
              user.tenantId,
              targetName,
              field.displayField,
            );

            if (searchResult.matchedId) {
              decision.parameters[fieldKey] = searchResult.matchedId;
              if (typeof decision.parameters.title === 'string') {
                decision.parameters.title = decision.parameters.title
                  .replace(new RegExp(`\\s+(?:for|assigned to|assign to|in)\\s+${targetName}`, 'i'), '')
                  .replace(/^(?:titled|called|named)\s+/i, '')
                  .trim();
              }
              break;
            } else {
              const notFoundResponse: ChatResponse = {
                mode: 'text',
                text:
                  field.entity.includes('user')
                    ? `User '${targetName}' was not found in the system. Available users are: ${searchResult.availableLabels.join(', ')}. Would you like to assign it to one of them?`
                    : `Record '${targetName}' was not found in ${searchResult.entityLabel}. Available options are: ${searchResult.availableLabels.slice(0, 8).join(', ')}. Would you like to select one of them?`,
              };
              this.aiLogger.logStep('RESPONSE_PLANNING', {
                status: 'REFERENCE_NOT_FOUND',
                targetName,
                response: notFoundResponse,
              });
              return notFoundResponse;
            }
          }
        }
      }
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
