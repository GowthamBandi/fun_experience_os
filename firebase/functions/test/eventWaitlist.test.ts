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

  test("join only when sold out and not booked; leave; an opening alerts, they stay on until they book, and hear about the next one", async () => {
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
    const spotAlerts = async (uid: string) =>
      (await db().collection("userNotifications").where("recipientUid", "==", uid).get()).docs
        .map((d) => d.data())
        .filter((n) => n.title === "A spot opened on Pickleball Night");
    await db().doc(`events/${id}`).update({ occupancy: occ(3) });
    // The emulator's real trigger may already have sent it: exactly one either way.
    await notifyEventWaitlist(id);
    expect(await spotAlerts(a)).toHaveLength(1);
    expect((await spotAlerts(a))[0]).toMatchObject({ link: { type: "event", id } });
    expect((await spotAlerts(a))[0].body).toMatch(/stay on the waitlist until you get in/);
    expect((await db().doc(`eventWaitlist/${id}__${a}`).get()).data()).toMatchObject({ alerts: 1 });
    // Inside the cooldown: nobody is told twice.
    expect(await notifyEventWaitlist(id)).toEqual({ notified: 0, cleared: 0 });

    // a lost that spot; another opens later: a hears again.
    const later = Date.now() + 11 * 60_000;
    expect(await notifyEventWaitlist(id, later)).toEqual({ notified: 1, cleared: 0 });
    expect(await spotAlerts(a)).toHaveLength(2);

    // a books: the next run drops them without another alert.
    await db().doc(`bookings/${uniq("bk")}`).set({ eventId: id, customerUid: a, status: "confirmed" });
    expect(await notifyEventWaitlist(id, later + 11 * 60_000)).toEqual({ notified: 0, cleared: 1 });
    expect((await db().doc(`eventWaitlist/${id}__${a}`).get()).exists).toBe(false);
    expect(await spotAlerts(a)).toHaveLength(2);
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
