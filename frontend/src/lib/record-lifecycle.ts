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
 * UI-only default record lifecycle (finetune-1 §3.2) — a convenience for
 * deciding which buttons to show. The backend's own `ALLOWED_TRANSITIONS`
 * (entity-repository.service.ts) is the actual authority and re-validates
 * every transition regardless of what this table says.
 */
export const LIFECYCLE: Record<RecordStatus, StatusActions> = {
  draft: {
    canEdit: true,
    forward: { label: 'Submit', to: 'submitted' },
    sideActions: [{ label: 'Delete', to: 'deleted', confirm: true }],
  },
  submitted: {
    canEdit: true,
    forward: { label: 'Approve', to: 'approved' },
    sideActions: [{ label: 'Delete', to: 'deleted', confirm: true }],
  },
  approved: {
    canEdit: false,
    sideActions: [{ label: 'Cancel Record', to: 'cancelled' }],
  },
  cancelled: {
    canEdit: false,
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

/** Action-registry target suffix for each transition — note "approved" reuses the existing `.complete` target name, not `.approve`. */
export const TRANSITION_TARGET_SUFFIX: Record<RecordStatus, string> = {
  draft: 'submit',
  submitted: 'submit',
  approved: 'complete',
  cancelled: 'cancel',
  deleted: 'delete',
};
