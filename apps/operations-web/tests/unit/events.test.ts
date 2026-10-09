import { describe, expect, it } from "vitest";
import {
  bookingBadge,
  bookingSummary,
  eventRange,
  eventTab,
  eventWhen,
  facets,
  filterEvents,
  isCancellable,
  isOffLifecycle,
  occupancyOf,
  parseEventTab,
  partitionEvents,
  ratio,
  startsRel,
  toBooking,
  toReview,
} from "@/lib/events";
import { toOrgEvent } from "@/lib/organizers";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const NOW = new Date("2026-10-09T12:00:00Z"); // 17:30 IST

const ev = (id: string, status: string, startsIso: string | null, endsIso: string | null, extra: Record<string, unknown> = {}) =>
  toOrgEvent(id, { title: id, status, startsAt: startsIso ? ts(startsIso) : undefined, endsAt: endsIso ? ts(endsIso) : undefined, ...extra });

describe("eventTab", () => {
  it("puts open events by the clock and the live phase", () => {
    expect(eventTab(ev("a", "published", "2026-10-10T12:00:00Z", "2026-10-10T14:00:00Z"), NOW)).toBe("upcoming");
    expect(eventTab(ev("b", "published", "2026-10-09T11:00:00Z", "2026-10-09T13:00:00Z"), NOW)).toBe("live");
    expect(eventTab(ev("c", "booking-closed", "2026-10-08T11:00:00Z", "2026-10-08T13:00:00Z"), NOW)).toBe("past");
    // The organizer can go live up to 3 h early: the live phase wins over the clock.
    expect(eventTab(ev("d", "live", "2026-10-09T14:00:00Z", "2026-10-09T16:00:00Z"), NOW)).toBe("live");
  });
  it("assumes 3 h when the end is missing, and upcoming when the start is missing", () => {
    expect(eventTab(ev("e", "published", "2026-10-09T10:00:00Z", null), NOW)).toBe("live");
    expect(eventTab(ev("f", "published", "2026-10-09T08:00:00Z", null), NOW)).toBe("past");
    expect(eventTab(ev("g", "published", null, null), NOW)).toBe("upcoming");
  });
  it("sends completed to past, cancelled to cancelled and everything else to drafts", () => {
    expect(eventTab(ev("h", "completed", "2026-10-20T00:00:00Z", null), NOW)).toBe("past");
    expect(eventTab(ev("i", "cancelled", "2026-10-20T00:00:00Z", null), NOW)).toBe("cancelled");
    for (const s of ["draft", "submitted", "changes-requested", "approved", "rejected", "paused", "blocked", "weird", ""]) {
      expect(eventTab(ev("j", s, "2026-10-20T00:00:00Z", null), NOW)).toBe("drafts");
    }
  });
  it("partitions and sorts: upcoming soonest first, past newest first", () => {
    const parts = partitionEvents(
      [
        ev("late", "published", "2026-10-12T12:00:00Z", null),
        ev("soon", "published", "2026-10-10T12:00:00Z", null),
        ev("old", "completed", "2026-10-01T12:00:00Z", null),
        ev("recent", "completed", "2026-10-05T12:00:00Z", null),
      ],
      NOW,
    );
    expect(parts.upcoming.map((e) => e.id)).toEqual(["soon", "late"]);
    expect(parts.past.map((e) => e.id)).toEqual(["recent", "old"]);
    expect(parts.live).toEqual([]);
  });
  it("parses the tab param", () => {
    expect(parseEventTab("drafts")).toBe("drafts");
    expect(parseEventTab("nope")).toBe("upcoming");
    expect(parseEventTab(null)).toBe("upcoming");
  });
});

describe("filters", () => {
  const rows = [
    ev("1", "published", null, null, { venue: { city: "Pune" }, category: "trips", organizerName: "Trailblazers Treks" }),
    ev("2", "published", null, null, { venue: { city: "Bengaluru" }, category: "sports", organizerName: "Weekend Cricket Club" }),
    ev("3", "published", null, null, { venue: { city: "Bengaluru" }, category: "music" }),
    ev("4", "published", null, null, {}),
  ];
  it("builds facets most common first and skips missing values", () => {
    expect(facets(rows, "city")).toEqual([
      { value: "Bengaluru", count: 2 },
      { value: "Pune", count: 1 },
    ]);
    expect(facets(rows, "category").map((f) => f.value)).toEqual(["music", "sports", "trips"]);
  });
  it("filters by city, category and search", () => {
    expect(filterEvents(rows, { city: "Bengaluru", category: null, search: "" }).map((e) => e.id)).toEqual(["2", "3"]);
    expect(filterEvents(rows, { city: "Bengaluru", category: "music", search: "" }).map((e) => e.id)).toEqual(["3"]);
    expect(filterEvents(rows, { city: null, category: null, search: "  cricket " }).map((e) => e.id)).toEqual(["2"]);
  });
});

describe("time labels (IST)", () => {
  it("formats day and time in IST", () => {
    expect(eventWhen(new Date("2026-10-11T13:30:00Z"))).toBe("Sun, 11 Oct · 7:00 pm");
    expect(eventWhen(null)).toBe("—");
  });
  it("labels relative days by the IST calendar", () => {
    expect(startsRel(new Date("2026-10-09T12:40:00Z"), NOW)).toBe("in 40 min");
    expect(startsRel(new Date("2026-10-09T11:30:00Z"), NOW)).toBe("started 30 min ago");
    expect(startsRel(new Date("2026-10-09T15:00:00Z"), NOW)).toBe("today, in 3 h");
    // 19:00Z on the 9th is 00:30 IST on the 10th: tomorrow, not today.
    expect(startsRel(new Date("2026-10-09T19:00:00Z"), NOW)).toBe("tomorrow");
    expect(startsRel(new Date("2026-10-14T12:00:00Z"), NOW)).toBe("in 5 days");
    expect(startsRel(new Date("2026-10-08T12:00:00Z"), NOW)).toBe("yesterday");
    expect(startsRel(new Date("2026-10-06T12:00:00Z"), NOW)).toBe("3 days ago");
    expect(startsRel(null, NOW)).toBe("—");
  });
  it("collapses a same-day range", () => {
    expect(eventRange(new Date("2026-10-11T13:30:00Z"), new Date("2026-10-11T15:30:00Z"))).toBe("Sun, 11 Oct · 7:00 pm – 9:00 pm");
    expect(eventRange(new Date("2026-10-11T13:30:00Z"), new Date("2026-10-12T13:30:00Z"))).toBe("Sun, 11 Oct · 7:00 pm → Mon, 12 Oct · 7:00 pm");
    expect(eventRange(null, null)).toBe("—");
  });
});

describe("occupancy", () => {
  it("reads capacity.maxPhysicalCapacity and the occupancy counters", () => {
    const o = occupancyOf({
      capacity: { maxPhysicalCapacity: 16, blockedSlots: 1 },
      occupancy: { confirmedPaidBookings: 9, confirmedComplimentaryBookings: 2, activeReservationHolds: 1, waitlistOfferHolds: 0, waitlistCount: 3 },
    });
    expect(o).toEqual({ capacity: 16, blocked: 1, taken: 11, held: 1, waitlist: 3, left: 3 });
  });
  it("falls back to capacity.max and never invents taken", () => {
    expect(occupancyOf({ capacity: { max: 10 } })).toMatchObject({ capacity: 10, taken: null, left: null });
    expect(occupancyOf({})).toMatchObject({ capacity: null, taken: null, left: null });
    expect(occupancyOf({ capacity: { max: 4 }, occupancy: { confirmedPaidBookings: 6 } }).left).toBe(0);
  });
  it("computes ratios without NaN", () => {
    expect(ratio(11, 16)).toBe(69);
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(null, 10)).toBeNull();
    expect(ratio(3, null)).toBeNull();
  });
});

describe("bookings and reviews", () => {
  it("shapes a booking and tolerates missing fields", () => {
    const b = toBooking("b1", { reference: "PLS-K7Q2MX", alias: "Ravi", spots: 2, amountMinor: 79800, status: "confirmed", createdAt: ts("2026-10-08T10:00:00Z"), eventId: "e1", customerUid: "u1", bookingType: "individual" });
    expect(b).toMatchObject({ reference: "PLS-K7Q2MX", alias: "Ravi", spots: 2, amountMinor: 79800, status: "confirmed", complimentary: false, eventId: "e1" });
    expect(toBooking("b2", { bookingType: "complimentary" })).toMatchObject({ reference: null, amountMinor: null, createdAt: null, complimentary: true });
  });
  it("badges booking statuses and summarises them", () => {
    expect(bookingBadge("confirmed")).toEqual({ label: "Confirmed", tone: "ok" });
    expect(bookingBadge("payment-orphaned").tone).toBe("err");
    expect(bookingBadge(undefined)).toEqual({ label: "—", tone: "muted" });
    const rows = [
      toBooking("1", { status: "confirmed", spots: 2 }),
      toBooking("2", { status: "completed", spots: 1 }),
      toBooking("3", { status: "held", spots: 1 }),
      toBooking("4", { status: "cancelled", spots: 3 }),
      toBooking("5", { status: "confirmed" }),
    ];
    expect(bookingSummary(rows)).toEqual({ confirmed: 3, spots: 3, held: 1, cancelled: 1 });
  });
  it("drops an out-of-range review rating", () => {
    expect(toReview("r1", { rating: 4, comment: "Great", authorName: "Asha", status: "published", updatedAt: ts("2026-10-08T10:00:00Z") })).toMatchObject({ rating: 4, author: "Asha" });
    expect(toReview("r2", { rating: 9 }).rating).toBeNull();
  });
});

describe("actions", () => {
  it("allows admin cancel only in the server's pre-completed statuses", () => {
    for (const s of ["draft", "submitted", "changes-requested", "approved", "published", "booking-closed", "live"]) expect(isCancellable(s)).toBe(true);
    for (const s of ["completed", "cancelled", "paused", "blocked", "active", undefined]) expect(isCancellable(s)).toBe(false);
  });
  it("flags statuses the lifecycle doesn't know", () => {
    expect(isOffLifecycle("paused")).toBe(true);
    expect(isOffLifecycle("published")).toBe(false);
  });
});

describe("event cancel key and toast", () => {
  it("keys on the event and the status it was cancelled from", async () => {
    const { cancelEventKey } = await import("@/lib/events");
    expect(cancelEventKey("ev1", "published")).toBe("event-cancel|ev1|published");
    expect(cancelEventKey("ev1", "live")).not.toBe(cancelEventKey("ev1", "published"));
    expect(cancelEventKey("ev1", undefined)).toBe("event-cancel|ev1|");
  });
  it("titles the toast from the server's status", async () => {
    const { cancelEventToast } = await import("@/lib/events");
    expect(cancelEventToast({ eventId: "ev1", status: "cancelled" }, "Sunset Trek")).toMatchObject({ tone: "ok", title: "Event cancelled · Sunset Trek" });
    expect(cancelEventToast({ status: "completed" }, "X")).toMatchObject({ tone: "info", title: "Event is now completed · X" });
    expect(cancelEventToast(null, "X")).toMatchObject({ tone: "info", title: "Cancel sent · X" });
  });
});
