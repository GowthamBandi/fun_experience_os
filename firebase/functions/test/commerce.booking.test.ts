/**
 * reserveSeat (customer path) — eligibility, tenancy, one-live-booking rule,
 * multi-spot no-oversell, idempotency, free events, hold sweeper.
 */

import {
  call,
  callCode,
  callErr,
  commerce,
  db,
  getDoc,
  lapseHold,
  newCustomer,
  phoneCtx,
  reserve,
  rid,
  seedOrg,
  seedEvent,
  uniq,
  world,
  anonEmailCtx,
} from "./commerce-helpers";
import { recomputeOccupancyFromBookings, occupancyDrift, type OccupancyCounters } from "../src/domain/capacity";
import { releaseExpiredHolds } from "../src/commerce/holds";

jest.setTimeout(180_000);

async function eventState(eventId: string) {
  const e = (await getDoc<{ occupancy: OccupancyCounters; remainingSellableCapacity: number }>(`events/${eventId}`))!;
  const bookings = (await db().collection("bookings").where("eventId", "==", eventId).get()).docs.map(
    (d) => d.data() as { status: string; spots: number; bookingType: string; customerUid: string }
  );
  return { ...e, bookings };
}

describe("reserveSeat — attacks on capacity", () => {
  test("oversell storm: 30 customers asking for 1–4 spots each on 10 seats never exceed 10", async () => {
    const { eventId } = await world({ capacity: 10 });
    const customers = await Promise.all(Array.from({ length: 30 }, () => newCustomer()));
    const asks = customers.map((_, i) => (i % 4) + 1);
    const results = await Promise.all(customers.map((uid, i) => callCode(commerce.reserveSeat, {
      requestId: rid(), eventId, spots: asks[i], alias: `Storm${i}`,
    }, phoneCtx(uid))));

    const s = await eventState(eventId);
    const heldSpots = s.bookings.filter((b) => b.status === "held").reduce((a, b) => a + b.spots, 0);
    const okCount = results.filter((r) => r === "OK").length;

    // THE INVARIANT
    expect(heldSpots).toBeLessThanOrEqual(10);
    expect(s.occupancy.activeReservationHolds).toBe(heldSpots);
    expect(s.bookings).toHaveLength(okCount);
    expect(s.remainingSellableCapacity).toBe(10 - heldSpots);
    // Every refusal is a clean business answer.
    for (const r of results) expect(["OK", "SOLD_OUT", "CONTENTION", "INTERNAL"]).toContain(r);
    expect(results.filter((r) => r === "SOLD_OUT").length).toBeGreaterThan(0);
    // Projection reconciles with the ledger of record.
    expect(occupancyDrift(s.occupancy, recomputeOccupancyFromBookings(s.bookings))).toEqual([]);
  });

  test("a 3-spot request with 2 seats left is refused outright (never partially filled)", async () => {
    const { eventId } = await world({ capacity: 2 });
    const uid = await newCustomer();
    const e = await callErr(commerce.reserveSeat, { requestId: rid(), eventId, spots: 3, alias: "Group" }, phoneCtx(uid));
    expect(e.code).toBe("SOLD_OUT");
    expect((await eventState(eventId)).bookings).toHaveLength(0);
  });

  test("spots outside 1..4 are rejected", async () => {
    const { eventId } = await world();
    const uid = await newCustomer();
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 5, alias: "Big" }, phoneCtx(uid))).toBe("INVALID_INPUT");
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 0, alias: "Zero" }, phoneCtx(uid))).toBe("INVALID_INPUT");
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1.5, alias: "Half" }, phoneCtx(uid))).toBe("INVALID_INPUT");
  });

  test("double-tap: the same requestId fired 3× concurrently creates one booking", async () => {
    const { eventId } = await world({ capacity: 5 });
    const uid = await newCustomer();
    const requestId = rid();
    const out = await Promise.all([0, 1, 2].map(() => reserve(uid, eventId, 2, requestId).catch((e) => e)));
    const ids = new Set(out.filter((o) => o && o.bookingId).map((o) => o.bookingId));
    expect(ids.size).toBe(1);
    const s = await eventState(eventId);
    expect(s.bookings).toHaveLength(1);
    expect(s.occupancy.activeReservationHolds).toBe(2);
  });

  test("the amount is price × spots, computed by the server", async () => {
    const { eventId } = await world({ priceMinor: 12_345 });
    const uid = await newCustomer();
    const r = await call<{ amountMinor: number; status: string }>(
      commerce.reserveSeat,
      { requestId: rid(), eventId, spots: 3, alias: "Payer", amountMinor: 1, priceMinor: 1 },
      phoneCtx(uid)
    );
    expect(r.status).toBe("held");
    expect(r.amountMinor).toBe(37_035);
  });
});

describe("reserveSeat — who may book", () => {
  test("a second live booking by the same customer for the same event is refused", async () => {
    const { eventId } = await world();
    const uid = await newCustomer();
    await reserve(uid, eventId);
    const e = await callErr(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Again" }, phoneCtx(uid));
    expect(e.code).toBe("CONFLICT");
  });

  test("two different requests by one customer racing concurrently still yield one booking", async () => {
    const { eventId } = await world();
    const uid = await newCustomer();
    const out = await Promise.all([1, 2, 3].map(() => callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Racer" }, phoneCtx(uid))));
    expect(out.filter((o) => o === "OK")).toHaveLength(1);
    expect((await eventState(eventId)).bookings).toHaveLength(1);
  });

  test("once the first hold lapses, the customer may book again and the old seat is released once", async () => {
    const { eventId } = await world({ capacity: 3 });
    const uid = await newCustomer();
    const first = await reserve(uid, eventId, 2);
    await lapseHold(first.bookingId);
    const second = await reserve(uid, eventId, 1);
    expect(second.status).toBe("held");
    const s = await eventState(eventId);
    expect((await getDoc<{ status: string }>(`bookings/${first.bookingId}`))!.status).toBe("expired");
    expect(s.occupancy.activeReservationHolds).toBe(1);
  });

  test("underage customer is refused (age computed at the event start)", async () => {
    const { eventId } = await world({ eligibility: { ageMin: 18, ageMax: null, genderRule: "open" } });
    const now = new Date();
    const teen = `${now.getUTCFullYear() - 17}-12-31`;
    const uid = await newCustomer({ birthDate: teen, gender: "man" });
    const e = await callErr(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Teen" }, phoneCtx(uid));
    expect(e.code).toBe("NOT_ELIGIBLE");
    expect(e.message).toMatch(/18/);
  });

  test("turning 18 before the event starts is enough", async () => {
    const startsInHours = 24 * 5;
    const { eventId } = await world({ startsInHours });
    const start = new Date(Date.now() + startsInHours * 3_600_000 + 330 * 60_000); // IST date of start
    const bday = new Date(Date.UTC(start.getUTCFullYear() - 18, start.getUTCMonth(), start.getUTCDate()));
    bday.setUTCDate(bday.getUTCDate() - 1);
    const uid = await newCustomer({ birthDate: bday.toISOString().slice(0, 10), gender: "woman" });
    expect((await reserve(uid, eventId)).status).toBe("held");
  });

  test("over the age cap is refused", async () => {
    const { eventId } = await world({ eligibility: { ageMin: 18, ageMax: 30, genderRule: "open" } });
    const uid = await newCustomer({ birthDate: "1970-01-01", gender: "woman" });
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Senior" }, phoneCtx(uid))).toBe("NOT_ELIGIBLE");
  });

  test("women-only event refuses a man and admits a woman", async () => {
    const { eventId } = await world({ eligibility: { ageMin: 18, ageMax: null, genderRule: "women-only" } });
    const man = await newCustomer({ birthDate: "1990-01-01", gender: "man" });
    const nb = await newCustomer({ birthDate: "1990-01-01", gender: "non-binary" });
    const woman = await newCustomer({ birthDate: "1990-01-01", gender: "woman" });
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Man" }, phoneCtx(man))).toBe("NOT_ELIGIBLE");
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "NB" }, phoneCtx(nb))).toBe("NOT_ELIGIBLE");
    expect((await reserve(woman, eventId)).status).toBe("held");
    const b = (await eventState(eventId)).bookings[0] as unknown as { eligibility: unknown; customerUid: string };
    // Only derived facts are copied — never birth date or gender.
    expect(b.eligibility).toEqual({ ageVerifiedOk: true, genderOk: true });
    expect(JSON.stringify(b)).not.toMatch(/woman|1990/);
  });

  test("men-only event refuses a woman", async () => {
    const { eventId } = await world({ eligibility: { ageMin: 18, ageMax: null, genderRule: "men-only" } });
    const woman = await newCustomer({ birthDate: "1990-01-01", gender: "woman" });
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Wo" }, phoneCtx(woman))).toBe("NOT_ELIGIBLE");
  });

  test("missing safety profile → NOT_ELIGIBLE 'Complete your profile'", async () => {
    const { eventId } = await world();
    const uid = await newCustomer(null);
    const e = await callErr(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Anon" }, phoneCtx(uid));
    expect(e.code).toBe("NOT_ELIGIBLE");
    expect(e.message).toMatch(/Complete your profile/);
  });

  test.each(["draft", "submitted", "approved", "cancelled", "completed", "booking-closed"])(
    "an event in status %s refuses bookings",
    async (status) => {
      const { eventId } = await world({ status });
      const uid = await newCustomer();
      expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "X1" }, phoneCtx(uid))).toBe("SESSION_NOT_BOOKABLE");
    }
  );

  test.each(["paused", "blocked"])("a %s organizer's events refuse bookings", async (status) => {
    const orgId = uniq("org");
    await seedOrg(orgId, status);
    const eventId = await seedEvent({ orgId });
    const uid = await newCustomer();
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "X1" }, phoneCtx(uid))).toBe("SESSION_NOT_BOOKABLE");
  });

  test("an event that already started refuses bookings", async () => {
    const { eventId } = await world({ startsInHours: -1 });
    const uid = await newCustomer();
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Late" }, phoneCtx(uid))).toBe("SESSION_NOT_BOOKABLE");
  });

  test("a paid event with no commission terms takes no money", async () => {
    const orgId = uniq("org");
    await seedOrg(orgId);
    const eventId = await seedEvent({ orgId });
    await db().collection("eventCommercials").doc(eventId).delete();
    const uid = await newCustomer();
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "NoTerms" }, phoneCtx(uid))).toBe("SESSION_NOT_BOOKABLE");
  });

  test("signed-out and non-phone accounts cannot book", async () => {
    const { eventId } = await world();
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Nobody" }, { rawRequest: {} })).toBe("NOT_AUTHENTICATED");
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Email" }, anonEmailCtx(uniq("u")))).toBe("NOT_PERMITTED");
  });

  test("booking attempts are rate limited per user (20 per 10 minutes)", async () => {
    const { eventId } = await world({ status: "draft" });
    const uid = await newCustomer();
    const codes: string[] = [];
    for (let i = 0; i < 21; i++) {
      codes.push(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Spam" }, phoneCtx(uid)));
    }
    expect(codes.slice(0, 20).every((c) => c === "SESSION_NOT_BOOKABLE")).toBe(true);
    expect(codes[20]).toBe("RATE_LIMITED");
  });
});

describe("free events", () => {
  test("a free event is confirmed at once with one signed ticket per spot", async () => {
    const { eventId } = await world({ priceMinor: 0 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId, 3);
    expect(r.status).toBe("confirmed");
    expect(r.holdExpiresAt).toBeNull();
    expect(r.ticketIds).toHaveLength(3);
    for (const t of r.ticketIds) {
      const ticket = (await getDoc<{ status: string; customerUid: string }>(`tickets/${t}`))!;
      expect(ticket.status).toBe("valid");
      expect(ticket.customerUid).toBe(uid);
      const secret = (await getDoc<{ payload: string; customerUid: string }>(`ticketSecrets/${t}`))!;
      expect(secret.payload).toMatch(new RegExp(`^PX1\\.${t}\\.[A-Za-z0-9_-]{22}$`));
      expect(secret.customerUid).toBe(uid);
    }
    const s = await eventState(eventId);
    expect(s.occupancy.confirmedPaidBookings).toBe(3);
    expect(s.occupancy.activeReservationHolds).toBe(0);
  });
});

describe("releaseExpiredHolds", () => {
  test("releases lapsed holds' capacity, leaves live holds alone, and is idempotent", async () => {
    const { eventId } = await world({ capacity: 6 });
    const a = await newCustomer();
    const b = await newCustomer();
    const lapsed = await reserve(a, eventId, 3);
    const live = await reserve(b, eventId, 2);
    await lapseHold(lapsed.bookingId);

    const first = await releaseExpiredHolds();
    expect(first.expired).toBeGreaterThanOrEqual(1);
    let s = await eventState(eventId);
    expect(s.occupancy.activeReservationHolds).toBe(2);
    expect(s.remainingSellableCapacity).toBe(4);
    expect((await getDoc<{ status: string }>(`bookings/${lapsed.bookingId}`))!.status).toBe("expired");
    expect((await getDoc<{ status: string }>(`bookings/${live.bookingId}`))!.status).toBe("held");

    // Twice, and concurrently: nothing more is released.
    await Promise.all([releaseExpiredHolds(), releaseExpiredHolds()]);
    s = await eventState(eventId);
    expect(s.occupancy.activeReservationHolds).toBe(2);
    expect(occupancyDrift(s.occupancy, recomputeOccupancyFromBookings(s.bookings))).toEqual([]);
    const audits = await db().collection("auditEvents").where("resourceId", "==", lapsed.bookingId).where("action", "==", "booking.hold-expired").get();
    expect(audits.size).toBe(1);
  });
});
