/**
 * Append-only money ledger (ADR-0005 "Ledger").
 *
 * Every money movement writes balanced entries (Σ debits == Σ credits) in
 * integer paise, all sharing one `txnId`. Entry ids are `${txnId}_${n}` and
 * written with `create`, so a replayed movement can never post twice.
 *
 *   Capture: DR customer_payments / CR platform_commission + CR organizer_payable
 *   Refund : DR organizer_payable + DR platform_commission / CR customer_refunds
 */

import type { Transaction } from "firebase-admin/firestore";
import { db, serverNow } from "../platform/firestore";
import { C, CURRENCY } from "./config";

export type LedgerAccount = "customer_payments" | "platform_commission" | "organizer_payable" | "customer_refunds";

export interface LedgerLine {
  account: LedgerAccount;
  direction: "debit" | "credit";
  amountMinor: number;
}

export interface LedgerContext {
  orgId: string;
  eventId: string;
  bookingId: string;
  paymentId: string;
  refundId?: string | null;
}

/** floor(amount × bps / 10000); the organizer gets the remainder. */
export function commissionFor(amountMinor: number, bps: number): number {
  return Math.floor((amountMinor * bps) / 10_000);
}

export function captureLines(amountMinor: number, commissionMinor: number): LedgerLine[] {
  const lines: LedgerLine[] = [{ account: "customer_payments", direction: "debit", amountMinor }];
  if (commissionMinor > 0) lines.push({ account: "platform_commission", direction: "credit", amountMinor: commissionMinor });
  lines.push({ account: "organizer_payable", direction: "credit", amountMinor: amountMinor - commissionMinor });
  return lines;
}

/**
 * Proportional reversal of a refund of `refundMinor` against a payment of
 * `paymentMinor` whose commission was `commissionMinor`, given `refundedBefore`
 * already reversed. Cumulative flooring guarantees that a full refund (in any
 * number of parts) reverses exactly the original commission, to the paisa.
 */
export function refundSplit(paymentMinor: number, commissionMinor: number, refundedBefore: number, refundMinor: number) {
  const cum = (x: number) => (paymentMinor > 0 ? Math.floor((commissionMinor * x) / paymentMinor) : 0);
  const commissionReversal = cum(refundedBefore + refundMinor) - cum(refundedBefore);
  return { commissionReversal, organizerReversal: refundMinor - commissionReversal };
}

export function refundLines(refundMinor: number, commissionReversal: number): LedgerLine[] {
  const lines: LedgerLine[] = [
    { account: "organizer_payable", direction: "debit", amountMinor: refundMinor - commissionReversal },
  ];
  if (commissionReversal > 0) lines.push({ account: "platform_commission", direction: "debit", amountMinor: commissionReversal });
  lines.push({ account: "customer_refunds", direction: "credit", amountMinor: refundMinor });
  return lines;
}

export function isBalanced(lines: Array<{ direction: string; amountMinor: number }>): boolean {
  let d = 0;
  let c = 0;
  for (const l of lines) {
    if (!Number.isSafeInteger(l.amountMinor) || l.amountMinor < 0) return false;
    if (l.direction === "debit") d += l.amountMinor;
    else c += l.amountMinor;
  }
  return d === c;
}

/** Posts a balanced transaction inside the caller's Firestore transaction. */
export function postLedger(
  tx: Transaction,
  txnId: string,
  kind: "capture" | "refund",
  ctx: LedgerContext,
  lines: LedgerLine[],
  meta: { txnGrossMinor: number; txnCommissionMinor: number }
): void {
  if (!isBalanced(lines)) throw new Error(`Unbalanced ledger transaction ${txnId}`);
  const now = serverNow();
  lines.forEach((l, i) => {
    tx.create(db().collection(C.ledgerEntries).doc(`${txnId}_${i}`), {
      txnId,
      kind,
      account: l.account,
      orgId: ctx.orgId,
      direction: l.direction,
      amountMinor: l.amountMinor,
      currency: CURRENCY,
      bookingId: ctx.bookingId,
      paymentId: ctx.paymentId,
      refundId: ctx.refundId ?? null,
      eventId: ctx.eventId,
      settlementId: null,
      // Gross and commission of the whole movement, for settlement statements.
      txnGrossMinor: meta.txnGrossMinor,
      txnCommissionMinor: meta.txnCommissionMinor,
      createdAt: now,
    });
  });
}
