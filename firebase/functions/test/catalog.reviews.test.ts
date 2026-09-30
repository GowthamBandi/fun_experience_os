import { ORG, U, H, call, codeOf, messageOf, clearFirestore, db, Timestamp, seedOrg, member, phoneCtx, adminCtx, rid } from "./catalog.fixtures";
import { submitReview, moderateReview } from "../src/catalog";
import { commentViolation, REVIEW_RATE_LIMIT } from "../src/catalog/reviews";

const EXP = "exp-review-0001";
const EV = "event-review-0001";
const DAY = 24 * H;

async function seedEvent(id = EV, o: { status?: string; endsAgoMs?: number } = {}) {
  const ends = Date.now() - (o.endsAgoMs ?? 2 * H);
  await db().doc(`events/${id}`).set({
    orgId: ORG, experienceId: EXP, status: o.status ?? "completed", title: "Football",
    startsAt: Timestamp.fromMillis(ends - 2 * H), endsAt: Timestamp.fromMillis(ends),
  });
}
async function ticket(uid: string, status = "used", eventId = EV) {
  await db().collection("tickets").add({ eventId, customerUid: uid, status, bookingId: "bk", orgId: ORG });
}
const review = (uid: string, over: Record<string, unknown> = {}) =>
  call(submitReview, { requestId: rid("rev"), eventId: EV, rating: 4, comment: "Great organisation and friendly players.", ...over }, phoneCtx(uid));
const agg = async () => ({
  org: (await db().doc(`publicOrganizers/${ORG}`).get()).data()!,
  exp: (await db().doc(`experiences/${EXP}`).get()).data()!,
});

beforeEach(async () => {
  await clearFirestore();
  await seedOrg();
  await db().doc(`experiences/${EXP}`).set({ orgId: ORG, status: "approved", title: "Football", ratingCount: 0, ratingSum: 0 });
  await db().doc(`publicProfiles/${U.customer}`).set({ displayName: "Asha" });
  await seedEvent();
});

test("a checked-in participant reviews; aggregates updated; author name from public profile", async () => {
  await ticket(U.customer);
  const r = await review(U.customer, { rating: 5 });
  expect(r).toMatchObject({ reviewId: `${EV}__${U.customer}`, status: "published", version: 1 });
  const doc = (await db().doc(`reviews/${EV}__${U.customer}`).get()).data()!;
  expect(doc).toMatchObject({ eventId: EV, experienceId: EXP, orgId: ORG, authorUid: U.customer, authorName: "Asha", rating: 5, status: "published" });
  expect(JSON.stringify(doc)).not.toMatch(/\+91/);
  const a = await agg();
  expect(a.org).toMatchObject({ ratingCount: 1, ratingSum: 5, ratingAverage: 5 });
  expect(a.exp).toMatchObject({ ratingCount: 1, ratingSum: 5 });
});

test("duplicate review replaces the first (count stays 1, sum adjusts, version increments)", async () => {
  await ticket(U.customer);
  await review(U.customer, { rating: 5 });
  const r2 = await review(U.customer, { rating: 2, comment: "Changed my mind." });
  expect(r2.version).toBe(2);
  const a = await agg();
  expect(a.org).toMatchObject({ ratingCount: 1, ratingSum: 2 });
  expect(a.exp).toMatchObject({ ratingCount: 1, ratingSum: 2 });
  expect((await db().collection("reviews").get()).size).toBe(1);
});

test("non-participant refused; participant not checked in (valid ticket) refused; cancelled/refunded tickets refused", async () => {
  expect(await codeOf(review(U.customer))).toBe("NOT_PERMITTED");
  await ticket(U.customer, "valid");
  await ticket(U.customer, "refunded");
  expect(await codeOf(review(U.customer))).toBe("NOT_PERMITTED");
  // a used ticket for a DIFFERENT event doesn't count
  await ticket(U.customer, "used", "event-other-0001");
  expect(await codeOf(review(U.customer))).toBe("NOT_PERMITTED");
});

test("before the event ends refused; after 30 days refused; cancelled events refused", async () => {
  await ticket(U.customer);
  await seedEvent(EV, { status: "live", endsAgoMs: -H });
  expect(await messageOf(review(U.customer))).toMatch(/once it has ended/);
  await seedEvent(EV, { status: "published", endsAgoMs: 31 * DAY });
  expect(await messageOf(review(U.customer))).toMatch(/30 days/);
  await seedEvent(EV, { status: "cancelled", endsAgoMs: H });
  expect(await codeOf(review(U.customer))).toBe("PRECONDITION");
  // ended but organizer never marked completed → allowed within window
  await seedEvent(EV, { status: "live", endsAgoMs: 29 * DAY });
  expect(await codeOf(review(U.customer))).toBe("RESOLVED");
});

test("organizer team members cannot review their own org's events", async () => {
  await member(ORG, U.customer2, { permissions: ["tickets.scan"], scope: "all" });
  await ticket(U.customer2);
  expect(await codeOf(review(U.customer2))).toBe("NOT_PERMITTED");
  await ticket(U.owner);
  expect(await codeOf(review(U.owner))).toBe("NOT_PERMITTED");
});

test("URLs, emails and phone numbers in comments are refused; rating/length validated", async () => {
  await ticket(U.customer);
  for (const comment of [
    "Book direct at https://cheap.example",
    "see www.mydeals.in for more",
    "visit partyhub.com now",
    "call me 98765 43210",
    "whatsapp +91-98765-43210",
    "mail me a.b@gmail.com",
  ]) {
    expect([comment, await codeOf(review(U.customer, { comment }))]).toEqual([comment, "INVALID_INPUT"]);
  }
  expect(await codeOf(review(U.customer, { comment: "x".repeat(1001) }))).toBe("INVALID_INPUT");
  expect(await codeOf(review(U.customer, { rating: 0 }))).toBe("INVALID_INPUT");
  expect(await codeOf(review(U.customer, { rating: 6 }))).toBe("INVALID_INPUT");
  expect(await codeOf(review(U.customer, { rating: 4.5 }))).toBe("INVALID_INPUT");
  expect(commentViolation("Played 2 games, 5 goals, match on 12.10.2026 was great")).toBeNull();
});

test("admin hide/publish adjusts aggregates, is audited; non-admins refused", async () => {
  await ticket(U.customer);
  await db().doc(`publicProfiles/${U.customer2}`).set({ displayName: "Ravi" });
  await ticket(U.customer2);
  await review(U.customer, { rating: 5 });
  await review(U.customer2, { rating: 3 });
  const id = `${EV}__${U.customer}`;
  const mod = (status: string, ctx: unknown = adminCtx()) =>
    call(moderateReview, { requestId: rid("mod"), reviewId: id, status, reason: "Spam report upheld" }, ctx);
  expect(await codeOf(mod("hidden", phoneCtx(U.owner)))).toBe("NOT_PERMITTED");
  expect(await codeOf(mod("hidden", { auth: { uid: "x", token: { email_verified: true, roleId: "auditor" } } }))).toBe("NOT_PERMITTED");
  expect(await codeOf(mod("deleted"))).toBe("INVALID_INPUT");
  await mod("hidden");
  let a = await agg();
  expect(a.org).toMatchObject({ ratingCount: 1, ratingSum: 3, ratingAverage: 3 });
  expect(a.exp).toMatchObject({ ratingCount: 1, ratingSum: 3 });
  await mod("hidden"); // no double-subtract
  a = await agg();
  expect(a.org.ratingCount).toBe(1);
  // author editing a hidden review keeps it hidden and aggregates untouched
  const edit = await review(U.customer, { rating: 1 });
  expect(edit.status).toBe("hidden");
  expect((await agg()).org).toMatchObject({ ratingCount: 1, ratingSum: 3 });
  await mod("published");
  expect((await agg()).org).toMatchObject({ ratingCount: 2, ratingSum: 4, ratingAverage: 2 });
  const audits = await db().collection("auditEvents").where("action", "==", "catalog.review-moderated").get();
  expect(audits.size).toBe(3);
});

test("reviews are rate limited per uid", async () => {
  await ticket(U.customer);
  for (let i = 0; i < REVIEW_RATE_LIMIT.limit; i++) await review(U.customer, { rating: 1 + (i % 5) });
  expect(await codeOf(review(U.customer))).toBe("RATE_LIMITED");
  expect((await agg()).org.ratingCount).toBe(1);
});
