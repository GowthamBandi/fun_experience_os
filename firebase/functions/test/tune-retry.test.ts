/**
 * Retry-budget sweep against the REAL reserveSeat transaction.
 *
 * The standalone probe in measure-contention.mjs used a lighter transaction
 * (1 read / 2 writes) than reserveSeat actually performs (2 reads / 4 writes),
 * and therefore reported an optimistic retry budget. This sweep measures the
 * real thing so ADR-0002 records a number that holds in production.
 *
 * Reports, for each budget: seats actually sold, clean sold-out answers,
 * aborted-by-contention (LOST SALES), and wall time.
 */

import { initializeApp, deleteApp, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { reserveSeat, type ReserveSeatCommand } from "../src/bookings/reserveSeat";
import { DomainError } from "../src/platform/errors";
import { EMPTY_OCCUPANCY } from "../src/domain/capacity";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-experience-os";

jest.setTimeout(600_000);

let app: App;
let db: Firestore;
const SESSION_ID = "s-tune";
const CAPACITY = 10;
const CLIENTS = 40;

beforeAll(() => {
  app = initializeApp({ projectId: "demo-experience-os" }, "tune");
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

async function seed() {
  await db.collection("events").doc(SESSION_ID).set({
    id: SESSION_ID,
    orgId: "org-tune",
    experienceId: "exp-tune",
    status: "published",
    priceMinor: 50_000,
    currency: "INR",
    capacity: {
      maxPhysicalCapacity: CAPACITY,
      blockedSlots: 0,
      compSlots: 0,
      minParticipants: 4,
      targetParticipants: CAPACITY,
    },
    occupancy: { ...EMPTY_OCCUPANCY },
  });
  await db.collection("eventCommercials").doc(SESSION_ID).set({ eventId: SESSION_ID, orgId: "org-tune", commissionBps: 1_000 });
}

function cmd(i: number, maxAttempts: number): ReserveSeatCommand {
  return {
    requestId: `tune-${maxAttempts}-${i}-${Math.random().toString(36).slice(2, 10)}`,
    eventId: SESSION_ID,
    alias: `Client${i}`,
    kind: "sellable",
    actor: { uid: "op-test", roleId: "super-admin" },
    source: "admin-console",
    maxAttempts,
  };
}

async function sweep(maxAttempts: number) {
  await wipe();
  await seed();
  const t0 = Date.now();
  const outcomes = await Promise.all(
    Array.from({ length: CLIENTS }, async (_, i) => {
      try {
        await reserveSeat(cmd(i, maxAttempts));
        return "booked";
      } catch (e) {
        if (e instanceof DomainError) return e.code === "SOLD_OUT" ? "sold-out" : "domain:" + e.code;
        const msg = (e as Error).message ?? "";
        if (/ABORTED|contention|deadline/i.test(msg)) return "aborted";
        return "error";
      }
    })
  );
  const wall = Date.now() - t0;
  const by = outcomes.reduce<Record<string, number>>((a, o) => ((a[o] = (a[o] || 0) + 1), a), {});
  const docs = (await db.collection("bookings").where("eventId", "==", SESSION_ID).get()).size;
  const sess = (await db.collection("events").doc(SESSION_ID).get()).data()!;

  return {
    maxAttempts,
    booked: by.booked || 0,
    soldOut: by["sold-out"] || 0,
    aborted: by.aborted || 0,
    other: Object.entries(by).filter(([k]) => !["booked", "sold-out", "aborted"].includes(k)),
    bookingDocs: docs,
    holds: sess.occupancy.activeReservationHolds,
    wall,
  };
}

test("retry-budget sweep: find the budget that sells every seat without overselling", async () => {
  const rows = [];
  for (const budget of [5, 10, 20, 40]) {
    const r = await sweep(budget);
    rows.push(r);
    // eslint-disable-next-line no-console
    console.log(
      `  maxAttempts=${String(r.maxAttempts).padStart(2)}  ` +
        `booked=${String(r.booked).padStart(2)}/${CAPACITY}  ` +
        `soldOut=${String(r.soldOut).padStart(2)}  aborted=${String(r.aborted).padStart(2)}  ` +
        `docs=${String(r.bookingDocs).padStart(2)}  holds=${String(r.holds).padStart(2)}  ` +
        `wall=${String(r.wall).padStart(6)}ms  ` +
        `${r.other.length ? "other=" + JSON.stringify(r.other) : ""}`
    );
  }

  // The non-negotiable invariant must hold at EVERY budget.
  for (const r of rows) {
    expect(r.bookingDocs).toBeLessThanOrEqual(CAPACITY);
    expect(r.holds).toBeLessThanOrEqual(CAPACITY);
    expect(r.bookingDocs).toBe(r.booked);
  }

  // At least one budget must sell the whole session without losing sales.
  const clean = rows.filter((r) => r.booked === CAPACITY && r.aborted === 0);
  // eslint-disable-next-line no-console
  console.log(
    `\n  budgets that sold all ${CAPACITY} seats with zero lost sales: ` +
      (clean.length ? clean.map((c) => `${c.maxAttempts} (${c.wall}ms)`).join(", ") : "NONE")
  );
  expect(clean.length).toBeGreaterThan(0);
});
