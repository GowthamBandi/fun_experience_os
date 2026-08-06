import type { PrototypeState } from "../scenarios/state";
import type {
  ModerationCase,
  ModerationCaseCategory,
  ModerationCaseSeverity,
  ModerationCaseStatus,
  ModerationAction,
  ModerationActionType,
  ModerationActionStatus,
  ModerationScope
} from "../entities";
import { uid, nextId, pushAudit, pushSignal } from "./helpers";

/** 1. Create Moderation Case */
export function createModerationCase(
  state: PrototypeState,
  params: {
    subjectTemporaryId?: string;
    subjectPersonId?: string;
    relatedIncidentIds?: string[];
    relatedSessionIds?: string[];
    relatedTournamentIds?: string[];
    relatedDisputeIds?: string[];
    category: ModerationCaseCategory;
    severity: ModerationCaseSeverity;
    originType: string;
    originId: string;
    notes?: string;
  },
  operatorId: string = "op-master"
): PrototypeState {
  const cases = state.moderationCases ?? [];
  const id = nextId("mod-case", cases.map((c) => c.id));

  const newCase: ModerationCase = {
    id,
    subjectTemporaryId: params.subjectTemporaryId,
    subjectPersonId: params.subjectPersonId,
    relatedIncidentIds: params.relatedIncidentIds ?? [],
    relatedSessionIds: params.relatedSessionIds ?? [],
    relatedTournamentIds: params.relatedTournamentIds ?? [],
    relatedDisputeIds: params.relatedDisputeIds ?? [],
    category: params.category,
    severity: params.severity,
    status: "open",
    originType: params.originType,
    originId: params.originId,
    notes: params.notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  let next = {
    ...state,
    moderationCases: [...cases, newCase]
  };

  next = pushAudit(next, {
    action: "Moderation Case Created",
    description: `Created moderation case ${id} (Subject: ${params.subjectTemporaryId || params.subjectPersonId || "Unknown"}).`,
    operatorId
  });

  return next;
}

/** 2. Propose Moderation Action */
export function proposeModerationAction(
  state: PrototypeState,
  params: {
    caseId: string;
    type: ModerationActionType;
    subjectTemporaryId?: string;
    subjectPersonId?: string;
    reason: string;
    scope: ModerationScope;
    scopeEntityId?: string;
    effectiveDate: string;
    expiryDate?: string;
  },
  operatorId: string = "op-master"
): PrototypeState {
  const actions = state.moderationActions ?? [];
  const id = nextId("mod-act", actions.map((a) => a.id));

  const newAction: ModerationAction = {
    id,
    caseId: params.caseId,
    type: params.type,
    subjectTemporaryId: params.subjectTemporaryId,
    subjectPersonId: params.subjectPersonId,
    reason: params.reason,
    scope: params.scope,
    scopeEntityId: params.scopeEntityId,
    effectiveDate: params.effectiveDate,
    expiryDate: params.expiryDate,
    status: "proposed",
    createdBy: operatorId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  let next = {
    ...state,
    moderationActions: [...actions, newAction],
    moderationCases: state.moderationCases.map((c) =>
      c.id === params.caseId
        ? {
            ...c,
            status: "action-proposed" as ModerationCaseStatus,
            recommendedAction: params.type,
            updatedAt: new Date().toISOString()
          }
        : c
    )
  };

  next = pushAudit(next, {
    action: "Moderation Action Proposed",
    description: `Proposed moderation action ${id} (${params.type}) for case ${params.caseId}.`,
    operatorId
  });

  return next;
}

/** 3. Approve Moderation Action */
export function approveModerationAction(
  state: PrototypeState,
  actionId: string,
  operatorId: string = "op-master"
): PrototypeState {
  const action = state.moderationActions.find((a) => a.id === actionId);
  if (!action) return state;

  let next = {
    ...state,
    moderationActions: state.moderationActions.map((a) =>
      a.id === actionId
        ? {
            ...a,
            status: "active" as ModerationActionStatus,
            approvedBy: operatorId,
            approvedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        : a
    ),
    moderationCases: state.moderationCases.map((c) =>
      c.id === action.caseId
        ? {
            ...c,
            status: "approved" as ModerationCaseStatus,
            decision: `Approved action ${action.type}`,
            decidedBy: operatorId,
            decidedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        : c
    )
  };

  next = pushAudit(next, {
    action: "Moderation Action Approved",
    description: `Approved and activated moderation action ${actionId} (${action.type}).`,
    operatorId
  });

  next = pushSignal(next, {
    kind: "alert",
    message: `Moderation action active: ${action.type} on subject ${action.subjectTemporaryId || action.subjectPersonId}`
  });

  return next;
}

/** 4. Reject Moderation Action */
export function rejectModerationAction(
  state: PrototypeState,
  actionId: string,
  reason: string,
  operatorId: string = "op-master"
): PrototypeState {
  const action = state.moderationActions.find((a) => a.id === actionId);
  if (!action) return state;

  let next = {
    ...state,
    moderationActions: state.moderationActions.map((a) =>
      a.id === actionId
        ? {
            ...a,
            status: "rejected" as ModerationActionStatus,
            rejectedBy: operatorId,
            rejectedAt: new Date().toISOString(),
            rejectionReason: reason,
            updatedAt: new Date().toISOString()
          }
        : a
    ),
    moderationCases: state.moderationCases.map((c) =>
      c.id === action.caseId
        ? {
            ...c,
            status: "open" as ModerationCaseStatus, // return to open for another proposal
            notes: c.notes + `\nRejected proposed action ${actionId}. Reason: ${reason}`,
            updatedAt: new Date().toISOString()
          }
        : c
    )
  };

  next = pushAudit(next, {
    action: "Moderation Action Rejected",
    description: `Rejected proposed moderation action ${actionId}. Reason: ${reason}`,
    operatorId
  });

  return next;
}

/** 5. Revoke Moderation Action */
export function revokeModerationAction(
  state: PrototypeState,
  actionId: string,
  reason: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    moderationActions: state.moderationActions.map((a) =>
      a.id === actionId
        ? {
            ...a,
            status: "revoked" as ModerationActionStatus,
            revokedBy: operatorId,
            revokedAt: new Date().toISOString(),
            revocationReason: reason,
            updatedAt: new Date().toISOString()
          }
        : a
    )
  };

  next = pushAudit(next, {
    action: "Moderation Action Revoked",
    description: `Revoked active moderation action ${actionId}. Reason: ${reason}`,
    operatorId
  });

  return next;
}

/** 6. Evaluate Subject Eligibility */
export function evaluateSubjectEligibility(
  state: PrototypeState,
  subjectId: string,
  context: {
    sessionId?: string;
    venueId?: string;
    territoryId?: string;
    tournamentId?: string;
  }
): { isEligible: boolean; blockReason?: string } {
  // Find all active/approved moderation actions for the subject
  const activeActions = (state.moderationActions ?? []).filter(
    (a) =>
      a.status === "active" &&
      (a.subjectTemporaryId === subjectId || a.subjectPersonId === subjectId)
  );

  for (const act of activeActions) {
    if (act.type === "permanent-ban") {
      return { isEligible: false, blockReason: `Permanent ban active on subject: ${act.reason}` };
    }

    if (act.type === "temporary-suspension") {
      // Check if expired
      if (act.expiryDate) {
        // If expired in prototype, we can check date strings or just assume active
        // Let's assume active unless revoked
      }
      return { isEligible: false, blockReason: `Temporary suspension active: ${act.reason}` };
    }

    // Check scope restrictions
    if (act.type === "venue-restriction" && context.venueId && act.scopeEntityId === context.venueId) {
      return { isEligible: false, blockReason: `Restricted from this venue: ${act.reason}` };
    }

    if (act.type === "activity-restriction" && context.tournamentId && act.scopeEntityId === context.tournamentId) {
      return { isEligible: false, blockReason: `Restricted from this tournament: ${act.reason}` };
    }
  }

  return { isEligible: true };
}
