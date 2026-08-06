import type { PrototypeState } from "../scenarios/state";
import type { RefundException, RefundExceptionReason, RefundExceptionStatus } from "../entities";
import { uid, nextId, pushAudit, pushSignal } from "./helpers";

/** 1. Recommend Refund Exception */
export function recommendRefundException(
  state: PrototypeState,
  params: {
    incidentId?: string;
    disputeId?: string;
    tournamentId?: string;
    matchId?: string;
    sessionId?: string;
    bookingId?: string;
    reason: RefundExceptionReason;
    amount: number;
    notes?: string;
  },
  operatorId: string = "op-master"
): PrototypeState {
  const exceptions = state.refundExceptions ?? [];
  const id = nextId("rex", exceptions.map((e) => e.id));

  const newException: RefundException = {
    id,
    incidentId: params.incidentId,
    disputeId: params.disputeId,
    tournamentId: params.tournamentId,
    matchId: params.matchId,
    sessionId: params.sessionId,
    bookingId: params.bookingId,
    reason: params.reason,
    amount: params.amount,
    currency: "INR",
    status: "recommended",
    recommendedBy: operatorId,
    recommendedAt: new Date().toISOString(),
    notes: params.notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  let next = {
    ...state,
    refundExceptions: [...exceptions, newException]
  };

  next = pushAudit(next, {
    action: "Refund Exception Recommended",
    description: `Recommended refund exception of ₹${params.amount} for reason "${params.reason}".`,
    operatorId
  });

  return next;
}

/** 2. Approve Refund Exception */
export function approveRefundException(
  state: PrototypeState,
  exceptionId: string,
  operatorId: string = "op-master"
): PrototypeState {
  const exception = state.refundExceptions.find((e) => e.id === exceptionId);
  if (!exception) return state;

  // Simulate creating a refund record in state
  const refunds = state.refunds ?? [];
  const refundId = nextId("ref", refunds.map((r) => r.id));

  const newRefund = {
    id: refundId,
    paymentId: exception.bookingId ? `pay-${exception.bookingId}` : "pay-manual",
    bookingId: exception.bookingId ?? "b-manual",
    sessionId: exception.sessionId ?? "s-manual",
    type: "manual-adjustment" as const,
    amount: exception.amount,
    reason: exception.notes || `Approved exception refund: ${exception.reason}`,
    status: "completed" as const,
    requestedAt: exception.recommendedAt,
    approvedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    approvedBy: operatorId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  let next = {
    ...state,
    refunds: [...refunds, newRefund],
    refundExceptions: state.refundExceptions.map((e) =>
      e.id === exceptionId
        ? {
            ...e,
            status: "approved" as RefundExceptionStatus,
            approvedBy: operatorId,
            approvedAt: new Date().toISOString(),
            linkedRefundId: refundId,
            updatedAt: new Date().toISOString()
          }
        : e
    )
  };

  next = pushAudit(next, {
    action: "Refund Exception Approved",
    description: `Approved refund exception ${exceptionId} (Refund: ${refundId}, Amount: ₹${exception.amount}).`,
    operatorId
  });

  next = pushSignal(next, {
    kind: "close",
    message: `Refund exception processed for ₹${exception.amount}`
  });

  return next;
}

/** 3. Reject Refund Exception */
export function rejectRefundException(
  state: PrototypeState,
  exceptionId: string,
  reason: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    refundExceptions: state.refundExceptions.map((e) =>
      e.id === exceptionId
        ? {
            ...e,
            status: "rejected" as RefundExceptionStatus,
            rejectedBy: operatorId,
            rejectedAt: new Date().toISOString(),
            rejectionReason: reason,
            updatedAt: new Date().toISOString()
          }
        : e
    )
  };

  next = pushAudit(next, {
    action: "Refund Exception Rejected",
    description: `Rejected refund exception ${exceptionId}. Reason: ${reason}`,
    operatorId
  });

  return next;
}
