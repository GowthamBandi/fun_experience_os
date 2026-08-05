import type { PrototypeState } from "../scenarios";
import type { Refund, RefundType } from "../entities";
import { validateRefundEligibility } from "../validators/bookingValidation";
import { pushAudit, pushSignal } from "./helpers";

const nowDisplay = () => "Just now";

/**
 * Initiates a refund request for a booking.
 */
export function initiateRefund(
  state: PrototypeState,
  params: {
    bookingId: string;
    amount: number;
    reason: string;
    type?: RefundType;
    operatorId?: string;
  }
): { state: PrototypeState; refund?: Refund; error?: string } {
  const validation = validateRefundEligibility(state, params.bookingId, params.amount);
  if (!validation.isValid) {
    return { state, error: validation.errors.join(" ") };
  }

  const booking = state.bookings.find((b) => b.id === params.bookingId);
  if (!booking) return { state, error: "Booking not found." };

  const refundId = `ref-${Date.now().toString(36)}`;
  const newRefund: Refund = {
    id: refundId,
    paymentId: `pay-${booking.id}`,
    bookingId: booking.id,
    sessionId: booking.sessionId,
    type: params.type || "user-cancellation",
    amount: params.amount,
    reason: params.reason,
    status: "requested",
    requestedAt: nowDisplay(),
    createdAt: nowDisplay(),
    updatedAt: nowDisplay(),
  };

  let next: PrototypeState = {
    ...state,
    refunds: [...(state.refunds ?? []), newRefund],
  };

  next = pushSignal(next, {
    kind: "system",
    message: `Refund request created for ${booking.alias} (₹${params.amount})`,
    sessionId: booking.sessionId,
  });

  next = pushAudit(next, {
    action: "Refund Requested",
    description: `Refund request ${refundId} (₹${params.amount}) created for booking ${booking.bookingCode || booking.id}.`,
    sessionId: booking.sessionId,
    operatorId: params.operatorId,
  });

  return { state: next, refund: newRefund };
}

/**
 * Approves a pending refund request (Finance role authorized action).
 */
export function approveRefund(
  state: PrototypeState,
  refundId: string,
  operatorId = "FIN-01"
): PrototypeState {
  const refund = (state.refunds ?? []).find((r) => r.id === refundId);
  if (!refund || (refund.status !== "requested" && refund.status !== "under-review")) {
    return state;
  }

  let next: PrototypeState = {
    ...state,
    refunds: (state.refunds ?? []).map((r) =>
      r.id === refundId
        ? {
            ...r,
            status: "approved" as const,
            approvedAt: nowDisplay(),
            approvedBy: operatorId,
            updatedAt: nowDisplay(),
          }
        : r
    ),
  };

  next = pushAudit(next, {
    action: "Refund Approved",
    description: `Refund ${refundId} (₹${refund.amount}) approved by Finance (${operatorId}).`,
    sessionId: refund.sessionId,
    operatorId,
  });

  // Automatically transition approved refund to completed in simulation
  return completeRefund(next, refundId, operatorId);
}

/**
 * Rejects a refund request.
 */
export function rejectRefund(
  state: PrototypeState,
  refundId: string,
  reason = "Policy non-compliance",
  operatorId = "FIN-01"
): PrototypeState {
  const refund = (state.refunds ?? []).find((r) => r.id === refundId);
  if (!refund) return state;

  let next: PrototypeState = {
    ...state,
    refunds: (state.refunds ?? []).map((r) =>
      r.id === refundId
        ? {
            ...r,
            status: "rejected" as const,
            failureReason: reason,
            updatedAt: nowDisplay(),
          }
        : r
    ),
  };

  return pushAudit(next, {
    action: "Refund Rejected",
    description: `Refund ${refundId} rejected by Finance (${reason}).`,
    sessionId: refund.sessionId,
    operatorId,
  });
}

/**
 * Marks a refund transaction completed and updates booking payment status to refunded.
 */
export function completeRefund(
  state: PrototypeState,
  refundId: string,
  operatorId?: string
): PrototypeState {
  const refund = (state.refunds ?? []).find((r) => r.id === refundId);
  if (!refund) return state;

  let next: PrototypeState = {
    ...state,
    refunds: (state.refunds ?? []).map((r) =>
      r.id === refundId
        ? {
            ...r,
            status: "completed" as const,
            completedAt: nowDisplay(),
            updatedAt: nowDisplay(),
          }
        : r
    ),
    bookings: state.bookings.map((b) =>
      b.id === refund.bookingId
        ? {
            ...b,
            paymentStatus: "refunded" as const,
            status: "refunded" as const,
            updatedAt: nowDisplay(),
          }
        : b
    ),
    transactions: [
      {
        id: `t-ref-${Date.now().toString(36)}`,
        sessionId: refund.sessionId,
        territoryId: state.sessions.find((s) => s.id === refund.sessionId)?.territoryId ?? "unknown",
        bookingId: refund.bookingId,
        kind: "refund" as const,
        amount: -refund.amount,
        method: "card",
        status: "settled" as const,
        at: nowDisplay(),
      },
      ...state.transactions,
    ],
  };

  next = pushSignal(next, {
    kind: "system",
    message: `Refund ₹${refund.amount} completed for booking ${refund.bookingId}`,
    sessionId: refund.sessionId,
  });

  return pushAudit(next, {
    action: "Refund Completed",
    description: `Refund ${refundId} (₹${refund.amount}) completed successfully.`,
    sessionId: refund.sessionId,
    operatorId,
  });
}

/**
 * Reconciles a payment transaction record.
 */
export function reconcilePayment(
  state: PrototypeState,
  paymentId: string,
  operatorId?: string
): PrototypeState {
  const payment = (state.payments ?? []).find((p) => p.id === paymentId);
  if (!payment) return state;

  let next: PrototypeState = {
    ...state,
    payments: (state.payments ?? []).map((p) =>
      p.id === paymentId ? { ...p, status: "reconciled" as const, updatedAt: nowDisplay() } : p
    ),
  };

  return pushAudit(next, {
    action: "Payment Reconciled",
    description: `Payment ${paymentId} (₹${payment.amount}) verified and reconciled.`,
    sessionId: payment.sessionId,
    operatorId,
  });
}

/** Legacy helpers maintained for backward compatibility */
export function simulateRefund(state: PrototypeState, transactionId: string, operatorId?: string): PrototypeState {
  const tx = state.transactions.find((t) => t.id === transactionId);
  if (!tx || tx.kind !== "refund") return state;
  const refund = (state.refunds ?? []).find((r) => r.bookingId === tx.bookingId);
  if (refund) return completeRefund(state, refund.id, operatorId);
  return state;
}

export function retryPayment(state: PrototypeState, transactionId: string, operatorId?: string): PrototypeState {
  const tx = state.transactions.find((t) => t.id === transactionId);
  if (!tx || tx.status !== "failed") return state;
  const next: PrototypeState = {
    ...state,
    transactions: state.transactions.map((t) => (t.id === transactionId ? { ...t, status: "settled" as const } : t)),
    bookings: state.bookings.map((b) =>
      b.id === tx.bookingId ? { ...b, status: "confirmed" as const, paymentStatus: "confirmed" as const } : b
    ),
  };
  return pushAudit(next, {
    action: "Payment Retried",
    description: `Payment transaction ${transactionId} retried and settled; booking ${tx.bookingId} confirmed.`,
    sessionId: tx.sessionId,
    operatorId,
  });
}

