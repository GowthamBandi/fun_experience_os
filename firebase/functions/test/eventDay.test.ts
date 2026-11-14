/**
 * Event-day state on the server (catalog/eventDay.ts): teams draw → lock →
 * reveal (bookings get their team + a notification), safety checks,
 * incidents (medium/high raise a risk alert), permissions and event status.
 */
import { call, callCode, callErr, phoneCtx, uniq, rid, db, Timestamp } from "./commerce-helpers";
import * as catalog from "../src/catalog";

async function world() {
  const orgId = uniq("org-day");
  const owner = uniq("owner");
  const staff = uniq("staff");
  const viewer = uniq("viewer");
  const eventId = uniq("ev");
  await db().doc(`organizers/${orgId}`).set({ status: "active", ownerUid: owner });
  const member = (uid: string, role: string, permissions: string[]) =>
    db().doc(`memberships/${orgId}__${uid}`).set({ orgId, uid, role, status: "active", permissions, eventScope: { all: true, eventIds: [] } });
  await member(owner, "owner", []);
  await member(staff, "staff", ["events.operate", "attendees.view"]);
  await member(viewer, "staff", ["attendees.view"]);
  await db().doc(`events/${eventId}`).set({ orgId, title: "Evening Badminton", status: "live", startsAt: Timestamp.now() });
  const people: Array<{ uid: string; bookingId: string; ticketId: string }> = [];
  for (let i = 0; i < 4; i++) {
    const uid = uniq("cust");
    const bookingId = uniq("bk");
    const ticketId = uniq("tk");
    await db().doc(`bookings/${bookingId}`).set({ customerUid: uid, eventId, orgId, status: "confirmed" });
    await db().doc(`tickets/${ticketId}`).set({ eventId, bookingId, customerUid: uid, status: "valid" });
    people.push({ uid, bookingId, ticketId });
  }
  return { orgId, owner, staff, viewer, eventId, people };
}

const save = (uid: string, w: { orgId: string; eventId: string }, op: Record<string, unknown>) =>
  call<{ op: string; revealed: number }>(catalog.saveEventDay, { requestId: rid(), orgId: w.orgId, eventId: w.eventId, ...op }, phoneCtx(uid));
const day = async (eventId: string) => (await db().doc(`eventDays/${eventId}`).get()).data()!;

describe("event day on the server", () => {
  test("draw → lock → reveal: each booking gets its team and a notification", async () => {
    const w = await world();
    const teams = Object.fromEntries(w.people.map((p, i) => [p.ticketId, i % 2]));
    expect(await callCode(catalog.saveEventDay, { requestId: rid(), orgId: w.orgId, eventId: w.eventId, op: "reveal" }, phoneCtx(w.staff))).toBe("PRECONDITION");
    await save(w.staff, w, { op: "teams", teamCount: 2, teams });
    expect(await day(w.eventId)).toMatchObject({ teamCount: 2, teams, teamsRevealed: false });
    await save(w.staff, w, { op: "lock" });
    expect(await callCode(catalog.saveEventDay, { requestId: rid(), orgId: w.orgId, eventId: w.eventId, op: "teams", teamCount: 2, teams }, phoneCtx(w.staff))).toBe("PRECONDITION");
    const r = await save(w.owner, w, { op: "reveal" });
    expect(r.revealed).toBe(4);
    for (const [i, p] of w.people.entries()) {
      expect((await db().doc(`bookings/${p.bookingId}`).get()).data()!.team).toBe(i % 2 === 0 ? "Team A" : "Team B");
      const notes = await db().collection("userNotifications").where("recipientUid", "==", p.uid).get();
      expect(notes.docs.map((n) => n.data().title)).toContain(i % 2 === 0 ? "You're in Team A" : "You're in Team B");
    }
    expect((await day(w.eventId)).teamsRevealed).toBe(true);
  });

  test("bad splits are refused", async () => {
    const w = await world();
    expect((await callErr(catalog.saveEventDay, { requestId: rid(), orgId: w.orgId, eventId: w.eventId, op: "teams", teamCount: 2, teams: { [w.people[0]!.ticketId]: 5 } }, phoneCtx(w.staff))).message).toMatch(/out of range/);
    expect(await callCode(catalog.saveEventDay, { requestId: rid(), orgId: w.orgId, eventId: w.eventId, op: "teams", teamCount: 9, teams: {} }, phoneCtx(w.staff))).toBe("INVALID_INPUT");
  });

  test("safety checks tick and untick; incidents alert trust & safety from medium up", async () => {
    const w = await world();
    await save(w.staff, w, { op: "safety", check: "firstAid", done: true });
    await save(w.staff, w, { op: "safety", check: "briefing", done: true });
    await save(w.staff, w, { op: "safety", check: "firstAid", done: false });
    expect((await day(w.eventId)).safetyChecks).toEqual(["briefing"]);

    await save(w.staff, w, { op: "incident", id: "i-1700000000-1", note: "Minor sprain, iced it.", severity: "low" });
    await save(w.staff, w, { op: "incident", id: "i-1700000000-2", note: "Player fainted; ambulance called.", severity: "high" });
    // Same incident sent again from another phone: kept once.
    await save(w.owner, w, { op: "incident", id: "i-1700000000-2", note: "Player fainted; ambulance called.", severity: "high" });
    const d = await day(w.eventId);
    expect(d.incidents.map((i: { id: string }) => i.id)).toEqual(["i-1700000000-1", "i-1700000000-2"]);
    expect((await db().doc(`riskAlerts/incident_${w.eventId}_i-1700000000-1`).get()).exists).toBe(false);
    expect((await db().doc(`riskAlerts/incident_${w.eventId}_i-1700000000-2`).get()).data()).toMatchObject({ kind: "event-incident", severity: "high", orgId: w.orgId });

    await save(w.staff, w, { op: "wrapUp", value: true });
    expect((await day(w.eventId)).wrapUp).toBe(true);
  });

  test("needs events.operate on an event that's on sale or live", async () => {
    const w = await world();
    for (const who of [w.viewer, uniq("stranger")]) {
      expect(await callCode(catalog.saveEventDay, { requestId: rid(), orgId: w.orgId, eventId: w.eventId, op: "safety", check: "exits", done: true }, phoneCtx(who))).toBe("NOT_PERMITTED");
    }
    await db().doc(`events/${w.eventId}`).update({ status: "draft" });
    expect(await callCode(catalog.saveEventDay, { requestId: rid(), orgId: w.orgId, eventId: w.eventId, op: "safety", check: "exits", done: true }, phoneCtx(w.staff))).toBe("PRECONDITION");
  });
});
