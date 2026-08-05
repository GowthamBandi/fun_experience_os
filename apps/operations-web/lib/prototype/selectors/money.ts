import type { PrototypeState } from "../scenarios/state";
import type { Payment, Refund } from "../entities";
import { sessionCapacityLedger } from "./capacity";

export function selectPaymentList(state: PrototypeState): Payment[] {
  return state.payments ?? [];
}

export function selectRefundList(state: PrototypeState): Refund[] {
  return state.refunds ?? [];
}

export interface FinancialOperationsMetrics {
  grossCollected: number;
  pendingRevenue: number;
  failedRevenue: number;
  totalRefunded: number;
  netRevenue: number;
  confirmedPaymentsCount: number;
  pendingPaymentsCount: number;
  failedPaymentsCount: number;
  refundsCount: number;
  pendingRefundsCount: number;
  reconciliationDiscrepanciesCount: number;
}

export function selectFinancialOperationsMetrics(state: PrototypeState): FinancialOperationsMetrics {
  const payments = state.payments ?? [];
  const refunds = state.refunds ?? [];

  let grossCollected = 0;
  let pendingRevenue = 0;
  let failedRevenue = 0;
  let confirmedPaymentsCount = 0;
  let pendingPaymentsCount = 0;
  let failedPaymentsCount = 0;

  payments.forEach((p) => {
    if (p.status === "confirmed" || p.status === "reconciled") {
      grossCollected += p.amount;
      confirmedPaymentsCount++;
    } else if (p.status === "pending" || p.status === "initiated") {
      pendingRevenue += p.amount;
      pendingPaymentsCount++;
    } else if (p.status === "failed") {
      failedRevenue += p.amount;
      failedPaymentsCount++;
    }
  });

  let totalRefunded = 0;
  let refundsCount = 0;
  let pendingRefundsCount = 0;

  refunds.forEach((r) => {
    if (r.status === "completed") {
      totalRefunded += r.amount;
      refundsCount++;
    } else if (r.status === "requested" || r.status === "under-review" || r.status === "approved" || r.status === "processing") {
      pendingRefundsCount++;
    }
  });

  const netRevenue = grossCollected - totalRefunded;

  // Discrepancy checks: Payments without bookings, or bookings marked confirmed without payment
  const bookingIds = new Set(state.bookings.map((b) => b.id));
  const unmatchedPayments = payments.filter((p) => !bookingIds.has(p.bookingId)).length;
  const confirmedBookingsUnpaid = state.bookings.filter(
    (b) => (b.status === "confirmed" || b.paymentStatus === "confirmed") && b.bookingType !== "complimentary" && !payments.some((p) => p.bookingId === b.id && p.status === "confirmed")
  ).length;

  const reconciliationDiscrepanciesCount = unmatchedPayments + confirmedBookingsUnpaid;

  return {
    grossCollected,
    pendingRevenue,
    failedRevenue,
    totalRefunded,
    netRevenue,
    confirmedPaymentsCount,
    pendingPaymentsCount,
    failedPaymentsCount,
    refundsCount,
    pendingRefundsCount,
    reconciliationDiscrepanciesCount,
  };
}

export function selectSessionFinancialSummary(state: PrototypeState, sessionId: string) {
  const session = state.sessions.find((s) => s.id === sessionId);
  const ledger = sessionCapacityLedger(state, sessionId);
  const payments = (state.payments ?? []).filter((p) => p.sessionId === sessionId);
  const refunds = (state.refunds ?? []).filter((r) => r.sessionId === sessionId);

  const grossCollected = payments
    .filter((p) => p.status === "confirmed" || p.status === "reconciled")
    .reduce((sum, p) => sum + p.amount, 0);

  const totalRefunded = refunds
    .filter((r) => r.status === "completed")
    .reduce((sum, r) => sum + r.amount, 0);

  const netRevenue = grossCollected - totalRefunded;
  const targetRevenue = (session?.basePrice || 0) * ledger.targetAttendance;
  const breakEvenRevenue = (session?.basePrice || 0) * ledger.breakEvenAttendance;
  const isProfitable = netRevenue >= breakEvenRevenue;

  return {
    sessionId,
    grossCollected,
    totalRefunded,
    netRevenue,
    targetRevenue,
    breakEvenRevenue,
    isProfitable,
    ledger,
  };
}
