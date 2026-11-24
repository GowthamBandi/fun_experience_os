/**
 * Organizer-set cancellation rules end to end on the emulator: frozen on the
 * booking at reservation, quoted and enforced by quoteCancellation /
 * cancelBooking, old bookings and events unchanged, free bookings respecting
 * allowed + cut-off, organizer/PULSE cancellations still refunding in full.
 */

import { FieldValue } from "firebase-admin/firestore";
import {
  book, call, callErr, commerce, db, getDoc, ledgerWhere, newCustomer, phoneCtx, reserve, rid, world,
} from "./commerce-helpers";
import { presetRules } from "../src/commerce/cancellation";
import { cancellationPercent } from "../src/commerce/policy";
import { refundCancelledEvent } from "../src/commerce/refunds";

jest.setTimeout(180_000);

const tiers = (...t: Array<[number, number]>) => t.map(([hoursBefore, refundPercent]) => ({ hoursBefore, refundPercent }));
const custom = (over: Record<string, unknown> = {}) => ({ allowed: true, cutoffHours: 0, tiers: tiers([72, 100], [24, 40]), preset: "custom", ...over });

type Quote = { percent: number; amountMinor: number; reason: string };
type Booking = { status: string; cancellation?: Record<string, unknown>; refundedMinor: number };
const quote = (uid: string, bookingId: string) => call<Quote>(commerce.quoteCancellation, { bookingId }, phoneCtx(uid));
const cancel = (uid: string, bookingId: string) =>
  call<{ status: string; refund: { amountMinor: number } | null }>(commerce.cancelBooking, { requestId: rid(), bookingId }, phoneCtx(uid));

/** The refusal as the app receives it: code, message and facts. */
async function refusalOf(fn: unknown, data: unknown, uid: string) {
  try {
    await call(fn, data, phoneCtx(uid));
  } catch (e) {
    const d = (e as { details?: { code?: string; message?: string; facts?: Record<string, unknown>; nextStep?: string } }).details ?? {};
    return { code: d.code, message: d.message, facts: d.facts, nextStep: d.nextStep };
  }
  throw new Error("expected a refusal");
}

describe("rules are frozen on the booking at reservation", () => {
  test("a booking carries the event's rules; an old event's one-word preset is frozen as its rules", async () => {
    const a = await world({ cancellation: custom(), policy: "custom" });
    const uid = await newCustomer();
    const b = await book(uid, a.eventId);
    expect((await getDoc<Booking>(`bookings/${b.bookingId}`))!.cancellation).toEqual(custom());

    const old = await world({ policy: "moderate" });
    const uid2 = await newCustomer();
    const r = await reserve(uid2, old.eventId);
    expect((await getDoc<Booking>(`bookings/${r.bookingId}`))!.cancellation).toEqual(presetRules("moderate"));
  });

  test("the organizer changing the event's rules later doesn't change an existing booking's quote", async () => {
    const { eventId } = await world({ cancellation: custom(), policy: "custom", startsInHours: 100, priceMinor: 50_000 });
    const early = await newCustomer();
    const b = await book(early, eventId);
    expect(await quote(early, b.bookingId)).toEqual({ percent: 100, amountMinor: 50_000, reason: "policy:custom" });

    // The organizer switches to "No cancellations".
    await db().doc(`events/${eventId}`).update({ cancellation: presetRules("none"), cancellationPolicy: "none" });
    expect(await quote(early, b.bookingId)).toEqual({ percent: 100, amountMinor: 50_000, reason: "policy:custom" });

    // A new booking agrees to the new rules.
    const late = await newCustomer();
    const b2 = await book(late, eventId);
    expect((await getDoc<Booking>(`bookings/${b2.bookingId}`))!.cancellation).toEqual(presetRules("none"));
    expect((await refusalOf(commerce.quoteCancellation, { bookingId: b2.bookingId }, late)).facts).toEqual({ reason: "not-allowed" });

    // The early booking still cancels under its own rules.
    const out = await cancel(early, b.bookingId);
    expect(out.refund?.amountMinor).toBe(50_000);
  });
});

describe("old bookings and events (only the string) quote exactly as before", () => {
  test.each([
    ["flexible", 30, 100],
    ["flexible", 10, 50],
    ["moderate", 100, 100],
    ["moderate", 48, 50],
    ["moderate", 12, 0],
    ["strict", 200, 100],
    ["strict", 100, 0],
  ] as const)("%s, %s h out → %s%%, same reason string", async (policy, hours, pct) => {
    const price = 99_999;
    const { eventId } = await world({ policy, startsInHours: hours, priceMinor: price });
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    // A booking made before rules were frozen has no `cancellation`.
    await db().doc(`bookings/${b.bookingId}`).update({ cancellation: FieldValue.delete() });
    const q = await quote(uid, b.bookingId);
    expect(q.percent).toBe(cancellationPercent(policy, hours));
    expect(q).toEqual({
      percent: pct,
      amountMinor: Math.floor((price * pct) / 100),
      reason: pct === 0 ? `outside-policy:${policy}` : `policy:${policy}`,
    });
    const out = await cancel(uid, b.bookingId);
    expect(out.refund?.amountMinor ?? 0).toBe(q.amountMinor);
    expect((await getDoc<{ cancelReason: string }>(`bookings/${b.bookingId}`))!.cancelReason).toBe(q.reason);
  });
});

describe("custom tiers, no cancellations, cut-off", () => {
  test("custom tiers decide the refund", async () => {
    const { eventId } = await world({ cancellation: custom(), policy: "custom", startsInHours: 48, priceMinor: 10_001 });
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    expect(await quote(uid, b.bookingId)).toEqual({ percent: 40, amountMinor: 4_000, reason: "policy:custom" });
    const out = await cancel(uid, b.bookingId);
    expect(out.refund?.amountMinor).toBe(4_000);
    expect((await getDoc<Booking>(`bookings/${b.bookingId}`))!).toMatchObject({ status: "cancelled", refundedMinor: 4_000 });
  });

  test("past the last tier but before the cut-off: cancellable with no refund", async () => {
    const { eventId } = await world({ cancellation: custom({ tiers: tiers([72, 100]) }), policy: "custom", startsInHours: 30 });
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    expect(await quote(uid, b.bookingId)).toMatchObject({ percent: 0, amountMinor: 0, reason: "outside-policy:custom" });
    expect((await cancel(uid, b.bookingId)).refund).toBeNull();
  });

  test("No cancellations: quote and cancel refused with facts; the booking, seat and ticket stay", async () => {
    const { eventId } = await world({ cancellation: presetRules("none"), policy: "none", startsInHours: 500, capacity: 3 });
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    const expected = {
      code: "PRECONDITION",
      message: "This booking can't be cancelled — the organizer doesn't allow cancellations.",
      facts: { reason: "not-allowed" },
      nextStep: "If something has gone wrong, contact PULSE support.",
    };
    expect(await refusalOf(commerce.quoteCancellation, { bookingId: b.bookingId }, uid)).toEqual(expected);
    expect(await refusalOf(commerce.cancelBooking, { requestId: rid(), bookingId: b.bookingId }, uid)).toEqual(expected);
    expect((await getDoc<Booking>(`bookings/${b.bookingId}`))!.status).toBe("confirmed");
    expect((await getDoc<{ status: string }>(`tickets/${b.ticketIds[0]}`))!.status).toBe("valid");
    expect((await getDoc<{ occupancy: { confirmedPaidBookings: number } }>(`events/${eventId}`))!.occupancy.confirmedPaidBookings).toBe(1);
    expect(await ledgerWhere("bookingId", b.bookingId).then((e) => e.filter((x) => x.kind === "refund"))).toHaveLength(0);
  });

  test("inside the cut-off: refused with facts.cutoffHours; outside it cancels as normal", async () => {
    const rules = custom({ cutoffHours: 24, tiers: tiers([48, 100], [0, 50]) });
    const near = await world({ cancellation: rules, policy: "custom", startsInHours: 20 });
    const uid = await newCustomer();
    const b = await book(uid, near.eventId);
    const refusal = await refusalOf(commerce.cancelBooking, { requestId: rid(), bookingId: b.bookingId }, uid);
    expect(refusal).toMatchObject({ code: "PRECONDITION", message: "Cancelling closed 24 hours before the start.", facts: { reason: "cutoff", cutoffHours: 24 } });
    expect(await refusalOf(commerce.quoteCancellation, { bookingId: b.bookingId }, uid)).toEqual(refusal);
    expect((await getDoc<Booking>(`bookings/${b.bookingId}`))!.status).toBe("confirmed");

    const far = await world({ cancellation: rules, policy: "custom", startsInHours: 30, priceMinor: 20_000 });
    const uid2 = await newCustomer();
    const b2 = await book(uid2, far.eventId);
    expect(await quote(uid2, b2.bookingId)).toEqual({ percent: 50, amountMinor: 10_000, reason: "policy:custom" });
  });

  test("an unpaid hold is released even under No cancellations", async () => {
    const { eventId } = await world({ cancellation: presetRules("none"), policy: "none", capacity: 2 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId);
    expect(r.status).toBe("held");
    expect((await cancel(uid, r.bookingId)).status).toBe("cancelled");
  });
});

describe("free bookings: no money, but allowed and the cut-off still decide", () => {
  test("allowed: cancels and frees the spot", async () => {
    const { eventId } = await world({ priceMinor: 0, cancellation: custom({ cutoffHours: 2 }), policy: "custom", capacity: 1 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId);
    expect(r.status).toBe("confirmed");
    expect(await quote(uid, r.bookingId)).toEqual({ percent: 0, amountMinor: 0, reason: "free-booking" });
    expect((await cancel(uid, r.bookingId)).refund).toBeNull();
    expect((await getDoc<{ remainingSellableCapacity: number }>(`events/${eventId}`))!.remainingSellableCapacity).toBe(1);
  });

  test("No cancellations: refused, spot kept", async () => {
    const { eventId } = await world({ priceMinor: 0, cancellation: presetRules("none"), policy: "none" });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId);
    expect((await refusalOf(commerce.cancelBooking, { requestId: rid(), bookingId: r.bookingId }, uid)).facts).toEqual({ reason: "not-allowed" });
    expect((await getDoc<Booking>(`bookings/${r.bookingId}`))!.status).toBe("confirmed");
  });

  test("inside the cut-off: refused", async () => {
    const { eventId } = await world({ priceMinor: 0, cancellation: custom({ cutoffHours: 48 }), policy: "custom", startsInHours: 40 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId);
    expect((await refusalOf(commerce.quoteCancellation, { bookingId: r.bookingId }, uid)).facts).toEqual({ reason: "cutoff", cutoffHours: 48 });
  });
});

describe("organizer / PULSE cancelling the event always refunds in full", () => {
  test("even under No cancellations", async () => {
    const { eventId } = await world({ cancellation: presetRules("none"), policy: "none", priceMinor: 30_000 });
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    await db().doc(`events/${eventId}`).update({ status: "cancelled" });
    // The live onEventCancelled trigger may get there first; either way, one full refund.
    await refundCancelledEvent(eventId, { uid: "admin-x", role: "platform:super-admin" }).catch(() => undefined);
    const end = Date.now() + 20_000;
    while (Date.now() < end && !(await getDoc(`refunds/evc_${b.bookingId}`))) await new Promise((r) => setTimeout(r, 250));
    const refunds = await db().collection("refunds").where("bookingId", "==", b.bookingId).get();
    expect(refunds.docs.map((d) => d.data().amountMinor)).toEqual([30_000]);
    expect(refunds.docs[0]!.data().reason).toBe("event-cancelled");
  });
});

describe("refusal reaches the callable with the message the app shows", () => {
  test("callErr surface", async () => {
    const { eventId } = await world({ cancellation: presetRules("none"), policy: "none" });
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    expect(await callErr(commerce.cancelBooking, { requestId: rid(), bookingId: b.bookingId }, phoneCtx(uid))).toEqual({
      code: "PRECONDITION",
      message: "This booking can't be cancelled — the organizer doesn't allow cancellations.",
    });
  });
});
