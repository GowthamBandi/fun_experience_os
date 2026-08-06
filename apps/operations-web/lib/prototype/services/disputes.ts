import type { PrototypeState } from "../scenarios/state";
import type { Dispute, DisputeType, DisputeStatus } from "../entities";
import { uid, nextId, pushAudit, pushSignal } from "./helpers";

/** 1. Submit Dispute */
export function submitDispute(
  state: PrototypeState,
  params: {
    type: DisputeType;
    reason: string;
    relatedEntityType: string;
    relatedEntityId: string;
    tournamentId?: string;
    matchId?: string;
    sessionId?: string;
    bookingId?: string;
    submittedBy: string;
  },
  operatorId: string = "op-master"
): PrototypeState {
  const disputes = state.disputes ?? [];
  const id = nextId("disp", disputes.map((d) => d.id));

  const newDispute: Dispute = {
    id,
    type: params.type,
    status: "submitted",
    reason: params.reason,
    relatedEntityType: params.relatedEntityType,
    relatedEntityId: params.relatedEntityId,
    tournamentId: params.tournamentId,
    matchId: params.matchId,
    sessionId: params.sessionId,
    bookingId: params.bookingId,
    submittedBy: params.submittedBy,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  let next = {
    ...state,
    disputes: [...disputes, newDispute]
  };

  next = pushAudit(next, {
    action: "Dispute Submitted",
    description: `Submitted dispute ${id} of type ${params.type} by ${params.submittedBy}.`,
    operatorId
  });

  next = pushSignal(next, {
    kind: "alert",
    message: `New dispute submitted: ${id}`
  });

  return next;
}

/** 2. Assign Dispute Reviewer */
export function assignDisputeReviewer(
  state: PrototypeState,
  disputeId: string,
  reviewerId: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    disputes: state.disputes.map((d) =>
      d.id === disputeId
        ? {
            ...d,
            status: "under-review" as DisputeStatus,
            reviewerId,
            assignedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        : d
    )
  };

  next = pushAudit(next, {
    action: "Dispute Reviewer Assigned",
    description: `Assigned reviewer ${reviewerId} to dispute ${disputeId}.`,
    operatorId
  });

  return next;
}

/** 3. Request Dispute Evidence */
export function requestDisputeEvidence(
  state: PrototypeState,
  disputeId: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    disputes: state.disputes.map((d) =>
      d.id === disputeId
        ? {
            ...d,
            status: "evidence-requested" as DisputeStatus,
            evidenceRequested: true,
            evidenceRequestedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        : d
    )
  };

  next = pushAudit(next, {
    action: "Dispute Evidence Requested",
    description: `Requested evidence for dispute ${disputeId}.`,
    operatorId
  });

  return next;
}

/** 4. Decide Dispute */
export function decideDispute(
  state: PrototypeState,
  params: {
    disputeId: string;
    decision: string;
    decisionReason: string;
    upheld: boolean;
  },
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    disputes: state.disputes.map((d) =>
      d.id === params.disputeId
        ? {
            ...d,
            status: (params.upheld ? "upheld" : "rejected") as DisputeStatus,
            decision: params.decision,
            decisionReason: params.decisionReason,
            decidedBy: operatorId,
            decidedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        : d
    )
  };

  next = pushAudit(next, {
    action: "Dispute Decided",
    description: `Decided dispute ${params.disputeId}: status = ${params.upheld ? "upheld" : "rejected"}. Reason: ${params.decisionReason}`,
    operatorId
  });

  return next;
}

/** 5. Close Dispute */
export function closeDispute(
  state: PrototypeState,
  disputeId: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    disputes: state.disputes.map((d) =>
      d.id === disputeId
        ? {
            ...d,
            status: "closed" as DisputeStatus,
            closedAt: new Date().toISOString(),
            closedBy: operatorId,
            updatedAt: new Date().toISOString()
          }
        : d
    )
  };

  next = pushAudit(next, {
    action: "Dispute Closed",
    description: `Closed dispute ${disputeId}.`,
    operatorId
  });

  return next;
}
