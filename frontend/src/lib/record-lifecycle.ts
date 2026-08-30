export type RecordStatus = 'draft' | 'submitted' | 'approved' | 'cancelled' | 'deleted';

export interface StatusSideAction {
  label: string;
  to: RecordStatus;
  confirm?: boolean;
}

export interface StatusActions {
  canEdit: boolean;
  forward?: { label: string; to: RecordStatus };
  sideActions: StatusSideAction[];
}

/**
 * UI default record lifecycle (finetune-1 §3.2 & DoersOS Default Workflow):
 * - Draft: editable, Next -> Submitted or Cancelled. (Delete is NOT allowed directly).
 * - Submitted: editable, Next -> Approved or Cancelled.
 * - Approved: read-only, Next -> Cancelled.
 * - Cancelled: read-only, Next -> Deleted or Draft (Reopen).
 * - Deleted: read-only, terminal state.
 *
 * Backend ALLOWED_TRANSITIONS (entity-repository.service.ts) is the authority.
 */
export const LIFECYCLE: Record<RecordStatus, StatusActions> = {
  draft: {
    canEdit: true,
    forward: { label: 'Submit', to: 'submitted' },
    sideActions: [{ label: 'Cancel', to: 'cancelled', confirm: true }],
  },
  submitted: {
    canEdit: true,
    forward: { label: 'Approve', to: 'approved' },
    sideActions: [{ label: 'Cancel', to: 'cancelled', confirm: true }],
  },
  approved: {
    canEdit: false,
    sideActions: [{ label: 'Cancel', to: 'cancelled', confirm: true }],
  },
  cancelled: {
    canEdit: false,
    forward: { label: 'Reopen as Draft', to: 'draft' },
    sideActions: [{ label: 'Delete', to: 'deleted', confirm: true }],
  },
  deleted: {
    canEdit: false,
    sideActions: [],
  },
};

export function lifecycleFor(status: string | undefined): StatusActions {
  return LIFECYCLE[(status as RecordStatus) ?? 'draft'] ?? LIFECYCLE.draft;
}

/** Action-registry target suffix for each transition */
export const TRANSITION_TARGET_SUFFIX: Record<RecordStatus, string> = {
  draft: 'reopen',
  submitted: 'submit',
  approved: 'complete',
  cancelled: 'cancel',
  deleted: 'delete',
};
