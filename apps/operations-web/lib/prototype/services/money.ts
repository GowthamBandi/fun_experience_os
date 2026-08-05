import type { PrototypeState } from "../scenarios";
import { pushAudit, pushSignal } from "./helpers";

/** Settle a pending refund transaction (simulated gateway callback). */
export function simulateRefund(state: PrototypeState, transactionId: string, operatorId?: string): PrototypeState {
  const tx = state.transactions.find((t) => t.id === transactionId);
  if (!tx || tx.kind !== "refund") return state;
  const next: PrototypeState = {
    ...state,
    transactions: state.transactions.map((t) => (t.id === transactionId ? { ...t, status: "settled" as const } : t))
  };
  return pushAudit(
    pushSignal(next, { kind: "system", message: `Refund ₹${Math.abs(tx.amount)} settled for transaction ${transactionId}.`, sessionId: tx.sessionId }),
    { action: "Refund Settled", description: `Refund transaction ${transactionId} (₹${Math.abs(tx.amount)}) settled via simulated gateway.`, sessionId: tx.sessionId, operatorId }
  );
}

/** Retry a failed payment transaction and flip the linked booking to pending/confirmed. */
export function retryPayment(state: PrototypeState, transactionId: string, operatorId?: string): PrototypeState {
  const tx = state.transactions.find((t) => t.id === transactionId);
  if (!tx || tx.status !== "failed") return state;
  const next: PrototypeState = {
    ...state,
    transactions: state.transactions.map((t) => (t.id === transactionId ? { ...t, status: "settled" as const } : t)),
    bookings: state.bookings.map((b) =>
      b.id === tx.bookingId ? { ...b, status: "payment-confirmed" as const } : b
    )
  };
  return pushAudit(next, {
    action: "Payment Retried",
    description: `Payment transaction ${transactionId} retried and settled; booking ${tx.bookingId} confirmed.`,
    sessionId: tx.sessionId,
    operatorId
  });
}
