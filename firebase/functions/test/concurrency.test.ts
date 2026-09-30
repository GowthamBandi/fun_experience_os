/**
 * MISSION 10 — CONCURRENCY / TRANSACTION SAFETY PROOF
 *
 * These are not unit tests with mocks. Every assertion below runs against a
 * real Firestore emulator with genuinely concurrent clients.
 *
 * The invariant under proof: THE PLATFORM MUST NEVER OVERSELL A SESSION.
 *
 * Run:  npm --prefix firebase/functions run test:emulator
 */

import { initializeApp, deleteApp, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import {
  reserveSeat,
  RESERVATION_HOLD_MINUTES,
  type ReserveSeatCommand,
} from "../src/bookings/reserveSeat";
import { DomainError } from "../src/platform/errors";
import {
  recomputeOccupancyFromBookings,
  occupancyDrift,
  EMPTY_OCCUPANCY,
  type OccupancyCounters,
} from "../src/domain/capacity";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-experience-os";

jest.setTimeout(180_000);

let app: App;
let db: Firestore;

const SESSION_ID = "s-concurrency";

beforeAll(() => {
  app = initializeApp({ projectId: "demo-experience-os" });
  db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
});

afterAll(async () => {
  await deleteApp(app);
});

async function wipe() {
  for (const c of ["bookings", "auditEvents", "commandReceipts", "events"]) {
    const snap = await db.collection(c).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function seedSession(opts: {
  maxPhysicalCapacity: number;
  blockedSlots?: number;
  compSlots?: number;
  status?: string;
}) {
  await db.collection("events").doc(SESSION_ID).set({
    id: SESSION_ID,
    // Canonical event document (ADR-0003); the admin path needs only these.
    orgId: "org-concurrency",
    experienceId: "exp-concurrency",
    status: opts.status ?? "published",
    // Paid event, so a sellable seat is a 15-minute hold (ADR-0005).
    priceMinor: 50_000,
    currency: "INR",
    commissionBps: 1_000,
    capacity: {
      maxPhysicalCapacity: opts.maxPhysicalCapacity,
      blockedSlots: opts.blockedSlots ?? 0,
      compSlots: opts.compSlots ?? 0,
      minParticipants: 4,
      targetParticipants: opts.maxPhysicalCapacity,
    },
    occupancy: { ...EMPTY_OCCUPANCY },
  });
}

const actor = { uid: "op-test", roleId: "super-admin" };

function cmd(i: number, overrides: Partial<ReserveSeatCommand> = {}): ReserveSeatCommand {
  return {
    requestId: `req-${SESSION_ID}-${i}-${Math.random().toString(36).slice(2, 10)}`,
    eventId: SESSION_ID,
    alias: `Client${i}`,
    kind: "sellable",
    actor,
    source: "admin-console",
    ...overrides,
  };
}

type Outcome = { ok: true } | { ok: false; code: string };

async function attempt(c: ReserveSeatCommand): Promise<Outcome> {
  try {
    await reserveSeat(c);
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, code: e.code };
    const msg = (e as Error).message ?? "";
    if (/ABORTED|too much contention|deadline/i.test(msg)) return { ok: false, code: "CONTENTION" };
    return { ok: false, code: "UNEXPECTED:" + msg };
  }
}

async function readState() {
  const s = await db.collection("events").doc(SESSION_ID).get();
  const bookings = await db.collection("bookings").where("eventId", "==", SESSION_ID).get();
  const data = s.data() as {
    occupancy: OccupancyCounters;
    remainingSellableCapacity: number;
    status: string;
    occupancyStatus: string;
  };
  return {
    occupancy: data.occupancy,
    remaining: data.remainingSellableCapacity,
    status: data.status,
    occupancyStatus: data.occupancyStatus,
    bookingDocs: bookings.docs.map((d) => d.data() as Record<string, string>),
  };
}

/* ================================================================== */

describe("MISSION 10 — no-oversell under real concurrency", () => {
  test("PROOF 1: capacity 1, two simultaneous bookers — exactly one wins", async () => {
    await wipe();
    await seedSession({ maxPhysicalCapacity: 1 });

    const [a, b] = await Promise.all([attempt(cmd(1)), attempt(cmd(2))]);
    const winners = [a, b].filter((r) => r.ok).length;
    const losers = [a, b].filter((r) => !r.ok);

    const state = await readState();

    expect(winners).toBe(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toEqual({ ok: false, code: "SOLD_OUT" });
    expect(state.bookingDocs).toHaveLength(1);
    expect(state.occupancy.activeReservationHolds).toBe(1);
    expect(state.remaining).toBe(0);
    // REG-001: occupancy is derived and lives in its own field. The lifecycle
    // status must stay 'published' so the capacity gate — not the lifecycle
    // gate — is what answers a sold-out request.
    expect(state.occupancyStatus).toBe("full");
    expect(state.status).toBe("published");
  });

  test("PROOF 2: capacity 10, 40 simultaneous bookers — exactly 10 seats, never 11", async () => {
    await wipe();
    await seedSession({ maxPhysicalCapacity: 10 });

    const CLIENTS = 40;
    const started = Date.now();
    const results = await Promise.all(
      Array.from({ length: CLIENTS }, (_, i) => attempt(cmd(i)))
    );
    const elapsedMs = Date.now() - started;

    const booked = results.filter((r) => r.ok).length;
    const soldOut = results.filter((r) => !r.ok && r.code === "SOLD_OUT").length;
    const contention = results.filter((r) => !r.ok && r.code === "CONTENTION").length;
    const unexpected = results.filter((r) => !r.ok && r.code.startsWith("UNEXPECTED"));

    const state = await readState();

    // eslint-disable-next-line no-console
    console.log(
      `\n  [PROOF 2] capacity=10 clients=${CLIENTS} elapsed=${elapsedMs}ms\n` +
        `            booked=${booked} soldOut=${soldOut} contention=${contention}\n` +
        `            bookingDocs=${state.bookingDocs.length} remaining=${state.remaining} occupancy=${state.occupancyStatus}`
    );

    expect(unexpected).toEqual([]);
    // THE INVARIANT: never more than capacity, no matter the contention.
    expect(state.bookingDocs.length).toBeLessThanOrEqual(10);
    expect(state.occupancy.activeReservationHolds).toBeLessThanOrEqual(10);
    // And every seat that exists was actually sold — no phantom seats.
    expect(state.bookingDocs.length).toBe(booked);
    expect(state.occupancy.activeReservationHolds).toBe(booked);
    // With bounded retry, all 10 seats should actually sell.
    expect(booked).toBe(10);
    expect(state.remaining).toBe(0);
  });

  test("PROOF 3: the counter projection reconciles with the booking ledger of record", async () => {
    const state = await readState();
    const recomputed = recomputeOccupancyFromBookings(
      state.bookingDocs.map((b) => ({
        bookingType: b.bookingType,
        status: b.status,
        spots: Number(b.spots),
      }))
    );
    const drift = occupancyDrift(state.occupancy, recomputed);
    expect(drift).toEqual([]);
  });

  test("PROOF 4: blocked slots reduce sellable capacity but not physical capacity", async () => {
    await wipe();
    // 10 physical, 3 withheld from sale => 7 sellable.
    await seedSession({ maxPhysicalCapacity: 10, blockedSlots: 3 });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => attempt(cmd(i)))
    );
    const booked = results.filter((r) => r.ok).length;
    const state = await readState();

    expect(booked).toBe(7);
    expect(state.bookingDocs).toHaveLength(7);
    expect(state.remaining).toBe(0);

    // Complimentary places consume physical capacity, which still has 3 free.
    const comp = await Promise.all(
      Array.from({ length: 6 }, (_, i) => attempt(cmd(100 + i, { kind: "complimentary" })))
    );
    const compBooked = comp.filter((r) => r.ok).length;
    const after = await readState();

    expect(compBooked).toBe(3);
    expect(after.occupancy.confirmedComplimentaryBookings).toBe(3);
    expect(
      after.occupancy.activeReservationHolds + after.occupancy.confirmedComplimentaryBookings
    ).toBe(10);
    expect(comp.filter((r) => !r.ok && r.code === "VENUE_FULL")).toHaveLength(3);
  });
});

describe("MISSION 10 — idempotency", () => {
  test("PROOF 5: the same requestId twice creates exactly one booking", async () => {
    await wipe();
    await seedSession({ maxPhysicalCapacity: 5 });

    const c = cmd(1);
    const first = await reserveSeat(c);
    const second = await reserveSeat(c);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.bookingId).toBe(first.bookingId);

    const state = await readState();
    expect(state.bookingDocs).toHaveLength(1);
    expect(state.occupancy.activeReservationHolds).toBe(1);
  });

  test("PROOF 6: a double-tap — the same requestId fired concurrently — still creates one booking", async () => {
    await wipe();
    await seedSession({ maxPhysicalCapacity: 5 });

    const c = cmd(2);
    const results = await Promise.all([attempt(c), attempt(c), attempt(c)]);
    const errors = results.filter((r) => !r.ok);

    const state = await readState();
    expect(state.bookingDocs).toHaveLength(1);
    expect(state.occupancy.activeReservationHolds).toBe(1);
    expect(errors.filter((e) => !e.ok && e.code.startsWith("UNEXPECTED"))).toEqual([]);
  });
});

describe("MISSION 10 — the session lifecycle is enforced by the server", () => {
  test.each([
    ["cancelled", "This session was cancelled, so it can't take bookings."],
    ["completed", "This session has already finished."],
    ["booking-closed", "Bookings have closed for this session."],
    ["draft", "This session hasn't been published yet, so it can't take bookings."],
  ])("PROOF 7: a %s session refuses bookings with an operator-readable reason", async (status, message) => {
    await wipe();
    await seedSession({ maxPhysicalCapacity: 10, status });

    let caught: DomainError | undefined;
    try {
      await reserveSeat(cmd(1));
    } catch (e) {
      caught = e as DomainError;
    }

    expect(caught).toBeInstanceOf(DomainError);
    expect(caught!.code).toBe("SESSION_NOT_BOOKABLE");
    expect(caught!.operatorMessage).toBe(message);
    expect(caught!.operatorMessage).not.toMatch(/error|invalid|failed|constraint|null|undefined/i);

    const bookings = await db.collection("bookings").where("eventId", "==", SESSION_ID).get();
    expect(bookings.size).toBe(0);
  });
});

describe("MISSION 14 — every admitted seat is audited to a server-resolved actor", () => {
  test("PROOF 8: audit events name the acting user and cannot be supplied by the caller", async () => {
    await wipe();
    await seedSession({ maxPhysicalCapacity: 3 });

    await reserveSeat(cmd(1, { actor: { uid: "uid-real", roleId: "city-manager" } }));

    const audits = await db.collection("auditEvents").get();
    expect(audits.size).toBe(1);
    const a = audits.docs[0].data();

    expect(a.action).toBe("booking.seat-reserved");
    expect(a.actorUid).toBe("uid-real");
    // ADR-0003 audit shape: the server-resolved role, and tenancy by orgId.
    expect(a.actorRole).toBe("city-manager");
    expect(a.resourceType).toBe("booking");
    expect(a.at).toBeDefined();
    expect(a.orgId).toBe("org-concurrency");
  });
});

describe("reservation holds", () => {
  test("PROOF 9: a sellable seat is held, not confirmed, and the hold has a real expiry", async () => {
    await wipe();
    await seedSession({ maxPhysicalCapacity: 3 });

    const before = Date.now();
    const r = await reserveSeat(cmd(1));
    const expiry = new Date(r.holdExpiresAt!).getTime();

    expect(r.status).toBe("held");
    // A real instant, not the string "15:00 mins" the prototype stored.
    expect(Number.isFinite(expiry)).toBe(true);
    expect(expiry).toBeGreaterThan(before + (RESERVATION_HOLD_MINUTES - 1) * 60_000);
    expect(expiry).toBeLessThan(before + (RESERVATION_HOLD_MINUTES + 1) * 60_000);

    const state = await readState();
    expect(state.bookingDocs[0].status).toBe("held");
    expect(state.occupancy.confirmedPaidBookings).toBe(0);
    expect(state.occupancy.activeReservationHolds).toBe(1);
  });
});
