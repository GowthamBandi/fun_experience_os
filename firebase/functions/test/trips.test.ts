/**
 * Trips end to end against the Firestore emulator: organizer draft → submit →
 * PULSE review → live trip → customer reserve → Razorpay (emulator provider,
 * real signatures) → confirm → balance → manifest → cancel / refund, plus the
 * booking rules (seats, room-type beds, cut-off, age, women-only, deposit vs
 * full) and the organizer's live operations.
 */
import {
  call, callErr, callCode, phoneCtx, adminCtx, uniq, rid, db, Timestamp, fakePayId, deliverWebhook, capturedEvent,
  commerce, expectBalanced, sum, type Entry,
} from "./commerce-helpers";
import { commissionFor } from "../src/commerce/ledger";
import { paymentSignature } from "../src/commerce/provider";
import * as trips from "../src/trips";
import { releaseExpiredTripHolds, settleTripCapture } from "../src/trips/bookings";
import { notifyTripWaitlist, seatOpened } from "../src/trips/waitlist";
import { quoteTrip, refundPercent } from "../src/trips/model";
import { balanceStage, sweepTripBalances } from "../src/trips/balance";

const DAY = 86_400_000;
/** Commission on the trips' org (10%), from its approved commercial agreement. */
const BPS = 1_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function seedOrg(orgId: string, ownerUid: string, staff: Record<string, string[]> = {}, commissionBps: number | null = BPS) {
  await db().doc(`organizers/${orgId}`).set({ status: "active", displayName: `Trail ${orgId.slice(-4)}`, version: 1 });
  if (commissionBps !== null) {
    await db().doc(`commercialAgreements/ca-${orgId}`).set({
      orgId, status: "approved", commissionBps, payoutCadence: "weekly", proposedBy: "admin-a", decidedBy: "admin-b", updatedAt: Timestamp.now(),
    });
  }
  await db().doc(`memberships/${orgId}__${ownerUid}`).set({
    orgId, uid: ownerUid, role: "owner", status: "active", permissions: [], eventScope: { all: true, eventIds: [] }, version: 1,
  });
  for (const [uid, permissions] of Object.entries(staff)) {
    await db().doc(`memberships/${orgId}__${uid}`).set({
      orgId, uid, role: "staff", status: "active", permissions, eventScope: { all: true, eventIds: [] }, version: 1,
    });
  }
}

/** A complete draft, as PULSE's TripDraft.toJson would send it. */
function draft(hostTripId: string, over: Record<string, unknown> = {}) {
  const day = (title: string, stay: string) => ({
    title, summary: "", activities: [{ time: "9:00 AM", title: "Walk", detail: "", icon: "hiking" }],
    meals: [], mealPlan: [{ meal: "dinner", time: "8:00 PM", place: "Camp", menu: "Thali", diets: ["veg"] }], stay, travel: "", overnightTransit: false,
  });
  return {
    title: "Coorg coffee trails", tagline: "Misty estates", destination: "Coorg", region: "south", style: "weekend",
    startCity: "Bengaluru", route: ["Bengaluru", "Madikeri", "Bengaluru"], highlights: ["Estates", "Falls", "Bonfire"],
    days: [day("Departure", "Homestay"), day("Estates", "Homestay"), day("Return", "")],
    stays: [{ name: "Misty Woods", type: "homestay", location: "Madikeri", nights: 2, note: "" }],
    vehicles: [{ type: "tempoTraveller", leg: "Return", model: "Urbania", seats: 17, ac: true, features: [] }],
    transport: "", diets: ["veg", "nonVeg"], foodNote: "",
    pickups: [{ id: "p1", name: "Majestic", landmark: "Gate 2", time: "9:30 PM" }, { id: "p2", name: "Silk Board", landmark: "Bus stop", time: "10:00 PM" }],
    drops: [{ id: "d1", name: "Majestic", landmark: "Gate 2", time: "6:00 AM" }],
    reportingNote: "", returnNote: "", goodies: [], rules: ["No alcohol in the vehicle"], luggageNote: "", bookingCutoffDays: 2,
    bestSeason: "", altitude: "", difficulty: "light", gender: "open", ageMin: 18, ageMax: null, groupMin: 4, groupMax: 10,
    departures: [
      { id: `${hostTripId}-d1`, start: iso(40 * DAY), end: iso(42 * DAY), seatsTotal: 10, priceDelta: 0, longWeekend: null },
      { id: `${hostTripId}-d2`, start: iso(10 * DAY), end: iso(12 * DAY), seatsTotal: 6, priceDelta: 500, longWeekend: null },
    ],
    departureHour: 21, departureMinute: 0,
    rooms: [
      { id: "quad", label: "Quad sharing", occupancy: 4, price: 8000, beds: 8 },
      { id: "double", label: "Double sharing", occupancy: 2, price: 10000, beds: 2 },
    ],
    roomPolicy: "guaranteed", roomNote: "", deposit: 2000, compareAt: null,
    addOns: [{ id: "raft", title: "Rafting", description: "Barapole", price: 1500, icon: "kayaking" }],
    inclusions: ["Transport", "Stays", "Meals"], exclusions: ["Tips"], refund: "standard",
    facts: [{ icon: "thermostat", title: "Weather", text: "Cool" }], faqs: [],
    packing: { Essentials: ["ID", "Jacket", "Bottle"] },
    captainName: "Ravi K", captainRole: "Trip captain", captainBio: "Ravi has led forty treks across the Western Ghats since 2018.",
    languages: ["English"], certifications: [], seed: 3,
    ...over,
  };
}

const people = (n: number, over: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({ name: `Traveller ${i + 1}`, age: 27, gender: "woman", diet: "veg", ...over }));

interface World { orgId: string; owner: string; hostTripId: string; tripId: string; d1: string; d2: string }

async function liveTrip(over: Record<string, unknown> = {}, commissionBps: number | null = BPS): Promise<World> {
  const orgId = uniq("org-trip");
  const owner = uniq("owner");
  await seedOrg(orgId, owner, { [`${owner}-lead`]: ["events.operate"] }, commissionBps);
  const hostTripId = uniq("ht");
  await call(trips.saveTripDraft, { requestId: rid(), orgId, hostTripId, draft: draft(hostTripId, over) }, phoneCtx(owner));
  await call(trips.submitTrip, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId, hostTripId }, phoneCtx(owner));
  const v = (await db().doc(`tripDrafts/${hostTripId}`).get()).data()!.version;
  const r = await call<{ tripId: string; status: string }>(trips.reviewTrip, { requestId: rid(), hostTripId, expectedVersion: v, outcome: "approved", note: "" }, adminCtx("ops-1"));
  expect(r.status).toBe("live");
  return { orgId, owner, hostTripId, tripId: r.tripId, d1: `${hostTripId}-d1`, d2: `${hostTripId}-d2` };
}

function reserveInput(w: World, over: Record<string, unknown> = {}) {
  const n = (over.travellers as number) ?? 2;
  return {
    requestId: rid(), tripId: w.tripId, departureId: w.d1, roomId: "quad", travellers: n, addOnIds: [], pickupId: "p1", dropId: "d1",
    payInFull: false, people: people(n), emergencyName: "Parent", emergencyPhone: "+91 98450 00000", ...over,
  };
}

/** Pays whatever the order says, with a valid checkout signature. */
async function pay(uid: string, bookingId: string, fn: unknown = trips.createTripPaymentOrder) {
  const o = await call<{ paymentId: string; providerOrderId: string; amountMinor: number }>(fn, { requestId: rid(), bookingId }, phoneCtx(uid));
  const payId = fakePayId();
  const out = await call<{ status: string; outcome: string }>(
    trips.confirmTripPayment,
    { paymentId: o.paymentId, providerPaymentId: payId, providerSignature: paymentSignature(o.providerOrderId, payId) },
    phoneCtx(uid)
  );
  return { order: o, out };
}

async function book(w: World, uid: string, over: Record<string, unknown> = {}) {
  const r = await call<{ bookingId: string; amountDue: number }>(trips.reserveTripSeats, reserveInput(w, over), phoneCtx(uid));
  await pay(uid, r.bookingId);
  return r;
}

const dep = async (id: string) => (await db().doc(`tripDepartures/${id}`).get()).data()!;
const booking = async (id: string) => (await db().doc(`tripBookings/${id}`).get()).data()!;

describe("organizer drafts and review", () => {
  test("save → submit → approve publishes the trip and its departures", async () => {
    const w = await liveTrip();
    const t = (await db().doc(`trips/${w.tripId}`).get()).data()!;
    expect(t).toMatchObject({ orgId: w.orgId, status: "live", hostTripId: w.hostTripId, title: "Coorg coffee trails", priceFrom: 8000 });
    expect(t.content.rooms).toHaveLength(2);
    expect(t.content.departures).toBeUndefined();
    expect(await dep(w.d1)).toMatchObject({ tripId: w.tripId, seatsTotal: 10, seatsTaken: 0, cancelled: false });
    const h = (await db().doc(`tripDrafts/${w.hostTripId}`).get()).data()!;
    expect(h).toMatchObject({ status: "live", tripId: w.tripId, reviewerNote: null });
    const note = await db().collection("userNotifications").where("recipientUid", "==", w.owner).get();
    expect(note.docs.map((d) => d.data().kind)).toContain("trip-decision");
  });

  test("an incomplete draft can be saved but not submitted", async () => {
    const orgId = uniq("org-trip");
    const owner = uniq("owner");
    await seedOrg(orgId, owner);
    const hostTripId = uniq("ht");
    await call(trips.saveTripDraft, { requestId: rid(), orgId, hostTripId, draft: { title: "Half" } }, phoneCtx(owner));
    const e = await callErr(trips.submitTrip, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId, hostTripId }, phoneCtx(owner));
    expect(e.code).toBe("PRECONDITION");
    expect(e.message).toMatch(/Basics/);
  });

  test("only the organizer team can save; strangers and customers are refused", async () => {
    const orgId = uniq("org-trip");
    const owner = uniq("owner");
    await seedOrg(orgId, owner, { viewer: ["experiences.view"] });
    const hostTripId = uniq("ht");
    expect(await callCode(trips.saveTripDraft, { requestId: rid(), orgId, hostTripId, draft: draft(hostTripId) }, phoneCtx("viewer"))).toBe("NOT_PERMITTED");
    expect(await callCode(trips.saveTripDraft, { requestId: rid(), orgId, hostTripId, draft: draft(hostTripId) }, phoneCtx(uniq("cust")))).toBe("NOT_PERMITTED");
  });

  test("changes requested needs a note; a stale version conflicts; the organizer sees the note", async () => {
    const orgId = uniq("org-trip");
    const owner = uniq("owner");
    await seedOrg(orgId, owner);
    const hostTripId = uniq("ht");
    await call(trips.saveTripDraft, { requestId: rid(), orgId, hostTripId, draft: draft(hostTripId) }, phoneCtx(owner));
    await call(trips.submitTrip, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId, hostTripId }, phoneCtx(owner));
    const v = (await db().doc(`tripDrafts/${hostTripId}`).get()).data()!.version;
    expect(await callCode(trips.reviewTrip, { requestId: rid(), hostTripId, expectedVersion: v, outcome: "changes-requested", note: "no" }, adminCtx("ops-1"))).toBe("INVALID_INPUT");
    expect(await callCode(trips.reviewTrip, { requestId: rid(), hostTripId, expectedVersion: v - 1, outcome: "rejected", note: "Permits are missing here." }, adminCtx("ops-1"))).toBe("CONFLICT");
    expect(await callCode(trips.reviewTrip, { requestId: rid(), hostTripId, expectedVersion: v, outcome: "approved", note: "" }, phoneCtx(owner))).toBe("NOT_PERMITTED");
    await call(trips.reviewTrip, { requestId: rid(), hostTripId, expectedVersion: v, outcome: "changes-requested", note: "Add the exact pickup landmark." }, adminCtx("ops-1"));
    expect((await db().doc(`tripDrafts/${hostTripId}`).get()).data()).toMatchObject({ status: "changes-requested", reviewerNote: "Add the exact pickup landmark." });
    // Editable again, and resubmittable.
    await call(trips.saveTripDraft, { requestId: rid(), orgId, hostTripId, draft: draft(hostTripId, { tagline: "Fixed" }) }, phoneCtx(owner));
    expect((await call(trips.submitTrip, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId, hostTripId }, phoneCtx(owner))).status).toBe("in-review");
  });

  test("a live trip's revision keeps seat counters and the old version on sale until approved", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    await book(w, cust);
    await call(trips.saveTripDraft, { requestId: rid(), orgId: w.orgId, hostTripId: w.hostTripId, draft: draft(w.hostTripId, { title: "Coorg coffee trails v2" }), forLive: true }, phoneCtx(w.owner));
    expect((await db().doc(`trips/${w.tripId}`).get()).data()!.title).toBe("Coorg coffee trails");
    await call(trips.submitTrip, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId: w.orgId, hostTripId: w.hostTripId }, phoneCtx(w.owner));
    const v = (await db().doc(`tripDrafts/${w.hostTripId}`).get()).data()!.version;
    await call(trips.reviewTrip, { requestId: rid(), hostTripId: w.hostTripId, expectedVersion: v, outcome: "approved", note: "" }, adminCtx("ops-1"));
    expect((await db().doc(`trips/${w.tripId}`).get()).data()!.title).toBe("Coorg coffee trails v2");
    expect((await dep(w.d1)).seatsTaken).toBe(2);
  });
});

describe("service cities", () => {
  afterEach(async () => {
    await db().doc("appConfig/cities").delete();
  });

  test("a trip must start in a city PULSE serves (no list yet → any city); live revisions too", async () => {
    const orgId = uniq("org-trip");
    const owner = uniq("owner");
    await seedOrg(orgId, owner);
    const submit = (hostTripId: string) =>
      callErr(trips.submitTrip, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId, hostTripId }, phoneCtx(owner));
    const save = (hostTripId: string, over: Record<string, unknown> = {}, forLive = false) =>
      call(trips.saveTripDraft, { requestId: rid(), orgId, hostTripId, draft: draft(hostTripId, over), forLive }, phoneCtx(owner));

    await db().doc("appConfig/cities").delete();
    const free = uniq("ht");
    await save(free, { startCity: "Pune" });
    expect((await call(trips.submitTrip, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId, hostTripId: free }, phoneCtx(owner))).status).toBe("in-review");

    await db().doc("appConfig/cities").set({
      cities: [
        { key: "bengaluru", name: "Bengaluru", state: "Karnataka", active: true },
        { key: "hyderabad", name: "Hyderabad", state: "Telangana", active: false },
      ],
    });
    const pune = uniq("ht");
    await save(pune, { startCity: "Pune" }); // drafts always save
    const e = await submit(pune);
    expect(e).toMatchObject({ code: "PRECONDITION", message: "PULSE isn't available in Pune yet. Choose one of the cities PULSE serves." });
    const hyd = uniq("ht");
    await save(hyd, { startCity: "Hyderabad" });
    expect((await submit(hyd)).message).toMatch(/isn't available in Hyderabad yet/);
    const blr = uniq("ht");
    await save(blr, { startCity: "Bangalore" });
    expect((await call(trips.submitTrip, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId, hostTripId: blr }, phoneCtx(owner))).status).toBe("in-review");
  });

  test("a live trip's revision can't move its start to an unserved city; the live version stays on sale", async () => {
    const w = await liveTrip();
    await db().doc("appConfig/cities").set({ cities: [{ key: "bengaluru", name: "Bengaluru", state: "Karnataka", active: true }] });
    await call(trips.saveTripDraft, { requestId: rid(), orgId: w.orgId, hostTripId: w.hostTripId, draft: draft(w.hostTripId, { startCity: "Chennai" }), forLive: true }, phoneCtx(w.owner));
    const e = await callErr(trips.submitTrip, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId: w.orgId, hostTripId: w.hostTripId }, phoneCtx(w.owner));
    expect(e.message).toMatch(/isn't available in Chennai yet/);
    expect((await db().doc(`trips/${w.tripId}`).get()).data()!.status).toBe("live");
  });
});

describe("booking", () => {
  test("reserve → pay deposit → confirmed; balance → paid in full", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    const r = await call<{ bookingId: string; amountDue: number; status: string }>(trips.reserveTripSeats, reserveInput(w, { addOnIds: ["raft"] }), phoneCtx(cust));
    expect(r.status).toBe("held");
    expect(r.amountDue).toBe(4000);
    expect(await dep(w.d1)).toMatchObject({ seatsTaken: 2, roomTaken: { quad: 2 } });
    const { order, out } = await pay(cust, r.bookingId);
    expect(order.amountMinor).toBe(400_000);
    expect(out.status).toBe("confirmed");
    const b = await booking(r.bookingId);
    const q = quoteTrip({ room: { id: "quad", label: "", occupancy: 4, price: 8000, beds: 8 }, priceDelta: 0, travellers: 2, addOns: [{ id: "raft", title: "", description: "", price: 1500, icon: "" }], addOnIds: ["raft"], depositPerPerson: 2000, payInFull: false });
    expect(b).toMatchObject({ status: "confirmed", paid: 4000, quote: q, alias: expect.any(String) });
    expect((await db().doc(`tripTravellers/${w.d1}__${cust}`).get()).exists).toBe(true);

    const bal = await pay(cust, r.bookingId, trips.payTripBalance);
    expect(bal.order.amountMinor).toBe((q.total - 4000) * 100);
    expect(bal.out.outcome).toBe("balance-paid");
    expect((await booking(r.bookingId)).paid).toBe(q.total);
    expect(await callCode(trips.payTripBalance, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(cust))).toBe("PRECONDITION");
  });

  test("15 days or less before departure, the full amount is due", async () => {
    const w = await liveTrip();
    const r = await call<{ amountDue: number }>(trips.reserveTripSeats, reserveInput(w, { departureId: w.d2, travellers: 1, people: people(1) }), phoneCtx(uniq("cust")));
    // (8000 + 500) + 5% GST
    expect(r.amountDue).toBe(8925);
  });

  test("seats, room-type beds, age, women-only and cut-off are enforced", async () => {
    const w = await liveTrip({ gender: "womenOnly", ageMax: 35 });
    const c = () => phoneCtx(uniq("cust"));
    expect((await callErr(trips.reserveTripSeats, reserveInput(w, { roomId: "double", travellers: 3, people: people(3) }), c())).message).toMatch(/2 double sharing beds are left/);
    expect((await callErr(trips.reserveTripSeats, reserveInput(w, { people: people(2, { age: 40 }) }), c())).code).toBe("NOT_ELIGIBLE");
    expect((await callErr(trips.reserveTripSeats, reserveInput(w, { people: [people(1)[0], { name: "Arjun", age: 25, gender: "man" }] }), c())).message).toMatch(/women only/);
    expect(await callCode(trips.reserveTripSeats, reserveInput(w, { travellers: 2, people: people(1) }), c())).toBe("INVALID_INPUT");
    expect(await callCode(trips.reserveTripSeats, reserveInput(w, { emergencyPhone: "123" }), c())).toBe("INVALID_INPUT");
    // Fill the departure: 10 seats.
    for (let i = 0; i < 5; i++) await call(trips.reserveTripSeats, reserveInput(w, i === 4 ? { roomId: "double" } : {}), c());
    expect((await callErr(trips.reserveTripSeats, reserveInput(w, { travellers: 1, people: people(1) }), c())).code).toBe("SOLD_OUT");
    // Cut-off: a departure inside the 2-day window.
    await db().doc(`tripDepartures/${w.d2}`).update({ start: Timestamp.fromMillis(Date.now() + DAY) });
    expect((await callErr(trips.reserveTripSeats, reserveInput(w, { departureId: w.d2 }), c())).message).toMatch(/closed 2 days before/);
  });

  test("expired holds release their seats; a late capture is re-admitted when there's room", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    const r = await call<{ bookingId: string }>(trips.reserveTripSeats, reserveInput(w), phoneCtx(cust));
    const o = await call<{ paymentId: string; providerOrderId: string; amountMinor: number }>(trips.createTripPaymentOrder, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(cust));
    await db().doc(`tripBookings/${r.bookingId}`).update({ holdExpiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await releaseExpiredTripHolds();
    expect((await booking(r.bookingId)).status).toBe("expired");
    expect((await dep(w.d1)).seatsTaken).toBe(0);
    // The money arrives later, by webhook.
    const res = await deliverWebhook(capturedEvent({ providerPaymentId: fakePayId(), orderId: o.providerOrderId, paymentId: o.paymentId, amount: o.amountMinor }));
    expect(res.statusCode).toBe(200);
    expect((res.body as { outcome: string }).outcome).toBe("trip:readmitted");
    expect((await booking(r.bookingId)).status).toBe("confirmed");
    expect((await dep(w.d1)).seatsTaken).toBe(2);
  });

  test("a forged checkout signature is refused", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    const r = await call<{ bookingId: string }>(trips.reserveTripSeats, reserveInput(w), phoneCtx(cust));
    const o = await call<{ paymentId: string }>(trips.createTripPaymentOrder, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(cust));
    expect(await callCode(trips.confirmTripPayment, { paymentId: o.paymentId, providerPaymentId: fakePayId(), providerSignature: "a".repeat(64) }, phoneCtx(cust))).toBe("NOT_PERMITTED");
    expect(await callCode(trips.createTripPaymentOrder, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(uniq("other")))).toBe("NOT_FOUND");
  });

  test("customer cancellation refunds by tier and frees seats", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    const r = await book(w, cust);
    const out = await call<{ refund: number; status: string }>(trips.cancelTripBooking, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(cust));
    // 40 days out on the standard policy: 90% of the ₹4,000 paid.
    expect(refundPercent("standard", 39)).toBe(90);
    expect(out).toMatchObject({ status: "cancelled", refund: 3600 });
    expect((await dep(w.d1)).seatsTaken).toBe(0);
    const refunds = await db().collection("tripRefunds").where("bookingId", "==", r.bookingId).get();
    expect(refunds.docs.map((d) => d.data().amountMinor)).toEqual([360_000]);
    expect(refunds.docs[0]!.data().status).toBe("processing");
    expect((await db().doc(`tripTravellers/${w.d1}__${cust}`).get()).exists).toBe(false);
  });
});

describe("live operations and the manifest", () => {
  test("manifest shows bookings with traveller details to the organizer team only", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    await book(w, cust);
    const m = await call<{ entries: Array<Record<string, unknown>> }>(trips.getTripManifest, { orgId: w.orgId, departureId: w.d1 }, phoneCtx(w.owner));
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0]).toMatchObject({ travellers: 2, roomId: "quad", pickupId: "p1", emergencyName: "Parent", paid: 4000 });
    expect((m.entries[0]!.people as unknown[]).length).toBe(2);
    // A co-traveller, and staff without attendees.view.
    expect(await callCode(trips.getTripManifest, { orgId: w.orgId, departureId: w.d1 }, phoneCtx(cust))).toBe("NOT_PERMITTED");
    expect(await callCode(trips.getTripManifest, { orgId: w.orgId, departureId: w.d1 }, phoneCtx(`${w.owner}-lead`))).toBe("NOT_PERMITTED");
  });

  test("seats can't go below bookings; closed sales stop bookings; updates reach travellers", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    await book(w, cust);
    const lead = phoneCtx(`${w.owner}-lead`);
    expect(await callCode(trips.setDepartureSeats, { requestId: rid(), orgId: w.orgId, departureId: w.d1, seats: 1 }, lead)).toBe("PRECONDITION");
    await call(trips.setDepartureSeats, { requestId: rid(), orgId: w.orgId, departureId: w.d1, seats: 8 }, lead);
    expect((await dep(w.d1)).seatsTotal).toBe(8);
    const draftDeps = (await db().doc(`tripDrafts/${w.hostTripId}`).get()).data()!.draft.departures;
    expect(draftDeps.find((d: { id: string }) => d.id === w.d1).seatsTotal).toBe(8);
    await call(trips.setSalesClosed, { requestId: rid(), orgId: w.orgId, departureId: w.d1, closed: true }, lead);
    expect((await callErr(trips.reserveTripSeats, reserveInput(w), phoneCtx(uniq("cust")))).message).toMatch(/closed bookings/);
    const u = await call<{ recipients: number }>(trips.postDepartureUpdate, { requestId: rid(), orgId: w.orgId, departureId: w.d1, text: "Pickup moved to Gate 3", important: true }, lead);
    expect(u.recipients).toBe(1);
    const n = await db().collection("userNotifications").where("recipientUid", "==", cust).get();
    expect(n.docs.map((d) => d.data().kind)).toContain("trip-update");
  });

  test("adding a date; cancelling a departure refunds everyone in full", async () => {
    const w = await liveTrip();
    const a = uniq("cust");
    const b = uniq("cust");
    const ra = await book(w, a);
    const rb = await book(w, b, { travellers: 1, people: people(1), payInFull: true });
    const add = await call<{ departureId: string }>(trips.addTripDeparture, {
      requestId: rid(), orgId: w.orgId, tripId: w.tripId,
      departure: { id: `${w.hostTripId}-d3`, start: iso(60 * DAY), end: iso(62 * DAY), seatsTotal: 10, priceDelta: 0 },
    }, phoneCtx(w.owner));
    expect((await dep(add.departureId)).tripId).toBe(w.tripId);
    expect(await callCode(trips.cancelDeparture, { requestId: rid(), orgId: w.orgId, departureId: w.d1, reason: "Landslide" }, phoneCtx(`${w.owner}-lead`))).toBe("NOT_PERMITTED");
    const out = await call<{ bookings: number }>(trips.cancelDeparture, { requestId: rid(), orgId: w.orgId, departureId: w.d1, reason: "Landslide on the ghat road" }, phoneCtx(w.owner));
    expect(out.bookings).toBe(2);
    expect(await booking(ra.bookingId)).toMatchObject({ status: "cancelled", refund: 4000, cancelledByOrganizer: true });
    const full = (await booking(rb.bookingId)).paid;
    expect(await booking(rb.bookingId)).toMatchObject({ status: "cancelled", refund: full });
    expect((await dep(w.d1)).cancelled).toBe(true);
    const updates = await db().collection("tripUpdates").where("departureId", "==", w.d1).get();
    expect(updates.docs[0]!.data().text).toMatch(/cancelled: Landslide/);
    expect((await callErr(trips.reserveTripSeats, reserveInput(w), phoneCtx(uniq("cust")))).message).toMatch(/cancelled that departure/);
  });
});

describe("waitlist", () => {
  /** A live trip whose first departure is sold out: 4 seats, 4 booked. */
  async function soldOut() {
    const w = await liveTrip();
    const booker = uniq("cust");
    const r = await book(w, booker, { travellers: 4, people: people(4) });
    await call(trips.setDepartureSeats, { requestId: rid(), orgId: w.orgId, departureId: w.d1, seats: 4 }, phoneCtx(w.owner));
    return { w, booker, bookingId: r.bookingId };
  }
  const entry = async (departureId: string, uid: string) => (await db().doc(`tripWaitlist/${departureId}__${uid}`).get()).data();
  const kinds = async (uid: string) =>
    (await db().collection("userNotifications").where("recipientUid", "==", uid).get()).docs.map((d) => d.data());

  test("joining is stored server-side, idempotent, and leaving removes it", async () => {
    const { w } = await soldOut();
    const cust = uniq("cust");
    const req = { requestId: rid(), departureId: w.d1 };
    expect(await call(trips.joinTripWaitlist, req, phoneCtx(cust))).toMatchObject({ waitlisted: true });
    expect(await call(trips.joinTripWaitlist, req, phoneCtx(cust))).toMatchObject({ waitlisted: true, replayed: true });
    expect(await call(trips.joinTripWaitlist, { requestId: rid(), departureId: w.d1 }, phoneCtx(cust))).toMatchObject({ waitlisted: true });
    expect(await entry(w.d1, cust)).toMatchObject({ departureId: w.d1, tripId: w.tripId, uid: cust });
    await call(trips.leaveTripWaitlist, { departureId: w.d1 }, phoneCtx(cust));
    expect(await entry(w.d1, cust)).toBeUndefined();
  });

  test("only sold-out, bookable dates; not when already booked on it", async () => {
    const { w, booker } = await soldOut();
    expect((await callErr(trips.joinTripWaitlist, { requestId: rid(), departureId: w.d2 }, phoneCtx(uniq("cust")))).message).toMatch(/Seats are open/);
    expect((await callErr(trips.joinTripWaitlist, { requestId: rid(), departureId: w.d1 }, phoneCtx(booker))).message).toMatch(/already booked/);
    expect(await callCode(trips.joinTripWaitlist, { requestId: rid(), departureId: "nope-d9" }, phoneCtx(uniq("cust")))).toBe("NOT_FOUND");
    expect(await callCode(trips.joinTripWaitlist, { requestId: rid() }, phoneCtx(uniq("cust")))).toBe("INVALID_INPUT");
  });

  test("a freed seat alerts everyone waiting; they stay on until they book, and hear about the next seat too", async () => {
    const { w, booker, bookingId } = await soldOut();
    const a = uniq("cust");
    const b = uniq("cust");
    await call(trips.joinTripWaitlist, { requestId: rid(), departureId: w.d1 }, phoneCtx(a));
    await call(trips.joinTripWaitlist, { requestId: rid(), departureId: w.d1 }, phoneCtx(b));
    // Still sold out: nothing happens.
    expect(await notifyTripWaitlist(w.d1)).toEqual({ notified: 0, cleared: 0 });
    await call(trips.cancelTripBooking, { requestId: rid(), bookingId }, phoneCtx(booker));
    // The emulator's real trigger may already have sent the first alert: either
    // way each person has exactly one, and both are still waiting.
    await notifyTripWaitlist(w.d1);
    const seatAlerts = async (uid: string) => (await kinds(uid)).filter((x) => x.kind === "trip-waitlist");
    const n = (await seatAlerts(a))[0];
    expect(n).toMatchObject({ title: "A seat opened on Coorg coffee trails", link: { type: "trip-departure", id: w.d1 } });
    expect(n.body).toMatch(/4 seats are free again/);
    expect(n.body).toMatch(/stay on the waitlist until you get in/);
    expect(await seatAlerts(a)).toHaveLength(1);
    expect(await seatAlerts(b)).toHaveLength(1);
    expect(await entry(w.d1, a)).toMatchObject({ alerts: 1 });
    expect(await entry(w.d1, b)).toMatchObject({ alerts: 1 });
    // A re-run inside the cooldown tells nobody twice.
    expect(await notifyTripWaitlist(w.d1)).toEqual({ notified: 0, cleared: 0 });

    // b got a seat; a lost the race. The next opening (after the cooldown)
    // alerts a again and drops b, who no longer needs the list.
    await db().doc(`tripTravellers/${w.d1}__${b}`).set({ departureId: w.d1, uid: b, bookings: 1 });
    const later = Date.now() + 11 * 60_000;
    expect(await notifyTripWaitlist(w.d1, later)).toEqual({ notified: 1, cleared: 1 });
    expect(await seatAlerts(a)).toHaveLength(2);
    expect(await entry(w.d1, a)).toMatchObject({ alerts: 2 });
    expect(await entry(w.d1, b)).toBeUndefined();
    // Leaving stops the alerts.
    await call(trips.leaveTripWaitlist, { departureId: w.d1 }, phoneCtx(a));
    expect(await notifyTripWaitlist(w.d1, later + 11 * 60_000)).toEqual({ notified: 0, cleared: 0 });
    expect(await seatAlerts(a)).toHaveLength(2);
  });

  test("booking takes them off the date's waitlist at once, not at the next opening", async () => {
    const { w, booker, bookingId } = await soldOut();
    const a = uniq("cust");
    await call(trips.joinTripWaitlist, { requestId: rid(), departureId: w.d1 }, phoneCtx(a));
    expect(await entry(w.d1, a)).toBeDefined();
    await call(trips.cancelTripBooking, { requestId: rid(), bookingId }, phoneCtx(booker));
    await call(trips.reserveTripSeats, reserveInput(w, { travellers: 1, people: people(1) }), phoneCtx(a));
    expect(await entry(w.d1, a)).toBeUndefined();
  });

  test("a cancelled departure clears its waitlist without a seat alert", async () => {
    const { w } = await soldOut();
    const a = uniq("cust");
    await call(trips.joinTripWaitlist, { requestId: rid(), departureId: w.d1 }, phoneCtx(a));
    await call(trips.cancelDeparture, { requestId: rid(), orgId: w.orgId, departureId: w.d1, reason: "Landslide on the ghat road" }, phoneCtx(w.owner));
    expect(await notifyTripWaitlist(w.d1)).toEqual({ notified: 0, cleared: 1 });
    expect((await kinds(a)).map((x) => x.kind)).not.toContain("trip-waitlist");
    expect((await callErr(trips.joinTripWaitlist, { requestId: rid(), departureId: w.d1 }, phoneCtx(uniq("cust")))).message).toMatch(/cancelled/);
  });

  test("the departure trigger fires only when a seat opens or the date is cancelled", async () => {
    const closed = { seatsTotal: 4, seatsTaken: 4, cancelled: false, salesClosed: false };
    expect(seatOpened(closed, { ...closed, seatsTaken: 3 })).toBe(true);
    expect(seatOpened(closed, { ...closed, seatsTotal: 6 })).toBe(true);
    expect(seatOpened({ ...closed, seatsTaken: 1, salesClosed: true }, { ...closed, seatsTaken: 1 })).toBe(true);
    expect(seatOpened({ ...closed, seatsTaken: 3 }, { ...closed, seatsTaken: 2 })).toBe(false);
    expect(seatOpened(closed, { ...closed, seatsTaken: 3, cancelled: true })).toBe(false);

    const { w, booker, bookingId } = await soldOut();
    const a = uniq("cust");
    await call(trips.joinTripWaitlist, { requestId: rid(), departureId: w.d1 }, phoneCtx(a));
    const before = await dep(w.d1);
    const run = (b: unknown, x: unknown) =>
      (trips.onTripDepartureChanged as unknown as { run: (c: unknown, ctx: unknown) => Promise<void> }).run(
        { before: { data: () => b }, after: { data: () => x } },
        { params: { departureId: w.d1 }, timestamp: new Date().toISOString() }
      );
    // No transition: ignored. Checked before the cancellation, because the
    // functions emulator also runs the real trigger on that write and may
    // clear the entry first.
    await run(before, before);
    expect(await entry(w.d1, a)).toBeDefined();
    await call(trips.cancelTripBooking, { requestId: rid(), bookingId }, phoneCtx(booker));
    const after = await dep(w.d1);
    // Idempotent whether or not the emulator's trigger already ran: one
    // alert, and a stays on the list until they book.
    await run(before, after);
    expect(await entry(w.d1, a)).toMatchObject({ alerts: 1 });
    expect((await kinds(a)).filter((x) => x.kind === "trip-waitlist")).toHaveLength(1);
  });
});

describe("ledger and settlement", () => {
  const ledger = async (field: string, value: string) =>
    (await db().collection("ledgerEntries").where(field, "==", value).get()).docs.map((d) => d.data() as Entry & { tripId: string; departureId: string; eventId: string | null });

  test("no approved commercial agreement → the trip can't take payments", async () => {
    const w = await liveTrip({}, null);
    const e = await callErr(trips.reserveTripSeats, reserveInput(w), phoneCtx(uniq("cust")));
    expect(e.code).toBe("SESSION_NOT_BOOKABLE");
    expect((await dep(w.d1)).seatsTaken).toBe(0);
  });

  test("captures and refunds post balanced entries at the commission snapshotted at reservation", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    const r = await call<{ bookingId: string }>(trips.reserveTripSeats, reserveInput(w), phoneCtx(cust));
    expect((await booking(r.bookingId)).commissionBps).toBe(BPS);
    // A later agreement never rewrites a booking's rate.
    await db().doc(`commercialAgreements/ca-${w.orgId}`).update({ commissionBps: 2_500 });
    const dep1 = await pay(cust, r.bookingId);
    const bal = await pay(cust, r.bookingId, trips.payTripBalance);
    const p1 = (await db().doc(`tripPayments/${dep1.order.paymentId}`).get()).data()!;
    expect(p1).toMatchObject({ commissionBps: BPS, commissionMinor: commissionFor(dep1.order.amountMinor, BPS) });

    let entries = await ledger("bookingId", r.bookingId);
    expect(expectBalanced(entries)).toBe(2);
    for (const e of entries) expect(e).toMatchObject({ orgId: w.orgId, tripId: w.tripId, departureId: w.d1, eventId: null, kind: "capture", settlementId: null });
    const paidMinor = dep1.order.amountMinor + bal.order.amountMinor;
    const commission = commissionFor(dep1.order.amountMinor, BPS) + commissionFor(bal.order.amountMinor, BPS);
    expect(sum(entries, "customer_payments", "debit")).toBe(paidMinor);
    expect(sum(entries, "platform_commission", "credit")).toBe(commission);
    expect(sum(entries, "organizer_payable", "credit")).toBe(paidMinor - commission);

    // Cancel 40 days out: 90% back, allocated newest payment first.
    const out = await call<{ refund: number }>(trips.cancelTripBooking, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(cust));
    entries = await ledger("bookingId", r.bookingId);
    expectBalanced(entries);
    const refunds = entries.filter((e) => e.kind === "refund");
    expect(sum(refunds, "customer_refunds", "credit")).toBe(out.refund * 100);
    const reversed = sum(refunds, "platform_commission", "debit");
    expect(reversed).toBeGreaterThan(0);
    expect(reversed).toBeLessThan(commission);
    expect(sum(refunds, "organizer_payable", "debit")).toBe(out.refund * 100 - reversed);
    const docs = (await db().collection("tripRefunds").where("bookingId", "==", r.bookingId).get()).docs.map((d) => d.data());
    expect(docs.every((d) => d.ledgerPosted === true)).toBe(true);
  });

  test("a duplicate capture is held for an admin (never sent automatically) and doesn't touch the ledger", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    const r = await call<{ bookingId: string }>(trips.reserveTripSeats, reserveInput(w), phoneCtx(cust));
    const { order } = await pay(cust, r.bookingId);
    const secondPay = fakePayId();
    const res = await deliverWebhook(capturedEvent({ providerPaymentId: secondPay, orderId: order.providerOrderId, paymentId: order.paymentId, amount: order.amountMinor }));
    expect(res.statusCode).toBe(200);
    const entries = await ledger("bookingId", r.bookingId);
    expect(expectBalanced(entries)).toBe(1);
    const dup = (await db().collection("tripRefunds").where("bookingId", "==", r.bookingId).get()).docs.map((d) => d.data());
    expect(dup).toEqual([expect.objectContaining({ reason: "duplicate-capture", ledgerPosted: false, status: "under-review", providerRefundId: null })]);
    expect((await db().doc(`riskAlerts/dup-capture_${secondPay}`).get()).data()).toMatchObject({ severity: "high" });
  });

  describe("payment lookup and order binding", () => {
    const tripCapture = (payId: string, orderId: string, amount: number, notes: Record<string, unknown>) => ({
      entity: "event", event: "payment.captured",
      payload: { payment: { entity: { id: payId, entity: "payment", amount, currency: "INR", status: "captured", order_id: orderId, notes } } },
    });

    test("notes naming another, already-paid trip payment don't decide the settlement", async () => {
      const cust = uniq("cust");
      const first = await liveTrip();
      const r1 = await call<{ bookingId: string }>(trips.reserveTripSeats, reserveInput(first), phoneCtx(cust));
      const { order: paid } = await pay(cust, r1.bookingId);
      const second = await liveTrip();
      const r2 = await call<{ bookingId: string }>(trips.reserveTripSeats, reserveInput(second), phoneCtx(cust));
      const o2 = await call<{ paymentId: string; providerOrderId: string; amountMinor: number }>(trips.createTripPaymentOrder, { requestId: rid(), bookingId: r2.bookingId }, phoneCtx(cust));
      const payId = fakePayId();
      const res = await deliverWebhook(tripCapture(payId, o2.providerOrderId, o2.amountMinor, { tripPaymentId: paid.paymentId }));
      expect(res.body).toMatchObject({ outcome: "trip:confirmed" });
      expect((await db().doc(`tripRefunds/dup_${payId}`).get()).exists).toBe(false);
      expect((await db().doc(`tripPayments/${o2.paymentId}`).get()).data()).toMatchObject({ status: "captured", providerPaymentId: payId });
    });

    test("a capture for a different order is refused before any branch, even on a paid trip payment", async () => {
      const w = await liveTrip();
      const cust = uniq("cust");
      const r = await call<{ bookingId: string }>(trips.reserveTripSeats, reserveInput(w), phoneCtx(cust));
      const { order } = await pay(cust, r.bookingId);
      for (const providerOrderId of ["order_emu_someone_else", null]) {
        const out = await settleTripCapture({
          paymentId: order.paymentId, providerOrderId, providerPaymentId: fakePayId(), amountMinor: order.amountMinor, currency: "INR", source: "webhook",
        });
        expect(out.outcome).toBe("order-mismatch");
      }
      expect((await db().collection("tripRefunds").where("bookingId", "==", r.bookingId).get()).size).toBe(0);
    });

    test("a trip payment whose order isn't recorded yet can't be settled (race variant)", async () => {
      const w = await liveTrip();
      const cust = uniq("cust");
      const r = await call<{ bookingId: string }>(trips.reserveTripSeats, reserveInput(w), phoneCtx(cust));
      const o = await call<{ paymentId: string; amountMinor: number }>(trips.createTripPaymentOrder, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(cust));
      await db().doc(`tripPayments/${o.paymentId}`).update({ providerOrderId: null, status: "creating" });
      const out = await settleTripCapture({
        paymentId: o.paymentId, providerOrderId: "order_emu_other", providerPaymentId: fakePayId(), amountMinor: o.amountMinor, currency: "INR", source: "webhook",
      });
      expect(out.outcome).toBe("order-mismatch");
      expect((await booking(r.bookingId)).status).toBe("held");
    });

    test("one Razorpay payment settles one trip payment only (and never an event payment too)", async () => {
      const cust = uniq("cust");
      const first = await liveTrip();
      const r1 = await call<{ bookingId: string }>(trips.reserveTripSeats, reserveInput(first), phoneCtx(cust));
      const o1 = await call<{ paymentId: string; providerOrderId: string }>(trips.createTripPaymentOrder, { requestId: rid(), bookingId: r1.bookingId }, phoneCtx(cust));
      const payId = fakePayId();
      await call(trips.confirmTripPayment, { paymentId: o1.paymentId, providerPaymentId: payId, providerSignature: paymentSignature(o1.providerOrderId, payId) }, phoneCtx(cust));
      expect((await db().doc(`providerPayments/${payId}`).get()).data()).toMatchObject({ kind: "trip", paymentId: o1.paymentId });
      const second = await liveTrip();
      const r2 = await call<{ bookingId: string }>(trips.reserveTripSeats, reserveInput(second), phoneCtx(cust));
      const o2 = await call<{ paymentId: string; providerOrderId: string; amountMinor: number }>(trips.createTripPaymentOrder, { requestId: rid(), bookingId: r2.bookingId }, phoneCtx(cust));
      const out = await settleTripCapture({
        paymentId: o2.paymentId, providerOrderId: o2.providerOrderId, providerPaymentId: payId, amountMinor: o2.amountMinor, currency: "INR", source: "webhook",
      });
      expect(out.outcome).toBe("payment-reused");
      expect((await booking(r2.bookingId)).status).toBe("held");
    });
  });

  test("settlement pays the organizer for finished and cancelled departures, not open ones", async () => {
    const w = await liveTrip();
    const a = await book(w, uniq("cust"));
    const b = await book(w, uniq("cust"), { departureId: w.d2 });
    const add = await call<{ departureId: string }>(trips.addTripDeparture, {
      requestId: rid(), orgId: w.orgId, tripId: w.tripId,
      departure: { id: `${w.hostTripId}-d3`, start: iso(60 * DAY), end: iso(62 * DAY), seatsTotal: 10, priceDelta: 0 },
    }, phoneCtx(w.owner));
    await book(w, uniq("cust"), { departureId: add.departureId });
    // d2 is cancelled (everyone refunded in full); d1 has run; d3 is still ahead.
    await call(trips.cancelDeparture, { requestId: rid(), orgId: w.orgId, departureId: w.d2, reason: "Landslide on the ghat road" }, phoneCtx(w.owner));
    await db().doc(`tripDepartures/${w.d1}`).update({ start: Timestamp.fromMillis(Date.now() - 3 * DAY), end: Timestamp.fromMillis(Date.now() - DAY) });

    const all = await ledger("orgId", w.orgId);
    expectBalanced(all);
    const paidA = (await booking(a.bookingId)).paid * 100;
    const paidB = (await booking(b.bookingId)).paid * 100;
    const cA = commissionFor(paidA, BPS);
    const cB = commissionFor(paidB, BPS);

    const out = await call<{ settlementId: string; status: string; netMinor: number; entryCount: number }>(
      commerce.buildSettlement, { requestId: rid(), orgId: w.orgId, periodEnd: new Date().toISOString() }, adminCtx("admin-a")
    );
    expect(out.status).toBe("pending-approval");
    const s = (await db().doc(`settlements/${out.settlementId}`).get()).data()!;
    // B's full refund reverses its whole commission: it nets to zero for the organizer.
    expect(s).toMatchObject({
      grossMinor: paidA + paidB,
      commissionMinor: cA + cB,
      refundsMinor: paidB - cB,
      netMinor: paidA - cA,
      entryCount: 3,
    });
    expect(s.grossMinor - s.commissionMinor - s.refundsMinor).toBe(s.netMinor);
    const after = await ledger("orgId", w.orgId);
    const claimed = after.filter((e) => e.settlementId === out.settlementId);
    expect(new Set(claimed.map((e) => e.departureId))).toEqual(new Set([w.d1, w.d2]));
    expect(after.filter((e) => e.departureId === add.departureId).every((e) => e.settlementId === null)).toBe(true);
  });
});

describe("trip balance: reminders, then cancellation", () => {
  const H = 3_600_000;
  /** Moves a booking's departure so that its balance due date is [dueIn] ms from now. */
  const dueIn = async (bookingId: string, ms: number) =>
    db().doc(`tripBookings/${bookingId}`).update({ departureStart: Timestamp.fromMillis(Date.now() + 15 * DAY + ms) });
  const balanceNotes = async (uid: string) =>
    (await db().collection("userNotifications").where("recipientUid", "==", uid).get()).docs
      .map((d) => d.data()).filter((n) => n.kind === "trip-balance");

  test("stages: none → soon (3 days out) → today → overdue (24 h) → cancel (48 h)", () => {
    const start = Date.now() + 40 * DAY;
    const due = start - 15 * DAY;
    expect(balanceStage(start, due - 4 * DAY)).toBe("none");
    expect(balanceStage(start, due - 2 * DAY)).toBe("soon");
    expect(balanceStage(start, due + H)).toBe("today");
    expect(balanceStage(start, due + 30 * H)).toBe("overdue");
    expect(balanceStage(start, due + 49 * H)).toBe("cancel");
  });

  test("each reminder goes out once; paying stops them", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    const r = await book(w, cust);
    await dueIn(r.bookingId, 2 * DAY);
    await sweepTripBalances();
    await sweepTripBalances(); // overlapping / repeated runs
    let notes = await balanceNotes(cust);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: "Your trip balance is due soon", link: { type: "trip-booking", id: r.bookingId } });

    await dueIn(r.bookingId, -H);
    await sweepTripBalances();
    notes = await balanceNotes(cust);
    expect(notes.map((n) => n.title)).toContain("Your trip balance is due today");
    expect((await booking(r.bookingId)).balanceReminders).toEqual(["soon", "today"]);

    await pay(cust, r.bookingId, trips.payTripBalance);
    await dueIn(r.bookingId, -30 * H);
    await sweepTripBalances();
    expect(await balanceNotes(cust)).toHaveLength(2); // paid: no overdue warning
  });

  test("after the 48 h grace the booking is cancelled, seats freed and the policy refund paid", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    const r = await book(w, cust);
    const seatsBefore = (await dep(w.d1)).seatsTaken;
    await dueIn(r.bookingId, -30 * H);
    await sweepTripBalances();
    expect((await balanceNotes(cust)).map((n) => n.title)).toContain("Pay your balance to keep your seats");
    expect((await booking(r.bookingId)).status).toBe("confirmed");

    await dueIn(r.bookingId, -49 * H);
    await sweepTripBalances();
    const b = await booking(r.bookingId);
    const daysOut = (b.departureStart.toMillis() - Date.now()) / DAY;
    const expected = Math.round((4000 * refundPercent("standard", Math.floor(daysOut))) / 100);
    expect(b).toMatchObject({ status: "cancelled", cancelledBy: "system:trip-balance", cancelReason: "Balance not paid by the due date", refund: expected });
    expect((await dep(w.d1)).seatsTaken).toBe(seatsBefore - 2);
    expect((await db().doc(`tripTravellers/${w.d1}__${cust}`).get()).exists).toBe(false);
    expect((await balanceNotes(cust)).map((n) => n.title)).toContain("Trip booking cancelled");
    const audit = await db().collection("auditEvents").where("resourceId", "==", r.bookingId).where("action", "==", "trips.booking-cancelled").get();
    expect(audit.docs[0]!.data()).toMatchObject({ actorRole: "system", source: "scheduler" });
    // Re-running is a no-op.
    await sweepTripBalances();
    expect((await booking(r.bookingId)).status).toBe("cancelled");
  });

  test("a balance payment being made right now is never cancelled under the customer", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    const r = await book(w, cust);
    await call(trips.payTripBalance, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(cust)); // order open, not paid yet
    await dueIn(r.bookingId, -49 * H);
    const out = await sweepTripBalances();
    expect(out.skippedPaying).toBeGreaterThanOrEqual(1);
    expect((await booking(r.bookingId)).status).toBe("confirmed");
  });

  test("bookings paid in full get no reminders", async () => {
    const w = await liveTrip();
    const cust = uniq("cust");
    const r = await book(w, cust, { payInFull: true });
    await dueIn(r.bookingId, -49 * H);
    await sweepTripBalances();
    expect(await balanceNotes(cust)).toHaveLength(0);
    expect((await booking(r.bookingId)).status).toBe("confirmed");
  });
});
