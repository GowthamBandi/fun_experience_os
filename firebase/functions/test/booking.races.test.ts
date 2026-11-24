/**
 * Limited spots and other people booking at the same time: every way a
 * customer can lose the race between opening a page and paying, and that
 * the answer is (a) correct — no oversell, no double charge, nobody charged
 * for nothing — and (b) actionable: plain words plus `details.facts` the app
 * uses to offer the right next step (waitlist, the number left, start again).
 *
 * What was already proven elsewhere and isn't repeated here: no-oversell
 * under 40-way concurrency and requestId idempotency (concurrency.test.ts),
 * multi-spot storms, one live booking per customer, eligibility, lapsed-hold
 * reclaim for events (commerce.booking.test.ts), late capture readmit /
 * orphan refund after the sweeper (commerce.payments.test.ts), trip seats /
 * beds / readmit after the sweeper (trips.test.ts).
 */
import {
  call, callCode, commerce, db, deliverWebhook, capturedEvent, fakePayId, getDoc, lapseHold, newCustomer, order,
  phoneCtx, adminCtx, reserve, rid, uniq, world, Timestamp,
} from "./commerce-helpers";
import { paymentSignature } from "../src/commerce/provider";
import { settleCapturedPayment } from "../src/commerce/payments";
import { customerSoldOut } from "../src/bookings/reserveSeat";
import { toHttpsError } from "../src/platform/callable";
import * as trips from "../src/trips";
import { capacityProblem, releaseExpiredTripHolds } from "../src/trips/bookings";

jest.setTimeout(180_000);

/** The callable's error payload exactly as the app receives it (`details`). */
async function refusal(fn: unknown, data: unknown, ctx: unknown) {
  try {
    await call(fn, data, ctx);
  } catch (e) {
    return (e as { details: { code: string; message: string; nextStep?: string; facts?: Record<string, unknown> } }).details;
  }
  throw new Error("expected the call to fail");
}

const reserveData = (eventId: string, spots = 1) => ({ requestId: rid(), eventId, spots, alias: "Quiet Heron" });

type Booking = { status: string; spots: number; ticketIds?: string[]; cancelReason?: string };
type Ev = { occupancy: { activeReservationHolds: number; confirmedPaidBookings: number }; remainingSellableCapacity: number };

/* ======================================================== events: the race */

describe("events — losing the race for the last spots", () => {
  test("two customers race for the last spot: one wins, the other is told plainly and given spotsLeft=0", async () => {
    const { eventId } = await world({ capacity: 1 });
    const [a, b] = await Promise.all([newCustomer(), newCustomer()]);
    const results = await Promise.allSettled([
      call(commerce.reserveSeat, reserveData(eventId), phoneCtx(a)),
      call(commerce.reserveSeat, reserveData(eventId), phoneCtx(b)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    const d = (lost.reason as { details: { code: string; message: string; nextStep: string; facts: Record<string, number> } }).details;
    expect(d.code).toBe("SOLD_OUT");
    expect(d.message).toBe("Someone just took the last spot.");
    expect(d.nextStep).toBe("Join the waitlist and we'll tell you the moment one opens.");
    expect(d.facts).toEqual({ spotsLeft: 0, requested: 1 });
    const ev = (await getDoc<Ev>(`events/${eventId}`))!;
    expect(ev.occupancy.activeReservationHolds).toBe(1);
    expect(ev.remainingSellableCapacity).toBe(0);
    // The loser can now wait for a spot.
    expect(await callCode(commerce.joinEventWaitlist, { requestId: rid(), eventId }, phoneCtx(results[0]!.status === "rejected" ? a : b))).toBe("OK");
  });

  test("asking for 3 with 2 left: refused whole, told how many are left, and booking the 2 then works", async () => {
    const { eventId } = await world({ capacity: 4 });
    await reserve(await newCustomer(), eventId, 2);
    const uid = await newCustomer();
    const d = await refusal(commerce.reserveSeat, reserveData(eventId, 3), phoneCtx(uid));
    expect(d).toMatchObject({
      code: "SOLD_OUT",
      message: "Only 2 spots are left, so we couldn't hold 3.",
      nextStep: "You can still book the 2 that are left.",
      facts: { spotsLeft: 2, requested: 3 },
    });
    expect((await db().collection("bookings").where("customerUid", "==", uid).get()).size).toBe(0);
    expect((await reserve(uid, eventId, 2)).status).toBe("held");
  });

  test("a waitlist join is refused (kindly) while spots are open", async () => {
    const { eventId } = await world({ capacity: 3 });
    const d = await refusal(commerce.joinEventWaitlist, { requestId: rid(), eventId }, phoneCtx(await newCustomer()));
    expect(d).toMatchObject({ code: "PRECONDITION", facts: { reason: "spots-open", spotsLeft: 3 } });
    expect(d.message).toBe("Good news — 3 spots just opened. Book it now, before someone else does.");
  });

  test("the customer copy never uses the console's words ('session', 'add this person')", () => {
    for (const [left, asked] of [[0, 1], [0, 3], [1, 2], [2, 3]] as const) {
      const p = toHttpsError(customerSoldOut(left, asked)).details as { message: string; nextStep: string; facts: object };
      expect(`${p.message} ${p.nextStep}`).not.toMatch(/session|this person|waiting list/i);
      expect(p.facts).toEqual({ spotsLeft: left, requested: asked });
    }
    expect(customerSoldOut(1, 2).operatorMessage).toBe("Only 1 spot is left, so we couldn't hold 2.");
    expect(customerSoldOut(1, 2).nextStep).toBe("You can still book the last one.");
  });

  test("the console path keeps its operator copy and codes (no facts leak there)", async () => {
    const { reserveSeat } = await import("../src/bookings/reserveSeat");
    const { eventId } = await world({ capacity: 1 });
    await reserve(await newCustomer(), eventId);
    await expect(
      reserveSeat({ requestId: rid(), eventId, alias: "Desk", kind: "sellable", actor: { uid: "op-1", roleId: "super-admin" }, source: "admin-console" })
    ).rejects.toMatchObject({ code: "SOLD_OUT", operatorMessage: "This session just sold out. No places are left." });
  });
});

describe("events — the page changed while it was open", () => {
  test.each([
    ["cancelled", "This event was cancelled, so it can't take bookings."],
    ["booking-closed", "Bookings have closed for this event."],
    ["draft", "The organizer is updating this event, so it isn't taking bookings right now."],
    ["live", "This event has already started, so it can't take bookings."],
  ])("a %s event refuses the customer in their words", async (status, message) => {
    const { eventId } = await world({ status });
    const d = await refusal(commerce.reserveSeat, reserveData(eventId), phoneCtx(await newCustomer()));
    expect(d).toMatchObject({ code: "SESSION_NOT_BOOKABLE", message, facts: { status } });
  });

  test("an earlier attempt that got through (answer lost) is reported as an existing hold the app can resume", async () => {
    const { eventId } = await world({ capacity: 5 });
    const uid = await newCustomer();
    const key = rid();
    const first = await reserve(uid, eventId, 1, key);
    // A retry with the SAME requestId (double tap, lost answer) replays the original.
    const replay = await reserve(uid, eventId, 1, key);
    expect(replay.bookingId).toBe(first.bookingId);
    // A NEW attempt (the app restarted and lost its key) is told about the hold.
    const d = await refusal(commerce.reserveSeat, reserveData(eventId), phoneCtx(uid));
    expect(d).toMatchObject({ code: "CONFLICT", message: "You're already holding a spot for this event.", facts: { existing: "held" } });
    expect((await db().collection("bookings").where("customerUid", "==", uid).get()).size).toBe(1);
  });
});

/* ================================================== events: payment races */

describe("events — the hold and the payment", () => {
  test("no payment opens on a hold that ran out, was released, or whose event was called off — each says why", async () => {
    const { eventId } = await world({ capacity: 5 });
    const c1 = await newCustomer();
    const r1 = await reserve(c1, eventId);
    await lapseHold(r1.bookingId);
    expect(await refusal(commerce.createPaymentOrder, { requestId: rid(), bookingId: r1.bookingId }, phoneCtx(c1))).toMatchObject({
      code: "PRECONDITION", facts: { reason: "hold-expired" },
    });

    const c2 = await newCustomer();
    const r2 = await reserve(c2, eventId);
    await call(commerce.cancelBooking, { requestId: rid(), bookingId: r2.bookingId }, phoneCtx(c2));
    expect(await refusal(commerce.createPaymentOrder, { requestId: rid(), bookingId: r2.bookingId }, phoneCtx(c2))).toMatchObject({
      code: "PRECONDITION", facts: { reason: "released" },
    });

    // Cancelled moments ago; the cancellation fan-out hasn't reached the hold yet.
    const c3 = await newCustomer();
    const r3 = await reserve(c3, eventId);
    await db().doc(`events/${eventId}`).update({ status: "cancelled" });
    const d = await refusal(commerce.createPaymentOrder, { requestId: rid(), bookingId: r3.bookingId }, phoneCtx(c3));
    expect(d).toMatchObject({ code: "PRECONDITION", facts: { reason: "event-cancelled" } });
    expect(d.message).toMatch(/cancelled.*haven't been charged/);
  });

  test("event cancelled while the customer was in the payment sheet: the capture is refunded in full, never confirmed", async () => {
    const { eventId } = await world({ capacity: 3, priceMinor: 50_000 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId, 2);
    const o = await order(uid, r.bookingId);
    await db().doc(`events/${eventId}`).update({ status: "cancelled" });

    const payId = fakePayId();
    const out = await call<{ status: string; ticketIds: string[]; refundId: string }>(
      commerce.confirmPayment,
      { paymentId: o.paymentId, providerPaymentId: payId, providerSignature: paymentSignature(o.providerOrderId, payId) },
      phoneCtx(uid)
    );
    expect(out.status).toBe("payment-orphaned");
    expect(out.ticketIds).toEqual([]);
    expect((await getDoc<Booking>(`bookings/${r.bookingId}`))!.status).toBe("payment-orphaned");
    expect((await db().collection("tickets").where("bookingId", "==", r.bookingId).get()).size).toBe(0);
    const refund = (await getDoc<{ amountMinor: number; reason: string; status: string }>(`refunds/orph_${o.paymentId}`))!;
    expect(refund).toMatchObject({ amountMinor: 100_000, reason: "payment-orphaned" });
    expect(["processing", "completed"]).toContain(refund.status);
    // Its seats are handed back, and the customer is told why.
    expect((await getDoc<Ev>(`events/${eventId}`))!.occupancy.activeReservationHolds).toBe(0);
    const notes = await db().collection("userNotifications").where("recipientUid", "==", uid).get();
    expect(notes.docs.map((n) => n.data().body as string).join(" ")).toMatch(/was cancelled while you were paying/);
    expect(notes.docs.some((n) => n.data().kind === "booking-confirmed")).toBe(false);
    // The webhook delivering the same capture later changes nothing.
    const again = await settleCapturedPayment({ paymentId: o.paymentId, providerOrderId: o.providerOrderId, providerPaymentId: payId, amountMinor: 100_000, currency: "INR", source: "webhook" });
    expect(again.outcome).toBe("already-settled");
  });

  test("the app let the hold go (timer ran out / left checkout) but the payment still landed: honoured when there's room", async () => {
    const { eventId } = await world({ capacity: 3 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId, 2);
    const o = await order(uid, r.bookingId);
    await call(commerce.cancelBooking, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(uid)); // releaseHold
    expect((await getDoc<Booking>(`bookings/${r.bookingId}`))!).toMatchObject({ status: "cancelled", cancelReason: "hold-released" });

    const res = await deliverWebhook(capturedEvent({ providerPaymentId: fakePayId(), orderId: o.providerOrderId, paymentId: o.paymentId, amount: o.amountMinor }));
    expect(res.body).toMatchObject({ outcome: "readmitted" });
    const b = (await getDoc<Booking>(`bookings/${r.bookingId}`))!;
    expect(b.status).toBe("confirmed");
    expect(b.ticketIds).toHaveLength(2);
    expect((await getDoc<Ev>(`events/${eventId}`))!.occupancy.confirmedPaidBookings).toBe(2);
  });

  test("…and refunded in full when someone else took those spots meanwhile", async () => {
    const { eventId } = await world({ capacity: 1 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId);
    const o = await order(uid, r.bookingId);
    await call(commerce.cancelBooking, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(uid));
    await reserve(await newCustomer(), eventId); // the freed spot goes at once

    const res = await deliverWebhook(capturedEvent({ providerPaymentId: fakePayId(), orderId: o.providerOrderId, paymentId: o.paymentId, amount: o.amountMinor }));
    expect(res.body).toMatchObject({ outcome: "orphaned" });
    expect((await getDoc<Booking>(`bookings/${r.bookingId}`))!.status).toBe("payment-orphaned");
    expect((await getDoc<{ reason: string }>(`refunds/orph_${o.paymentId}`))!.reason).toBe("payment-orphaned");
    const ev = (await getDoc<Ev>(`events/${eventId}`))!;
    expect(ev.occupancy.activeReservationHolds).toBe(1); // the other customer's, untouched
    expect(ev.remainingSellableCapacity).toBe(0); // never oversold
  });

  test("double tap on Pay: one order, one charge; a second capture of the same order is refunded", async () => {
    const { eventId } = await world({ capacity: 2 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId);
    const [o1, o2] = await Promise.all([order(uid, r.bookingId), order(uid, r.bookingId)].map((p) => p.catch((e: unknown) => e)));
    const orders = [o1, o2].filter((x): x is { paymentId: string; providerOrderId: string; amountMinor: number; keyId: string } => !!(x as { paymentId?: string }).paymentId);
    // Either both calls returned the same order, or the second was told to wait (CONTENTION) — never two orders.
    expect(new Set(orders.map((x) => x.providerOrderId)).size).toBe(1);
    const o = orders[0]!;
    const p1 = fakePayId();
    const p2 = fakePayId();
    const first = await deliverWebhook(capturedEvent({ providerPaymentId: p1, orderId: o.providerOrderId, paymentId: o.paymentId, amount: o.amountMinor }));
    const second = await deliverWebhook(capturedEvent({ providerPaymentId: p2, orderId: o.providerOrderId, paymentId: o.paymentId, amount: o.amountMinor }));
    expect(first.body).toMatchObject({ outcome: "confirmed" });
    expect(second.body).toMatchObject({ outcome: "duplicate-capture" });
    expect((await getDoc<{ status: string }>(`refunds/dup_${p2}`))).toBeDefined();
  });
});

/* ======================================================== trips: the race */

const DAY = 86_400_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function liveTrip(seats = 4) {
  const orgId = uniq("org-race");
  const owner = uniq("owner");
  await db().doc(`organizers/${orgId}`).set({ status: "active", displayName: "Race Trails", version: 1 });
  await db().doc(`commercialAgreements/ca-${orgId}`).set({
    orgId, status: "approved", commissionBps: 1_000, payoutCadence: "weekly", proposedBy: "a", decidedBy: "b", updatedAt: Timestamp.now(),
  });
  await db().doc(`memberships/${orgId}__${owner}`).set({ orgId, uid: owner, role: "owner", status: "active", permissions: [], eventScope: { all: true, eventIds: [] }, version: 1 });
  const hostTripId = uniq("ht");
  const day = (title: string, stay: string) => ({
    title, summary: "", activities: [{ time: "9:00 AM", title: "Walk", detail: "", icon: "hiking" }],
    meals: [], mealPlan: [{ meal: "dinner", time: "8:00 PM", place: "Camp", menu: "Thali", diets: ["veg"] }], stay, travel: "", overnightTransit: false,
  });
  const draft = {
    title: "Race to Coorg", tagline: "Misty estates", destination: "Coorg", region: "south", style: "weekend",
    startCity: "Bengaluru", route: ["Bengaluru", "Madikeri", "Bengaluru"], highlights: ["Estates", "Falls", "Bonfire"],
    days: [day("Departure", "Homestay"), day("Estates", "Homestay"), day("Return", "")],
    stays: [{ name: "Misty Woods", type: "homestay", location: "Madikeri", nights: 2, note: "" }],
    vehicles: [{ type: "tempoTraveller", leg: "Return", model: "Urbania", seats: 17, ac: true, features: [] }],
    transport: "", diets: ["veg"], foodNote: "",
    pickups: [{ id: "p1", name: "Majestic", landmark: "Gate 2", time: "9:30 PM" }],
    drops: [{ id: "d1", name: "Majestic", landmark: "Gate 2", time: "6:00 AM" }],
    reportingNote: "", returnNote: "", goodies: [], rules: ["No alcohol in the vehicle"], luggageNote: "", bookingCutoffDays: 2,
    bestSeason: "", altitude: "", difficulty: "light", gender: "open", ageMin: 18, ageMax: null, groupMin: 2, groupMax: 10,
    departures: [{ id: `${hostTripId}-d1`, start: iso(40 * DAY), end: iso(42 * DAY), seatsTotal: seats, priceDelta: 0, longWeekend: null }],
    departureHour: 21, departureMinute: 0,
    rooms: [
      { id: "quad", label: "Quad sharing", occupancy: 4, price: 8000, beds: 8 },
      { id: "double", label: "Double sharing", occupancy: 2, price: 10000, beds: 2 },
    ],
    roomPolicy: "guaranteed", roomNote: "", deposit: 2000, compareAt: null, addOns: [],
    inclusions: ["Transport", "Stays", "Meals"], exclusions: ["Tips"], refund: "standard",
    facts: [{ icon: "thermostat", title: "Weather", text: "Cool" }], faqs: [], packing: { Essentials: ["ID", "Jacket", "Bottle"] },
    captainName: "Ravi K", captainRole: "Trip captain", captainBio: "Ravi has led forty treks across the Western Ghats since 2018.",
    languages: ["English"], certifications: [], seed: 3,
  };
  await call(trips.saveTripDraft, { requestId: rid(), orgId, hostTripId, draft }, phoneCtx(owner));
  await call(trips.submitTrip, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId, hostTripId }, phoneCtx(owner));
  const v = (await db().doc(`tripDrafts/${hostTripId}`).get()).data()!.version;
  const r = await call<{ tripId: string }>(trips.reviewTrip, { requestId: rid(), hostTripId, expectedVersion: v, outcome: "approved", note: "" }, adminCtx("ops-1"));
  return { tripId: r.tripId, d1: `${hostTripId}-d1` };
}

const tripInput = (w: { tripId: string; d1: string }, travellers = 2, roomId = "quad") => ({
  requestId: rid(), tripId: w.tripId, departureId: w.d1, roomId, travellers, addOnIds: [], pickupId: "p1", dropId: "d1", payInFull: false,
  people: Array.from({ length: travellers }, (_, i) => ({ name: `Traveller ${i + 1}`, age: 27, gender: "woman", diet: "veg" })),
  emergencyName: "Parent", emergencyPhone: "+91 98450 00000",
});
const tripBooking = async (id: string) => (await db().doc(`tripBookings/${id}`).get()).data()!;
const departure = async (id: string) => (await db().doc(`tripDepartures/${id}`).get()).data()!;

describe("trips — losing the race for seats and beds", () => {
  test("two travellers race for the last seats: one wins, the other gets seatsLeft=0 and the waitlist", async () => {
    const w = await liveTrip(2);
    const [a, b] = [uniq("cust"), uniq("cust")];
    const results = await Promise.allSettled([
      call(trips.reserveTripSeats, tripInput(w, 2), phoneCtx(a)),
      call(trips.reserveTripSeats, tripInput(w, 2), phoneCtx(b)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const d = ((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason as { details: Record<string, unknown> }).details;
    expect(d).toMatchObject({ code: "SOLD_OUT", message: "Someone just took the last seat on this date.", facts: { seatsLeft: 0, requested: 2 } });
    expect((await departure(w.d1)).seatsTaken).toBe(2);
  });

  test("3 travellers with 1 seat left / a room type that filled up: told exactly what still fits", async () => {
    const w = await liveTrip(4);
    await call(trips.reserveTripSeats, tripInput(w, 2, "double"), phoneCtx(uniq("cust")));
    await call(trips.reserveTripSeats, tripInput(w, 1), phoneCtx(uniq("cust")));
    expect(await refusal(trips.reserveTripSeats, tripInput(w, 3), phoneCtx(uniq("cust")))).toMatchObject({
      code: "SOLD_OUT", facts: { seatsLeft: 1, requested: 3 },
    });
    expect(await refusal(trips.reserveTripSeats, tripInput(w, 1, "double"), phoneCtx(uniq("cust")))).toMatchObject({
      code: "SOLD_OUT", message: "Double sharing just filled up on this date.", facts: { seatsLeft: 1, bedsLeft: 0, requested: 1, roomId: "double" },
    });
  });

  test("capacityProblem: plain words + facts for every shortfall", () => {
    const room = { id: "double", label: "Double sharing", beds: 2 };
    expect(capacityProblem({ seatsTotal: 4, seatsTaken: 0, roomTaken: {} }, room, 2)).toBeNull();
    expect(capacityProblem({ seatsTotal: 4, seatsTaken: 3, roomTaken: {} }, room, 2)!.facts).toEqual({ seatsLeft: 1, requested: 2 });
    expect(capacityProblem({ seatsTotal: 4, seatsTaken: 1, roomTaken: { double: 1 } }, room, 2)!.operatorMessage)
      .toBe("Only 1 double sharing bed is left, so we couldn't hold 2.");
  });

  test("a date that looks full because of a lapsed (unswept) hold books at once — the hold is reclaimed exactly once", async () => {
    const w = await liveTrip(2);
    const slow = uniq("cust");
    const r = await call<{ bookingId: string }>(trips.reserveTripSeats, tripInput(w, 2), phoneCtx(slow));
    await db().doc(`tripBookings/${r.bookingId}`).update({ holdExpiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    // No sweeper run: the next traveller still gets the seats.
    const next = await call<{ bookingId: string; status: string }>(trips.reserveTripSeats, tripInput(w, 2), phoneCtx(uniq("cust")));
    expect(next.status).toBe("held");
    expect((await tripBooking(r.bookingId)).status).toBe("expired");
    expect(await departure(w.d1)).toMatchObject({ seatsTaken: 2, roomTaken: { quad: 2 } });
    // The slow traveller's late payment finds no room → refunded in full, never oversold.
    const o = await refusal(trips.createTripPaymentOrder, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(slow));
    expect(o).toMatchObject({ code: "PRECONDITION", facts: { reason: "hold-expired" } });
  });

  test("a late trip payment after the traveller already re-booked the same date is refunded, not a second booking", async () => {
    const w = await liveTrip(6);
    const uid = uniq("cust");
    const r1 = await call<{ bookingId: string }>(trips.reserveTripSeats, tripInput(w, 2), phoneCtx(uid));
    const o1 = await call<{ paymentId: string; providerOrderId: string; amountMinor: number }>(trips.createTripPaymentOrder, { requestId: rid(), bookingId: r1.bookingId }, phoneCtx(uid));
    await db().doc(`tripBookings/${r1.bookingId}`).update({ holdExpiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    // Re-books (reclaim isn't needed: there's room) and pays.
    const r2 = await call<{ bookingId: string }>(trips.reserveTripSeats, tripInput(w, 2), phoneCtx(uid));
    await releaseExpiredTripHolds();
    const o2 = await call<{ paymentId: string; providerOrderId: string }>(trips.createTripPaymentOrder, { requestId: rid(), bookingId: r2.bookingId }, phoneCtx(uid));
    const p2 = fakePayId();
    await call(trips.confirmTripPayment, { paymentId: o2.paymentId, providerPaymentId: p2, providerSignature: paymentSignature(o2.providerOrderId, p2) }, phoneCtx(uid));

    // The first checkout's money arrives late.
    const res = await deliverWebhook(capturedEvent({ providerPaymentId: fakePayId(), orderId: o1.providerOrderId, paymentId: o1.paymentId, amount: o1.amountMinor }));
    expect((res.body as { outcome: string }).outcome).toBe("trip:orphaned");
    expect((await tripBooking(r1.bookingId)).status).toBe("expired");
    expect((await tripBooking(r2.bookingId)).status).toBe("confirmed");
    expect((await departure(w.d1)).seatsTaken).toBe(2);
    expect((await db().doc(`tripRefunds/orph_${o1.paymentId}`).get()).exists).toBe(true);
  });

  test("released trip hold (payment cancelled in the app) then the payment lands: honoured when seats remain", async () => {
    const w = await liveTrip(4);
    const uid = uniq("cust");
    const r = await call<{ bookingId: string }>(trips.reserveTripSeats, tripInput(w, 2), phoneCtx(uid));
    const o = await call<{ paymentId: string; providerOrderId: string; amountMinor: number }>(trips.createTripPaymentOrder, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(uid));
    await call(trips.cancelTripBooking, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(uid));
    expect((await departure(w.d1)).seatsTaken).toBe(0);
    expect(await refusal(trips.createTripPaymentOrder, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(uid))).toMatchObject({
      facts: { reason: "released" },
    });

    const res = await deliverWebhook(capturedEvent({ providerPaymentId: fakePayId(), orderId: o.providerOrderId, paymentId: o.paymentId, amount: o.amountMinor }));
    expect((res.body as { outcome: string }).outcome).toBe("trip:readmitted");
    expect((await tripBooking(r.bookingId)).status).toBe("confirmed");
    expect((await departure(w.d1)).seatsTaken).toBe(2);
  });
});
