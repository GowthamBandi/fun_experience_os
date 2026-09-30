import type { Timestamp } from "firebase-admin/firestore";

export type PaymentStatus = "creating" | "created" | "captured" | "failed" | "refunded" | "partially-refunded";

export interface PaymentDoc {
  id: string;
  bookingId: string;
  orgId: string;
  eventId: string;
  customerUid: string;
  provider: "razorpay";
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  /** Snapshotted at capture from the event (ADR-0005): history never rewrites. */
  commissionBps: number | null;
  commissionMinor: number | null;
  refundedMinor: number;
  creatingUntil?: Timestamp | null;
  riskFlag?: string | null;
  lastError?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  capturedAt?: Timestamp | null;
}

export type RefundStatus =
  | "requested"
  | "under-review"
  | "approved"
  | "rejected"
  | "processing"
  | "completed"
  | "failed";

export type RefundReason =
  | "customer-cancellation"
  | "event-cancelled"
  | "payment-orphaned"
  | "duplicate-capture"
  | "organizer-request";

export interface RefundDoc {
  id: string;
  bookingId: string;
  paymentId: string;
  orgId: string;
  eventId: string;
  customerUid: string;
  amountMinor: number;
  currency: string;
  status: RefundStatus;
  reason: RefundReason;
  note: string | null;
  requestedBy: string;
  approvals: string[];
  decidedBy: string | null;
  /** Provider payment to refund (differs from the payment doc only for duplicate captures). */
  providerPaymentId: string | null;
  providerRefundId: string | null;
  /** False only for ledger-neutral refunds (a duplicate capture never entered the ledger). */
  ledgerPosted: boolean;
  executingUntil?: Timestamp | null;
  lastError?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
