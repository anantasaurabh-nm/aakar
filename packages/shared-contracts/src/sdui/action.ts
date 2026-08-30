import { z } from 'zod';

/**
 * Controlled action-type registry. The server describes intent only;
 * the client maps each type to an approved handler. No arbitrary URLs
 * or executable code are ever accepted here.
 */
export const ActionTypeSchema = z.enum([
  'navigate',
  'create',
  'edit',
  'submit',
  'delete',
  'refresh',
  'open',
  'close',
  'export',
  'cancel',
  'approve',
  'reject',
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const SDUIActionSchema = z.object({
  type: ActionTypeSchema,
  /** Opaque identifier resolved by the client's action registry (e.g. a nav target, not a URL). */
  target: z.string().optional(),
  /** Optional confirmation prompt for destructive/high-impact actions. */
  confirm: z
    .object({
      title: z.string().optional(),
      message: z.string(),
    })
    .optional(),
});
export type SDUIAction = z.infer<typeof SDUIActionSchema>;
