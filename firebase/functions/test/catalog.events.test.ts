import {
  ORG, OTHER_ORG, U, H, call, codeOf, messageOf, clearFirestore, db, Timestamp, seedOrg, seedStandardTeam, member,
  experienceInput, eventInput, phoneCtx, adminCtx, rid, isoIn, ALL_PERMS,
} from "./catalog.fixtures";
import {
  saveExperience, submitExperience, saveEvent, submitEvent, publishEvent, setEventResponsibility, setEventPhase,
  cancelEvent, adminCancelEvent,
} from "../src/catalog";
import { applyApprovedRevision } from "../src/catalog/experiences";
import { validateCategoryConfig } from "../src/catalog/categories";
import { EMPTY_OCCUPANCY } from "../src/domain/capacity";
import { proposeCommercialAgreement, decideCommercialAgreement } from "../src/commerce";

const owner = phoneCtx(U.owner);

async function approvedExperience(over: Record<string, unknown> = {}) {
  const r = await call(saveExperience, experienceInput(over), owner);
  await db().doc(`experiences/${r.experienceId}`).update({ status: "approved" });
  return r.experienceId as string;
}

async function draftEvent(experienceId: string, over: Record<string, unknown> = {}) {
  const r = await call(saveEvent, eventInput(experienceId, over), owner);
  return r.eventId as string;
}

async function approvedEvent(experienceId: string, over: Record<string, unknown> = {}) {
  const id = await draftEvent(experienceId, over);
  await db().doc(`events/${id}`).update({ status: "approved" });
  return id;
}

const pub = (eventId: string, ctx = owner) => call(publishEvent, { requestId: rid("pub"), orgId: ORG, eventId }, ctx);

let expId: string;

beforeEach(async () => {
  await clearFirestore();
  await seedOrg();
  await seedStandardTeam(["event-aaaa-0001"]);
  expId = await approvedExperience();
});

// ------------------------------------------------------------- experiences

describe("experiences", () => {
  test("owner creates a draft; audit + receipt written; replay is idempotent", async () => {
    const input = experienceInput();
    const a = await call(saveExperience, input, owner);
    const b = await call(saveExperience, input, owner);
    expect(a).toMatchObject({ status: "draft", replayed: false });
    expect(b).toMatchObject({ experienceId: a.experienceId, replayed: true });
    const doc = (await db().doc(`experiences/${a.experienceId}`).get()).data()!;
    expect(doc).toMatchObject({ orgId: ORG, status: "draft", category: "sports", config: { teamSize: 5, skillLevel: "all-levels" }, ratingCount: 0 });
    const audits = await db().collection("auditEvents").where("resourceId", "==", a.experienceId).get();
    expect(audits.size).toBe(1);
  });

  test("requestId reused for a different action or by another actor → CONFLICT", async () => {
    const input = experienceInput();
    await call(saveExperience, input, owner);
    expect(await codeOf(call(saveExperience, input, phoneCtx(U.manager)))).toBe("CONFLICT");
  });

  test("customer (no membership), view-only staff, revoked staff, other org owner cannot save or submit", async () => {
    await seedOrg(OTHER_ORG, U.otherOwner);
    for (const uid of [U.customer, U.viewer, U.revoked, U.otherOwner, U.leadA]) {
      expect(await codeOf(call(saveExperience, experienceInput(), phoneCtx(uid)))).toBe("NOT_PERMITTED");
    }
    const draft = await call(saveExperience, experienceInput(), owner);
    for (const uid of [U.customer, U.viewer, U.revoked]) {
      expect(await codeOf(call(submitExperience, { requestId: rid(), orgId: ORG, experienceId: draft.experienceId }, phoneCtx(uid)))).toBe("NOT_PERMITTED");
    }
  });

  test("non-phone (anonymous / email) sign-in is refused", async () => {
    expect(await codeOf(call(saveExperience, experienceInput(), { auth: { uid: U.owner, token: {} } }))).toBe("NOT_PERMITTED");
    expect(await codeOf(call(saveExperience, experienceInput(), {}))).toBe("NOT_AUTHENTICATED");
  });

  test("submit creates an experience-approval governance case with derived risk", async () => {
    const d = await call(saveExperience, experienceInput({ category: "trips", idRequired: true, config: { pickupPoint: "Ameerpet metro", overnight: true } }), owner);
    const s = await call(submitExperience, { requestId: rid(), orgId: ORG, experienceId: d.experienceId }, phoneCtx(U.manager));
    expect(s.status).toBe("submitted");
    const c = (await db().doc(`governanceCases/${s.caseId}`).get()).data()!;
    expect(c).toMatchObject({
      kind: "experience-approval", targetId: d.experienceId, targetCollection: "experiences", subject: "Sunday 5-a-side Football",
      orgId: ORG, status: "pending", version: 0, policyVersion: "EXPERIENCE-1.0", risk: "high",
    });
    // submitted is locked
    expect(await codeOf(call(saveExperience, experienceInput({ experienceId: d.experienceId }), owner))).toBe("PRECONDITION");
    const low = await call(saveExperience, experienceInput({ safety: { level: "low", measures: [] } }), owner);
    const s2 = await call(submitExperience, { requestId: rid(), orgId: ORG, experienceId: low.experienceId }, owner);
    expect((await db().doc(`governanceCases/${s2.caseId}`).get()).data()!.risk).toBe("low");
  });

  test("editing an approved experience creates a revision; the approved doc is untouched until re-approval", async () => {
    const before = (await db().doc(`experiences/${expId}`).get()).data()!;
    const r = await call(saveExperience, experienceInput({ experienceId: expId, title: "Sunday Football v2" }), owner);
    expect(r.experienceId).not.toBe(expId);
    expect(r.previousVersionId).toBe(expId);
    const after = (await db().doc(`experiences/${expId}`).get()).data()!;
    expect(after).toEqual(before);
    // a second save continues the same open revision
    const r2 = await call(saveExperience, experienceInput({ experienceId: expId, title: "Sunday Football v3" }), owner);
    expect(r2.experienceId).toBe(r.experienceId);
    // submitting then approving (as governance would) merges into the original id
    await call(submitExperience, { requestId: rid(), orgId: ORG, experienceId: r.experienceId }, owner);
    expect(await codeOf(call(saveExperience, experienceInput({ experienceId: expId }), owner))).toBe("PRECONDITION");
    await db().doc(`experiences/${r.experienceId}`).update({ status: "approved" });
    expect(await applyApprovedRevision(r.experienceId)).toBe("merged");
    expect(await applyApprovedRevision(r.experienceId)).toBe("skipped");
    const merged = (await db().doc(`experiences/${expId}`).get()).data()!;
    expect(merged).toMatchObject({ title: "Sunday Football v3", status: "approved", lastRevisionId: r.experienceId });
    expect((await db().doc(`experiences/${r.experienceId}`).get()).data()).toMatchObject({ status: "archived", mergedInto: expId });
  });

  test("category config: unknown field rejected; required field enforced; movies A forces 18+; overnight trips need ID", async () => {
    expect(await messageOf(call(saveExperience, experienceInput({ config: { teamSize: 5, ownerPhone: "x" } }), owner))).toMatch(/ownerPhone/);
    expect(await codeOf(call(saveExperience, experienceInput({ config: { teamSize: 5.5 } }), owner))).toBe("INVALID_INPUT");
    expect(await codeOf(call(saveExperience, experienceInput({ config: { skillLevel: "pro" } }), owner))).toBe("INVALID_INPUT");
    expect(await codeOf(call(saveExperience, experienceInput({ category: "trips", config: { overnight: false } }), owner))).toBe("INVALID_INPUT");
    expect(await messageOf(call(saveExperience, experienceInput({ category: "movies", ageMin: 16, config: { certificate: "A" } }), owner))).toMatch(/18/);
    expect(await codeOf(call(saveExperience, experienceInput({ category: "movies", ageMin: 18, config: { certificate: "A", language: "Telugu" } }), owner))).toBe("RESOLVED");
    expect(await codeOf(call(saveExperience, experienceInput({ category: "trips", idRequired: false, config: { pickupPoint: "Ameerpet", overnight: true } }), owner))).toBe("INVALID_INPUT");
    expect(await codeOf(call(saveExperience, experienceInput({ category: "spaceflight" }), owner))).toBe("INVALID_INPUT");
    expect(await codeOf(call(saveExperience, experienceInput({ genderRule: "members-only" }), owner))).toBe("INVALID_INPUT");
    expect(await codeOf(call(saveExperience, experienceInput({ ageMin: 10 }), owner))).toBe("INVALID_INPUT");
    expect(await codeOf(call(saveExperience, experienceInput({ mediaPaths: [`orgMedia/${OTHER_ORG}/x.jpg`] }), owner))).toBe("INVALID_INPUT");
    expect(await codeOf(call(saveExperience, experienceInput({ mediaPaths: [`orgMedia/${ORG}/../kyc/x.jpg`] }), owner))).toBe("INVALID_INPUT");
    // registry is data: every category validates an empty-but-valid config generically
    expect(validateCategoryConfig("workshops", { materialsIncluded: true }, { ageMin: 13, ageMax: null, idRequired: false, genderRule: "open" })).toEqual({ materialsIncluded: true });
  });
});

// ------------------------------------------------------------------ events

describe("events", () => {
  test("saveEvent writes the canonical event shape", async () => {
    const id = await draftEvent(expId, { capacity: { max: 20, min: 6, blocked: 2 }, staffUids: [U.checkin] });
    const ev = (await db().doc(`events/${id}`).get()).data()!;
    expect(ev).toMatchObject({
      orgId: ORG, experienceId: expId, status: "draft", title: "Sunday 5-a-side Football", name: "Sunday 5-a-side Football",
      organizerName: `${ORG} Events`, location: "Jubilee Hills, Hyderabad", category: "sports", activity: "Football",
      venue: { name: "Turf Arena", area: "Jubilee Hills", city: "Hyderabad", address: "Road 36, Jubilee Hills" },
      capacity: { maxPhysicalCapacity: 20, blockedSlots: 2, compSlots: 0, minParticipants: 6, targetParticipants: 18 },
      occupancy: EMPTY_OCCUPANCY, priceMinor: 49_900, currency: "INR",
      eligibility: { ageMin: 16, ageMax: null, genderRule: "open" }, cancellationPolicy: "moderate",
      responsibility: { primaryUid: U.owner, staffUids: [U.checkin] }, version: 1, createdBy: U.owner,
    });
    expect(ev).not.toHaveProperty("commissionBps");
    expect(ev.startsAt).toBeInstanceOf(Timestamp);
    expect(ev.endsAt.toMillis() - ev.startsAt.toMillis()).toBe(90 * 60_000);
    expect(ev.createdAt).toBeInstanceOf(Timestamp);
    expect(ev.updatedAt).toBeInstanceOf(Timestamp);
  });

  test("input validation: lead time, duration, capacity, price, currency, experience status/org", async () => {
    const bad = [
      { startsAt: isoIn(60 * 60_000) },
      { startsAt: "2026-10-10 10:00" },
      { durationMinutes: 10 },
      { durationMinutes: 14 * 24 * 60 + 1 },
      { capacity: { max: 5001, min: 1 } },
      { capacity: { max: 10, min: 11 } },
      { capacity: { max: 0, min: 0 } },
      { priceMinor: 10_000_001 },
      { priceMinor: 99.5 },
      { priceMinor: -1 },
      { currency: "USD" },
      { venue: { name: "X", area: "Area", city: "City", address: "Somewhere 1" } },
    ];
    for (const over of bad) expect([over, await codeOf(call(saveEvent, eventInput(expId, over), owner))]).toEqual([over, "INVALID_INPUT"]);
    const draftExp = (await call(saveExperience, experienceInput(), owner)).experienceId;
    expect(await codeOf(call(saveEvent, eventInput(draftExp), owner))).toBe("PRECONDITION");
    await seedOrg(OTHER_ORG, U.otherOwner);
    const foreign = (await call(saveExperience, experienceInput({ orgId: OTHER_ORG }), phoneCtx(U.otherOwner))).experienceId;
    await db().doc(`experiences/${foreign}`).update({ status: "approved" });
    expect(await codeOf(call(saveEvent, eventInput(foreign), owner))).toBe("NOT_FOUND");
  });

  test("arena must be approved; responsibility must be active + events.operate; staff must be active", async () => {
    await db().doc("arenas/arena-pending").set({ status: "under-review" });
    await db().doc("arenas/arena-ok").set({ status: "active", capacity: 10 });
    expect(await codeOf(call(saveEvent, eventInput(expId, { arenaId: "arena-pending" }), owner))).toBe("PRECONDITION");
    expect(await codeOf(call(saveEvent, eventInput(expId, { arenaId: "arena-ok" }), owner))).toBe("PRECONDITION"); // over arena capacity
    expect(await codeOf(call(saveEvent, eventInput(expId, { arenaId: "arena-ok", capacity: { max: 10, min: 2 } }), owner))).toBe("RESOLVED");
    expect(await codeOf(call(saveEvent, eventInput(expId, { primaryUid: U.checkin }), owner))).toBe("PRECONDITION");
    expect(await codeOf(call(saveEvent, eventInput(expId, { primaryUid: U.revoked }), owner))).toBe("PRECONDITION");
    expect(await codeOf(call(saveEvent, eventInput(expId, { primaryUid: U.customer }), owner))).toBe("PRECONDITION");
    expect(await codeOf(call(saveEvent, eventInput(expId, { primaryUid: U.manager }), owner))).toBe("RESOLVED");
    expect(await codeOf(call(saveEvent, eventInput(expId, { staffUids: [U.revoked] }), owner))).toBe("PRECONDITION");
    expect(await codeOf(call(saveEvent, eventInput(expId, { staffUids: [U.customer] }), owner))).toBe("PRECONDITION");
  });

  test("permissions: customer denied; staff without events.edit denied; staff scoped to A cannot edit B or create", async () => {
    const eventA = "event-aaaa-0001";
    // seed event A with the id in lead's scope
    const b = await draftEvent(expId);
    const aData = (await db().doc(`events/${b}`).get()).data()!;
    await db().doc(`events/${eventA}`).set({ ...aData });
    expect(await codeOf(call(saveEvent, eventInput(expId), phoneCtx(U.customer)))).toBe("NOT_PERMITTED");
    expect(await codeOf(call(saveEvent, eventInput(expId, { eventId: b }), phoneCtx(U.viewer)))).toBe("NOT_PERMITTED");
    expect(await codeOf(call(saveEvent, eventInput(expId, { eventId: b }), phoneCtx(U.revoked)))).toBe("NOT_PERMITTED");
    expect(await codeOf(call(saveEvent, eventInput(expId, { eventId: b }), phoneCtx(U.leadA)))).toBe("NOT_PERMITTED");
    expect(await codeOf(call(saveEvent, eventInput(expId), phoneCtx(U.leadA)))).toBe("NOT_PERMITTED"); // can't create new
    expect(await codeOf(call(saveEvent, eventInput(expId, { eventId: eventA, priceMinor: 100 }), phoneCtx(U.leadA)))).toBe("RESOLVED");
    expect(await codeOf(call(submitEvent, { requestId: rid(), orgId: ORG, eventId: b }, phoneCtx(U.leadA)))).toBe("NOT_PERMITTED");
    expect(await codeOf(call(submitEvent, { requestId: rid(), orgId: ORG, eventId: eventA }, phoneCtx(U.leadA)))).toBe("RESOLVED");
    // cross-org: an owner of another org can't touch this org's event even naming their own org
    await seedOrg(OTHER_ORG, U.otherOwner);
    expect(await codeOf(call(saveEvent, eventInput(expId, { orgId: OTHER_ORG, eventId: b }), phoneCtx(U.otherOwner)))).toBe("NOT_FOUND");
  });

  test("submitEvent creates an event-approval case; submitted is locked", async () => {
    const id = await draftEvent(expId);
    const s = await call(submitEvent, { requestId: rid(), orgId: ORG, eventId: id }, owner);
    const c = (await db().doc(`governanceCases/${s.caseId}`).get()).data()!;
    expect(c).toMatchObject({ kind: "event-approval", targetId: id, targetCollection: "events", orgId: ORG, status: "pending", version: 0, subject: "Sunday 5-a-side Football", projectedGmvMinor: 49_900 * 20 });
    expect(await codeOf(call(saveEvent, eventInput(expId, { eventId: id }), owner))).toBe("PRECONDITION");
    expect(await codeOf(call(submitEvent, { requestId: rid(), orgId: ORG, eventId: id }, owner))).toBe("PRECONDITION");
  });

  test("publish happy path snapshots commissionBps and agreement id", async () => {
    const id = await approvedEvent(expId);
    const r = await pub(id);
    expect(r).toMatchObject({ status: "published", commissionBps: 1200 });
    const ev = (await db().doc(`events/${id}`).get()).data()!;
    expect(ev).toMatchObject({ status: "published" });
    // commission terms are private: never on the public event document
    expect(ev).not.toHaveProperty("commissionBps");
    expect(ev).not.toHaveProperty("commercialAgreementId");
    expect((await db().doc(`eventCommercials/${id}`).get()).data()).toMatchObject({ orgId: ORG, eventId: id, commissionBps: 1200, commercialAgreementId: `ca-${ORG}` });
    expect(ev.publishedAt).toBeInstanceOf(Timestamp);
    // agreement change later does not rewrite the event
    await db().doc(`commercialAgreements/ca-${ORG}`).update({ commissionBps: 2000 });
    expect((await db().doc(`eventCommercials/${id}`).get()).data()!.commissionBps).toBe(1200);
    expect(await codeOf(pub(id))).toBe("PRECONDITION"); // already published
  });

  test("commercial terms: proposed by one admin, approved by another, supersede the old version and unlock publish", async () => {
    await db().doc(`commercialAgreements/ca-${ORG}`).delete();
    const e1 = await approvedEvent(expId);
    expect(await messageOf(pub(e1))).toMatch(/commercial terms/);

    const propose = (ctx: unknown, over: Record<string, unknown> = {}) =>
      call(proposeCommercialAgreement, { requestId: rid("ca"), orgId: ORG, commissionBps: 1500, payoutCadence: "weekly", note: "Signed MSA v3", ...over }, ctx);
    const decide = (agreementId: string, action: string, ctx: unknown) =>
      call(decideCommercialAgreement, { requestId: rid("cad"), agreementId, action, note: "Checked against MSA" }, ctx);

    // organizers and non-admins can't touch terms
    expect(await codeOf(propose(owner))).toBe("NOT_PERMITTED");
    expect(await codeOf(propose(adminCtx("admin-a"), { commissionBps: 6000 }))).toBe("INVALID_INPUT");
    expect(await codeOf(propose(adminCtx("admin-a"), { orgId: "org-missing" }))).toBe("NOT_FOUND");

    const first = await propose(adminCtx("admin-a"));
    expect(first.status).toBe("pending-approval");
    expect(await messageOf(pub(e1))).toMatch(/commercial terms/); // pending terms don't count
    expect(await codeOf(decide(first.agreementId, "approve", adminCtx("admin-a")))).toBe("NOT_PERMITTED"); // dual control
    expect(await codeOf(decide(first.agreementId, "approve", owner))).toBe("NOT_PERMITTED");
    const ok = await decide(first.agreementId, "approve", adminCtx("admin-b"));
    expect(ok).toMatchObject({ status: "approved", supersededId: null });
    expect(await codeOf(decide(first.agreementId, "reject", adminCtx("admin-c")))).toBe("PRECONDITION"); // already decided

    expect(await pub(e1)).toMatchObject({ status: "published", commissionBps: 1500 });

    // a new version supersedes the old one; only one approved agreement per organizer
    const second = await propose(adminCtx("admin-b"), { commissionBps: 1000 });
    const ok2 = await decide(second.agreementId, "approve", adminCtx("admin-a"));
    expect(ok2).toMatchObject({ status: "approved", supersededId: first.agreementId });
    const approved = await db().collection("commercialAgreements").where("orgId", "==", ORG).where("status", "==", "approved").get();
    expect(approved.docs.map((d) => d.id)).toEqual([second.agreementId]);
    expect((await db().doc(`eventCommercials/${e1}`).get()).data()!.commissionBps).toBe(1500); // history unchanged
    const e2 = await approvedEvent(expId);
    expect(await pub(e2)).toMatchObject({ commissionBps: 1000 });

    const audits = await db().collection("auditEvents").where("resourceId", "==", second.agreementId).get();
    expect(audits.docs.map((d) => d.data().action).sort()).toEqual(["commercial-agreement.approved", "commercial-agreement.proposed"]);
  });

  test("publish refused: not approved / experience not approved / organizer paused / no agreement / primary revoked / primary lacks operate / start passed / no permission", async () => {
    const draft = await draftEvent(expId);
    expect(await codeOf(pub(draft))).toBe("PRECONDITION");

    const e1 = await approvedEvent(expId);
    expect(await codeOf(pub(e1, phoneCtx(U.customer)))).toBe("NOT_PERMITTED");
    expect(await codeOf(pub(e1, phoneCtx(U.viewer)))).toBe("NOT_PERMITTED");
    expect(await codeOf(pub(e1, phoneCtx(U.leadA)))).toBe("NOT_PERMITTED"); // out of scope

    await db().doc(`experiences/${expId}`).update({ status: "submitted" });
    expect(await messageOf(pub(e1))).toMatch(/experience/i);
    await db().doc(`experiences/${expId}`).update({ status: "approved" });

    await db().doc(`organizers/${ORG}`).update({ status: "paused" });
    expect(await messageOf(pub(e1))).toMatch(/isn't active/);
    await db().doc(`organizers/${ORG}`).update({ status: "active" });

    await db().doc(`commercialAgreements/ca-${ORG}`).update({ status: "pending" });
    expect(await messageOf(pub(e1))).toMatch(/commercial terms/);
    await db().doc(`commercialAgreements/ca-other`).set({ orgId: OTHER_ORG, status: "approved", commissionBps: 500 });
    expect(await messageOf(pub(e1))).toMatch(/commercial terms/); // another org's agreement doesn't count
    await db().doc(`commercialAgreements/ca-${ORG}`).update({ status: "approved" });

    const e2 = await approvedEvent(expId, { primaryUid: U.manager });
    await member(ORG, U.manager, { permissions: ALL_PERMS, scope: "all", status: "revoked" });
    expect(await messageOf(pub(e2))).toMatch(/responsible/);
    await member(ORG, U.manager, { permissions: ALL_PERMS.filter((p) => p !== "events.operate"), scope: "all" });
    expect(await messageOf(pub(e2))).toMatch(/responsible/);
    await member(ORG, U.manager, { permissions: ALL_PERMS, scope: "all" });
    expect(await codeOf(pub(e2))).toBe("RESOLVED");

    await db().doc(`events/${e1}`).update({ startsAt: Timestamp.fromMillis(Date.now() - H), endsAt: Timestamp.fromMillis(Date.now() + H) });
    expect(await messageOf(pub(e1))).toMatch(/passed/);
    expect((await db().doc(`events/${e1}`).get()).data()!.status).toBe("approved");
  });

  test("post-publish edits: price/time/venue refused once bookings exist; capacity allowed not below taken; unbooked terms change unpublishes", async () => {
    const id = await approvedEvent(expId);
    await pub(id);
    const base = eventInput(expId, { eventId: id });
    const ev = (await db().doc(`events/${id}`).get()).data()!;
    const same = { ...base, startsAt: ev.startsAt.toDate().toISOString() };

    // booking exists (commerce's shape): refused with a cancel+recreate hint
    await db().doc("bookings/bk-0001").set({ eventId: id, orgId: ORG, customerUid: U.customer, status: "confirmed", spots: 2 });
    await db().doc(`events/${id}`).update({ "occupancy.confirmedPaidBookings": 2 });
    for (const over of [{ priceMinor: 59_900 }, { startsAt: isoIn(96 * H) }, { venue: { ...base.venue, name: "Other Turf" } }, { durationMinutes: 120 }]) {
      const p = call(saveEvent, { ...same, requestId: rid(), ...over }, owner);
      const msg = await messageOf(p);
      expect(msg).toMatch(/already booked/);
    }
    const err = await call(saveEvent, { ...same, requestId: rid(), priceMinor: 1 }, owner).catch((e) => e);
    expect(err.details.nextStep).toMatch(/Cancel this event/);
    // capacity change: allowed, but not below seats taken
    expect(await codeOf(call(saveEvent, { ...same, requestId: rid(), capacity: { max: 30, min: 6 } }, owner))).toBe("RESOLVED");
    expect((await db().doc(`events/${id}`).get()).data()).toMatchObject({ status: "published", capacity: { maxPhysicalCapacity: 30 } });
    expect((await db().doc(`eventCommercials/${id}`).get()).data()!.commissionBps).toBe(1200);
    expect(await codeOf(call(saveEvent, { ...same, requestId: rid(), capacity: { max: 2, min: 1, blocked: 1 } }, owner))).toBe("PRECONDITION");

    // a published event with NO bookings: changing price un-publishes it for re-approval
    const id2 = await approvedEvent(expId);
    await pub(id2);
    const ev2 = (await db().doc(`events/${id2}`).get()).data()!;
    const r = await call(saveEvent, { ...eventInput(expId, { eventId: id2 }), startsAt: ev2.startsAt.toDate().toISOString(), priceMinor: 10_000 }, owner);
    expect(r.status).toBe("draft");
    expect((await db().doc(`events/${id2}`).get()).data()).toMatchObject({ status: "draft", publishedAt: null, priceMinor: 10_000 });
    expect((await db().doc(`eventCommercials/${id2}`).get()).exists).toBe(false); // snapshot dropped until re-published
  });

  test("setEventResponsibility enforces the invariant and scope", async () => {
    const id = await approvedEvent(expId);
    await pub(id);
    const set = (primaryUid: string, ctx = owner, staffUids: string[] = []) =>
      call(setEventResponsibility, { requestId: rid(), orgId: ORG, eventId: id, primaryUid, staffUids }, ctx);
    expect(await codeOf(set(U.checkin))).toBe("PRECONDITION");
    expect(await codeOf(set(U.revoked))).toBe("PRECONDITION");
    expect(await codeOf(set(U.manager, phoneCtx(U.viewer)))).toBe("NOT_PERMITTED");
    expect(await codeOf(set(U.manager, owner, [U.checkin, U.checkin]))).toBe("RESOLVED");
    expect((await db().doc(`events/${id}`).get()).data()!.responsibility).toEqual({ primaryUid: U.manager, staffUids: [U.checkin] });
  });

  test("setEventPhase moves forward only; completed requires the start to have passed; needs events.operate", async () => {
    const id = await approvedEvent(expId);
    await pub(id);
    const phase = (p: string, ctx = owner) => call(setEventPhase, { requestId: rid(), orgId: ORG, eventId: id, phase: p }, ctx);
    expect(await codeOf(phase("booking-closed", phoneCtx(U.checkin)))).toBe("NOT_PERMITTED");
    expect(await codeOf(phase("published"))).toBe("INVALID_INPUT");
    expect(await codeOf(phase("live"))).toBe("PRECONDITION"); // 72h before start
    expect(await codeOf(phase("completed"))).toBe("PRECONDITION");
    expect(await codeOf(phase("booking-closed"))).toBe("RESOLVED");
    expect(await codeOf(phase("booking-closed"))).toBe("PRECONDITION"); // not forward
    await db().doc(`events/${id}`).update({ startsAt: Timestamp.fromMillis(Date.now() - H) });
    expect(await codeOf(phase("live"))).toBe("RESOLVED");
    expect(await codeOf(phase("booking-closed"))).toBe("PRECONDITION"); // backwards
    expect(await codeOf(phase("completed"))).toBe("RESOLVED");
    expect(await codeOf(phase("live"))).toBe("PRECONDITION");
    const draft = await draftEvent(expId);
    expect(await codeOf(call(setEventPhase, { requestId: rid(), orgId: ORG, eventId: draft, phase: "live" }, owner))).toBe("PRECONDITION");
  });

  test("cancelEvent requires a ≥10-char reason and events.cancel in scope; admin path via adminCancelEvent", async () => {
    const id = await approvedEvent(expId);
    await pub(id);
    const cancel = (reason: unknown, ctx = owner) => call(cancelEvent, { requestId: rid(), orgId: ORG, eventId: id, reason }, ctx);
    expect(await codeOf(cancel(undefined))).toBe("INVALID_INPUT");
    expect(await codeOf(cancel("rain"))).toBe("INVALID_INPUT");
    expect(await codeOf(cancel("Heavy rain forecast", phoneCtx(U.leadA)))).toBe("NOT_PERMITTED");
    expect(await codeOf(cancel("Heavy rain forecast", phoneCtx(U.customer)))).toBe("NOT_PERMITTED");
    expect(await codeOf(cancel("Heavy rain forecast", phoneCtx(U.viewer)))).toBe("NOT_PERMITTED");
    const r = await cancel("Heavy rain forecast for Sunday");
    expect(r.status).toBe("cancelled");
    const ev = (await db().doc(`events/${id}`).get()).data()!;
    expect(ev).toMatchObject({ status: "cancelled", cancelledBy: U.owner, cancelReason: "Heavy rain forecast for Sunday", cancelledByRole: "organizer" });
    expect(ev.cancelledAt).toBeInstanceOf(Timestamp);
    expect(await codeOf(cancel("Heavy rain forecast again"))).toBe("PRECONDITION");

    // admin cancel: phone users (even owners) can't use it; admins can
    const id2 = await approvedEvent(expId);
    const adminCancel = (ctx: unknown, reason = "Venue safety certificate revoked") =>
      call(adminCancelEvent, { requestId: rid(), eventId: id2, reason }, ctx);
    expect(await codeOf(adminCancel(owner))).toBe("NOT_PERMITTED");
    expect(await codeOf(adminCancel({ auth: { uid: "aud", token: { email_verified: true, roleId: "auditor" } } }))).toBe("NOT_PERMITTED");
    expect(await codeOf(adminCancel(adminCtx(), "short"))).toBe("INVALID_INPUT");
    expect((await adminCancel(adminCtx())).status).toBe("cancelled");
    expect((await db().doc(`events/${id2}`).get()).data()).toMatchObject({ cancelledByRole: "admin", cancelledBy: "admin-0001" });
  });

  test("cancelling a submitted event also closes its pending governance case", async () => {
    const id = await draftEvent(expId);
    const s = await call(submitEvent, { requestId: rid(), orgId: ORG, eventId: id }, owner);
    await call(cancelEvent, { requestId: rid(), orgId: ORG, eventId: id, reason: "Changed our plans entirely" }, owner);
    expect((await db().doc(`governanceCases/${s.caseId}`).get()).data()!.status).toBe("cancelled");
  });

  test("every mutation is audited", async () => {
    const id = await approvedEvent(expId);
    await pub(id);
    const actions = (await db().collection("auditEvents").where("resourceId", "==", id).get()).docs.map((d) => d.data().action);
    expect(actions).toEqual(expect.arrayContaining(["catalog.event-saved", "catalog.event-published"]));
  });
});
