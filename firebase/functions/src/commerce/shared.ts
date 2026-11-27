import type { Transaction } from "firebase-admin/firestore";
import { COLLECTIONS, bookingRef, db, sessionRef, serverNow } from "../platform/firestore";
import { DomainError, notFound } from "../platform/errors";
import type { BookingDoc, EventDoc } from "../bookings/reserveSeat";
import { C } from "./config";
import type { PaymentDoc, RefundDoc } from "./types";

export const paymentRef = (id: string) => db().collection(C.payments).doc(id);
export const refundRef = (id: string) => db().collection(C.refunds).doc(id);
export const ticketRef = (id: string) => db().collection(C.tickets).doc(id);
export const providerPaymentRef = (providerPaymentId: string) =>
  db().collection(C.providerPayments).doc(providerPaymentId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120) || "_");

/** Which PULSE payment a Razorpay payment id was recorded against (`providerPayments/{pay_id}`). */
export interface ProviderPaymentClaim {
  kind: "event" | "trip";
  paymentId: string;
  providerOrderId: string;
  claimedAt: FirebaseFirestore.Timestamp;
}

/** True when [snap] is empty or already names this exact payment. */
export function claimAllows(snap: FirebaseFirestore.DocumentSnapshot, kind: ProviderPaymentClaim["kind"], paymentId: string): boolean {
  if (!snap.exists) return true;
  const c = snap.data() as ProviderPaymentClaim;
  return c.kind === kind && c.paymentId === paymentId;
}

/** Records the claim in [tx] when it isn't recorded yet (the caller read [snap] in the same tx). */
export function writeClaim(
  tx: Transaction,
  snap: FirebaseFirestore.DocumentSnapshot,
  providerPaymentId: string,
  claim: Omit<ProviderPaymentClaim, "claimedAt">
): void {
  if (snap.exists) return;
  tx.create(providerPaymentRef(providerPaymentId), { ...claim, claimedAt: serverNow() });
}
export { bookingRef, sessionRef as eventRef };

export async function getBooking(id: string, tx?: Transaction): Promise<BookingDoc | null> {
  const s = tx ? await tx.get(bookingRef(id)) : await bookingRef(id).get();
  return s.exists ? (s.data() as BookingDoc) : null;
}
export async function getEvent(id: string, tx?: Transaction): Promise<EventDoc | null> {
  const s = tx ? await tx.get(sessionRef(id)) : await sessionRef(id).get();
  return s.exists ? (s.data() as EventDoc) : null;
}
export async function getPayment(id: string, tx?: Transaction): Promise<PaymentDoc | null> {
  const s = tx ? await tx.get(paymentRef(id)) : await paymentRef(id).get();
  return s.exists ? (s.data() as PaymentDoc) : null;
}
export async function getRefund(id: string, tx?: Transaction): Promise<RefundDoc | null> {
  const s = tx ? await tx.get(refundRef(id)) : await refundRef(id).get();
  return s.exists ? (s.data() as RefundDoc) : null;
}

/** Owner-only view of a booking. A stranger learns nothing (same answer as missing). */
export function assertOwner(b: BookingDoc | null, uid: string): BookingDoc {
  if (!b || b.customerUid !== uid) throw notFound("We couldn't find that booking.", "Open My bookings and try again.");
  return b;
}

/** Records a risk alert for the governance console (idempotent by id). */
export function raiseRiskAlert(
  tx: Transaction,
  id: string,
  a: { kind: string; severity: "low" | "medium" | "high"; orgId?: string | null; summary: string; detail: Record<string, unknown> }
): void {
  tx.set(db().collection(COLLECTIONS.riskAlerts).doc(id), {
    id,
    kind: a.kind,
    severity: a.severity,
    status: "open",
    orgId: a.orgId ?? null,
    summary: a.summary,
    detail: a.detail,
    createdAt: serverNow(),
  });
}

export const iso = (t: { toDate(): Date } | null | undefined): string | null => (t ? t.toDate().toISOString() : null);

export function conflict(message: string, nextStep?: string): DomainError {
  return new DomainError("CONFLICT", message, { nextStep });
}
