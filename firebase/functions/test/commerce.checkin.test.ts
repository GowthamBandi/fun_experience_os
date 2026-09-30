/**
 * Manual door check-in (checkInManually) and the organizer attendee list
 * (listEventAttendees).
 */

import {
  book,
  call,
  callCode,
  commerce,
  db,
  getDoc,
  newCustomer,
  phoneCtx,
  rid,
  seedEvent,
  seedMembership,
  uniq,
  world,
} from "./commerce-helpers";

jest.setTimeout(120_000);

type Scan = { result: string; ticket?: { ticketId: string; alias: string; spotsLabel: string; checkedInAt: string | null } };
type Attendee = { bookingId: string; ticketId: string; alias: string; status: string; checkedInAt: string | null; spotsLabel: string; bookedAt: string | null };

const REASON = "Guest's phone battery died at the door";

async function setup() {
  const { orgId, eventId } = await world({ priceMinor: 0 });
  const eventB = await seedEvent({ orgId, priceMinor: 0 });
  const uid = await newCustomer();
  const b = await book(uid, eventId, 2);
  const scanner = uniq("staff");
  await seedMembership(orgId, scanner, { permissions: ["tickets.scan", "attendees.view"], eventIds: [eventId, eventB] });
  return { orgId, eventId, eventB, uid, booking: b, scanner };
}

const manual = (scanner: string, eventId: string, ticketId: string, requestId = rid(), reason = REASON) =>
  call<Scan>(commerce.checkInManually, { requestId, eventId, ticketId, reason }, phoneCtx(scanner));

describe("checkInManually", () => {
  test("valid → checked-in with method + reason recorded and a dedicated audit action", async () => {
    const s = await setup();
    const ticketId = s.booking.ticketIds[0]!;
    const out = await manual(s.scanner, s.eventId, ticketId);
    expect(out.result).toBe("checked-in");
    expect(out.ticket).toMatchObject({ ticketId, spotsLabel: "Spot 1 of 2" });
    expect(out.ticket!.alias).toBeTruthy();
    expect(out.ticket!.checkedInAt).toEqual(expect.any(String));

    const t = (await getDoc<Record<string, unknown>>(`tickets/${ticketId}`))!;
    expect(t).toMatchObject({ status: "used", checkedInBy: s.scanner, checkInMethod: "manual", checkInReason: REASON });
    expect((await getDoc<{ status: string }>(`tickets/${s.booking.ticketIds[1]}`))!.status).toBe("valid");

    const audits = await db()
      .collection("auditEvents")
      .where("resourceId", "==", ticketId)
      .where("action", "==", "ticket.checked-in-manually")
      .get();
    expect(audits.size).toBe(1);
    expect(audits.docs[0]!.data()).toMatchObject({ actorUid: s.scanner, reason: REASON });
  });

  test("replaying the same requestId returns the same result and writes nothing new", async () => {
    const s = await setup();
    const ticketId = s.booking.ticketIds[0]!;
    const reqId = rid();
    const first = await manual(s.scanner, s.eventId, ticketId, reqId);
    const replay = await manual(s.scanner, s.eventId, ticketId, reqId);
    expect(replay).toEqual(first);
    expect(first.result).toBe("checked-in");
    const audits = await db().collection("auditEvents").where("resourceId", "==", ticketId).where("action", "==", "ticket.checked-in-manually").get();
    expect(audits.size).toBe(1);
  });

  test("a second manual check-in (new request) → already-used with the first time", async () => {
    const s = await setup();
    const ticketId = s.booking.ticketIds[0]!;
    const first = await manual(s.scanner, s.eventId, ticketId);
    const second = await manual(s.scanner, s.eventId, ticketId);
    expect(second.result).toBe("already-used");
    expect(second.ticket!.checkedInAt).toBe(first.ticket!.checkedInAt);
  });

  test("a ticket scanned by QR is already-used for manual check-in", async () => {
    const s = await setup();
    const ticketId = s.booking.ticketIds[1]!;
    const payload = (await getDoc<{ payload: string }>(`ticketSecrets/${ticketId}`))!.payload;
    const scan = await call<Scan>(commerce.scanTicket, { requestId: rid(), eventId: s.eventId, payload }, phoneCtx(s.scanner));
    expect(scan.result).toBe("checked-in");
    expect((await manual(s.scanner, s.eventId, ticketId)).result).toBe("already-used");
  });

  test("a ticket of another event (or an unknown ticket) → wrong-event, nothing changes", async () => {
    const s = await setup();
    expect(await manual(s.scanner, s.eventB, s.booking.ticketIds[0]!)).toEqual({ result: "wrong-event" });
    expect(await manual(s.scanner, s.eventId, "abcdefghijklmnopqrst")).toEqual({ result: "wrong-event" });
    expect((await getDoc<{ status: string }>(`tickets/${s.booking.ticketIds[0]}`))!.status).toBe("valid");
  });

  test("cancelled and refunded tickets are reported as such", async () => {
    const s = await setup();
    await db().collection("tickets").doc(s.booking.ticketIds[0]!).update({ status: "refunded" });
    await db().collection("tickets").doc(s.booking.ticketIds[1]!).update({ status: "cancelled" });
    expect((await manual(s.scanner, s.eventId, s.booking.ticketIds[0]!)).result).toBe("refunded");
    expect((await manual(s.scanner, s.eventId, s.booking.ticketIds[1]!)).result).toBe("cancelled");
  });

  test("no tickets.scan, out of scope, revoked, other org, customer → NOT_PERMITTED", async () => {
    const s = await setup();
    const noPerm = uniq("staff");
    await seedMembership(s.orgId, noPerm, { permissions: ["attendees.view"], eventIds: "all" });
    const outOfScope = uniq("staff");
    await seedMembership(s.orgId, outOfScope, { permissions: ["tickets.scan"], eventIds: [s.eventB] });
    const revoked = uniq("staff");
    await seedMembership(s.orgId, revoked, { permissions: ["tickets.scan"], eventIds: "all", status: "revoked" });
    const foreign = uniq("staff");
    await seedMembership(uniq("org"), foreign, { permissions: ["tickets.scan"], eventIds: "all", role: "owner" });

    for (const who of [noPerm, outOfScope, revoked, foreign, s.uid]) {
      const code = await callCode(
        commerce.checkInManually,
        { requestId: rid(), eventId: s.eventId, ticketId: s.booking.ticketIds[0], reason: REASON },
        phoneCtx(who)
      );
      expect(code).toBe("NOT_PERMITTED");
    }
    expect((await getDoc<{ status: string }>(`tickets/${s.booking.ticketIds[0]}`))!.status).toBe("valid");
  });

  test("a reason is required (10–300 characters)", async () => {
    const s = await setup();
    for (const reason of [undefined, "short", "x".repeat(301)]) {
      const code = await callCode(
        commerce.checkInManually,
        { requestId: rid(), eventId: s.eventId, ticketId: s.booking.ticketIds[0], reason },
        phoneCtx(s.scanner)
      );
      expect(code).toBe("INVALID_INPUT");
    }
  });
});

describe("listEventAttendees", () => {
  test("lists aliases and ticket ids only — no customer uid, phone, age or gender", async () => {
    const s = await setup();
    await manual(s.scanner, s.eventId, s.booking.ticketIds[0]!);
    const out = await call<{ attendees: Attendee[] }>(commerce.listEventAttendees, { orgId: s.orgId, eventId: s.eventId }, phoneCtx(s.scanner));
    expect(out.attendees).toHaveLength(2);
    const byTicket = new Map(out.attendees.map((a) => [a.ticketId, a]));
    expect(byTicket.get(s.booking.ticketIds[0]!)).toMatchObject({ bookingId: s.booking.bookingId, status: "used", spotsLabel: "Spot 1 of 2" });
    expect(byTicket.get(s.booking.ticketIds[0]!)!.checkedInAt).toEqual(expect.any(String));
    expect(byTicket.get(s.booking.ticketIds[1]!)).toMatchObject({ status: "valid", checkedInAt: null });
    for (const a of out.attendees) {
      expect(Object.keys(a).sort()).toEqual(["alias", "bookedAt", "bookingId", "checkedInAt", "spotsLabel", "status", "ticketId"]);
    }
    const raw = JSON.stringify(out);
    expect(raw).not.toContain(s.uid);
    for (const k of ["customerUid", "phone", "birthDate", "age", "gender"]) expect(raw).not.toContain(`"${k}"`);
  });

  test("not rate limited: a host workspace refreshing many events in parallel is never locked out", async () => {
    const s = await setup();
    // Well past the old 60-per-10-min budget, half of it in parallel bursts.
    for (let i = 0; i < 40; i++) {
      const out = await call<{ attendees: Attendee[] }>(commerce.listEventAttendees, { orgId: s.orgId, eventId: s.eventId }, phoneCtx(s.scanner));
      expect(out.attendees).toHaveLength(2);
    }
    for (let burst = 0; burst < 4; burst++) {
      const codes = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          callCode(commerce.listEventAttendees, { orgId: s.orgId, eventId: i % 2 ? s.eventB : s.eventId }, phoneCtx(s.scanner))
        )
      );
      expect(codes).toEqual(Array(10).fill("OK"));
    }
    expect((await db().collection("rateLimits").doc(`attendees_${s.scanner}`).get()).exists).toBe(false);
  });

  test("requires attendees.view on that event; other org's ids are not found", async () => {
    const s = await setup();
    const scanOnly = uniq("staff");
    await seedMembership(s.orgId, scanOnly, { permissions: ["tickets.scan"], eventIds: "all" });
    const outOfScope = uniq("staff");
    await seedMembership(s.orgId, outOfScope, { permissions: ["attendees.view"], eventIds: [s.eventB] });
    const revoked = uniq("staff");
    await seedMembership(s.orgId, revoked, { permissions: ["attendees.view"], eventIds: "all", status: "revoked" });
    for (const who of [scanOnly, outOfScope, revoked, s.uid]) {
      expect(await callCode(commerce.listEventAttendees, { orgId: s.orgId, eventId: s.eventId }, phoneCtx(who))).toBe("NOT_PERMITTED");
    }
    const otherOrg = uniq("org");
    const foreign = uniq("staff");
    await seedMembership(otherOrg, foreign, { permissions: ["attendees.view"], eventIds: "all", role: "owner" });
    expect(await callCode(commerce.listEventAttendees, { orgId: otherOrg, eventId: s.eventId }, phoneCtx(foreign))).toBe("NOT_FOUND");
  });
});
