/**
 * Trip balance: reminders, then enforcement.
 *
 * A confirmed trip booking that paid only the booking amount owes the rest
 * BALANCE_DUE_DAYS (15) before departure. The sweep (scheduled hourly):
 * - "soon":    within 3 days of the due date → a reminder;
 * - "today":   on the due date (first 24 h)  → a reminder;
 * - "overdue": 24–48 h after the due date    → a final warning;
 * - after the 48 h grace: the booking is cancelled, its seats are freed (the
 *   waitlist trigger tells waiting customers), and what the trip's refund
 *   policy allows is refunded — the same path as the customer cancelling.
 *
 * Each reminder is recorded on the booking (`balanceReminders`), written in
 * the same transaction as the notification, so overlapping runs never send
 * one twice. A booking whose balance payment is being set up right now is
 * left alone until the next run; a capture that still lands after the
 * cancellation is refunded by the payment-orphaned path (bookings.ts).
 */

import { db, serverNow, Timestamp } from "../platform/firestore";
import { notify } from "../platform/notify";
import { logInfo } from "../platform/log";
import { BALANCE_DUE_DAYS, DAY_MS } from "./model";
import { T, tripBookingRef, tripPaymentRef } from "./refs";
import { cancelTripBookingInTx, executeTripRefund, type TripBookingDoc, type TripPaymentDoc } from "./bookings";

const H = 3_600_000;
export const BALANCE_REMINDER_LEAD_MS = 3 * DAY_MS;
export const BALANCE_GRACE_MS = 48 * H;
/** A balance payment opened this recently may still complete: don't cancel under it. */
export const OPEN_PAYMENT_GUARD_MS = 30 * 60_000;

export type BalanceStage = "none" | "soon" | "today" | "overdue" | "cancel";

export const balanceDueAt = (departureStartMs: number) => departureStartMs - BALANCE_DUE_DAYS * DAY_MS;

/** Where a booking with an unpaid balance stands at [nowMs]. */
export function balanceStage(departureStartMs: number, nowMs: number): BalanceStage {
  const due = balanceDueAt(departureStartMs);
  if (nowMs < due - BALANCE_REMINDER_LEAD_MS) return "none";
  if (nowMs < due) return "soon";
  if (nowMs < due + 24 * H) return "today";
  if (nowMs < due + BALANCE_GRACE_MS) return "overdue";
  return "cancel";
}

/** Whole rupees, Indian grouping: "₹12,500". */
export const PulseFormatInr = (rupees: number) => `₹${Math.round(rupees).toLocaleString("en-IN")}`;

const owed = (b: Pick<TripBookingDoc, "quote" | "paid">) => Math.max(0, b.quote.total - b.paid);

function message(stage: "soon" | "today" | "overdue", b: TripBookingDoc, dueMs: number): { title: string; body: string } {
  const amount = PulseFormatInr(owed(b));
  const cutoff = new Date(dueMs + BALANCE_GRACE_MS).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
  switch (stage) {
    case "soon":
      return {
        title: "Your trip balance is due soon",
        body: `${amount} is due for ${b.title} by ${new Date(dueMs).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}. Pay it from Your trips.`,
      };
    case "today":
      return { title: "Your trip balance is due today", body: `Pay ${amount} for ${b.title} to keep your seats.` };
    case "overdue":
      return {
        title: "Pay your balance to keep your seats",
        body: `${amount} for ${b.title} is overdue. If it isn't paid by ${cutoff}, the booking is cancelled under the trip's refund policy.`,
      };
  }
}

export interface BalanceSweepResult {
  scanned: number;
  reminded: number;
  cancelled: number;
  skippedPaying: number;
  truncated: boolean;
}

export async function sweepTripBalances(opts: { limit?: number } = {}): Promise<BalanceSweepResult> {
  const limit = opts.limit ?? 300;
  const nowMs = serverNow().toMillis();
  // Due within the reminder lead, or past it: departure ≤ now + 15 d + 3 d.
  const snap = await db().collection(T.tripBookings)
    .where("status", "==", "confirmed")
    .where("departureStart", ">", Timestamp.fromMillis(nowMs))
    .where("departureStart", "<=", Timestamp.fromMillis(nowMs + BALANCE_DUE_DAYS * DAY_MS + BALANCE_REMINDER_LEAD_MS))
    .orderBy("departureStart")
    .limit(limit)
    .get();

  const out: BalanceSweepResult = { scanned: snap.size, reminded: 0, cancelled: 0, skippedPaying: 0, truncated: snap.size === limit };
  for (const doc of snap.docs) {
    const first = doc.data() as TripBookingDoc;
    if (owed(first) <= 0) continue;
    const stage = balanceStage(first.departureStart.toMillis(), nowMs);
    if (stage === "none") continue;

    const result = await db().runTransaction(async (tx) => {
      const s = await tx.get(tripBookingRef(doc.id));
      const b = s.data() as (TripBookingDoc & { balanceReminders?: string[] }) | undefined;
      if (!b || b.status !== "confirmed" || owed(b) <= 0) return { kind: "noop" as const };
      const now = serverNow();
      const st = balanceStage(b.departureStart.toMillis(), now.toMillis());
      const dueMs = balanceDueAt(b.departureStart.toMillis());

      if (st === "cancel") {
        if (b.openPaymentId) {
          const p = await tx.get(tripPaymentRef(b.openPaymentId));
          const pay = p.data() as TripPaymentDoc | undefined;
          const live = pay && (pay.status === "creating" || pay.status === "created")
            && now.toMillis() - pay.updatedAt.toMillis() < OPEN_PAYMENT_GUARD_MS;
          if (live) return { kind: "paying" as const };
        }
        const done = await cancelTripBookingInTx(tx, now, doc.id, b, {
          actorUid: "system:trip-balance", actorRole: "system", cancelledBy: "system:trip-balance",
          reason: "Balance not paid by the due date", requestId: null, source: "scheduler",
        });
        notify(tx, {
          recipientUid: b.customerUid,
          kind: "trip-balance",
          title: "Trip booking cancelled",
          body: `The balance for ${b.title} wasn't paid, so the booking was cancelled.${done.refund > 0 ? ` ${PulseFormatInr(done.refund)} is being refunded.` : ""}`,
          dedupeKey: `${doc.id}-cancelled`,
          link: { type: "trip-booking", id: doc.id },
        });
        return { kind: "cancelled" as const, refundIds: done.refundIds };
      }

      if (st === "none") return { kind: "noop" as const };
      const sent = Array.isArray(b.balanceReminders) ? b.balanceReminders : [];
      if (sent.includes(st)) return { kind: "noop" as const };
      const m = message(st, b, dueMs);
      notify(tx, {
        recipientUid: b.customerUid,
        kind: "trip-balance",
        title: m.title,
        body: m.body,
        dedupeKey: `${doc.id}-${st}`,
        link: { type: "trip-booking", id: doc.id },
      });
      tx.update(tripBookingRef(doc.id), { balanceReminders: [...sent, st], updatedAt: now });
      return { kind: "reminded" as const };
    });

    if (result.kind === "reminded") out.reminded++;
    if (result.kind === "paying") out.skippedPaying++;
    if (result.kind === "cancelled") {
      out.cancelled++;
      for (const id of result.refundIds) await executeTripRefund(id);
    }
  }
  if (out.reminded || out.cancelled) logInfo({ event: "job.completed", job: "sweepTripBalances", ...out });
  return out;
}
