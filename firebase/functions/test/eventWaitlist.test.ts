/**
 * Waitlist for sold-out experiences (commerce/eventWaitlist.ts).
 */
import { call, callCode, phoneCtx, uniq, rid, db, Timestamp } from "./commerce-helpers";
import * as commerce from "../src/commerce";
import { eventOpenSpots, eventSpotOpened, notifyEventWaitlist } from "../src/commerce/eventWaitlist";

const DAY = 86_400_000;
const cap = { maxPhysicalCapacity: 4, blockedSlots: 0, compSlots: 0, minParticipants: 2, targetParticipants: 4 };
const occ = (paid: number) => ({ activeReservationHolds: 0, waitlistOfferHolds: 0, confirmedPaidBookings: paid, confirmedComplimentaryBookings: 0, waitlistCount: 0 });

async function event(paid = 4, over: Record<string, unknown> = {}) {
  const id = uniq("ev");
  await db().doc(`events/${id}`).set({ orgId: "org-x", title: "Pickleball Night", status: "published", startsAt: Timestamp.fromMillis(Date.now() + 2 * DAY), capacity: cap, occupancy: occ(paid), ...over });
  return id;
}

describe("event waitlist", () => {
  test("open spots and the 'spot opened' edge", () => {
    const ev = { status: "published", startsAt: Timestamp.fromMillis(Date.now() + DAY), capacity: cap, occupancy: occ(4) };
    expect(eventOpenSpots(ev)).toBe(0);
    expect(eventOpenSpots({ ...ev, occupancy: occ(3) })).toBe(1);
    expect(eventSpotOpened(ev, { ...ev, occupancy: occ(3) })).toBe(true);
    expect(eventSpotOpened({ ...ev, occupancy: occ(2) }, { ...ev, occupancy: occ(3) })).toBe(false);
    expect(eventOpenSpots({ ...ev, status: "cancelled", occupancy: occ(0) })).toBe(0);
  });

  test("join only when sold out and not booked; leave; a spot opening notifies once and clears", async () => {
    const id = await event(4);
    const a = uniq("cust");
    const b = uniq("cust");
    await call(commerce.joinEventWaitlist, { requestId: rid(), eventId: id }, phoneCtx(a));
    await call(commerce.joinEventWaitlist, { requestId: rid(), eventId: id }, phoneCtx(b));
    expect((await db().doc(`eventWaitlist/${id}__${a}`).get()).exists).toBe(true);
    await call(commerce.leaveEventWaitlist, { eventId: id }, phoneCtx(b));
    expect((await db().doc(`eventWaitlist/${id}__${b}`).get()).exists).toBe(false);

    // Still full: nothing happens.
    expect(await notifyEventWaitlist(id)).toEqual({ notified: 0, cleared: 0 });
    await db().doc(`events/${id}`).update({ occupancy: occ(3) });
    const out = await notifyEventWaitlist(id);
    expect(out.cleared).toBeGreaterThanOrEqual(1);
    const notes = (await db().collection("userNotifications").where("recipientUid", "==", a).get()).docs.map((d) => d.data());
    expect(notes.find((n) => n.title === "A spot opened on Pickleball Night")).toMatchObject({ link: { type: "event", id } });
    expect((await db().doc(`eventWaitlist/${id}__${a}`).get()).exists).toBe(false);
  });

  test("refused when spots are open, when already booked, or when the event isn't on sale", async () => {
    const open = await event(1);
    expect(await callCode(commerce.joinEventWaitlist, { requestId: rid(), eventId: open }, phoneCtx(uniq("c")))).toBe("PRECONDITION");
    const full = await event(4);
    const booked = uniq("c");
    await db().doc(`bookings/${uniq("bk")}`).set({ eventId: full, customerUid: booked, status: "confirmed" });
    expect(await callCode(commerce.joinEventWaitlist, { requestId: rid(), eventId: full }, phoneCtx(booked))).toBe("PRECONDITION");
    const draft = await event(4, { status: "draft" });
    expect(await callCode(commerce.joinEventWaitlist, { requestId: rid(), eventId: draft }, phoneCtx(uniq("c")))).toBe("NOT_FOUND");
  });

  test("a cancelled event clears its waitlist without an alert", async () => {
    const id = await event(4);
    const a = uniq("cust");
    await call(commerce.joinEventWaitlist, { requestId: rid(), eventId: id }, phoneCtx(a));
    await db().doc(`events/${id}`).update({ status: "cancelled", occupancy: occ(0) });
    expect(await notifyEventWaitlist(id)).toEqual({ notified: 0, cleared: 1 });
  });
});
