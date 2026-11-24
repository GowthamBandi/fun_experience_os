/**
 * Trip attendance (setTripBoarding), trip reviews (submitTripReview, with
 * moderateReview on kind "trip") and the organizer profile history
 * (getOrganizerHistory), against the Firestore emulator.
 */
import { ORG, OTHER_ORG, U, H, call, codeOf, messageOf, clearFirestore, db, Timestamp, seedOrg, member, phoneCtx, adminCtx, rid } from "./catalog.fixtures";
import { submitReview, submitTripReview, moderateReview, getOrganizerHistory } from "../src/catalog";
import { publicReviewId } from "../src/catalog/reviews";
import { getTripManifest, setTripBoarding } from "../src/trips";

const DAY = 24 * H;
const TRIP = "t-trip-rv-0001";
const DEP = "dep-rv-0001";
const BK = "tb-rv-0001";
const ts = (offsetMs: number) => Timestamp.fromMillis(Date.now() + offsetMs);

async function seedDeparture(id = DEP, o: { startIn?: number; endIn?: number; cancelled?: boolean; seatsTaken?: number; tripId?: string; orgId?: string } = {}) {
  const endIn = o.endIn ?? -2 * H;
  await db().doc(`tripDepartures/${id}`).set({
    tripId: o.tripId ?? TRIP, orgId: o.orgId ?? ORG, start: ts(o.startIn ?? endIn - 2 * DAY), end: ts(endIn),
    seatsTotal: 10, seatsTaken: o.seatsTaken ?? 2, cancelled: o.cancelled ?? false, salesClosed: false,
  });
}
async function seedBooking(id = BK, o: { uid?: string; status?: string; departureId?: string; boarded?: boolean; orgId?: string } = {}) {
  await db().doc(`tripBookings/${id}`).set({
    id, reference: "PLS-TR-AAAA", customerUid: o.uid ?? U.customer, orgId: o.orgId ?? ORG, tripId: TRIP, departureId: o.departureId ?? DEP,
    title: "Coorg coffee trails", status: o.status ?? "confirmed", travellers: 1, roomId: "quad", addOnIds: [], pickupId: "p1", dropId: null,
    quote: { total: 8000 }, paid: 8000, alias: "Asha", people: [{ name: "Asha K", age: 27, gender: "woman", diet: null }],
    emergencyName: "Mum", emergencyPhone: "+919876543210", checked: [],
    ...(o.boarded ? { boardedAt: Timestamp.now(), boardedBy: U.owner } : {}),
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  });
}
const board = (uid: string, over: Record<string, unknown> = {}) =>
  call(setTripBoarding, { requestId: rid("brd"), orgId: ORG, departureId: DEP, bookingId: BK, boarded: true, ...over }, phoneCtx(uid));
const review = (uid: string, over: Record<string, unknown> = {}) =>
  call(submitTripReview, { requestId: rid("trv"), bookingId: BK, rating: 4, comment: "Lovely homestay and a great captain.", ...over }, phoneCtx(uid));
const agg = async () => ({
  org: (await db().doc(`publicOrganizers/${ORG}`).get()).data()!,
  trip: (await db().doc(`trips/${TRIP}`).get()).data()!,
});

beforeEach(async () => {
  await clearFirestore();
  await seedOrg();
  await member(ORG, U.checkin, { permissions: ["events.view", "tickets.scan"], scope: "all" });
  await member(ORG, U.viewer, { permissions: ["events.view", "attendees.view"], scope: "all" });
  await db().doc(`trips/${TRIP}`).set({ orgId: ORG, status: "live", title: "Coorg coffee trails", destination: "Coorg", content: { startCity: "Bengaluru" } });
  await db().doc(`publicProfiles/${U.customer}`).set({ displayName: "Asha" });
  await seedDeparture();
  await seedBooking();
});

describe("setTripBoarding", () => {
  test("tickets.scan marks and unmarks boarding; the manifest shows it; audited", async () => {
    expect(await codeOf(board(U.customer))).toBe("NOT_PERMITTED");
    expect(await codeOf(board(U.viewer))).toBe("NOT_PERMITTED");
    expect(await board(U.checkin)).toMatchObject({ bookingId: BK, boarded: true });
    let b = (await db().doc(`tripBookings/${BK}`).get()).data()!;
    expect(b.boardedAt).toBeInstanceOf(Timestamp);
    expect(b.boardedBy).toBe(U.checkin);
    const m = await call(getTripManifest, { orgId: ORG, departureId: DEP }, phoneCtx(U.owner));
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0]).toMatchObject({ bookingId: BK, boarded: true });

    expect(await board(U.owner, { boarded: false })).toMatchObject({ bookingId: BK, boarded: false });
    b = (await db().doc(`tripBookings/${BK}`).get()).data()!;
    expect(b.boardedAt).toBeNull();
    expect(b.boardedBy).toBeNull();
    expect((await call(getTripManifest, { orgId: ORG, departureId: DEP }, phoneCtx(U.owner))).entries[0].boarded).toBe(false);
    const audits = await db().collection("auditEvents").where("action", "==", "trips.boarding-set").get();
    expect(audits.size).toBe(2);
  });

  test("window: from 24h before the start to 30 days after the end", async () => {
    await seedDeparture(DEP, { startIn: 2 * DAY, endIn: 4 * DAY });
    expect(await messageOf(board(U.owner))).toMatch(/24 hours before/);
    await seedDeparture(DEP, { startIn: 20 * H, endIn: 3 * DAY });
    expect(await codeOf(board(U.owner))).toBe("RESOLVED");
    await seedDeparture(DEP, { endIn: -31 * DAY });
    expect(await messageOf(board(U.owner))).toMatch(/30 days/);
    await seedDeparture(DEP, { endIn: -29 * DAY });
    expect(await codeOf(board(U.owner))).toBe("RESOLVED");
  });

  test("booking must be confirmed, on that departure and org; departure not cancelled", async () => {
    await seedBooking(BK, { status: "held" });
    expect(await codeOf(board(U.owner))).toBe("PRECONDITION");
    await seedBooking(BK, { departureId: "dep-rv-other" });
    expect(await codeOf(board(U.owner))).toBe("NOT_FOUND");
    await seedBooking(BK);
    await seedDeparture(DEP, { cancelled: true });
    expect(await codeOf(board(U.owner))).toBe("PRECONDITION");
    // Another org's owner can't touch this booking via their own org.
    await seedOrg(OTHER_ORG, U.otherOwner);
    await seedDeparture(DEP);
    expect(await codeOf(call(setTripBoarding, { requestId: rid("brd"), orgId: OTHER_ORG, departureId: DEP, bookingId: BK, boarded: true }, phoneCtx(U.otherOwner)))).toBe("NOT_FOUND");
    expect(await codeOf(board(U.owner, { boarded: "yes" }))).toBe("INVALID_INPUT");
  });
});

describe("submitTripReview", () => {
  test("refused: not boarded, not ended, after 30 days, cancelled, org member, not the owner", async () => {
    expect(await messageOf(review(U.customer))).toMatch(/marked as boarded/);
    expect(await codeOf(review(U.customer))).toBe("NOT_PERMITTED");
    await seedBooking(BK, { boarded: true });
    await seedDeparture(DEP, { startIn: -DAY, endIn: H });
    expect(await messageOf(review(U.customer))).toMatch(/once it has ended/);
    await seedDeparture(DEP, { endIn: -31 * DAY });
    expect(await messageOf(review(U.customer))).toMatch(/30 days/);
    await seedDeparture(DEP, { cancelled: true });
    expect(await codeOf(review(U.customer))).toBe("PRECONDITION");
    await seedDeparture(DEP);
    // Someone else's booking.
    expect(await codeOf(review(U.customer2))).toBe("NOT_FOUND");
    // A cancelled booking.
    await seedBooking(BK, { boarded: true, status: "cancelled" });
    expect(await codeOf(review(U.customer))).toBe("PRECONDITION");
    // Organizer team member who travelled on their own trip.
    await seedBooking(BK, { boarded: true, uid: U.checkin });
    expect(await codeOf(review(U.checkin))).toBe("NOT_PERMITTED");
    // Comment rules are the same as event reviews.
    await seedBooking(BK, { boarded: true });
    expect(await codeOf(review(U.customer, { comment: "call me 98765 43210" }))).toBe("INVALID_INPUT");
    expect(await codeOf(review(U.customer, { rating: 6 }))).toBe("INVALID_INPUT");
    expect((await db().collection("reviews").get()).size).toBe(0);
  });

  test("a boarded traveller reviews: organizer + trip aggregates and the public copy; edit doesn't double count", async () => {
    await board(U.owner);
    const r = await review(U.customer, { rating: 5 });
    expect(r).toMatchObject({ reviewId: `${DEP}__${U.customer}`, status: "published", version: 1 });
    const doc = (await db().doc(`reviews/${DEP}__${U.customer}`).get()).data()!;
    expect(doc).toMatchObject({ kind: "trip", tripId: TRIP, departureId: DEP, orgId: ORG, authorUid: U.customer, authorName: "Asha", rating: 5, status: "published", version: 1, moderation: null });
    let a = await agg();
    expect(a.org).toMatchObject({ ratingCount: 1, ratingSum: 5, ratingAverage: 5 });
    expect(a.trip).toMatchObject({ ratingCount: 1, ratingSum: 5, ratingAverage: 5 });
    const pub = (await db().collection("publicReviews").doc(publicReviewId(`${DEP}__${U.customer}`)).get()).data()!;
    expect(pub).toMatchObject({ kind: "trip", orgId: ORG, tripId: TRIP, departureId: DEP, title: "Coorg coffee trails", authorName: "Asha", rating: 5 });
    expect(pub).not.toHaveProperty("authorUid");

    const r2 = await review(U.customer, { rating: 2, comment: "Changed my mind." });
    expect(r2.version).toBe(2);
    a = await agg();
    expect(a.org).toMatchObject({ ratingCount: 1, ratingSum: 2, ratingAverage: 2 });
    expect(a.trip).toMatchObject({ ratingCount: 1, ratingSum: 2 });
    expect((await db().collection("reviews").get()).size).toBe(1);
  });

  test("trip and event reviews count together in the organization rating", async () => {
    await db().doc(`experiences/exp-rv-0001`).set({ orgId: ORG, status: "approved", title: "Football" });
    await db().doc(`events/ev-rv-0001`).set({ orgId: ORG, experienceId: "exp-rv-0001", status: "completed", title: "Football night", startsAt: ts(-4 * H), endsAt: ts(-2 * H) });
    await db().collection("tickets").add({ eventId: "ev-rv-0001", customerUid: U.customer, status: "used", bookingId: "bk", orgId: ORG });
    await call(submitReview, { requestId: rid("rev"), eventId: "ev-rv-0001", rating: 3 }, phoneCtx(U.customer));
    const evPub = (await db().collection("publicReviews").doc(publicReviewId(`ev-rv-0001__${U.customer}`)).get()).data()!;
    expect(evPub).toMatchObject({ kind: "event", title: "Football night", eventId: "ev-rv-0001" });
    await board(U.owner);
    await review(U.customer, { rating: 5 });
    expect((await agg()).org).toMatchObject({ ratingCount: 2, ratingSum: 8, ratingAverage: 4 });
  });

  test("moderation hides and restores a trip review on the organizer and the trip", async () => {
    await board(U.owner);
    await review(U.customer, { rating: 5 });
    const id = `${DEP}__${U.customer}`;
    const mod = (status: string) => call(moderateReview, { requestId: rid("mod"), reviewId: id, status, reason: "Spam report upheld" }, adminCtx());
    await mod("hidden");
    expect((await db().collection("publicReviews").doc(publicReviewId(id)).get()).exists).toBe(false);
    let a = await agg();
    expect(a.org).toMatchObject({ ratingCount: 0, ratingSum: 0, ratingAverage: null });
    expect(a.trip).toMatchObject({ ratingCount: 0, ratingAverage: null });
    // The author editing a hidden review keeps it hidden.
    expect((await review(U.customer, { rating: 1 })).status).toBe("hidden");
    expect((await agg()).org.ratingCount).toBe(0);
    await mod("published");
    a = await agg();
    expect(a.org).toMatchObject({ ratingCount: 1, ratingSum: 1, ratingAverage: 1 });
    expect(a.trip).toMatchObject({ ratingCount: 1, ratingSum: 1 });
    const pub = (await db().collection("publicReviews").doc(publicReviewId(id)).get()).data()!;
    expect(pub).toMatchObject({ kind: "trip", tripId: TRIP, departureId: DEP, title: "Coorg coffee trails", rating: 1 });
  });
});

describe("getOrganizerHistory", () => {
  test("only past, non-cancelled events and trips with travellers, newest first, with grouped reviews", async () => {
    const ev = (id: string, status: string, endIn: number, title = id) =>
      db().doc(`events/${id}`).set({
        orgId: ORG, experienceId: "exp-h", status, title, category: "sports", location: "Indiranagar, Bengaluru",
        startsAt: ts(endIn - 2 * H), endsAt: ts(endIn),
      });
    await ev("ev-h-done", "completed", -3 * DAY, "Football night");
    await ev("ev-h-live-past", "published", -DAY);
    await ev("ev-h-cancelled", "cancelled", -2 * DAY);
    await ev("ev-h-draft", "draft", -2 * DAY);
    await ev("ev-h-future", "published", 3 * DAY);
    await ev("ev-h-running", "live", H); // started, not over
    await db().doc(`events/ev-h-other`).set({ orgId: OTHER_ORG, status: "completed", title: "x", startsAt: ts(-5 * H), endsAt: ts(-4 * H) });
    // DEP (ended 2h ago, 2 seats) is the newest; plus a cancelled, an empty and a future departure.
    await seedDeparture("dep-h-cancelled", { endIn: -DAY, cancelled: true });
    await seedDeparture("dep-h-empty", { endIn: -DAY, seatsTaken: 0 });
    await seedDeparture("dep-h-future", { endIn: 5 * DAY });

    await db().doc(`publicOrganizers/${ORG}`).set({ ratingCount: 3, ratingSum: 12, ratingAverage: 4 }, { merge: true });
    const pub = (id: string, data: Record<string, unknown>, ageMs: number) =>
      db().doc(`publicReviews/${id}`).set({ orgId: ORG, authorName: "Asha", comment: "Nice", ...data, createdAt: ts(-ageMs), updatedAt: ts(-ageMs) });
    await pub("ev-h-done__u1", { eventId: "ev-h-done", experienceId: "exp-h", rating: 5 }, 3 * H); // legacy (no kind)
    await pub("ev-h-done__u2", { kind: "event", eventId: "ev-h-done", experienceId: "exp-h", rating: 4, authorName: "Ravi" }, 2 * H);
    await pub(`${DEP}__u3`, { kind: "trip", tripId: TRIP, departureId: DEP, rating: 3 }, H);

    const out = await call(getOrganizerHistory, { orgId: ORG }, phoneCtx(U.customer2));
    expect(out).toMatchObject({ orgId: ORG, ratingCount: 3, ratingAverage: 4 });
    expect(out.items.map((i: { id: string }) => i.id)).toEqual([DEP, "ev-h-live-past", "ev-h-done"]);
    const [trip, , done] = out.items;
    expect(trip).toMatchObject({
      kind: "trip", id: DEP, experienceId: null, tripId: TRIP, title: "Coorg coffee trails", category: null, place: "Bengaluru",
      ratingCount: 1, ratingAverage: 3,
    });
    expect(trip.reviews).toEqual([{ authorName: "Asha", rating: 3, comment: "Nice", createdAt: expect.any(String) }]);
    expect(typeof trip.startsAt).toBe("string");
    expect(done).toMatchObject({ kind: "event", experienceId: "exp-h", tripId: null, title: "Football night", category: "sports", place: "Indiranagar, Bengaluru", ratingCount: 2, ratingAverage: 4.5 });
    expect(done.reviews.map((r: { authorName: string }) => r.authorName)).toEqual(["Ravi", "Asha"]);
    expect(out.items[1]).toMatchObject({ ratingCount: 0, ratingAverage: null, reviews: [] });

    // Unknown org: empty, no error. Bad input: INVALID_INPUT. Signed out: refused.
    const empty = await call(getOrganizerHistory, { orgId: "org-nobody" }, phoneCtx(U.customer2));
    expect(empty).toEqual({ orgId: "org-nobody", items: [], ratingCount: 0, ratingAverage: null });
    expect(await codeOf(call(getOrganizerHistory, { orgId: "" }, phoneCtx(U.customer2)))).toBe("INVALID_INPUT");
    expect(await codeOf(call(getOrganizerHistory, { orgId: ORG }, {}))).not.toBe("RESOLVED");
    // Console admins can read it too.
    expect((await call(getOrganizerHistory, { orgId: ORG }, adminCtx())).items).toHaveLength(3);
  });
});
