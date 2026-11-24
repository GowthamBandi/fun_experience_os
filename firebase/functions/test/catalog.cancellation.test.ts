/**
 * Organizer-set cancellation rules through the catalog callables:
 * saveExperience validation and storage (old one-word apps keep working),
 * copies onto events, the review cases' plain words and flags, and an
 * approved revision's new rules reaching upcoming events while every
 * existing booking keeps the rules it was made under.
 */

import {
  ORG, U, call, clearFirestore, db, eventInput, experienceInput, phoneCtx, rid, seedOrg, seedStandardTeam,
} from "./catalog.fixtures";
import { saveEvent, saveExperience, submitEvent, submitExperience } from "../src/catalog";
import { applyApprovedRevision } from "../src/catalog/experiences";
import { syncEventCancellation } from "../src/catalog/cancellationSync";
import { presetRules } from "../src/commerce/cancellation";

jest.setTimeout(120_000);

const owner = phoneCtx(U.owner);
const tiers = (...t: Array<[number, number]>) => t.map(([hoursBefore, refundPercent]) => ({ hoursBefore, refundPercent }));
const custom = (over: Record<string, unknown> = {}) => ({ allowed: true, cutoffHours: 24, tiers: tiers([48, 100], [24, 50]), preset: "custom", ...over });

async function errorOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    const d = (e as { details?: { code?: string; message?: string; facts?: Record<string, unknown> } }).details ?? {};
    return { code: d.code, message: d.message, facts: d.facts };
  }
  throw new Error("expected a refusal");
}

async function waitUntil(check: () => Promise<boolean>, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("condition not reached in time");
}

const doc = async (path: string) => (await db().doc(path).get()).data()!;
const withoutPolicy = (over: Record<string, unknown> = {}) => {
  const input: Record<string, unknown> = experienceInput(over);
  delete input.cancellationPolicy;
  return input;
};

async function approvedExperience(over: Record<string, unknown> = {}) {
  const r = await call(saveExperience, over.cancellation ? withoutPolicy(over) : experienceInput(over), owner);
  await db().doc(`experiences/${r.experienceId}`).update({ status: "approved" });
  return r.experienceId as string;
}

beforeEach(async () => {
  await clearFirestore();
  await seedOrg();
  await seedStandardTeam([]);
});

describe("saveExperience", () => {
  test("stores the organizer's rules and, for older apps, the preset name (custom)", async () => {
    const r = await call(saveExperience, withoutPolicy({ cancellation: custom() }), owner);
    expect(await doc(`experiences/${r.experienceId}`)).toMatchObject({ cancellation: custom(), cancellationPolicy: "custom" });
  });

  test("a picked preset is stored by name; a preset with changed rules is stored as custom", async () => {
    const a = await call(saveExperience, withoutPolicy({ cancellation: presetRules("none") }), owner);
    expect(await doc(`experiences/${a.experienceId}`)).toMatchObject({ cancellation: presetRules("none"), cancellationPolicy: "none" });
    const b = await call(saveExperience, withoutPolicy({ cancellation: { ...presetRules("strict"), cutoffHours: 6 } }), owner);
    expect(await doc(`experiences/${b.experienceId}`)).toMatchObject({ cancellationPolicy: "custom", cancellation: { preset: "custom", cutoffHours: 6 } });
  });

  test("an older app sending only the one-word policy still saves, with the preset's rules", async () => {
    const r = await call(saveExperience, experienceInput({ cancellationPolicy: "flexible" }), owner);
    expect(await doc(`experiences/${r.experienceId}`)).toMatchObject({ cancellationPolicy: "flexible", cancellation: presetRules("flexible") });
  });

  test("broken rules are refused with a plain message and facts for the form", async () => {
    expect(await errorOf(call(saveExperience, withoutPolicy({ cancellation: custom({ tiers: tiers([24, 100], [48, 50]) }) }), owner))).toEqual({
      code: "INVALID_INPUT",
      message: "Refund tiers must go from earliest to latest.",
      facts: { field: "cancellation", tier: 2 },
    });
    expect(await errorOf(call(saveExperience, withoutPolicy({ cancellation: custom({ cutoffHours: 1000 }) }), owner))).toMatchObject({
      code: "INVALID_INPUT",
      message: "The cancellation cut-off must be a whole number of hours from 0 to 720.",
      facts: { field: "cancellation" },
    });
    expect((await errorOf(call(saveExperience, experienceInput({ cancellationPolicy: "custom" }), owner))).message).toBe("Set the custom cancellation rules.");
    expect((await errorOf(call(saveExperience, experienceInput({ cancellationPolicy: "lenient" }), owner))).message).toBe("Cancellation policy is not supported.");
  });
});

describe("review cases carry the rules in plain words and the reviewer flags", () => {
  test("experience: No cancellations is flagged", async () => {
    const r = await call(saveExperience, withoutPolicy({ cancellation: presetRules("none") }), owner);
    const s = await call(submitExperience, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId: ORG, experienceId: r.experienceId }, owner);
    expect(await doc(`governanceCases/${s.caseId}`)).toMatchObject({
      cancellationSummary: "No cancellations. Once booked, a spot can't be cancelled.",
      cancellationFlags: ["no-cancellations"],
    });
  });

  test("experience: a 72-hour cut-off is flagged; an old draft with only the string submits unflagged", async () => {
    const r = await call(saveExperience, withoutPolicy({ cancellation: custom({ cutoffHours: 72, tiers: tiers([96, 100]) }) }), owner);
    const s = await call(submitExperience, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId: ORG, experienceId: r.experienceId }, owner);
    expect(await doc(`governanceCases/${s.caseId}`)).toMatchObject({
      cancellationSummary: "Full refund if you cancel 4+ days before. No refund from 4 to 3 days. No cancelling in the last 3 days.",
      cancellationFlags: ["long-cutoff"],
    });

    // A draft saved before rules existed: only the one-word preset on file.
    const old = await call(saveExperience, experienceInput({ cancellationPolicy: "strict" }), owner);
    const { FieldValue } = await import("firebase-admin/firestore");
    await db().doc(`experiences/${old.experienceId}`).update({ cancellation: FieldValue.delete() });
    const s2 = await call(submitExperience, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId: ORG, experienceId: old.experienceId }, owner);
    expect(await doc(`governanceCases/${s2.caseId}`)).toMatchObject({
      cancellationSummary: "Full refund if you cancel 7+ days before. No refund in the last 7 days.",
      cancellationFlags: [],
    });
  });

  test("experience: stored rules that went bad are refused at submit", async () => {
    const r = await call(saveExperience, withoutPolicy({ cancellation: custom() }), owner);
    await db().doc(`experiences/${r.experienceId}`).update({ "cancellation.tiers": tiers([10, 50], [20, 60]) });
    expect(await errorOf(call(submitExperience, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId: ORG, experienceId: r.experienceId }, owner))).toMatchObject({
      code: "INVALID_INPUT",
      facts: { field: "cancellation" },
    });
  });

  test("event: copies the experience's rules at save, refreshes them at submit, case flagged", async () => {
    const xId = await approvedExperience({ cancellation: custom() });
    const e = await call(saveEvent, eventInput(xId), owner);
    expect(await doc(`events/${e.eventId}`)).toMatchObject({ cancellation: custom(), cancellationPolicy: "custom" });

    // The experience's rules changed since (an approved revision): submit copies the current ones.
    await db().doc(`experiences/${xId}`).update({ cancellation: presetRules("none"), cancellationPolicy: "none" });
    const s = await call(submitEvent, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId: ORG, eventId: e.eventId }, owner);
    expect(await doc(`events/${e.eventId}`)).toMatchObject({ status: "submitted", cancellation: presetRules("none"), cancellationPolicy: "none" });
    expect(await doc(`governanceCases/${s.caseId}`)).toMatchObject({ cancellationFlags: ["no-cancellations"] });
  });

  test("event on an old experience (string only) gets the preset's rules", async () => {
    const xId = await approvedExperience({ cancellationPolicy: "moderate" });
    const { FieldValue } = await import("firebase-admin/firestore");
    await db().doc(`experiences/${xId}`).update({ cancellation: FieldValue.delete() });
    const e = await call(saveEvent, eventInput(xId), owner);
    expect(await doc(`events/${e.eventId}`)).toMatchObject({ cancellationPolicy: "moderate", cancellation: presetRules("moderate") });
  });
});

describe("an approved revision's new rules reach upcoming events; existing bookings keep theirs", () => {
  test("sync: open upcoming events move; old bookings are frozen first; frozen bookings and closed events untouched", async () => {
    const xId = await approvedExperience({ cancellationPolicy: "flexible" });
    const open = await call(saveEvent, eventInput(xId), owner);
    const closed = await call(saveEvent, eventInput(xId), owner);
    await db().doc(`events/${open.eventId}`).update({ status: "published" });
    await db().doc(`events/${closed.eventId}`).update({ status: "completed" });
    // An old booking (nothing frozen), a new one (frozen), and a cancelled one.
    await db().doc("bookings/bk-old-0001").set({ eventId: open.eventId, status: "confirmed", customerUid: U.customer });
    await db().doc("bookings/bk-new-0001").set({ eventId: open.eventId, status: "confirmed", customerUid: U.customer2, cancellation: presetRules("strict") });
    await db().doc("bookings/bk-gone-0001").set({ eventId: open.eventId, status: "cancelled", customerUid: U.customer });

    // The revision (No cancellations) is approved and merged.
    const rev = await call(saveExperience, withoutPolicy({ experienceId: xId, cancellation: presetRules("none") }), owner);
    await call(submitExperience, { agreementVersion: "ORG-EVENT-1.0", requestId: rid(), orgId: ORG, experienceId: rev.experienceId }, owner);
    await db().doc(`experiences/${rev.experienceId}`).update({ status: "approved" });
    await applyApprovedRevision(rev.experienceId).catch(() => "skipped"); // the live trigger may win
    await waitUntil(async () => (await doc(`experiences/${xId}`)).cancellationPolicy === "none");
    await syncEventCancellation(xId); // idempotent with the trigger's run

    expect(await doc(`events/${open.eventId}`)).toMatchObject({ cancellation: presetRules("none"), cancellationPolicy: "none" });
    expect(await doc(`events/${closed.eventId}`)).toMatchObject({ cancellation: presetRules("flexible") });
    expect((await doc("bookings/bk-old-0001")).cancellation).toEqual(presetRules("flexible"));
    expect((await doc("bookings/bk-new-0001")).cancellation).toEqual(presetRules("strict"));
    expect((await doc("bookings/bk-gone-0001")).cancellation).toBeUndefined();
    const audits = await db().collection("auditEvents").where("resourceId", "==", open.eventId).get();
    expect(audits.docs.filter((a) => a.data().action === "catalog.event-cancellation-synced")).toHaveLength(1);

    // Running again changes nothing.
    expect(await syncEventCancellation(xId)).toMatchObject({ eventsUpdated: [], bookingsFrozen: 0 });
  });

  test("a revision that doesn't change the rules doesn't touch events or bookings", async () => {
    const xId = await approvedExperience({ cancellationPolicy: "moderate" });
    const e = await call(saveEvent, eventInput(xId), owner);
    await db().doc(`events/${e.eventId}`).update({ status: "published" });
    await db().doc("bookings/bk-old-0002").set({ eventId: e.eventId, status: "confirmed", customerUid: U.customer });
    expect(await syncEventCancellation(xId)).toMatchObject({ eventsUpdated: [], bookingsFrozen: 0 });
    expect((await doc("bookings/bk-old-0002")).cancellation).toBeUndefined();
  });
});
