/**
 * END-TO-END JOURNEYS (real services chained, no mocks, emulator Firestore).
 *
 *   J1 organizer onboarding → terms → experience → events published
 *   J2 customer books 2 spots and pays; webhook replay changes nothing
 *   J3 staff invited, redeems, scans; scope & money walls; revoked
 *   J4 completion → reviews → settlement with dual control
 *   J5 event cancellation → refunds exactly once, ledger nets to zero
 *
 * Tests in this file run in order and share state (one marketplace story).
 */

import { allows, type Membership } from "../src/access/permissions";
import { ticketPayload, ticketSignature } from "../src/commerce/tickets";
import { refundCancelledEvent } from "../src/commerce/refunds";
import {
  ADMIN_A, ADMIN_B, H, RUN, adminA, adminB, applyAsOrganizer, approveCase, approveCommercialTerms, approvedExperience,
  balancedTxns, bookAndPay, call, callCode, capturedEvent, catalog, commerce, completeProfile, count, customer,
  decideCase, deliverWebhook, docsWhere, dumpCollections, eventInput, getDoc, identity, issuedCodes, ledgerFor,
  moveEventToPast, net, order, organizerCaseIdFor, person, reserve, rid, scan, ticketPayloads, type Entry, type Person,
} from "./e2e-helpers";
import { paymentSignature } from "../src/commerce/provider";

jest.setTimeout(240_000);

const PRICE_A = 3_000_000; // ₹30,000 — 3 spots sold → settlement above the ₹50,000 dual-control line
const PRICE_B = 150_000; // ₹1,500
const BPS = 1_200;

const S: {
  owner?: Person;
  orgId?: string;
  experienceId?: string;
  eventA?: string;
  eventB?: string;
  cust1?: Person;
  cust2?: Person;
  booking1?: { bookingId: string; ticketIds: string[]; paymentId: string; providerOrderId: string; providerPaymentId: string };
  staff?: Person;
  staffScanRid?: string;
} = {};

const commission = (gross: number) => Math.floor((gross * BPS) / 10_000);

/** Polls until `check` passes (a live Firestore trigger may still be finishing in CI). */
async function settle(check: () => Promise<boolean>, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("condition not reached in time");
}

describe(`E2E journeys (run ${RUN})`, () => {
  test("J1 organizer journey: apply → KYC approval (code once) → redeem → terms → experience → events published", async () => {
    const t0 = Date.now();
    const owner = person("j1-owner");
    S.owner = owner;

    // Profile + application → organizer-kyc case.
    await expect(completeProfile(owner, { gender: "man", name: "Ravi Host" })).resolves.toEqual({ ok: true });
    const app = await applyAsOrganizer(owner, "Deccan Weekend Club");
    expect(app).toMatchObject({ status: "submitted", caseId: organizerCaseIdFor(owner.uid) });
    expect(await getDoc(`governanceCases/${organizerCaseIdFor(owner.uid)}`)).toMatchObject({ kind: "organizer-kyc", status: "pending" });

    // A customer can't decide governance cases.
    expect(await callCode(decideCase, { requestId: rid("dec"), caseId: organizerCaseIdFor(owner.uid), expectedVersion: 0, outcome: "approved", note: "" }, owner.ctx)).toBe("NOT_PERMITTED");

    // Admin approval returns the Organizer Code ONCE.
    const decideRid = rid("dec");
    const decided = await call(decideCase, { requestId: decideRid, caseId: organizerCaseIdFor(owner.uid), expectedVersion: 0, outcome: "approved", note: "" }, adminA());
    expect(decided.organizerCode).toMatch(/^[23456789A-HJKMNP-Z]{10}$/);
    const code = String(decided.organizerCode);
    issuedCodes.push(code);
    const orgId = String(decided.orgId);
    S.orgId = orgId;
    const replay = await call(decideCase, { requestId: decideRid, caseId: organizerCaseIdFor(owner.uid), expectedVersion: 0, outcome: "approved", note: "" }, adminA());
    expect(replay).toMatchObject({ replayed: true, codeAlreadyIssued: true, orgId });
    expect(replay.organizerCode).toBeUndefined();
    expect(await getDoc(`organizerActivations/${owner.uid}`)).toMatchObject({ status: "issued", orgId });
    expect(JSON.stringify(await getDoc(`organizerActivations/${owner.uid}`))).not.toContain(code);
    expect((await call(identity.myAccess, {}, owner.ctx)).organizer).toMatchObject({ applicationStatus: "approved", activationPending: true });

    // Wrong code refused (right format, wrong value) and a stranger can't use the right code.
    const wrong = code.slice(0, 9) + (code[9] === "Z" ? "Y" : "Z");
    expect(await callCode(identity.redeemOrganizerCode, { code: wrong }, owner.ctx)).toBe("INVALID_INPUT");
    const stranger = person("j1-stranger");
    expect(await callCode(identity.redeemOrganizerCode, { code }, stranger.ctx)).toBe("INVALID_INPUT");
    expect(await getDoc(`memberships/${orgId}__${owner.uid}`)).toBeUndefined();

    // Redeem → owner membership; the code is burned.
    expect(await call(identity.redeemOrganizerCode, { code: code.toLowerCase().replace(/(.{5})/, "$1-") }, owner.ctx)).toEqual({ orgId });
    expect(await getDoc(`memberships/${orgId}__${owner.uid}`)).toMatchObject({ role: "owner", status: "active", eventScope: { all: true } });
    expect(await callCode(identity.redeemOrganizerCode, { code }, owner.ctx)).toBe("INVALID_INPUT");
    expect(await getDoc(`publicOrganizers/${orgId}`)).toMatchObject({ orgId, name: "Deccan Weekend Club", verified: true });

    // Commercial terms through the real decideCase (commission-proposal).
    const { agreementId } = await approveCommercialTerms(orgId, BPS);
    expect(await getDoc(`commercialAgreements/${agreementId}`)).toMatchObject({ status: "approved", commissionBps: BPS });

    // Experience with category config → submit → admin approves.
    const saved = await call(catalog.saveExperience, {
      requestId: rid("exp"), orgId, title: "Sunday 5-a-side Football", tagline: "Floodlit turf", category: "sports", activity: "Football",
      description: "A relaxed but competitive five-a-side football session for all skill levels.", highlights: ["Floodlit turf"],
      format: "5-a-side", genderRule: "open", ageMin: 18, idRequired: false, rules: ["No studs"], bring: ["Water"],
      safety: { level: "medium", measures: ["First-aid kit"] }, cancellationPolicy: "flexible",
      config: { teamSize: 5, skillLevel: "all-levels", equipmentProvided: true },
    }, owner.ctx);
    const experienceId = String(saved.experienceId);
    S.experienceId = experienceId;
    expect(await getDoc(`experiences/${experienceId}`)).toMatchObject({ status: "draft", config: { teamSize: 5, skillLevel: "all-levels" } });
    // Scheduling against an unapproved experience is refused.
    expect(await callCode(catalog.saveEvent, eventInput(orgId, experienceId, owner.uid), owner.ctx)).toBe("PRECONDITION");
    const sx = await call(catalog.submitExperience, { requestId: rid("sx"), orgId, experienceId }, owner.ctx);
    expect(await getDoc(`governanceCases/${sx.caseId}`)).toMatchObject({ kind: "experience-approval", targetId: experienceId });
    await approveCase(String(sx.caseId));
    expect(await getDoc(`experiences/${experienceId}`)).toMatchObject({ status: "approved" });

    // Event A (primary = owner) → submit → approve → publish (commission snapshotted).
    const ev = await call(catalog.saveEvent, eventInput(orgId, experienceId, owner.uid, { priceMinor: PRICE_A, capacity: { max: 10, min: 2 } }), owner.ctx);
    const eventA = String(ev.eventId);
    S.eventA = eventA;
    expect(await getDoc(`events/${eventA}`)).toMatchObject({ status: "draft", responsibility: { primaryUid: owner.uid } });
    expect(await callCode(catalog.publishEvent, { requestId: rid("pe"), orgId, eventId: eventA }, owner.ctx)).toBe("PRECONDITION");
    const se = await call(catalog.submitEvent, { requestId: rid("se"), orgId, eventId: eventA }, owner.ctx);
    expect(await callCode(catalog.publishEvent, { requestId: rid("pe"), orgId, eventId: eventA }, owner.ctx)).toBe("PRECONDITION");
    await approveCase(String(se.caseId));
    expect(await getDoc(`events/${eventA}`)).toMatchObject({ status: "approved" });
    const pub = await call(catalog.publishEvent, { requestId: rid("pe"), orgId, eventId: eventA }, owner.ctx);
    expect(pub).toMatchObject({ status: "published", commissionBps: BPS });
    const evA = (await getDoc(`events/${eventA}`))!;
    expect(evA).toMatchObject({ status: "published", priceMinor: PRICE_A });
    // The public event carries no commercial terms; they sit in the private snapshot.
    expect(evA).not.toHaveProperty("commissionBps");
    expect(await getDoc(`eventCommercials/${eventA}`)).toMatchObject({ orgId, commissionBps: BPS, commercialAgreementId: agreementId });
    expect(evA.publishedAt).toBeTruthy();

    // Event B of the same org (used by the staff-scope and cancellation journeys).
    const evB = await call(catalog.saveEvent, eventInput(orgId, experienceId, owner.uid, { priceMinor: PRICE_B, startsAt: new Date(Date.now() + 12 * 24 * H).toISOString() }), owner.ctx);
    S.eventB = String(evB.eventId);
    const seB = await call(catalog.submitEvent, { requestId: rid("se"), orgId, eventId: S.eventB }, owner.ctx);
    await approveCase(String(seB.caseId), adminB());
    await call(catalog.publishEvent, { requestId: rid("pe"), orgId, eventId: S.eventB }, owner.ctx);

    // Public: the published event is bookable by any profile-complete customer (proved in J2).
    const published = await docsWhere("events", "orgId", orgId);
    expect(published.filter((e) => e.status === "published").map((e) => e.id).sort()).toEqual([eventA, S.eventB].sort());
    // Organizer notifications from governance decisions.
    expect(await getDoc(`userNotifications/organizer-approved:${organizerCaseIdFor(owner.uid)}:v1:${owner.uid}`)).toBeTruthy();
    console.log(`J1 took ${Date.now() - t0} ms`);
  });

  test("J2 customer journey: profile → reserve 2 → order → verified confirm → tickets/ledger/notification; webhook replay is a no-op", async () => {
    const t0 = Date.now();
    const cust1 = await customer("j2-cust", { birthDate: "1995-05-20", gender: "woman" });
    S.cust1 = cust1;
    const eventA = S.eventA!;

    const r = await reserve(cust1, eventA, 2);
    expect(r).toMatchObject({ status: "held", amountMinor: 2 * PRICE_A, ticketIds: [] });
    const o = await order(cust1, r.bookingId);
    expect(o.amountMinor).toBe(2 * PRICE_A);
    const providerPaymentId = `pay_emu_${RUN}j2`;
    const c = await call(commerce.confirmPayment, { paymentId: o.paymentId, providerPaymentId, providerSignature: paymentSignature(o.providerOrderId, providerPaymentId) }, cust1.ctx);
    expect(c).toMatchObject({ bookingId: r.bookingId, status: "confirmed" });
    expect(c.ticketIds).toHaveLength(2);
    S.booking1 = { bookingId: r.bookingId, ticketIds: c.ticketIds, paymentId: o.paymentId, providerOrderId: o.providerOrderId, providerPaymentId };

    // Booking + event counters.
    expect(await getDoc(`bookings/${r.bookingId}`)).toMatchObject({ status: "confirmed", spots: 2, amountMinor: 2 * PRICE_A, paymentId: o.paymentId });
    expect((await getDoc(`events/${eventA}`))!.occupancy).toMatchObject({ confirmedPaidBookings: 2, activeReservationHolds: 0 });

    // Two tickets with signed payloads in ticketSecrets (holder-bound, no PII in the payload).
    for (const [i, id] of c.ticketIds.entries()) {
      const t = (await getDoc(`tickets/${id}`))!;
      expect(t).toMatchObject({ status: "valid", eventId: eventA, bookingId: r.bookingId, customerUid: cust1.uid, spotIndex: i + 1 });
      const sec = (await getDoc(`ticketSecrets/${id}`))!;
      expect(sec).toMatchObject({ customerUid: cust1.uid, eventId: eventA });
      expect(sec.payload).toBe(ticketPayload(id, eventA, r.bookingId));
      expect(sec.payload).toMatch(/^PX1\.[A-Za-z0-9]{20}\.[A-Za-z0-9_-]{22}$/);
    }

    // Payment snapshot + ledger balanced to the paisa.
    expect(await getDoc(`payments/${o.paymentId}`)).toMatchObject({ status: "captured", commissionBps: BPS, commissionMinor: commission(2 * PRICE_A), amountMinor: 2 * PRICE_A });
    const entries = await ledgerFor("bookingId", r.bookingId);
    expect(balancedTxns(entries)).toBe(1);
    expect(net(entries, "customer_payments")).toBe(-2 * PRICE_A);
    expect(net(entries, "platform_commission")).toBe(commission(2 * PRICE_A));
    expect(net(entries, "organizer_payable")).toBe(2 * PRICE_A - commission(2 * PRICE_A));

    // Notification (dedupe id = kind:booking:recipient).
    expect(await getDoc(`userNotifications/booking-confirmed:${r.bookingId}:${cust1.uid}`)).toMatchObject({ recipientUid: cust1.uid, read: false });

    // Replays: the same client confirmation and the webhook for the same capture.
    const before = {
      tickets: await count("tickets", "bookingId", r.bookingId),
      ledger: entries.length,
      notes: await count("userNotifications", "recipientUid", cust1.uid),
      occ: JSON.stringify((await getDoc(`events/${eventA}`))!.occupancy),
    };
    const again = await call(commerce.confirmPayment, { paymentId: o.paymentId, providerPaymentId, providerSignature: paymentSignature(o.providerOrderId, providerPaymentId) }, cust1.ctx);
    expect(again.ticketIds).toEqual(c.ticketIds);
    const hookId = `evt_rzp_${RUN}_j2`;
    const hook = await deliverWebhook(capturedEvent({ providerPaymentId, orderId: o.providerOrderId, paymentId: o.paymentId, amount: 2 * PRICE_A }), { eventId: hookId });
    expect(hook.statusCode).toBe(200);
    expect(hook.body).toMatchObject({ ok: true, outcome: "already-settled" });
    const dup = await deliverWebhook(capturedEvent({ providerPaymentId, orderId: o.providerOrderId, paymentId: o.paymentId, amount: 2 * PRICE_A }), { eventId: hookId });
    expect(dup.body).toMatchObject({ ok: true, duplicate: true });
    expect({
      tickets: await count("tickets", "bookingId", r.bookingId),
      ledger: (await ledgerFor("bookingId", r.bookingId)).length,
      notes: await count("userNotifications", "recipientUid", cust1.uid),
      occ: JSON.stringify((await getDoc(`events/${eventA}`))!.occupancy),
    }).toEqual(before);
    expect(await getDoc(`payments/${o.paymentId}`)).toMatchObject({ status: "captured", refundedMinor: 0 });
    console.log(`J2 took ${Date.now() - t0} ms`);
  });

  test("J3 staff journey: invite (check-in, event A) → code once → phone-bound redeem → scan → scope/money walls → revoke", async () => {
    const t0 = Date.now();
    const { owner, orgId, eventA, eventB } = S as Required<typeof S>;
    const staff = person("j3-staff");
    S.staff = staff;
    await completeProfile(staff, { gender: "non-binary" });

    const inviteRid = rid("inv");
    const inv = await call(identity.inviteStaff, {
      requestId: inviteRid, orgId, phone: staff.phone, title: "Door team", permissions: ["events.view", "attendees.view", "tickets.scan"], eventScope: [eventA],
    }, owner.ctx);
    expect(inv.code).toMatch(/^[23456789A-HJKMNP-Z]{8}$/);
    issuedCodes.push(inv.code);
    const replay = await call(identity.inviteStaff, {
      requestId: inviteRid, orgId, phone: staff.phone, title: "Door team", permissions: ["events.view", "attendees.view", "tickets.scan"], eventScope: [eventA],
    }, owner.ctx);
    expect(replay).toMatchObject({ replayed: true, codeAlreadyIssued: true, inviteId: inv.inviteId });
    expect(replay.code).toBeUndefined();
    expect(JSON.stringify(await getDoc(`staffInvites/${inv.inviteId}`))).not.toContain(inv.code);

    // Before redeeming: the phone alone grants nothing.
    expect(await callCode(commerce.scanTicket, { requestId: rid("sc"), eventId: eventA, payload: "PX1.x" }, staff.ctx)).toBe("NOT_PERMITTED");
    expect((await call(identity.myAccess, {}, staff.ctx)).pendingStaffInvites).toHaveLength(1);

    // Wrong phone refused (knowing the code is not enough) — right phone ok.
    const impostor = person("j3-impostor");
    expect(await callCode(identity.redeemStaffCode, { code: inv.code }, impostor.ctx)).toBe("INVALID_INPUT");
    expect(await getDoc(`memberships/${orgId}__${impostor.uid}`)).toBeUndefined();
    expect(await call(identity.redeemStaffCode, { code: inv.code }, staff.ctx)).toEqual({ orgId });
    const m = (await getDoc<Membership>(`memberships/${orgId}__${staff.uid}`))!;
    expect(m).toMatchObject({ role: "staff", status: "active", permissions: ["events.view", "attendees.view", "tickets.scan"], eventScope: { all: false, eventIds: [eventA] } });
    expect(await callCode(identity.redeemStaffCode, { code: inv.code }, staff.ctx)).toBe("INVALID_INPUT");

    // Scan ticket #1 → checked-in; again → already-used; same requestId replay → checked-in (idempotent).
    const [p1, p2] = await ticketPayloads(S.booking1!.ticketIds);
    const scanRid = rid("sc");
    S.staffScanRid = scanRid;
    expect((await scan(staff, eventA, p1!, scanRid)).result).toBe("checked-in");
    expect((await scan(staff, eventA, p1!)).result).toBe("already-used");
    expect((await scan(staff, eventA, p1!, scanRid)).result).toBe("checked-in");
    expect(await getDoc(`tickets/${S.booking1!.ticketIds[0]}`)).toMatchObject({ status: "used", checkedInBy: staff.uid, scanRequestId: scanRid });

    // Another event of the SAME org is outside the grant.
    const bTicketPayload = `PX1.${S.booking1!.ticketIds[1]}.${ticketSignature(S.booking1!.ticketIds[1]!, eventB, S.booking1!.bookingId)}`;
    expect(await callCode(commerce.scanTicket, { requestId: rid("sc"), eventId: eventB, payload: p2 }, staff.ctx)).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.scanTicket, { requestId: rid("sc"), eventId: eventB, payload: bTicketPayload }, staff.ctx)).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.listEventAttendees, { orgId, eventId: eventB }, staff.ctx)).toBe("NOT_PERMITTED");
    const attendees = await call(commerce.listEventAttendees, { orgId, eventId: eventA }, staff.ctx);
    expect(attendees.attendees).toHaveLength(2);
    expect(JSON.stringify(attendees)).not.toContain(S.cust1!.uid);

    // Money and team management are walled off.
    expect(await callCode(commerce.buildSettlement, { requestId: rid("bs"), orgId, periodEnd: new Date(Date.now() - 1000).toISOString() }, staff.ctx)).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.decideSettlement, { requestId: rid("ds"), settlementId: `stl_${orgId}_x`, action: "approve", note: "self-approve" }, staff.ctx)).toBe("NOT_PERMITTED");
    expect(allows(m, "earnings.view")).toBe(false); // the same predicate the ledger/settlement read rules use
    expect(allows(m, "refunds.view")).toBe(false);
    expect(await callCode(identity.listStaff, { orgId }, staff.ctx)).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.requestRefund, { requestId: rid("rr"), orgId, bookingId: S.booking1!.bookingId, amountMinor: 100, reason: "friend" }, staff.ctx)).toBe("NOT_PERMITTED");
    expect(await callCode(catalog.setEventPhase, { requestId: rid("ph"), orgId, eventId: eventA, phase: "booking-closed" }, staff.ctx)).toBe("NOT_PERMITTED");

    // Manual check-in (exists): ticket #2 by id with a reason; wrong event → NOT_PERMITTED.
    expect(await callCode(commerce.checkInManually, { requestId: rid("mc"), eventId: eventB, ticketId: S.booking1!.ticketIds[1], reason: "Phone battery died at door" }, staff.ctx)).toBe("NOT_PERMITTED");
    const manualRid = rid("mc");
    const manual = await call(commerce.checkInManually, { requestId: manualRid, eventId: eventA, ticketId: S.booking1!.ticketIds[1], reason: "Phone battery died at door" }, staff.ctx);
    expect(manual.result).toBe("checked-in");
    expect((await call(commerce.checkInManually, { requestId: manualRid, eventId: eventA, ticketId: S.booking1!.ticketIds[1], reason: "Phone battery died at door" }, staff.ctx)).result).toBe("checked-in");
    expect((await call(commerce.checkInManually, { requestId: rid("mc"), eventId: eventA, ticketId: S.booking1!.ticketIds[1], reason: "Phone battery died at door" }, staff.ctx)).result).toBe("already-used");
    expect((await scan(staff, eventA, p2!)).result).toBe("already-used");

    // Owner revokes → the very next scan is refused, even replaying the old requestId.
    const rev = await call(identity.revokeStaff, { requestId: rid("rv"), orgId, uid: staff.uid, reason: "Season ended" }, owner.ctx);
    expect(rev).toMatchObject({ status: "revoked" });
    expect(await callCode(commerce.scanTicket, { requestId: rid("sc"), eventId: eventA, payload: p1 }, staff.ctx)).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.scanTicket, { requestId: scanRid, eventId: eventA, payload: p1 }, staff.ctx)).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.checkInManually, { requestId: manualRid, eventId: eventA, ticketId: S.booking1!.ticketIds[1], reason: "Phone battery died at door" }, staff.ctx)).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.listEventAttendees, { orgId, eventId: eventA }, staff.ctx)).toBe("NOT_PERMITTED");
    expect(await getDoc(`userNotifications/staff-revoked:${orgId}__${staff.uid}:v1:${staff.uid}`)).toBeTruthy();
    expect((await docsWhere("auditEvents", "resourceId", `${orgId}__${staff.uid}`)).map((a) => a.action).sort()).toEqual(["staff.activated", "staff.revoked"]);
    console.log(`J3 took ${Date.now() - t0} ms`);
  });

  test("J4 completion & money: live → completed → reviews → settlement reconciles → dual-control payout", async () => {
    const t0 = Date.now();
    const { owner, orgId, eventA } = S as Required<typeof S>;
    // Second customer books but never checks in.
    const cust2 = await customer("j4-cust2", { birthDate: "1990-01-01", gender: "man" });
    S.cust2 = cust2;
    const b2 = await bookAndPay(cust2, eventA, 1);
    expect(b2.status).toBe("confirmed");

    // Phases only move forward; the clock is moved into the past as the catalog tests do.
    expect(await callCode(catalog.setEventPhase, { requestId: rid("ph"), orgId, eventId: eventA, phase: "live" }, owner.ctx)).toBe("PRECONDITION");
    await moveEventToPast(eventA);
    await call(catalog.setEventPhase, { requestId: rid("ph"), orgId, eventId: eventA, phase: "live" }, owner.ctx);
    await call(catalog.setEventPhase, { requestId: rid("ph"), orgId, eventId: eventA, phase: "completed" }, owner.ctx);
    expect(await callCode(catalog.setEventPhase, { requestId: rid("ph"), orgId, eventId: eventA, phase: "live" }, owner.ctx)).toBe("PRECONDITION");
    expect(await getDoc(`events/${eventA}`)).toMatchObject({ status: "completed" });

    // Reviews: the checked-in customer may; the no-show may not; the owner may not.
    const review = await call(catalog.submitReview, { requestId: rid("rv"), eventId: eventA, rating: 5, comment: "Great organisation and friendly games." }, S.cust1!.ctx);
    expect(review).toMatchObject({ reviewId: `${eventA}__${S.cust1!.uid}`, status: "published" });
    expect(await callCode(catalog.submitReview, { requestId: rid("rv"), eventId: eventA, rating: 1 }, cust2.ctx)).toBe("NOT_PERMITTED");
    expect(await getDoc(`reviews/${eventA}__${cust2.uid}`)).toBeUndefined();
    expect(await callCode(catalog.submitReview, { requestId: rid("rv"), eventId: eventA, rating: 5 }, owner.ctx)).toBe("NOT_PERMITTED");
    expect(await getDoc(`publicOrganizers/${orgId}`)).toMatchObject({ ratingCount: 1, ratingSum: 5 });

    // Settlement: organizer / staff can't build it; admin can.
    expect(await callCode(commerce.buildSettlement, { requestId: rid("bs"), orgId, periodEnd: new Date(Date.now() - 1000).toISOString() }, owner.ctx)).toBe("NOT_PERMITTED");
    const buildRid = rid("bs");
    // periodEnd = now: every capture above is included (entries created after periodEnd are, correctly, not).
    await new Promise((res) => setTimeout(res, 20));
    const built = await call(commerce.buildSettlement, { requestId: buildRid, orgId, periodEnd: new Date().toISOString() }, adminA());
    expect(built.status).toBe("pending-approval");
    const stl = (await getDoc(`settlements/${built.settlementId}`))!;
    const gross = 3 * PRICE_A;
    expect(stl).toMatchObject({ orgId, grossMinor: gross, commissionMinor: commission(2 * PRICE_A) + commission(PRICE_A), refundsMinor: 0 });
    expect(stl.grossMinor - stl.commissionMinor - stl.refundsMinor).toBe(stl.netMinor);

    // Independent reconciliation over ledgerEntries.
    const all = await ledgerFor("orgId", orgId);
    balancedTxns(all);
    const claimed = all.filter((e: Entry) => e.settlementId === built.settlementId);
    expect(claimed.every((e) => e.account === "organizer_payable" && e.eventId === eventA)).toBe(true);
    expect(claimed.length).toBe(stl.entryCount);
    const payableA = all.filter((e) => e.eventId === eventA && e.account === "organizer_payable");
    expect(claimed.length).toBe(payableA.length);
    expect(net(payableA, "organizer_payable")).toBe(stl.netMinor);
    const eventAEntries = all.filter((e) => e.eventId === eventA);
    expect(-net(eventAEntries, "customer_payments")).toBe(stl.grossMinor);
    expect(net(eventAEntries, "platform_commission")).toBe(stl.commissionMinor);
    expect(net(eventAEntries, "customer_refunds")).toBe(stl.refundsMinor);
    // Rebuilding claims nothing twice.
    const rebuilt = await call(commerce.buildSettlement, { requestId: rid("bs"), orgId, periodEnd: new Date().toISOString() }, adminB());
    expect(rebuilt).toMatchObject({ status: "empty", settlementId: null });

    // Decisions: approve (A) → mark-paid by A refused above ₹50,000 → by B allowed with a reference.
    expect(stl.netMinor).toBeGreaterThan(5_000_000);
    expect(await callCode(commerce.decideSettlement, { requestId: rid("ds"), settlementId: built.settlementId, action: "approve", note: "owner approves" }, owner.ctx)).toBe("NOT_PERMITTED");
    expect((await call(commerce.decideSettlement, { requestId: rid("ds"), settlementId: built.settlementId, action: "approve", note: "Reconciled against ledger" }, adminA())).status).toBe("approved");
    expect(await callCode(commerce.decideSettlement, { requestId: rid("ds"), settlementId: built.settlementId, action: "mark-paid", note: "paid", payoutReference: "UTR-A-0001" }, adminA())).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.decideSettlement, { requestId: rid("ds"), settlementId: built.settlementId, action: "mark-paid", note: "paid" }, adminB())).toBe("INVALID_INPUT");
    const paid = await call(commerce.decideSettlement, { requestId: rid("ds"), settlementId: built.settlementId, action: "mark-paid", note: "Paid via NEFT", payoutReference: `UTR${RUN}0001` }, adminB());
    expect(paid.status).toBe("paid");
    expect(await getDoc(`settlements/${built.settlementId}`)).toMatchObject({ status: "paid", approvedBy: ADMIN_A, paidBy: ADMIN_B, payoutReference: `UTR${RUN}0001` });
    console.log(`J4 took ${Date.now() - t0} ms`);
  });

  test("J5 cancellation journey: 3 confirmed customers → cancelEvent → refundCancelledEvent refunds each exactly once; idempotent", async () => {
    const t0 = Date.now();
    const { owner, orgId, eventB } = S as Required<typeof S>;
    const custs = await Promise.all([1, 2, 3].map((i) => customer(`j5-c${i}`)));
    const bookings = [];
    for (const c of custs) bookings.push(await bookAndPay(c, eventB, 1));
    expect(bookings.every((b) => b.status === "confirmed")).toBe(true);
    expect((await getDoc(`events/${eventB}`))!.occupancy).toMatchObject({ confirmedPaidBookings: 3 });

    expect(await callCode(catalog.cancelEvent, { requestId: rid("ce"), orgId, eventId: eventB, reason: "short" }, owner.ctx)).toBe("INVALID_INPUT");
    const cx = await call(catalog.cancelEvent, { requestId: rid("ce"), orgId, eventId: eventB, reason: "Turf closed for monsoon repairs" }, owner.ctx);
    expect(cx).toMatchObject({ status: "cancelled" });
    expect(await getDoc(`events/${eventB}`)).toMatchObject({ status: "cancelled", cancelReason: "Turf closed for monsoon repairs", statusBeforeCancel: "published" });

    const first = await refundCancelledEvent(eventB, { uid: owner.uid, role: "system" });
    // Where the Functions emulator runs (CI), the deployed onEventCancelled
    // trigger shares this work; per-booking transactions keep it exactly-once.
    expect(first.bookingsCancelled).toBeLessThanOrEqual(3);
    expect(first.refundsIssued).toBeLessThanOrEqual(3);
    await settle(async () => {
      const rs = await docsWhere("refunds", "eventId", eventB);
      return rs.length === 3 && rs.every((r) => (r as { status?: string }).status === "processing");
    });
    for (const [i, b] of bookings.entries()) {
      const refunds = await docsWhere("refunds", "bookingId", b.bookingId);
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ id: `evc_${b.bookingId}`, amountMinor: PRICE_B, reason: "event-cancelled", status: "processing", ledgerPosted: true });
      expect(await getDoc(`bookings/${b.bookingId}`)).toMatchObject({ status: "cancelled", cancelReason: "event-cancelled", refundedMinor: PRICE_B });
      expect(await getDoc(`payments/${b.paymentId}`)).toMatchObject({ status: "refunded", refundedMinor: PRICE_B });
      for (const t of b.ticketIds) expect((await getDoc(`tickets/${t}`))!.status).toBe("refunded");
      expect(await getDoc(`userNotifications/event-cancelled:${eventB}:${custs[i]!.uid}`)).toMatchObject({ kind: "event-cancelled" });
    }
    const ledger = await ledgerFor("eventId", eventB);
    expect(balancedTxns(ledger)).toBe(6); // 3 captures + 3 reversals
    expect(net(ledger, "organizer_payable")).toBe(0);
    expect(net(ledger, "platform_commission")).toBe(0);
    expect(-net(ledger, "customer_payments")).toBe(net(ledger, "customer_refunds"));
    expect((await getDoc(`events/${eventB}`))!.occupancy).toMatchObject({ confirmedPaidBookings: 0, activeReservationHolds: 0 });

    // Trigger fires again (at-least-once delivery): nothing changes.
    const snapshot = async () => ({
      ledger: (await ledgerFor("eventId", eventB)).length,
      refunds: await count("refunds", "eventId", eventB),
      notes: (await Promise.all(custs.map((c) => count("userNotifications", "recipientUid", c.uid)))).join(","),
      audits: await count("auditEvents", "orgId", orgId),
    });
    // Let any in-flight trigger writes land before taking the baseline.
    let before = await snapshot();
    for (let stable = 0; stable < 3; ) {
      await new Promise((r) => setTimeout(r, 500));
      const now = await snapshot();
      stable = JSON.stringify(now) === JSON.stringify(before) ? stable + 1 : 0;
      before = now;
    }
    const second = await refundCancelledEvent(eventB, { uid: owner.uid, role: "system" });
    expect(second).toMatchObject({ bookingsCancelled: 0, refundsIssued: 0, refundIds: [] });
    expect(await snapshot()).toEqual(before);

    // A cancelled event can't be booked or scanned into.
    const late = await customer("j5-late");
    expect(await callCode(commerce.reserveSeat, { requestId: rid("rs"), eventId: eventB, spots: 1, alias: "Late" }, late.ctx)).toBe("SESSION_NOT_BOOKABLE");
    const [pb] = await ticketPayloads(bookings[0]!.ticketIds);
    expect((await scan(owner, eventB, pb!)).result).toBe("refunded");
    console.log(`J5 took ${Date.now() - t0} ms`);
  });

  test("LEAK: no auditEvents / commandReceipts (or other stored doc) contains a plaintext organizer or staff code", async () => {
    expect(issuedCodes.length).toBeGreaterThanOrEqual(2);
    const { docs, text } = await dumpCollections([
      "auditEvents", "commandReceipts", "organizerActivations", "staffInvites", "organizerApplications", "governanceCases", "userNotifications", "memberships",
    ]);
    expect(docs).toBeGreaterThan(0);
    for (const code of issuedCodes) expect(text.includes(code)).toBe(false);
  });
});

// Keep unused-import linting quiet for helpers referenced only in some runs.
void ADMIN_A;
void approvedExperience;
