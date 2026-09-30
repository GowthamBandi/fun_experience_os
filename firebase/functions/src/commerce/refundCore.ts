/**
 * Refund plumbing shared by cancellation, discretionary refunds, event
 * cancellation and orphaned captures (ADR-0005 "Refunds").
 *
 * A refund is committed in two steps:
 *  1. In a Firestore transaction the refund document becomes `approved`, the
 *     ledger reversal is posted and the payment's `refundedMinor` grows. From
 *     this moment the money is owed back and can never be settled out.
 *  2. `executeRefund()` calls the provider with idempotency key = refundId and
 *     moves the refund to `processing` (or `completed`). A provider outage
 *     leaves it `approved`; the scheduled sweeper retries it.
 */

import type { Transaction } from "firebase-admin/firestore";
import { Timestamp, serverNow } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { notify } from "../platform/notify";
import { refundLines, refundSplit, postLedger } from "./ledger";
import { getPaymentProvider } from "./provider";
import { getPayment, getRefund, paymentRef, raiseRiskAlert, refundRef } from "./shared";
import type { PaymentDoc, PaymentStatus, RefundDoc, RefundReason } from "./types";
import { db } from "../platform/firestore";
import { C } from "./config";
import { logError, logWarn } from "../platform/log";

/**
 * Posts the ledger reversal for a refund of `amountMinor` against `payment`
 * (whose refundedMinor is `refundedBefore`). Returns the payment patch; the
 * caller writes it (it may be combined with other payment changes).
 */
export function postRefundLedger(
  tx: Transaction,
  refundId: string,
  payment: PaymentDoc,
  refundedBefore: number,
  amountMinor: number
): { refundedMinor: number; status: PaymentStatus } {
  const remaining = payment.amountMinor - refundedBefore;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > remaining) {
    throw new Error(`Refund ${refundId} of ${amountMinor} exceeds refundable ${remaining}`);
  }
  const { commissionReversal } = refundSplit(payment.amountMinor, payment.commissionMinor ?? 0, refundedBefore, amountMinor);
  postLedger(
    tx,
    `ref_${refundId}`,
    "refund",
    { orgId: payment.orgId, eventId: payment.eventId, bookingId: payment.bookingId, paymentId: payment.id, refundId },
    refundLines(amountMinor, commissionReversal),
    { txnGrossMinor: amountMinor, txnCommissionMinor: commissionReversal }
  );
  const refundedMinor = refundedBefore + amountMinor;
  return { refundedMinor, status: refundedMinor >= payment.amountMinor ? "refunded" : "partially-refunded" };
}

/** Builds a new refund document (not yet written). */
export function newRefundDoc(
  id: string,
  p: PaymentDoc,
  a: {
    amountMinor: number;
    status: RefundDoc["status"];
    reason: RefundReason;
    requestedBy: string;
    note?: string | null;
    providerPaymentId?: string | null;
    ledgerPosted: boolean;
    approvals?: string[];
    decidedBy?: string | null;
  }
): RefundDoc {
  const now = serverNow();
  return {
    id,
    bookingId: p.bookingId,
    paymentId: p.id,
    orgId: p.orgId,
    eventId: p.eventId,
    customerUid: p.customerUid,
    amountMinor: a.amountMinor,
    currency: p.currency,
    status: a.status,
    reason: a.reason,
    note: a.note ?? null,
    requestedBy: a.requestedBy,
    approvals: a.approvals ?? [],
    decidedBy: a.decidedBy ?? null,
    providerPaymentId: a.providerPaymentId ?? p.providerPaymentId,
    providerRefundId: null,
    ledgerPosted: a.ledgerPosted,
    executingUntil: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Approves an existing/new refund of `amountMinor` on `payment` inside `tx`:
 * ledger reversal + payment.refundedMinor. Caller has read `payment` in `tx`.
 */
export function approveRefundInTx(
  tx: Transaction,
  refund: RefundDoc,
  payment: PaymentDoc,
  opts: { create: boolean; decidedBy?: string | null }
): RefundDoc {
  const patch = postRefundLedger(tx, refund.id, payment, payment.refundedMinor ?? 0, refund.amountMinor);
  const now = serverNow();
  tx.update(paymentRef(payment.id), { refundedMinor: patch.refundedMinor, status: patch.status, updatedAt: now });
  const approved: RefundDoc = {
    ...refund,
    status: "approved",
    ledgerPosted: true,
    decidedBy: opts.decidedBy ?? refund.decidedBy,
    updatedAt: now,
  };
  if (opts.create) tx.create(refundRef(refund.id), approved);
  else tx.update(refundRef(refund.id), { status: "approved", ledgerPosted: true, decidedBy: approved.decidedBy, updatedAt: now });
  return approved;
}

const LEASE_MS = 60_000;

/**
 * Sends an `approved` refund to the provider (idempotency key = refundId).
 * Never throws: a provider failure leaves the refund `approved` for retry.
 */
export async function executeRefund(refundId: string): Promise<RefundDoc["status"] | null> {
  const leased = await db().runTransaction(async (tx) => {
    const r = await getRefund(refundId, tx);
    if (!r || r.status !== "approved" || r.providerRefundId) return null;
    const now = serverNow();
    if (r.executingUntil && r.executingUntil.toMillis() > now.toMillis()) return null;
    const p = await getPayment(r.paymentId, tx);
    tx.update(refundRef(refundId), { executingUntil: Timestamp.fromMillis(now.toMillis() + LEASE_MS) });
    return { r, providerPaymentId: r.providerPaymentId ?? p?.providerPaymentId ?? null };
  });
  if (!leased) return (await getRefund(refundId))?.status ?? null;
  const { r, providerPaymentId } = leased;

  if (!providerPaymentId) {
    await refundRef(refundId).update({ executingUntil: null, lastError: "no-provider-payment", updatedAt: serverNow() });
    logWarn({ event: "refund.stuck", reason: "no-provider-payment", refundId, orgId: r.orgId });
    return "approved";
  }

  try {
    const out = await getPaymentProvider().refund({
      providerPaymentId,
      amountMinor: r.amountMinor,
      refundId,
      notes: { refundId, bookingId: r.bookingId, paymentId: r.paymentId },
    });
    return await db().runTransaction(async (tx) => {
      const cur = await getRefund(refundId, tx);
      if (!cur) return null;
      if (cur.status !== "approved") {
        // A webhook overtook us; just remember the provider id.
        if (!cur.providerRefundId) tx.update(refundRef(refundId), { providerRefundId: out.providerRefundId });
        return cur.status;
      }
      const status = out.status === "processed" ? "completed" : out.status === "failed" ? "failed" : "processing";
      tx.update(refundRef(refundId), {
        status,
        providerRefundId: out.providerRefundId,
        executingUntil: null,
        lastError: null,
        updatedAt: serverNow(),
      });
      writeAudit(tx, {
        action: "refund.sent-to-provider",
        actorUid: "system",
        actorRole: "system",
        resourceType: "refund",
        resourceId: refundId,
        orgId: cur.orgId,
        after: { status, providerRefundId: out.providerRefundId, amountMinor: cur.amountMinor },
        source: "system",
      });
      if (status === "failed") failedRefundAlert(tx, cur);
      if (status === "completed") {
        // Instant refunds come back processed; tell the customer now (same
        // dedupe id as the webhook path, which can't also fire: it only acts
        // on approved/processing refunds).
        notify(tx, {
          recipientUid: cur.customerUid,
          kind: "refund-update",
          title: "Refund sent",
          body: `Your refund of ₹${(cur.amountMinor / 100).toFixed(2)} has been processed by the bank.`,
          dedupeKey: `${refundId}-completed`,
          link: { type: "booking", id: cur.bookingId },
        });
      }
      return status;
    });
  } catch (e) {
    const message = String((e as Error)?.message ?? e).slice(0, 300);
    await refundRef(refundId).update({ executingUntil: null, lastError: message, updatedAt: serverNow() });
    // Money is owed and not yet sent: ERROR so it pages if it persists.
    logError({ event: "refund.provider-error", refundId, orgId: r.orgId, amountMinor: r.amountMinor, error: message });
    return "approved";
  }
}

function failedRefundAlert(tx: Transaction, r: RefundDoc) {
  raiseRiskAlert(tx, `refund-failed_${r.id}`, {
    kind: "refund-failed",
    severity: "high",
    orgId: r.orgId,
    summary: "A refund failed at the payment provider and needs manual action.",
    detail: { refundId: r.id, amountMinor: r.amountMinor, bookingId: r.bookingId },
  });
}

/** `refund.processed` / `refund.failed` from the provider. Idempotent. */
export async function completeRefundFromProvider(
  refundId: string,
  providerRefundId: string | null,
  outcome: "processed" | "failed"
): Promise<"completed" | "failed" | "ignored"> {
  return db().runTransaction(async (tx) => {
    const r = await getRefund(refundId, tx);
    if (!r) return "ignored";
    if (r.status !== "approved" && r.status !== "processing") return "ignored";
    const status = outcome === "processed" ? "completed" : "failed";
    const now = serverNow();
    tx.update(refundRef(refundId), {
      status,
      providerRefundId: r.providerRefundId ?? providerRefundId,
      executingUntil: null,
      completedAt: status === "completed" ? now : null,
      updatedAt: now,
    });
    writeAudit(tx, {
      action: `refund.${status}`,
      actorUid: "razorpay",
      actorRole: "system",
      resourceType: "refund",
      resourceId: refundId,
      orgId: r.orgId,
      after: { status, amountMinor: r.amountMinor },
      source: "webhook",
    });
    if (status === "completed") {
      notify(tx, {
        recipientUid: r.customerUid,
        kind: "refund-update",
        title: "Refund sent",
        body: `Your refund of ₹${(r.amountMinor / 100).toFixed(2)} has been processed by the bank.`,
        dedupeKey: `${refundId}-completed`,
        link: { type: "booking", id: r.bookingId },
      });
    } else {
      failedRefundAlert(tx, r);
    }
    return status;
  });
}

/**
 * Finds refunds stuck in `approved` (provider call failed) and retries them.
 * Bounded: reads at most `scan` candidates and calls the provider for at most
 * `limit`, least-recently-touched first (each attempt bumps `updatedAt`), so a
 * refund that can never succeed doesn't starve the others. Sorting happens in
 * memory to avoid a composite index; the `scan` window only matters beyond
 * 200 simultaneously stuck refunds, which is itself an incident.
 */
export async function retryApprovedRefunds(
  limit = 50,
  scan = 200,
  opts: { deadlineMs?: number; now?: () => number } = {}
): Promise<{ retried: number; due: number; stoppedForTime: boolean }> {
  const clock = opts.now ?? Date.now;
  const snap = await db().collection(C.refunds).where("status", "==", "approved").limit(scan).get();
  const now = clock();
  const due = snap.docs
    .map((d) => d.data() as RefundDoc)
    .filter((r) => !r.providerRefundId && !(r.executingUntil && r.executingUntil.toMillis() > now))
    .sort((a, b) => (a.updatedAt?.toMillis?.() ?? 0) - (b.updatedAt?.toMillis?.() ?? 0))
    .slice(0, limit);
  let n = 0;
  for (const r of due) {
    // Time budget: each attempt can take up to the provider timeout (15 s)
    // during an outage. Never START one past the deadline, so the scheduled
    // function finishes (and records its summary) before its own timeout.
    // What's left is retried by the next run, least-recently-touched first.
    if (opts.deadlineMs !== undefined && clock() >= opts.deadlineMs) {
      return { retried: n, due: due.length, stoppedForTime: true };
    }
    await executeRefund(r.id);
    n++;
  }
  return { retried: n, due: due.length, stoppedForTime: false };
}

/** Worst-case duration of one provider call (provider.ts AbortSignal timeout) plus its transactions. */
export const REFUND_ATTEMPT_WORST_MS = 20_000;
