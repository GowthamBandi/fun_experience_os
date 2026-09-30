/**
 * Signed QR tickets and door check-in (scanTicket).
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
import { ticketPayload, ticketSignature } from "../src/commerce/tickets";

jest.setTimeout(120_000);

type Scan = { result: string; ticket?: { ticketId: string; alias: string; spotsLabel: string; checkedInAt: string | null } };

async function setup() {
  const { orgId, eventId } = await world({ priceMinor: 0 });
  const eventB = await seedEvent({ orgId, priceMinor: 0 });
  const uid = await newCustomer();
  const b = await book(uid, eventId, 2);
  const payloads = await Promise.all(b.ticketIds.map(async (t) => (await getDoc<{ payload: string }>(`ticketSecrets/${t}`))!.payload));
  const scanner = uniq("staff");
  await seedMembership(orgId, scanner, { permissions: ["tickets.scan"], eventIds: [eventId, eventB] });
  return { orgId, eventId, eventB, uid, booking: b, payloads, scanner };
}

const scan = (scanner: string, eventId: string, payload: string, requestId = rid()) =>
  call<Scan>(commerce.scanTicket, { requestId, eventId, payload }, phoneCtx(scanner));

describe("scanTicket", () => {
  test("valid → checked-in; same requestId replay → same result; another scan → already-used with first time", async () => {
    const s = await setup();
    const reqId = rid();
    const first = await scan(s.scanner, s.eventId, s.payloads[0]!, reqId);
    expect(first.result).toBe("checked-in");
    expect(first.ticket!.spotsLabel).toBe("Spot 1 of 2");
    expect(first.ticket!.alias).toBeTruthy();

    const replay = await scan(s.scanner, s.eventId, s.payloads[0]!, reqId);
    expect(replay).toEqual(first);

    const second = await scan(s.scanner, s.eventId, s.payloads[0]!);
    expect(second.result).toBe("already-used");
    expect(second.ticket!.checkedInAt).toBe(first.ticket!.checkedInAt);

    // A second scanner at the door also sees already-used.
    const other = uniq("staff");
    await seedMembership(s.orgId, other, { permissions: ["tickets.scan"], eventIds: "all" });
    expect((await scan(other, s.eventId, s.payloads[0]!)).result).toBe("already-used");

    const t = (await getDoc<{ status: string; checkedInBy: string; scanRequestId: string }>(`tickets/${s.booking.ticketIds[0]}`))!;
    expect(t).toMatchObject({ status: "used", checkedInBy: s.scanner, scanRequestId: reqId });
    // The other spot of the booking is untouched.
    expect((await getDoc<{ status: string }>(`tickets/${s.booking.ticketIds[1]}`))!.status).toBe("valid");

    const audits = await db().collection("auditEvents").where("resourceId", "==", s.booking.ticketIds[0]).where("action", "==", "ticket.checked-in").get();
    expect(audits.size).toBe(1);
  });

  test("concurrent scans of the same ticket check in exactly once", async () => {
    const s = await setup();
    const out = await Promise.all([1, 2, 3, 4].map(() => scan(s.scanner, s.eventId, s.payloads[1]!)));
    expect(out.filter((o) => o.result === "checked-in")).toHaveLength(1);
    expect(out.filter((o) => o.result === "already-used")).toHaveLength(3);
  });

  test("forged and altered payloads are invalid and change nothing", async () => {
    const s = await setup();
    const [, ticketId, sig] = s.payloads[0]!.split(".");
    const flip = (c: string) => (c === "A" ? "B" : "A");
    const attacks = [
      `PX1.${ticketId}.${flip(sig![0]!)}${sig!.slice(1)}`, // altered signature
      `PX1.${s.booking.ticketIds[1]}.${sig}`, // signature moved to another ticket
      `PX1.${ticketId}.${"A".repeat(22)}`, // guessed signature
      `PX1.${"x".repeat(20)}.${sig}`, // unknown ticket
      `PX2.${ticketId}.${sig}`, // wrong version
      `PX1.${ticketId}.${sig}.extra`,
      "not a ticket",
      // Signed with the right algorithm but for another booking id (forged binding).
      `PX1.${ticketId}.${ticketSignature(ticketId!, s.eventId, "someOtherBooking")}`,
    ];
    for (const p of attacks) expect((await scan(s.scanner, s.eventId, p)).result).toBe("invalid");
    for (const t of s.booking.ticketIds) expect((await getDoc<{ status: string }>(`tickets/${t}`))!.status).toBe("valid");
    const rejected = await db().collection("auditEvents").where("actorUid", "==", s.scanner).where("action", "==", "ticket.scan-rejected").get();
    expect(rejected.size).toBe(attacks.length);
  });

  test("a genuine ticket scanned at another event → wrong-event", async () => {
    const s = await setup();
    expect((await scan(s.scanner, s.eventB, s.payloads[0]!)).result).toBe("wrong-event");
    expect((await getDoc<{ status: string }>(`tickets/${s.booking.ticketIds[0]}`))!.status).toBe("valid");
  });

  test("staff without tickets.scan, out of event scope, revoked, or from another org → NOT_PERMITTED", async () => {
    const s = await setup();
    const noPerm = uniq("staff");
    await seedMembership(s.orgId, noPerm, { permissions: ["attendees.view"], eventIds: "all" });
    const outOfScope = uniq("staff");
    await seedMembership(s.orgId, outOfScope, { permissions: ["tickets.scan"], eventIds: [s.eventB] });
    const revoked = uniq("staff");
    await seedMembership(s.orgId, revoked, { permissions: ["tickets.scan"], eventIds: "all", status: "revoked" });
    const foreign = uniq("staff");
    await seedMembership(uniq("org"), foreign, { permissions: ["tickets.scan"], eventIds: "all", role: "owner" });
    const customer = s.uid;

    for (const who of [noPerm, outOfScope, revoked, foreign, customer]) {
      expect(await callCode(commerce.scanTicket, { requestId: rid(), eventId: s.eventId, payload: s.payloads[0] }, phoneCtx(who))).toBe("NOT_PERMITTED");
    }
    expect((await getDoc<{ status: string }>(`tickets/${s.booking.ticketIds[0]}`))!.status).toBe("valid");
  });

  test("revocation applies to the very next scan", async () => {
    const s = await setup();
    expect((await scan(s.scanner, s.eventId, s.payloads[0]!)).result).toBe("checked-in");
    await seedMembership(s.orgId, s.scanner, { permissions: ["tickets.scan"], eventIds: [s.eventId], status: "revoked" });
    expect(await callCode(commerce.scanTicket, { requestId: rid(), eventId: s.eventId, payload: s.payloads[1] }, phoneCtx(s.scanner))).toBe("NOT_PERMITTED");
  });

  test("cancelled and refunded tickets are reported as such", async () => {
    const s = await setup();
    await db().collection("tickets").doc(s.booking.ticketIds[0]!).update({ status: "refunded" });
    await db().collection("tickets").doc(s.booking.ticketIds[1]!).update({ status: "cancelled" });
    expect((await scan(s.scanner, s.eventId, s.payloads[0]!)).result).toBe("refunded");
    expect((await scan(s.scanner, s.eventId, s.payloads[1]!)).result).toBe("cancelled");
  });

  test("scans are rate limited per scanner", async () => {
    const s = await setup();
    const codes: string[] = [];
    for (let i = 0; i < 121; i++) {
      codes.push(await callCode(commerce.scanTicket, { requestId: rid(), eventId: s.eventId, payload: "junk-junk" }, phoneCtx(s.scanner)));
    }
    expect(codes.slice(0, 120).every((c) => c === "OK")).toBe(true);
    expect(codes[120]).toBe("RATE_LIMITED");
  });

  test("the payload format carries no personal data and matches the documented signature", async () => {
    const s = await setup();
    const t = (await getDoc<{ bookingId: string; eventId: string }>(`tickets/${s.booking.ticketIds[0]}`))!;
    expect(s.payloads[0]).toBe(ticketPayload(s.booking.ticketIds[0]!, t.eventId, t.bookingId));
    expect(s.payloads[0]).not.toContain(s.uid);
    expect(s.payloads[0]!.split(".")[2]).toHaveLength(22);
  });
});
