import { z } from 'zod';
import { RecordStatusSchema } from './record';

export const WorkflowTransitionSchema = z.object({
  to: RecordStatusSchema,
  label: z.string(),
  actionType: z.enum(['forward', 'side']).default('side'),
  requiredRoles: z.array(z.string()).optional(),
  requiredPermission: z.string().optional(),
  makerChecker: z.boolean().optional(),
  requiredFields: z.array(z.string()).optional(),
  confirm: z.union([z.boolean(), z.string()]).optional(),
  sideEffects: z
    .object({
      setSubmittedMetadata: z.boolean().optional(),
      setApprovedMetadata: z.boolean().optional(),
      setCancelledMetadata: z.boolean().optional(),
    })
    .optional(),
});
export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>;

export const WorkflowStateSchema = z.object({
  label: z.string(),
  canEdit: z.boolean().default(false),
  badgeTone: z.enum(['neutral', 'warning', 'success', 'danger', 'info', 'accent']).default('neutral'),
  stepIndex: z.number().int().optional(),
  transitions: z.array(WorkflowTransitionSchema).default([]),
});
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export const ModuleWorkflowDefinitionSchema = z.object({
  $schema: z.string().optional(),
  id: z.string(),
  entity: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  initialStatus: RecordStatusSchema.default('draft'),
  pipeline: z.array(z.string()).optional(), // Ordered pipeline states for visual stepper, e.g. ['draft', 'submitted', 'approved']
  states: z.record(RecordStatusSchema, WorkflowStateSchema),
});
export type ModuleWorkflowDefinition = z.infer<typeof ModuleWorkflowDefinitionSchema>;

/** Computed action returned to the frontend for the current user and record */
export interface ComputedWorkflowAction {
  label: string;
  to: string;
  actionType: 'forward' | 'side';
  confirm?: boolean | string;
  disabled?: boolean;
  disabledReason?: string;
}

/** Computed workflow context sent to RecordView SDUI */
export interface ComputedRecordWorkflow {
  workflowId: string;
  currentStatus: string;
  stateLabel: string;
  badgeTone: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'accent';
  canEdit: boolean;
  forwardAction?: ComputedWorkflowAction;
  sideActions: ComputedWorkflowAction[];
  stepper?: {
    currentStepIndex: number;
    steps: Array<{
      key: string;
      label: string;
      status: 'completed' | 'current' | 'upcoming' | 'cancelled';
      performedBy?: string | null;
      performedAt?: string | null;
    }>;
  };
}
