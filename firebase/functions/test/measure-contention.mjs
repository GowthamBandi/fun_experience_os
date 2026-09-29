/**
 * Contention measurement — not a test, an instrument.
 *
 * Measures what actually happens when N clients contend for seats on ONE
 * Firestore session document, so that the seat-claim architecture is chosen on
 * evidence rather than folklore. Feeds ADR-0002.
 *
 * Run with the Firestore emulator up:
 *   node test/measure-contention.mjs
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-experience-os";

const app = initializeApp({ projectId: "demo-experience-os" });
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

const SESSION = "s-measure";

async function wipe() {
  for (const c of ["bookings", "scheduledSessions"]) {
    const snap = await db.collection(c).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function seed(capacity) {
  await db.collection("scheduledSessions").doc(SESSION).set({
    capacity,
    taken: 0,
    status: "booking-open",
  });
}

/** Strategy A — single hot counter document, guarded transaction. */
async function claimViaCounter(i, maxAttempts) {
  const t0 = Date.now();
  const ref = db.collection("scheduledSessions").doc(SESSION);
  const bookingRef = db.collection("bookings").doc();
  try {
    await db.runTransaction(
      async (tx) => {
        const snap = await tx.get(ref);
        const d = snap.data();
        if (d.taken >= d.capacity) {
          const e = new Error("SOLD_OUT");
          e.soldOut = true;
          throw e;
        }
        tx.set(bookingRef, { sessionId: SESSION, alias: `c${i}`, status: "reserved" });
        tx.update(ref, { taken: d.taken + 1 });
      },
      { maxAttempts }
    );
    return { outcome: "booked", ms: Date.now() - t0 };
  } catch (e) {
    if (e.soldOut) return { outcome: "sold-out", ms: Date.now() - t0 };
    if (e.code === 10 || /ABORTED|contention/i.test(e.message || ""))
      return { outcome: "aborted", ms: Date.now() - t0 };
    return { outcome: "error:" + (e.code ?? e.message), ms: Date.now() - t0 };
  }
}

/**
 * Strategy B — pre-created seat documents. A booker claims ONE seat doc.
 * Capacity becomes a STRUCTURAL invariant: only `capacity` seat docs exist, so
 * overselling is not merely rejected, it is unrepresentable.
 */
async function seedSeats(capacity) {
  const batch = db.batch();
  for (let s = 0; s < capacity; s++) {
    batch.set(db.collection("scheduledSessions").doc(SESSION).collection("seats").doc(`seat-${s}`), {
      index: s,
      claimed: false,
    });
  }
  await batch.commit();
}

async function claimViaSeatDoc(i, capacity, maxAttempts) {
  const t0 = Date.now();
  const seats = db.collection("scheduledSessions").doc(SESSION).collection("seats");
  // Probe seats in a caller-specific rotation so clients spread across documents
  // instead of all colliding on seat-0.
  const order = Array.from({ length: capacity }, (_, k) => (k + i) % capacity);

  for (const idx of order) {
    const ref = seats.doc(`seat-${idx}`);
    try {
      const claimed = await db.runTransaction(
        async (tx) => {
          const snap = await tx.get(ref);
          if (snap.data().claimed) return false;
          tx.update(ref, { claimed: true, alias: `c${i}` });
          tx.set(db.collection("bookings").doc(), {
            sessionId: SESSION,
            seatIndex: idx,
            alias: `c${i}`,
            status: "reserved",
          });
          return true;
        },
        { maxAttempts }
      );
      if (claimed) return { outcome: "booked", ms: Date.now() - t0 };
    } catch (e) {
      if (e.code === 10 || /ABORTED|contention/i.test(e.message || "")) continue;
      return { outcome: "error:" + (e.code ?? e.message), ms: Date.now() - t0 };
    }
  }
  return { outcome: "sold-out", ms: Date.now() - t0 };
}

function summarise(label, capacity, clients, results, elapsedMs, bookingDocs, extra = {}) {
  const by = results.reduce((a, r) => ((a[r.outcome] = (a[r.outcome] || 0) + 1), a), {});
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const booked = by.booked || 0;
  const oversold = bookingDocs > capacity;
  console.log(
    `\n${label}\n` +
      `   capacity=${capacity} clients=${clients}\n` +
      `   outcomes=${JSON.stringify(by)}\n` +
      `   bookingDocs=${bookingDocs}  ${Object.entries(extra).map(([k, v]) => `${k}=${v}`).join("  ")}\n` +
      `   wall=${elapsedMs}ms  p50=${p50}ms  p95=${p95}ms\n` +
      `   VERDICT: ${oversold ? "OVERSOLD ✗" : booked === Math.min(capacity, clients) ? "CORRECT ✓" : `LOST SALES (${booked}/${Math.min(capacity, clients)}) ✗`}`
  );
  return { label, capacity, clients, by, bookingDocs, elapsedMs, p50, p95, oversold, booked };
}

async function countBookings() {
  return (await db.collection("bookings").where("sessionId", "==", SESSION).get()).size;
}

async function runCounter(capacity, clients, maxAttempts) {
  await wipe();
  await seed(capacity);
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: clients }, (_, i) => claimViaCounter(i, maxAttempts))
  );
  const wall = Date.now() - t0;
  const docs = await countBookings();
  const taken = (await db.collection("scheduledSessions").doc(SESSION).get()).data().taken;
  return summarise(
    `A) single hot counter doc      (maxAttempts=${maxAttempts})`,
    capacity, clients, results, wall, docs, { taken }
  );
}

async function runSeats(capacity, clients, maxAttempts) {
  await wipe();
  await seed(capacity);
  await seedSeats(capacity);
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: clients }, (_, i) => claimViaSeatDoc(i, capacity, maxAttempts))
  );
  const wall = Date.now() - t0;
  const docs = await countBookings();
  const seats = await db.collection("scheduledSessions").doc(SESSION).collection("seats").get();
  const claimed = seats.docs.filter((d) => d.data().claimed).length;
  return summarise(
    `B) per-seat documents          (maxAttempts=${maxAttempts})`,
    capacity, clients, results, wall, docs, { claimedSeats: claimed }
  );
}

async function main() {
  console.log("Firestore contention measurement @", process.env.FIRESTORE_EMULATOR_HOST);
  const report = [];

  report.push(await runCounter(1, 2, 5));
  report.push(await runCounter(10, 40, 5));
  report.push(await runSeats(10, 40, 5));
  report.push(await runSeats(50, 120, 5));

  console.log("\n=== SUMMARY ===");
  for (const r of report) {
    console.log(
      `${(r.oversold ? "OVERSOLD" : r.booked === Math.min(r.capacity, r.clients) ? "CORRECT " : "LOSTSALE").padEnd(9)} ` +
        `${r.label.padEnd(46)} wall=${String(r.elapsedMs).padStart(6)}ms p95=${String(r.p95).padStart(6)}ms`
    );
  }

  const fs = await import("fs/promises");
  await fs.writeFile("./test/contention-results.json", JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
