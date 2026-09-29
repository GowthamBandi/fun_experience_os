/**
 * The reservation-hold sweeper against the Firestore emulator: expired holds
 * are released with their session counters in one transaction, live holds and
 * confirmed seats are untouched, and a second run changes nothing.
 */
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { reserveSeat, type ReserveSeatCommand } from "../src/bookings/reserveSeat";
import { releaseExpiredHolds, releaseSessionHolds } from "../src/bookings/releaseExpiredHolds";
import { EMPTY_OCCUPANCY, occupancyDrift, recomputeOccupancyFromBookings, type OccupancyCounters } from "../src/domain/capacity";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-experience-os";

let app: App;
let db: Firestore;

beforeAll(() => {
  app = initializeApp({ projectId: "demo-experience-os" }, "sweeper-tests");
  db = getFirestore(app);
});
afterAll(async () => deleteApp(app));

beforeEach(async () => {
  for (const c of ["bookings", "auditEvents", "commandReceipts", "scheduledSessions"]) {
    const snap = await db.collection(c).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
});

async function seedSession(id: string, capacity: number) {
  await db.doc(`scheduledSessions/${id}`).set({
    id,
    status: "booking-open",
    territoryId: "hvd-central",
    capacity: { maxPhysicalCapacity: capacity, blockedSlots: 0, compSlots: 0, minParticipants: 2, targetParticipants: capacity },
    occupancy: { ...EMPTY_OCCUPANCY },
  });
}

let counter = 0;
function cmd(sessionId: string, overrides: Partial<ReserveSeatCommand> = {}): ReserveSeatCommand {
  counter++;
  return {
    requestId: `sweep-${sessionId}-${counter}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    alias: `Guest${counter}`,
    kind: "sellable",
    actor: { uid: "op-test", roleId: "super-admin", displayName: "Test Operator" },
    source: "admin-console",
    ...overrides,
  };
}

async function backdate(bookingId: string, minutesAgo: number) {
  await db.doc(`bookings/${bookingId}`).update({ reservationExpiresAt: Timestamp.fromMillis(Date.now() - minutesAgo * 60_000) });
}

async function session(id: string) {
  return (await db.doc(`scheduledSessions/${id}`).get()).data() as { occupancy: OccupancyCounters; remainingSellableCapacity: number; occupancyStatus: string };
}

test("expired holds are released with their session counters, live holds and comps are untouched", async () => {
  await seedSession("s-sweep-a", 4);
  await seedSession("s-sweep-b", 2);
  const a1 = await reserveSeat(cmd("s-sweep-a"));
  const a2 = await reserveSeat(cmd("s-sweep-a"));
  const a3 = await reserveSeat(cmd("s-sweep-a"));
  const comp = await reserveSeat(cmd("s-sweep-a", { kind: "complimentary" }));
  const b1 = await reserveSeat(cmd("s-sweep-b"));
  const b2 = await reserveSeat(cmd("s-sweep-b"));
  expect((await session("s-sweep-b")).occupancyStatus).toBe("full");

  await backdate(a1.bookingId, 1);
  await backdate(a2.bookingId, 30);
  await backdate(b1.bookingId, 5);
  await backdate(b2.bookingId, 2);

  const summary = await releaseExpiredHolds();
  expect(summary).toEqual({ scanned: 4, released: 4, sessions: 2 });

  const bookings = Object.fromEntries((await db.collection("bookings").get()).docs.map((d) => [d.id, d.data()]));
  for (const id of [a1.bookingId, a2.bookingId, b1.bookingId, b2.bookingId]) {
    expect(bookings[id]).toMatchObject({ reservationStatus: "expired", status: "reservation-expired", paymentStatus: "not-started" });
  }
  expect(bookings[a3.bookingId]).toMatchObject({ reservationStatus: "active", status: "payment-pending" });
  expect(bookings[comp.bookingId]).toMatchObject({ reservationStatus: "not-required", status: "confirmed" });

  const a = await session("s-sweep-a");
  expect(a.occupancy.activeReservationHolds).toBe(1);
  expect(a.occupancy.confirmedComplimentaryBookings).toBe(1);
  expect(a.remainingSellableCapacity).toBe(3);
  const b = await session("s-sweep-b");
  expect(b.occupancy.activeReservationHolds).toBe(0);
  expect(b.remainingSellableCapacity).toBe(2);
  expect(b.occupancyStatus).not.toBe("full");

  // The projection still reconciles with the ledger of record.
  for (const id of ["s-sweep-a", "s-sweep-b"]) {
    const docs = (await db.collection("bookings").where("sessionId", "==", id).get()).docs.map((d) => d.data());
    const recomputed = recomputeOccupancyFromBookings(docs.map((d) => ({ bookingType: d.bookingType, reservationStatus: d.reservationStatus, status: d.status, paymentStatus: d.paymentStatus })));
    expect(occupancyDrift((await session(id)).occupancy, recomputed)).toEqual([]);
  }

  const audits = (await db.collection("auditEvents").where("action", "==", "booking.hold-expired").get()).docs.map((d) => d.data());
  expect(audits).toHaveLength(4);
  for (const audit of audits) {
    expect(audit).toMatchObject({ actorUid: "system", actorName: "System", actorRoleId: "system", entityType: "booking", schemaVersion: 1 });
    expect(audit.subject).toMatch(/^Reservation expired — Guest\d+$/);
  }

  // A seat that was released can be sold again.
  const resold = await reserveSeat(cmd("s-sweep-b"));
  expect(resold.status).toBe("reserved");
});

test("a second run is a no-op", async () => {
  await seedSession("s-sweep-c", 3);
  const hold = await reserveSeat(cmd("s-sweep-c"));
  await backdate(hold.bookingId, 10);
  expect((await releaseExpiredHolds()).released).toBe(1);
  expect(await releaseExpiredHolds()).toEqual({ scanned: 0, released: 0, sessions: 0 });
  expect((await session("s-sweep-c")).occupancy.activeReservationHolds).toBe(0);
  expect((await db.collection("auditEvents").where("action", "==", "booking.hold-expired").get()).size).toBe(1);
});

test("concurrent sweeps release each hold exactly once", async () => {
  await seedSession("s-sweep-d", 6);
  const holds = await Promise.all([1, 2, 3, 4].map(() => reserveSeat(cmd("s-sweep-d"))));
  for (const h of holds) await backdate(h.bookingId, 3);
  const results = await Promise.all([releaseExpiredHolds(), releaseExpiredHolds(), releaseExpiredHolds()]);
  expect(results.reduce((sum, r) => sum + r.released, 0)).toBe(4);
  const s = await session("s-sweep-d");
  expect(s.occupancy.activeReservationHolds).toBe(0);
  expect(s.remainingSellableCapacity).toBe(6);
});

test("a hold confirmed after the sweep query is not released", async () => {
  await seedSession("s-sweep-e", 2);
  const hold = await reserveSeat(cmd("s-sweep-e"));
  await backdate(hold.bookingId, 3);
  // Simulates a payment confirming the hold between query and transaction:
  // the in-transaction re-read sees it is no longer an active hold.
  await db.doc(`bookings/${hold.bookingId}`).update({ reservationStatus: "not-required", status: "confirmed", paymentStatus: "confirmed" });
  expect(await releaseSessionHolds("s-sweep-e", [hold.bookingId], Timestamp.now())).toBe(0);
  expect((await releaseExpiredHolds()).released).toBe(0);
  expect((await db.doc(`bookings/${hold.bookingId}`).get()).data()?.status).toBe("confirmed");
});
