/**
 * ATTACK SUITE — every attempt must fail with the right business error and
 * leave no side effects. Real callables, emulator Firestore, no mocks.
 *
 * World (built once through the real onboarding/approval journeys):
 *   org A: owner, check-in staff (scope evA1), manager (staff.manage, all)
 *          evA1 (30 places), evA2, evSmall (5 places), evBig (₹20,000)
 *   org B: owner, staff; evB1 published, evB2 approved (unpublished)
 *   org C: no commercial agreement; evC1 approved (unpublished)
 */

import { randomBytes } from "node:crypto";
import { ticketSignature } from "../src/commerce/tickets";
import { paymentSignature } from "../src/commerce/provider";
import {
  H, RUN, adminA, adminB, adminCtx, approveCase, approvedExperience, bookAndPay, call, callCode, capturedEvent, catalog,
  codeOf, commerce, completeEvent, completeProfile, customer, decideCase, deliverWebhook, docsWhere, dumpCollections,
  eventInput, fakePayId, fingerprint, getDoc, hireStaff, identity, issuedCodes, ledgerFor, onboardOrganizer, order,
  organizerCaseIdFor, organizerWorld, person, phoneCtxFor, reserve, rid, scan, setMarketplaceEntityStatus,
  sideEffectCounts, ticketPayloads, uniquePhone, applyAsOrganizer, db, Timestamp, type Person,
} from "./e2e-helpers";

jest.setTimeout(300_000);

interface World {
  A: { owner: Person; orgId: string; experienceId: string; evA1: string; evA2: string; evSmall: string; evBig: string };
  B: { owner: Person; orgId: string; experienceId: string; evB1: string; evB2: string };
  C: { owner: Person; orgId: string; evC1: string };
  checkin: Person;
  manager: Person;
  staffB: Person;
  staffInviteId: string;
  bookingB: { bookingId: string; ticketIds: string[] };
  bookingA: { bookingId: string; ticketIds: string[] };
}
let W: World;

const ALL_PERMS = [
  "experiences.view", "experiences.edit", "experiences.submit", "events.view", "events.edit", "events.submit", "events.publish",
  "events.operate", "events.cancel", "attendees.view", "tickets.scan", "reviews.view", "reviews.respond", "refunds.view",
  "refunds.request", "earnings.view", "staff.manage",
];

async function approvedUnpublishedEvent(owner: Person, orgId: string, experienceId: string) {
  const saved = await call(catalog.saveEvent, eventInput(orgId, experienceId, owner.uid), owner.ctx);
  const sub = await call(catalog.submitEvent, { requestId: rid("se"), orgId, eventId: saved.eventId }, owner.ctx);
  await approveCase(String(sub.caseId));
  return String(saved.eventId);
}

beforeAll(async () => {
  const t0 = Date.now();
  const a = await organizerWorld("atkA", [{ capacity: { max: 30, min: 2 } }, {}, { capacity: { max: 5, min: 1 } }, { priceMinor: 2_000_000 }]);
  const b = await organizerWorld("atkB", [{}]);
  const evB2 = await approvedUnpublishedEvent(b.owner, b.orgId, b.experienceId);
  const c = await onboardOrganizer("atkC");
  const expC = await approvedExperience(c.owner, c.orgId);
  const evC1 = await approvedUnpublishedEvent(c.owner, c.orgId, expC);

  const checkin = person("atk-checkin");
  const manager = person("atk-manager");
  const staffB = person("atk-staffB");
  await Promise.all([completeProfile(checkin), completeProfile(manager), completeProfile(staffB)]);
  const inv = await hireStaff(a.owner, a.orgId, checkin, ["events.view", "attendees.view", "tickets.scan"], [a.eventIds[0]!]);
  await hireStaff(a.owner, a.orgId, manager, ["staff.manage", "events.view", "tickets.scan"], "all");
  await hireStaff(b.owner, b.orgId, staffB, ["events.view", "tickets.scan"], "all");

  const custB = await customer("atk-custB");
  const bookingB = await bookAndPay(custB, b.eventIds[0]!, 1);
  const custA = await customer("atk-custA");
  const bookingA = await bookAndPay(custA, a.eventIds[0]!, 1);

  W = {
    A: { owner: a.owner, orgId: a.orgId, experienceId: a.experienceId, evA1: a.eventIds[0]!, evA2: a.eventIds[1]!, evSmall: a.eventIds[2]!, evBig: a.eventIds[3]! },
    B: { owner: b.owner, orgId: b.orgId, experienceId: b.experienceId, evB1: b.eventIds[0]!, evB2 },
    C: { owner: c.owner, orgId: c.orgId, evC1 },
    checkin, manager, staffB, staffInviteId: inv.inviteId,
    bookingB, bookingA,
  };
  console.log(`attack world built in ${Date.now() - t0} ms`);
});

/** Everything an attack against org [orgId] could touch. */
async function snapshot(orgId: string, paths: string[]) {
  return { counts: await sideEffectCounts(orgId), docs: await fingerprint(paths) };
}

describe(`E2E attacks (run ${RUN})`, () => {
  test("ATK-01 customer calling organizer / staff / admin services is refused, no side effects", async () => {
    const { A } = W;
    const cust = await customer("atk01");
    const paths = [`events/${A.evA1}`, `experiences/${A.experienceId}`, `memberships/${A.orgId}__${W.checkin.uid}`, `organizers/${A.orgId}`, `staffInvites/${W.staffInviteId}`];
    const before = await snapshot(A.orgId, paths);
    const rids: string[] = [];
    const r = (p: string) => { const x = rid(p); rids.push(x); return x; };
    const [payload] = await ticketPayloads(W.bookingA.ticketIds);
    const cases: Array<[string, unknown, Record<string, unknown>, string]> = [
      ["saveExperience", catalog.saveExperience, { requestId: r("x"), orgId: A.orgId, experienceId: A.experienceId, title: "Hijacked", tagline: "", category: "sports", activity: "Football", description: "Twenty characters minimum description.", highlights: [], format: "5-a-side", genderRule: "open", ageMin: 18, idRequired: false, rules: [], bring: [], safety: { level: "low", measures: [] }, cancellationPolicy: "flexible" }, "NOT_PERMITTED"],
      ["submitExperience", catalog.submitExperience, { requestId: r("x"), orgId: A.orgId, experienceId: A.experienceId }, "NOT_PERMITTED"],
      ["saveEvent", catalog.saveEvent, { ...eventInput(A.orgId, A.experienceId, cust.uid, { eventId: A.evA1, priceMinor: 1 }), requestId: r("x") }, "NOT_PERMITTED"],
      ["submitEvent", catalog.submitEvent, { requestId: r("x"), orgId: A.orgId, eventId: A.evA1 }, "NOT_PERMITTED"],
      ["publishEvent", catalog.publishEvent, { requestId: r("x"), orgId: A.orgId, eventId: A.evA1 }, "NOT_PERMITTED"],
      ["setEventPhase", catalog.setEventPhase, { requestId: r("x"), orgId: A.orgId, eventId: A.evA1, phase: "booking-closed" }, "NOT_PERMITTED"],
      ["setEventResponsibility", catalog.setEventResponsibility, { requestId: r("x"), orgId: A.orgId, eventId: A.evA1, primaryUid: cust.uid }, "NOT_PERMITTED"],
      ["cancelEvent", catalog.cancelEvent, { requestId: r("x"), orgId: A.orgId, eventId: A.evA1, reason: "I want my money back" }, "NOT_PERMITTED"],
      ["inviteStaff", identity.inviteStaff, { requestId: r("x"), orgId: A.orgId, phone: uniquePhone(), title: "Me", permissions: ALL_PERMS, eventScope: "all" }, "NOT_PERMITTED"],
      ["listStaff", identity.listStaff, { orgId: A.orgId }, "NOT_PERMITTED"],
      ["updateStaff", identity.updateStaff, { requestId: r("x"), orgId: A.orgId, uid: W.checkin.uid, permissions: ["events.view"] }, "NOT_PERMITTED"],
      ["revokeStaff", identity.revokeStaff, { requestId: r("x"), orgId: A.orgId, uid: W.checkin.uid, reason: "no reason" }, "NOT_PERMITTED"],
      ["reissueStaffCode", identity.reissueStaffCode, { requestId: r("x"), orgId: A.orgId, inviteId: W.staffInviteId }, "NOT_PERMITTED"],
      ["scanTicket", commerce.scanTicket, { requestId: r("x"), eventId: A.evA1, payload }, "NOT_PERMITTED"],
      ["checkInManually", commerce.checkInManually, { requestId: r("x"), eventId: A.evA1, ticketId: W.bookingA.ticketIds[0], reason: "letting myself in" }, "NOT_PERMITTED"],
      ["listEventAttendees", commerce.listEventAttendees, { orgId: A.orgId, eventId: A.evA1 }, "NOT_PERMITTED"],
      ["requestRefund", commerce.requestRefund, { requestId: r("x"), orgId: A.orgId, bookingId: W.bookingA.bookingId, amountMinor: 100, reason: "gimme" }, "NOT_PERMITTED"],
      // Admin-only (console) services with a phone identity.
      ["decideCase", decideCase, { requestId: r("x"), caseId: organizerCaseIdFor(cust.uid), expectedVersion: 0, outcome: "approved", note: "" }, "NOT_PERMITTED"],
      ["setMarketplaceEntityStatus", setMarketplaceEntityStatus, { requestId: r("x"), entityType: "organizer", entityId: A.orgId, expectedVersion: 0, status: "blocked", reason: "hostile takeover attempt" }, "NOT_PERMITTED"],
      ["reissueOrganizerCode", identity.reissueOrganizerCode, { requestId: r("x"), applicantUid: A.owner.uid, reason: "please give me the code" }, "NOT_PERMITTED"],
      ["decideRefund", commerce.decideRefund, { requestId: r("x"), refundId: "evc_anything", decision: "approve", note: "approve" }, "NOT_PERMITTED"],
      ["buildSettlement", commerce.buildSettlement, { requestId: r("x"), orgId: A.orgId, periodEnd: new Date(Date.now() - 1000).toISOString() }, "NOT_PERMITTED"],
      ["decideSettlement", commerce.decideSettlement, { requestId: r("x"), settlementId: `stl_${A.orgId}_x`, action: "mark-paid", note: "paid", payoutReference: "UTR1234" }, "NOT_PERMITTED"],
      ["adminCancelEvent", catalog.adminCancelEvent, { requestId: r("x"), eventId: A.evA1, reason: "emergency cancellation" }, "NOT_PERMITTED"],
      ["moderateReview", catalog.moderateReview, { requestId: r("x"), reviewId: `${A.evA1}__${cust.uid}`, status: "hidden", reason: "spam spam" }, "NOT_PERMITTED"],
    ];
    const got: Record<string, string> = {};
    for (const [name, fn, data] of cases) got[name] = await callCode(fn, data, cust.ctx);
    expect(got).toEqual(Object.fromEntries(cases.map(([n, , , e]) => [n, e])));

    // Forged console claims on a phone identity don't open the console either.
    const spoof = { auth: { uid: cust.uid, token: { phone_number: cust.phone, roleId: "super-admin" } }, rawRequest: {} } as never;
    expect(await callCode(decideCase, { requestId: r("x"), caseId: organizerCaseIdFor(cust.uid), expectedVersion: 0, outcome: "approved", note: "" }, spoof)).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.buildSettlement, { requestId: r("x"), orgId: A.orgId, periodEnd: new Date(Date.now() - 1000).toISOString() }, spoof)).toBe("NOT_PERMITTED");
    // An auditor (read-only console role) can't decide money either.
    expect(await callCode(commerce.decideSettlement, { requestId: r("x"), settlementId: `stl_${A.orgId}_x`, action: "approve", note: "approve" }, adminCtx(`auditor-${RUN}`, "auditor"))).toBe("NOT_PERMITTED");
    // Anonymous.
    expect(await callCode(catalog.publishEvent, { requestId: r("x"), orgId: A.orgId, eventId: A.evA1 }, { rawRequest: {} })).toBe("NOT_AUTHENTICATED");

    expect(await snapshot(A.orgId, paths)).toEqual(before);
    const receipts = await db().collection("commandReceipts").get();
    expect(receipts.docs.filter((d) => rids.some((x) => d.id.includes(x)))).toHaveLength(0);
  });

  test("ATK-02 organizer A acting on organizer B's event / experience / staff is refused, no side effects", async () => {
    const { A, B } = W;
    const own = A.owner.ctx;
    const [bPayload] = await ticketPayloads(W.bookingB.ticketIds);
    const paths = [`events/${B.evB1}`, `events/${B.evB2}`, `experiences/${B.experienceId}`, `memberships/${B.orgId}__${W.staffB.uid}`, `tickets/${W.bookingB.ticketIds[0]}`];
    const beforeB = await snapshot(B.orgId, paths);
    const beforeA = await sideEffectCounts(A.orgId);
    const got = {
      saveEventInB: await callCode(catalog.saveEvent, eventInput(B.orgId, B.experienceId, A.owner.uid), own),
      editBEventViaA: await callCode(catalog.saveEvent, eventInput(A.orgId, A.experienceId, A.owner.uid, { eventId: B.evB1 }), own),
      scheduleOnBExperience: await callCode(catalog.saveEvent, eventInput(A.orgId, B.experienceId, A.owner.uid), own),
      editBExperienceViaA: await callCode(catalog.saveExperience, { requestId: rid("x"), orgId: A.orgId, experienceId: B.experienceId, title: "Stolen", category: "sports", activity: "Football", description: "Twenty characters minimum description.", format: "5v5", genderRule: "open", ageMin: 18, idRequired: false, safety: { level: "low", measures: [] }, cancellationPolicy: "strict" }, own),
      submitBExperienceViaA: await callCode(catalog.submitExperience, { requestId: rid("x"), orgId: A.orgId, experienceId: B.experienceId }, own),
      publishInB: await callCode(catalog.publishEvent, { requestId: rid("x"), orgId: B.orgId, eventId: B.evB2 }, own),
      publishBViaA: await callCode(catalog.publishEvent, { requestId: rid("x"), orgId: A.orgId, eventId: B.evB2 }, own),
      cancelInB: await callCode(catalog.cancelEvent, { requestId: rid("x"), orgId: B.orgId, eventId: B.evB1, reason: "sabotage the competitor" }, own),
      cancelBViaA: await callCode(catalog.cancelEvent, { requestId: rid("x"), orgId: A.orgId, eventId: B.evB1, reason: "sabotage the competitor" }, own),
      phaseBViaA: await callCode(catalog.setEventPhase, { requestId: rid("x"), orgId: A.orgId, eventId: B.evB1, phase: "booking-closed" }, own),
      scopeStaffToBEvent: await callCode(identity.inviteStaff, { requestId: rid("x"), orgId: A.orgId, phone: uniquePhone(), title: "Spy", permissions: ["tickets.scan"], eventScope: [B.evB1] }, own),
      revokeBStaff: await callCode(identity.revokeStaff, { requestId: rid("x"), orgId: B.orgId, uid: W.staffB.uid, reason: "poach" }, own),
      revokeBStaffViaA: await callCode(identity.revokeStaff, { requestId: rid("x"), orgId: A.orgId, uid: W.staffB.uid, reason: "poach" }, own),
      updateBStaff: await callCode(identity.updateStaff, { requestId: rid("x"), orgId: B.orgId, uid: W.staffB.uid, permissions: ["events.view"] }, own),
      listBStaff: await callCode(identity.listStaff, { orgId: B.orgId }, own),
      scanBTicket: await callCode(commerce.scanTicket, { requestId: rid("x"), eventId: B.evB1, payload: bPayload }, own),
      manualBTicket: await callCode(commerce.checkInManually, { requestId: rid("x"), eventId: B.evB1, ticketId: W.bookingB.ticketIds[0], reason: "manual check-in attempt" }, own),
      attendeesInB: await callCode(commerce.listEventAttendees, { orgId: B.orgId, eventId: B.evB1 }, own),
      attendeesBViaA: await callCode(commerce.listEventAttendees, { orgId: A.orgId, eventId: B.evB1 }, own),
      refundBViaA: await callCode(commerce.requestRefund, { requestId: rid("x"), orgId: A.orgId, bookingId: W.bookingB.bookingId, amountMinor: 100, reason: "refund" }, own),
      refundInB: await callCode(commerce.requestRefund, { requestId: rid("x"), orgId: B.orgId, bookingId: W.bookingB.bookingId, amountMinor: 100, reason: "refund" }, own),
      primaryFromB: await callCode(catalog.setEventResponsibility, { requestId: rid("x"), orgId: A.orgId, eventId: A.evA2, primaryUid: B.owner.uid }, own),
      bStaffScansA: await callCode(commerce.scanTicket, { requestId: rid("x"), eventId: A.evA1, payload: bPayload }, W.staffB.ctx),
    };
    expect(got).toEqual({
      saveEventInB: "NOT_PERMITTED", editBEventViaA: "NOT_FOUND", scheduleOnBExperience: "NOT_FOUND", editBExperienceViaA: "NOT_FOUND",
      submitBExperienceViaA: "NOT_FOUND", publishInB: "NOT_PERMITTED", publishBViaA: "NOT_FOUND", cancelInB: "NOT_PERMITTED",
      cancelBViaA: "NOT_FOUND", phaseBViaA: "NOT_FOUND", scopeStaffToBEvent: "INVALID_INPUT", revokeBStaff: "NOT_PERMITTED",
      revokeBStaffViaA: "NOT_FOUND", updateBStaff: "NOT_PERMITTED", listBStaff: "NOT_PERMITTED", scanBTicket: "NOT_PERMITTED",
      manualBTicket: "NOT_PERMITTED", attendeesInB: "NOT_PERMITTED", attendeesBViaA: "NOT_FOUND", refundBViaA: "NOT_FOUND",
      refundInB: "NOT_PERMITTED", primaryFromB: "PRECONDITION", bStaffScansA: "NOT_PERMITTED",
    });
    expect(await snapshot(B.orgId, paths)).toEqual(beforeB);
    expect(await sideEffectCounts(A.orgId)).toEqual(beforeA);
  });

  test("ATK-03 staff can't grant themselves (or others) more than they hold, no side effects", async () => {
    const { A } = W;
    const paths = [`memberships/${A.orgId}__${W.checkin.uid}`, `memberships/${A.orgId}__${W.manager.uid}`, `memberships/${A.orgId}__${A.owner.uid}`];
    const before = await snapshot(A.orgId, paths);
    const got = {
      checkinSelfUpgrade: await callCode(identity.updateStaff, { requestId: rid("x"), orgId: A.orgId, uid: W.checkin.uid, permissions: ALL_PERMS.filter((p) => p !== "staff.manage"), eventScope: "all" }, W.checkin.ctx),
      checkinInvitesAccomplice: await callCode(identity.inviteStaff, { requestId: rid("x"), orgId: A.orgId, phone: uniquePhone(), title: "Alt", permissions: ["staff.manage"], eventScope: "all" }, W.checkin.ctx),
      managerSelfUpgrade: await callCode(identity.updateStaff, { requestId: rid("x"), orgId: A.orgId, uid: W.manager.uid, permissions: ["staff.manage", "earnings.view"], eventScope: "all" }, W.manager.ctx),
      managerGrantsUnheld: await callCode(identity.updateStaff, { requestId: rid("x"), orgId: A.orgId, uid: W.checkin.uid, permissions: ["events.view", "tickets.scan", "events.publish"] }, W.manager.ctx),
      managerInvitesUnheld: await callCode(identity.inviteStaff, { requestId: rid("x"), orgId: A.orgId, phone: uniquePhone(), title: "Alt", permissions: ["earnings.view"], eventScope: "all" }, W.manager.ctx),
      managerInvitesManager: await callCode(identity.inviteStaff, { requestId: rid("x"), orgId: A.orgId, phone: uniquePhone(), title: "Alt", permissions: ["staff.manage"], eventScope: "all" }, W.manager.ctx),
      managerEditsOwner: await callCode(identity.updateStaff, { requestId: rid("x"), orgId: A.orgId, uid: A.owner.uid, permissions: ["events.view"] }, W.manager.ctx),
      managerRevokesOwner: await callCode(identity.revokeStaff, { requestId: rid("x"), orgId: A.orgId, uid: A.owner.uid, reason: "coup" }, W.manager.ctx),
      managerRevokesSelfGuard: await callCode(identity.revokeStaff, { requestId: rid("x"), orgId: A.orgId, uid: W.manager.uid, reason: "self" }, W.manager.ctx),
    };
    expect(got).toEqual({
      checkinSelfUpgrade: "NOT_PERMITTED", checkinInvitesAccomplice: "NOT_PERMITTED", managerSelfUpgrade: "NOT_PERMITTED",
      managerGrantsUnheld: "NOT_PERMITTED", managerInvitesUnheld: "NOT_PERMITTED", managerInvitesManager: "NOT_PERMITTED",
      managerEditsOwner: "NOT_PERMITTED", managerRevokesOwner: "NOT_PERMITTED", managerRevokesSelfGuard: "NOT_PERMITTED",
    });
    expect(await snapshot(A.orgId, paths)).toEqual(before);
  });

  test("ATK-04 forged QR (edited ticketId / edited signature / signature minted for another event) → invalid; other event's ticket → wrong-event", async () => {
    const { A } = W;
    const cust = await customer("atk04");
    const mine = await bookAndPay(cust, A.evA1, 1);
    const other = await bookAndPay(await customer("atk04b"), A.evA2, 1);
    const [good] = await ticketPayloads(mine.ticketIds);
    const [otherGood] = await ticketPayloads(other.ticketIds);
    const [, tid, sig] = good!.split(".") as [string, string, string];
    const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);
    const forgeries = {
      editedTicketId: `PX1.${flip(tid, 5)}.${sig}`,
      swappedTicketId: `PX1.${W.bookingA.ticketIds[0]}.${sig}`,
      editedSignature: `PX1.${tid}.${flip(sig, 21)}`,
      sigForOtherEvent: `PX1.${tid}.${ticketSignature(tid, A.evA2, mine.bookingId)}`,
      sigForOtherBooking: `PX1.${tid}.${ticketSignature(tid, A.evA1, W.bookingA.bookingId)}`,
      garbage: "PX1.not-a-ticket",
      wrongPrefix: good!.replace(/^PX1/, "PX2"),
    };
    const paths = [`tickets/${mine.ticketIds[0]}`, `tickets/${W.bookingA.ticketIds[0]}`, `tickets/${other.ticketIds[0]}`];
    const before = await fingerprint(paths);
    const rejectedBefore = (await docsWhere("auditEvents", "actorUid", W.checkin.uid)).filter((a) => a.action === "ticket.scan-rejected").length;
    const got: Record<string, string> = {};
    for (const [k, payload] of Object.entries(forgeries)) got[k] = (await scan(W.checkin, A.evA1, payload)).result;
    expect(got).toEqual(Object.fromEntries(Object.keys(forgeries).map((k) => [k, "invalid"])));
    // A genuine ticket of another event of the same org, by the owner who may scan both.
    expect((await scan(A.owner, A.evA1, otherGood!)).result).toBe("wrong-event");
    expect(await fingerprint(paths)).toEqual(before);
    const rejectedAfter = (await docsWhere("auditEvents", "actorUid", W.checkin.uid)).filter((a) => a.action === "ticket.scan-rejected").length;
    expect(rejectedAfter - rejectedBefore).toBe(Object.keys(forgeries).length);
    // The genuine payload still works afterwards.
    expect((await scan(W.checkin, A.evA1, good!)).result).toBe("checked-in");
  });

  test("ATK-05 reused QR → already-used for every later scanner/method; first check-in is never overwritten", async () => {
    const { A } = W;
    const cust = await customer("atk05");
    const b = await bookAndPay(cust, A.evA1, 1);
    const [payload] = await ticketPayloads(b.ticketIds);
    const first = await scan(W.checkin, A.evA1, payload!);
    expect(first.result).toBe("checked-in");
    const stamp = await fingerprint([`tickets/${b.ticketIds[0]}`]);
    expect((await scan(W.checkin, A.evA1, payload!)).result).toBe("already-used");
    expect((await scan(A.owner, A.evA1, payload!)).result).toBe("already-used");
    expect((await scan(W.manager, A.evA1, payload!)).result).toBe("already-used");
    expect((await call(commerce.checkInManually, { requestId: rid("mc"), eventId: A.evA1, ticketId: b.ticketIds[0], reason: "claims QR failed" }, A.owner.ctx)).result).toBe("already-used");
    // Parallel replays of a screenshot: still exactly one check-in.
    const burst = await Promise.all([1, 2, 3, 4].map(() => scan(A.owner, A.evA1, payload!)));
    expect(burst.every((x) => x.result === "already-used")).toBe(true);
    expect(await fingerprint([`tickets/${b.ticketIds[0]}`])).toEqual(stamp);
    expect((await docsWhere("auditEvents", "resourceId", b.ticketIds[0])).filter((a) => String(a.action).startsWith("ticket.checked-in"))).toHaveLength(1);
    (globalThis as Record<string, unknown>).__atk05 = { cust, ticketId: b.ticketIds[0] };
  });

  test("ATK-06 duplicate booking via parallel requests with different requestIds → exactly one live booking", async () => {
    const { A } = W;
    const cust = await customer("atk06");
    const occ0 = (await getDoc(`events/${A.evA1}`))!.occupancy;
    const codes = await Promise.all([1, 2, 3, 4, 5, 6].map(() => codeOf(reserve(cust, A.evA1, 1))));
    expect(codes.filter((c) => c === "OK")).toHaveLength(1);
    expect(codes.filter((c) => c !== "OK").every((c) => c === "CONFLICT")).toBe(true);
    const bookings = await docsWhere("bookings", "customerUid", cust.uid);
    expect(bookings).toHaveLength(1);
    const occ1 = (await getDoc(`events/${A.evA1}`))!.occupancy;
    expect(occ1.activeReservationHolds - occ0.activeReservationHolds).toBe(1);
    // And sequentially afterwards.
    expect(await codeOf(reserve(cust, A.evA1, 1))).toBe("CONFLICT");
  });

  test("ATK-07 oversell: 25 parallel customers on 5 seats → never more than 5 admitted", async () => {
    const { A } = W;
    const custs = await Promise.all(Array.from({ length: 25 }, (_, i) => customer(`atk07-${i}`)));
    const t0 = Date.now();
    const codes = await Promise.all(custs.map((c) => codeOf(reserve(c, A.evSmall, 1))));
    const ms = Date.now() - t0;
    const ok = codes.filter((c) => c === "OK").length;
    const tally = codes.reduce<Record<string, number>>((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {});
    console.log(`ATK-07 oversell: ${JSON.stringify(tally)} in ${ms} ms`);
    expect(ok).toBeLessThanOrEqual(5);
    expect(ok).toBe(5); // no lost sales either (retry budget 20)
    expect(codes.filter((c) => c !== "OK").every((c) => c === "SOLD_OUT")).toBe(true);
    const bookings = (await docsWhere("bookings", "eventId", A.evSmall)).filter((b) => b.status === "held" || b.status === "confirmed");
    expect(bookings).toHaveLength(ok);
    const ev = (await getDoc(`events/${A.evSmall}`))!;
    expect(ev.occupancy.activeReservationHolds + ev.occupancy.confirmedPaidBookings).toBe(ok);
    expect(await codeOf(reserve(await customer("atk07-late"), A.evSmall, 1))).toBe("SOLD_OUT");
  });

  test("ATK-08 forged payment signatures are refused; booking stays held, nothing captured", async () => {
    const { A } = W;
    const cust = await customer("atk08");
    const r = await reserve(cust, A.evA1, 1);
    const o = await order(cust, r.bookingId);
    const payId = fakePayId();
    const otherOrder = `order_emu_${randomBytes(7).toString("hex")}`;
    const victim = await customer("atk08v");
    const vr = await reserve(victim, A.evA1, 1);
    const vo = await order(victim, vr.bookingId);
    const vPay = fakePayId();
    const paths = [`bookings/${r.bookingId}`, `payments/${o.paymentId}`, `events/${A.evA1}`, `bookings/${vr.bookingId}`, `payments/${vo.paymentId}`];
    const before = await fingerprint(paths);
    const got = {
      randomHex: await callCode(commerce.confirmPayment, { paymentId: o.paymentId, providerPaymentId: payId, providerSignature: randomBytes(32).toString("hex") }, cust.ctx),
      sigForOtherPaymentId: await callCode(commerce.confirmPayment, { paymentId: o.paymentId, providerPaymentId: payId, providerSignature: paymentSignature(o.providerOrderId, fakePayId()) }, cust.ctx),
      sigForOtherOrder: await callCode(commerce.confirmPayment, { paymentId: o.paymentId, providerPaymentId: payId, providerSignature: paymentSignature(otherOrder, payId) }, cust.ctx),
      othersPaymentWithValidSig: await callCode(commerce.confirmPayment, { paymentId: vo.paymentId, providerPaymentId: vPay, providerSignature: paymentSignature(vo.providerOrderId, vPay) }, cust.ctx),
      othersOrder: await callCode(commerce.createPaymentOrder, { requestId: rid("po"), bookingId: vr.bookingId }, cust.ctx),
    };
    expect(got).toEqual({ randomHex: "NOT_PERMITTED", sigForOtherPaymentId: "NOT_PERMITTED", sigForOtherOrder: "NOT_PERMITTED", othersPaymentWithValidSig: "NOT_FOUND", othersOrder: "NOT_FOUND" });
    // Forged webhook signature.
    const hook = await deliverWebhook(capturedEvent({ providerPaymentId: payId, orderId: o.providerOrderId, paymentId: o.paymentId, amount: o.amountMinor }), { signature: randomBytes(32).toString("hex") });
    expect(hook.statusCode).toBe(400);
    expect(await fingerprint(paths)).toEqual(before);
    expect(await getDoc(`bookings/${r.bookingId}`)).toMatchObject({ status: "held", ticketIds: [] });
    expect(await ledgerFor("bookingId", r.bookingId)).toHaveLength(0);
    expect(await docsWhere("tickets", "bookingId", r.bookingId)).toHaveLength(0);
    expect((await docsWhere("auditEvents", "resourceId", o.paymentId)).filter((a) => a.action === "payment.signature-rejected").length).toBe(3);
  });

  test("ATK-09 client-supplied amounts are ignored; an under-paid (signed) capture never confirms", async () => {
    const { A } = W;
    const price = Number((await getDoc(`events/${A.evA1}`))!.priceMinor);
    const cust = await customer("atk09");
    const r = await call(commerce.reserveSeat, { requestId: rid("rs"), eventId: A.evA1, spots: 2, alias: "Cheap", amountMinor: 1, priceMinor: 1, commissionBps: 0 }, cust.ctx);
    expect(r.amountMinor).toBe(2 * price);
    const o = await call(commerce.createPaymentOrder, { requestId: rid("po"), bookingId: r.bookingId, amountMinor: 1, currency: "USD" }, cust.ctx);
    expect(o).toMatchObject({ amountMinor: 2 * price, currency: "INR" });
    const payId = fakePayId();
    const hook = await deliverWebhook(capturedEvent({ providerPaymentId: payId, orderId: o.providerOrderId, paymentId: o.paymentId, amount: 1 }));
    expect(hook.body).toMatchObject({ ok: true, outcome: "amount-mismatch" });
    expect(await getDoc(`bookings/${r.bookingId}`)).toMatchObject({ status: "held", ticketIds: [] });
    expect(await ledgerFor("bookingId", r.bookingId)).toHaveLength(0);
    expect(await getDoc(`riskAlerts/amount-mismatch_${payId}`)).toMatchObject({ kind: "payment-amount-mismatch", severity: "high" });
    // The genuine full-amount checkout still confirms at the server's price.
    const good = fakePayId();
    const c = await call(commerce.confirmPayment, { paymentId: o.paymentId, providerPaymentId: good, providerSignature: paymentSignature(o.providerOrderId, good), amountMinor: 1 }, cust.ctx);
    expect(c.status).toBe("confirmed");
    const entries = await ledgerFor("bookingId", r.bookingId);
    expect(entries.find((e) => e.account === "customer_payments")!.amountMinor).toBe(2 * price);
  });

  test("ATK-10 organizer owner can request but never approve a refund", async () => {
    const { A } = W;
    const cust = await customer("atk10");
    const b = await bookAndPay(cust, A.evBig, 1);
    expect(await callCode(commerce.requestRefund, { requestId: rid("rr"), orgId: A.orgId, bookingId: b.bookingId, amountMinor: b.amountMinor + 1, reason: "too much" }, A.owner.ctx)).toBe("INVALID_INPUT");
    const req = await call(commerce.requestRefund, { requestId: rid("rr"), orgId: A.orgId, bookingId: b.bookingId, amountMinor: 1_500_000, reason: "Venue AC failed" }, A.owner.ctx);
    expect(req.status).toBe("under-review");
    const paths = [`refunds/${req.refundId}`, `payments/${b.paymentId}`, `bookings/${b.bookingId}`];
    const before = await fingerprint(paths);
    const ledger0 = (await ledgerFor("bookingId", b.bookingId)).length;
    expect(await callCode(commerce.decideRefund, { requestId: rid("dr"), refundId: req.refundId, decision: "approve", note: "self-approve" }, A.owner.ctx)).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.decideRefund, { requestId: rid("dr"), refundId: req.refundId, decision: "approve", note: "self-approve" }, W.manager.ctx)).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.decideRefund, { requestId: rid("dr"), refundId: req.refundId, decision: "approve", note: "self-approve" }, cust.ctx)).toBe("NOT_PERMITTED");
    expect(await fingerprint(paths)).toEqual(before);
    expect((await ledgerFor("bookingId", b.bookingId)).length).toBe(ledger0);
    expect(await getDoc(`refunds/${req.refundId}`)).toMatchObject({ status: "under-review", approvals: [] });
    (globalThis as Record<string, unknown>).__atk10 = { refundId: req.refundId, bookingId: b.bookingId, paymentId: b.paymentId, ledger0 };
  });

  test("ATK-11 the same admin can't double-approve a large refund (> ₹10,000); a second admin completes it once", async () => {
    const x = (globalThis as Record<string, any>).__atk10 as { refundId: string; bookingId: string; paymentId: string; ledger0: number };
    const firstRid = rid("dr");
    expect((await call(commerce.decideRefund, { requestId: firstRid, refundId: x.refundId, decision: "approve", note: "Checked venue report" }, adminA())).status).toBe("awaiting-second-approval");
    const before = await fingerprint([`refunds/${x.refundId}`, `payments/${x.paymentId}`]);
    expect(await callCode(commerce.decideRefund, { requestId: rid("dr"), refundId: x.refundId, decision: "approve", note: "approve again" }, adminA())).toBe("NOT_PERMITTED");
    // Replaying A's own first request returns the stored outcome, not a second approval.
    expect((await call(commerce.decideRefund, { requestId: firstRid, refundId: x.refundId, decision: "approve", note: "Checked venue report" }, adminA())).status).toBe("awaiting-second-approval");
    expect(await fingerprint([`refunds/${x.refundId}`, `payments/${x.paymentId}`])).toEqual(before);
    expect((await ledgerFor("bookingId", x.bookingId)).length).toBe(x.ledger0);
    const second = await call(commerce.decideRefund, { requestId: rid("dr"), refundId: x.refundId, decision: "approve", note: "Second approval" }, adminB());
    expect(["approved", "processing"]).toContain(second.status);
    expect(await callCode(commerce.decideRefund, { requestId: rid("dr"), refundId: x.refundId, decision: "approve", note: "third" }, adminB())).toBe("CONFLICT");
    const entries = await ledgerFor("bookingId", x.bookingId);
    expect(new Set(entries.filter((e) => e.kind === "refund").map((e) => e.txnId)).size).toBe(1);
    expect(await getDoc(`payments/${x.paymentId}`)).toMatchObject({ refundedMinor: 1_500_000, status: "partially-refunded" });
    expect((await getDoc(`refunds/${x.refundId}`))!.approvals).toHaveLength(2);
  });

  test("ATK-12 organizer & staff codes: invalid / stolen / expired / superseded / reused are all refused", async () => {
    // Organizer code.
    const app = person("atk12-app");
    await completeProfile(app);
    await applyAsOrganizer(app);
    const d = await approveCase(organizerCaseIdFor(app.uid));
    const oldCode = String(d.organizerCode);
    issuedCodes.push(oldCode);
    const thief = person("atk12-thief");
    const org = {
      badFormat: await callCode(identity.redeemOrganizerCode, { code: "ABC" }, app.ctx),
      wrong: await callCode(identity.redeemOrganizerCode, { code: oldCode.split("").reverse().join("") === oldCode ? "2345678923" : oldCode.split("").reverse().join("") }, app.ctx),
      stolen: await callCode(identity.redeemOrganizerCode, { code: oldCode }, thief.ctx),
    };
    await db().doc(`organizerActivations/${app.uid}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
    const expired = await callCode(identity.redeemOrganizerCode, { code: oldCode }, app.ctx);
    expect(await getDoc(`memberships/${d.orgId}__${app.uid}`)).toBeUndefined();
    const re = await call(identity.reissueOrganizerCode, { requestId: rid("ro"), applicantUid: app.uid, reason: "Code expired before activation" }, adminB());
    issuedCodes.push(String(re.organizerCode));
    const superseded = await callCode(identity.redeemOrganizerCode, { code: oldCode }, app.ctx);
    expect(await call(identity.redeemOrganizerCode, { code: re.organizerCode }, app.ctx)).toEqual({ orgId: d.orgId });
    const reused = await callCode(identity.redeemOrganizerCode, { code: re.organizerCode }, app.ctx);
    expect({ ...org, expired, superseded, reused }).toEqual({
      badFormat: "INVALID_INPUT", wrong: "INVALID_INPUT", stolen: "INVALID_INPUT", expired: "PRECONDITION", superseded: "INVALID_INPUT", reused: "INVALID_INPUT",
    });
    expect(await getDoc(`memberships/${d.orgId}__${thief.uid}`)).toBeUndefined();

    // Staff code.
    const { A } = W;
    const s = person("atk12-staff");
    await completeProfile(s);
    const inv = await call(identity.inviteStaff, { requestId: rid("inv"), orgId: A.orgId, phone: s.phone, title: "Door", permissions: ["tickets.scan"], eventScope: [A.evA1] }, A.owner.ctx);
    issuedCodes.push(inv.code);
    const wrongStaff = await callCode(identity.redeemStaffCode, { code: inv.code === "22222222" ? "33333333" : "22222222" }, s.ctx);
    const otherPhone = await callCode(identity.redeemStaffCode, { code: inv.code }, person("atk12-other").ctx);
    await db().doc(`staffInvites/${inv.inviteId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
    const expiredStaff = await callCode(identity.redeemStaffCode, { code: inv.code }, s.ctx);
    const rs = await call(identity.reissueStaffCode, { requestId: rid("rsc"), orgId: A.orgId, inviteId: inv.inviteId }, A.owner.ctx);
    issuedCodes.push(rs.code);
    const supersededStaff = await callCode(identity.redeemStaffCode, { code: inv.code }, s.ctx);
    expect(await getDoc(`memberships/${A.orgId}__${s.uid}`)).toBeUndefined();
    expect(await call(identity.redeemStaffCode, { code: rs.code }, s.ctx)).toEqual({ orgId: A.orgId });
    const reusedStaff = await callCode(identity.redeemStaffCode, { code: rs.code }, s.ctx);
    expect({ wrongStaff, otherPhone, expiredStaff, supersededStaff, reusedStaff }).toEqual({
      wrongStaff: "INVALID_INPUT", otherPhone: "INVALID_INPUT", expiredStaff: "PRECONDITION", supersededStaff: "INVALID_INPUT", reusedStaff: "INVALID_INPUT",
    });
    expect(await getDoc(`memberships/${A.orgId}__${s.uid}`)).toMatchObject({ status: "active", permissions: ["tickets.scan"] });
  });

  test("ATK-13 brute force: 5 wrong codes lock the uid for an hour (even the right code is refused); 10 misses lock a staff invite", async () => {
    const app = person("atk13-app");
    await completeProfile(app);
    await applyAsOrganizer(app);
    const d = await approveCase(organizerCaseIdFor(app.uid));
    issuedCodes.push(String(d.organizerCode));
    const guesses = ["2222222222", "3333333333", "4444444444", "5555555555", "6666666666"].filter((g) => g !== d.organizerCode);
    for (const g of guesses.slice(0, 5)) expect(await callCode(identity.redeemOrganizerCode, { code: g }, app.ctx)).toBe("INVALID_INPUT");
    expect(await callCode(identity.redeemOrganizerCode, { code: d.organizerCode }, app.ctx)).toBe("RATE_LIMITED");
    expect(await getDoc(`memberships/${d.orgId}__${app.uid}`)).toBeUndefined();
    expect(await getDoc(`organizerActivations/${app.uid}`)).toMatchObject({ status: "issued" });
    const fails = (await docsWhere("auditEvents", "actorUid", app.uid)).filter((a) => a.action === "access.code-failed");
    expect(fails.map((f) => f.reason).sort()).toEqual([...Array(5).fill("mismatch"), "rate-limited"].sort());

    // Per-invite lifetime lock: a recycled number shared by two uids can't pool 10 guesses.
    const { A } = W;
    const phone = uniquePhone();
    const inv = await call(identity.inviteStaff, { requestId: rid("inv"), orgId: A.orgId, phone, title: "Door", permissions: ["tickets.scan"], eventScope: [A.evA1] }, A.owner.ctx);
    issuedCodes.push(inv.code);
    const u1 = { uid: `atk13-u1-${RUN}`, ctx: phoneCtxFor(`atk13-u1-${RUN}`, phone) };
    const u2 = { uid: `atk13-u2-${RUN}`, ctx: phoneCtxFor(`atk13-u2-${RUN}`, phone) };
    const u3 = { uid: `atk13-u3-${RUN}`, ctx: phoneCtxFor(`atk13-u3-${RUN}`, phone) };
    const staffGuesses = ["22222222", "33333333", "44444444", "55555555", "66666666", "77777777", "88888888", "99999999", "AAAAAAAA", "BBBBBBBB"].filter((g) => g !== inv.code);
    for (const [i, g] of staffGuesses.slice(0, 10).entries()) {
      expect(await callCode(identity.redeemStaffCode, { code: g }, (i < 5 ? u1 : u2).ctx)).toBe("INVALID_INPUT");
    }
    expect(await getDoc(`staffInvites/${inv.inviteId}`)).toMatchObject({ status: "locked" });
    expect(await callCode(identity.redeemStaffCode, { code: inv.code }, u3.ctx)).toBe("INVALID_INPUT");
    for (const u of [u1, u2, u3]) expect(await getDoc(`memberships/${A.orgId}__${u.uid}`)).toBeUndefined();
  });

  test("ATK-14 revoked staff replaying an old requestId gets NOT_PERMITTED; catalog replays cause no side effects", async () => {
    const { A } = W;
    const door2 = person("atk14-door2");
    await completeProfile(door2);
    await hireStaff(A.owner, A.orgId, door2, ["events.view", "tickets.scan", "events.operate", "attendees.view"], [A.evA2]);
    const cust = await customer("atk14");
    const b = await bookAndPay(cust, A.evA2, 2);
    const [p1, p2] = await ticketPayloads(b.ticketIds);
    const scanRid = rid("sc");
    expect((await scan(door2, A.evA2, p1!, scanRid)).result).toBe("checked-in");
    const manualRid = rid("mc");
    expect((await call(commerce.checkInManually, { requestId: manualRid, eventId: A.evA2, ticketId: b.ticketIds[1], reason: "QR screen cracked badly" }, door2.ctx)).result).toBe("checked-in");
    const phaseRid = rid("ph");
    await call(catalog.setEventPhase, { requestId: phaseRid, orgId: A.orgId, eventId: A.evA2, phase: "booking-closed" }, door2.ctx);

    await call(identity.revokeStaff, { requestId: rid("rv"), orgId: A.orgId, uid: door2.uid, reason: "Left the team" }, A.owner.ctx);
    const paths = [`events/${A.evA2}`, `tickets/${b.ticketIds[0]}`, `tickets/${b.ticketIds[1]}`, `memberships/${A.orgId}__${door2.uid}`];
    const before = await snapshot(A.orgId, paths);
    const got = {
      scanReplay: await callCode(commerce.scanTicket, { requestId: scanRid, eventId: A.evA2, payload: p1 }, door2.ctx),
      scanNew: await callCode(commerce.scanTicket, { requestId: rid("sc"), eventId: A.evA2, payload: p2 }, door2.ctx),
      manualReplay: await callCode(commerce.checkInManually, { requestId: manualRid, eventId: A.evA2, ticketId: b.ticketIds[1], reason: "QR screen cracked badly" }, door2.ctx),
      phaseNew: await callCode(catalog.setEventPhase, { requestId: rid("ph"), orgId: A.orgId, eventId: A.evA2, phase: "live" }, door2.ctx),
      attendees: await callCode(commerce.listEventAttendees, { orgId: A.orgId, eventId: A.evA2 }, door2.ctx),
    };
    expect(got).toEqual({ scanReplay: "NOT_PERMITTED", scanNew: "NOT_PERMITTED", manualReplay: "NOT_PERMITTED", phaseNew: "NOT_PERMITTED", attendees: "NOT_PERMITTED" });
    // Catalog commands authorize BEFORE replaying a receipt (fixed 2026-09-30),
    // so a revoked member can't even read back an earlier result.
    const phaseReplay = await codeOf(call(catalog.setEventPhase, { requestId: phaseRid, orgId: A.orgId, eventId: A.evA2, phase: "booking-closed" }, door2.ctx));
    expect(phaseReplay).toBe("NOT_PERMITTED");
    expect(await snapshot(A.orgId, paths)).toEqual(before);
  });

  test("ATK-15 publishing without approvals / terms / an active organizer is refused and snapshots no commission", async () => {
    const { A, B, C } = W;
    // Draft and submitted events.
    const draft = await call(catalog.saveEvent, eventInput(A.orgId, A.experienceId, A.owner.uid), A.owner.ctx);
    const pubDraft = await callCode(catalog.publishEvent, { requestId: rid("pe"), orgId: A.orgId, eventId: draft.eventId }, A.owner.ctx);
    const sub = await call(catalog.submitEvent, { requestId: rid("se"), orgId: A.orgId, eventId: draft.eventId }, A.owner.ctx);
    const pubSubmitted = await callCode(catalog.publishEvent, { requestId: rid("pe"), orgId: A.orgId, eventId: draft.eventId }, A.owner.ctx);
    // Rejected by governance.
    await call(decideCase, { requestId: rid("dec"), caseId: sub.caseId, expectedVersion: 0, outcome: "rejected", note: "Venue permit missing for this date." }, adminA());
    const pubRejected = await callCode(catalog.publishEvent, { requestId: rid("pe"), orgId: A.orgId, eventId: draft.eventId }, A.owner.ctx);
    // Approved event but no commercial agreement (org C).
    const pubNoTerms = await callCode(catalog.publishEvent, { requestId: rid("pe"), orgId: C.orgId, eventId: C.evC1 }, C.owner.ctx);
    // A (hand-written) non-approved agreement doesn't count either.
    await db().doc(`commercialAgreements/ca_draft_${C.orgId}`).set({ orgId: C.orgId, status: "proposed", commissionBps: 0, updatedAt: Timestamp.now() });
    const pubProposedTerms = await callCode(catalog.publishEvent, { requestId: rid("pe"), orgId: C.orgId, eventId: C.evC1 }, C.owner.ctx);
    const bookUnpublished = await callCode(commerce.reserveSeat, { requestId: rid("rs"), eventId: C.evC1, spots: 1, alias: "Early" }, (await customer("atk15")).ctx);
    // Organizer paused by the platform.
    const orgVersion = Number((await getDoc(`organizers/${B.orgId}`))!.version ?? 0);
    await call(setMarketplaceEntityStatus, { requestId: rid("st"), entityType: "organizer", entityId: B.orgId, expectedVersion: orgVersion, status: "paused", reason: "KYC re-verification pending" }, adminA());
    const pubPaused = await callCode(catalog.publishEvent, { requestId: rid("pe"), orgId: B.orgId, eventId: B.evB2 }, B.owner.ctx);
    const bookPaused = await callCode(commerce.reserveSeat, { requestId: rid("rs"), eventId: B.evB1, spots: 1, alias: "Paused" }, (await customer("atk15p")).ctx);
    await call(setMarketplaceEntityStatus, { requestId: rid("st"), entityType: "organizer", entityId: B.orgId, expectedVersion: orgVersion + 1, status: "active", reason: "KYC re-verification complete" }, adminA());

    expect({ pubDraft, pubSubmitted, pubRejected, pubNoTerms, pubProposedTerms, bookUnpublished, pubPaused, bookPaused }).toEqual({
      pubDraft: "PRECONDITION", pubSubmitted: "PRECONDITION", pubRejected: "PRECONDITION", pubNoTerms: "PRECONDITION",
      pubProposedTerms: "PRECONDITION", bookUnpublished: "SESSION_NOT_BOOKABLE", pubPaused: "PRECONDITION", bookPaused: "SESSION_NOT_BOOKABLE",
    });
    expect(await getDoc(`events/${draft.eventId}`)).toMatchObject({ status: "rejected", publishedAt: null });
    expect(await getDoc(`events/${C.evC1}`)).toMatchObject({ status: "approved", publishedAt: null });
    expect(await getDoc(`events/${B.evB2}`)).toMatchObject({ status: "approved", publishedAt: null });
    for (const id of [draft.eventId, C.evC1, B.evB2]) expect(await getDoc(`eventCommercials/${id}`)).toBeUndefined();
  });

  test("ATK-16 changing price / time / venue after bookings exist is refused; the event is unchanged", async () => {
    const { A } = W;
    const ev = (await getDoc(`events/${A.evA1}`))!;
    const same = {
      eventId: A.evA1,
      startsAt: (ev.startsAt as Timestamp).toDate().toISOString(),
      durationMinutes: ev.durationMinutes,
      priceMinor: ev.priceMinor,
      capacity: { max: ev.capacity.maxPhysicalCapacity, min: ev.capacity.minParticipants },
    };
    const before = await fingerprint([`events/${A.evA1}`]);
    const got = {
      price: await callCode(catalog.saveEvent, eventInput(A.orgId, A.experienceId, A.owner.uid, { ...same, priceMinor: ev.priceMinor * 2 }), A.owner.ctx),
      priceDown: await callCode(catalog.saveEvent, eventInput(A.orgId, A.experienceId, A.owner.uid, { ...same, priceMinor: 100 }), A.owner.ctx),
      time: await callCode(catalog.saveEvent, eventInput(A.orgId, A.experienceId, A.owner.uid, { ...same, startsAt: new Date((ev.startsAt as Timestamp).toMillis() + 24 * H).toISOString() }), A.owner.ctx),
      venue: await callCode(catalog.saveEvent, eventInput(A.orgId, A.experienceId, A.owner.uid, { ...same, venue: { name: "Other Turf", area: "Gachibowli", city: "Hyderabad", address: "Plot 9, Gachibowli" } }), A.owner.ctx),
      capacityBelowTaken: await callCode(catalog.saveEvent, eventInput(A.orgId, A.experienceId, A.owner.uid, { ...same, capacity: { max: 1, min: 1 } }), A.owner.ctx),
    };
    expect(got).toEqual({ price: "PRECONDITION", priceDown: "PRECONDITION", time: "PRECONDITION", venue: "PRECONDITION", capacityBelowTaken: "PRECONDITION" });
    expect(await fingerprint([`events/${A.evA1}`])).toEqual(before);
  });

  test("ATK-17 reviews: non-participant, no-show, organizer's own staff and owner are refused; the attendee may review", async () => {
    const { A } = W;
    // The check-in staffer also bought a ticket as a customer and was checked in.
    const staffBooking = await bookAndPay(W.checkin, A.evA1, 1);
    const [sp] = await ticketPayloads(staffBooking.ticketIds);
    expect((await scan(A.owner, A.evA1, sp!)).result).toBe("checked-in");
    const noShow = await customer("atk17-noshow");
    await bookAndPay(noShow, A.evA1, 1);
    const stranger = await customer("atk17-stranger");
    // Before the event ends nobody may review.
    const attendee = (globalThis as Record<string, any>).__atk05 as { cust: Person };
    expect(await callCode(catalog.submitReview, { requestId: rid("rv"), eventId: A.evA1, rating: 5 }, attendee.cust.ctx)).toBe("PRECONDITION");
    await completeEvent(A.owner, A.orgId, A.evA1);

    const beforeAgg = await fingerprint([`publicOrganizers/${A.orgId}`, `experiences/${A.experienceId}`]);
    const got = {
      stranger: await callCode(catalog.submitReview, { requestId: rid("rv"), eventId: A.evA1, rating: 1, comment: "Never went, terrible" }, stranger.ctx),
      noShow: await callCode(catalog.submitReview, { requestId: rid("rv"), eventId: A.evA1, rating: 1 }, noShow.ctx),
      ownStaff: await callCode(catalog.submitReview, { requestId: rid("rv"), eventId: A.evA1, rating: 5, comment: "Best event ever" }, W.checkin.ctx),
      owner: await callCode(catalog.submitReview, { requestId: rid("rv"), eventId: A.evA1, rating: 5 }, A.owner.ctx),
      contactSpam: await callCode(catalog.submitReview, { requestId: rid("rv"), eventId: A.evA1, rating: 5, comment: "call me 98765 43210" }, attendee.cust.ctx),
    };
    expect(got).toEqual({ stranger: "NOT_PERMITTED", noShow: "NOT_PERMITTED", ownStaff: "NOT_PERMITTED", owner: "NOT_PERMITTED", contactSpam: "INVALID_INPUT" });
    expect(await fingerprint([`publicOrganizers/${A.orgId}`, `experiences/${A.experienceId}`])).toEqual(beforeAgg);
    for (const u of [stranger.uid, noShow.uid, W.checkin.uid, A.owner.uid]) expect(await getDoc(`reviews/${A.evA1}__${u}`)).toBeUndefined();
    const ok = await call(catalog.submitReview, { requestId: rid("rv"), eventId: A.evA1, rating: 4, comment: "Well run" }, attendee.cust.ctx);
    expect(ok.status).toBe("published");
  });

  test("CTRL-18 settlement below the ₹50,000 dual-control line: one admin may approve AND mark paid; organizers never", async () => {
    const { B } = W;
    await completeEvent(B.owner, B.orgId, B.evB1);
    const built = await call(commerce.buildSettlement, { requestId: rid("bs"), orgId: B.orgId, periodEnd: new Date().toISOString() }, adminA());
    expect(built.status).toBe("pending-approval");
    const stl = (await getDoc(`settlements/${built.settlementId}`))!;
    expect(stl.netMinor).toBeLessThanOrEqual(5_000_000);
    expect(stl.grossMinor - stl.commissionMinor - stl.refundsMinor).toBe(stl.netMinor);
    expect(await callCode(commerce.decideSettlement, { requestId: rid("ds"), settlementId: built.settlementId, action: "approve", note: "self" }, B.owner.ctx)).toBe("NOT_PERMITTED");
    expect((await call(commerce.decideSettlement, { requestId: rid("ds"), settlementId: built.settlementId, action: "approve", note: "Reconciled" }, adminA())).status).toBe("approved");
    expect((await call(commerce.decideSettlement, { requestId: rid("ds"), settlementId: built.settlementId, action: "mark-paid", note: "Paid", payoutReference: `UTR${RUN}B` }, adminA())).status).toBe("paid");
    expect(await callCode(commerce.decideSettlement, { requestId: rid("ds"), settlementId: built.settlementId, action: "mark-paid", note: "Paid twice", payoutReference: `UTR${RUN}B2` }, adminB())).toBe("PRECONDITION");
    expect(await getDoc(`settlements/${built.settlementId}`)).toMatchObject({ status: "paid", approvedBy: stl.builtBy, paidBy: stl.builtBy, payoutReference: `UTR${RUN}B` });
  });

  test("LEAK: no auditEvents / commandReceipts (or other stored doc) contains any plaintext organizer or staff code", async () => {
    expect(issuedCodes.length).toBeGreaterThanOrEqual(8);
    const { docs, text } = await dumpCollections([
      "auditEvents", "commandReceipts", "organizerActivations", "staffInvites", "organizerApplications", "governanceCases",
      "userNotifications", "memberships", "rateLimits", "organizers", "publicOrganizers",
    ]);
    expect(docs).toBeGreaterThan(50);
    const leaked = issuedCodes.filter((c) => text.includes(c));
    expect(leaked).toEqual([]);
  });
});
