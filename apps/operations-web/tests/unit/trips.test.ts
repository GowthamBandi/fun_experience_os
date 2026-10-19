import { describe, expect, it } from "vitest";
import { CommandValidationError, buildReviewTripPayload } from "@/lib/console/actions";
import { canViewRoute, rolesAllowedFor } from "@/lib/console/capabilities";
import { NAV } from "@/lib/nav";
import {
  ageRange,
  daysLabel,
  departureRange,
  draftFacts,
  groupRange,
  isDecidable,
  isRevision,
  noteMin,
  parseDraft,
  priceDeltaLabel,
  roomPolicyLabel,
  rupees,
  toTripRow,
  totalSeats,
  tripBadge,
  tripDecisionKey,
  tripMeta,
  tripOutcomeMessage,
  tripQueue,
  tripStyle,
  validateTripDecision,
  waitingHours,
  waitingLabel,
} from "@/lib/trips";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const NOW = new Date("2026-10-19T12:00:00Z");

function trip(id: string, over: Record<string, unknown> = {}) {
  return toTripRow(id, {
    orgId: "org1",
    organizerName: "Hill Trails",
    status: "in-review",
    title: `Trip ${id}`,
    destination: "Coorg",
    style: "weekend",
    durationDays: 3,
    priceFrom: 8999,
    departuresCount: 2,
    tripId: null,
    reviewerNote: null,
    submittedAt: ts("2026-10-18T12:00:00Z"),
    version: 4,
    draft: {},
    ...over,
  });
}

describe("toTripRow", () => {
  it("maps the server fields and falls back to the draft", () => {
    const row = toTripRow("ht1", {
      status: "in-review",
      submittedAt: ts("2026-10-18T09:00:00Z"),
      version: 7,
      draft: { title: "Spiti in Winter", destination: "Spiti", style: "trek", days: [{ title: "Arrive" }, {}], departures: [{ id: "d1" }] },
    });
    expect(row).toMatchObject({ id: "ht1", title: "Spiti in Winter", destination: "Spiti", style: "trek", durationDays: 2, departuresCount: 1, version: 7, priceFrom: null, tripId: null });
    expect(row.submittedAt?.toISOString()).toBe("2026-10-18T09:00:00.000Z");
  });
  it("is tolerant of missing and malformed fields", () => {
    const row = toTripRow("x", { version: -1, draft: "nope", title: "  ", departuresCount: "3" });
    expect(row.title).toBe("Untitled trip");
    expect(row.version).toBe(0);
    expect(row.departuresCount).toBe(0);
    expect(row.draft.days).toEqual([]);
  });
  it("flags a revision of a live trip by tripId", () => {
    expect(isRevision(trip("a"))).toBe(false);
    expect(isRevision(trip("b", { tripId: "trip_9" }))).toBe(true);
  });
});

describe("tripQueue", () => {
  const rows = [
    trip("late", { submittedAt: ts("2026-10-19T08:00:00Z") }),
    trip("undated", { submittedAt: null }),
    trip("early", { submittedAt: ts("2026-10-15T08:00:00Z") }),
    trip("back", { status: "changes-requested", submittedAt: ts("2026-10-10T08:00:00Z") }),
    trip("liveOld", { status: "live", decidedAt: ts("2026-10-01T08:00:00Z") }),
    trip("liveNew", { status: "live", decidedAt: ts("2026-10-12T08:00:00Z") }),
  ];
  it("lists in-review trips longest-waiting first, undated last", () => {
    expect(tripQueue(rows, "in-review").map((r) => r.id)).toEqual(["early", "late", "undated"]);
  });
  it("filters each tab by status", () => {
    expect(tripQueue(rows, "changes-requested").map((r) => r.id)).toEqual(["back"]);
    expect(tripQueue(rows, "rejected")).toEqual([]);
  });
  it("lists history most recently decided first", () => {
    expect(tripQueue(rows, "live").map((r) => r.id)).toEqual(["liveNew", "liveOld"]);
  });
  it("breaks ties by id so the order is stable", () => {
    const same = [trip("b"), trip("a"), trip("c")];
    expect(tripQueue(same, "in-review").map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("presentation", () => {
  it("labels statuses, styles and enums", () => {
    expect(tripBadge("in-review")).toEqual({ label: "In review", tone: "violet" });
    expect(tripBadge("live").tone).toBe("ok");
    expect(tripBadge("weird")).toEqual({ label: "weird", tone: "muted" });
    expect(tripStyle("roadTrip").label).toBe("Road trip");
    expect(tripStyle("space").label).toBe("space");
    expect(roomPolicyLabel("bestEffort")).toMatch(/^Best effort/);
    expect(roomPolicyLabel(null)).toBe("—");
  });
  it("formats money, ranges and days", () => {
    expect(rupees(12499)).toBe("₹12,499");
    expect(rupees(null)).toBe("—");
    expect(priceDeltaLabel(1500)).toBe("+₹1,500");
    expect(priceDeltaLabel(-500)).toBe("−₹500");
    expect(priceDeltaLabel(0)).toBe("Base price");
    expect(ageRange(18, 45)).toBe("18–45");
    expect(ageRange(18, null)).toBe("18+");
    expect(groupRange(6, 18)).toBe("6–18 people");
    expect(groupRange(null, null)).toBe("—");
    expect(daysLabel(1)).toBe("1 day");
    expect(daysLabel(4)).toBe("4 days");
    expect(departureRange("2026-12-12T00:30:00+05:30", "2026-12-15T20:00:00+05:30")).toBe("Sat, 12 Dec → 15 Dec 2026");
    expect(departureRange(null, null)).toBe("—");
  });
  it("shows waiting time from submittedAt and flags age in hours", () => {
    const row = trip("a", { submittedAt: ts("2026-10-19T09:00:00Z") });
    expect(waitingLabel(row, NOW)).toBe("3 h ago");
    expect(waitingLabel(row, null)).toBe("—");
    expect(waitingHours(row, NOW)).toBe(3);
    expect(waitingHours(trip("b", { submittedAt: null }), NOW)).toBeNull();
    expect(waitingLabel(trip("c", { status: "live", decidedAt: ts("2026-10-19T11:30:00Z") }), NOW)).toBe("30 min ago");
  });
  it("builds the row meta", () => {
    expect(tripMeta(trip("a"))).toBe("by Hill Trails · Coorg · Weekend getaway");
  });
});

describe("parseDraft", () => {
  const draft = parseDraft({
    days: [
      {
        title: "Into the hills",
        activities: [{ time: "07:00", title: "Pickup", detail: "Majestic", icon: "🚌" }, "bad"],
        mealPlan: [{ meal: "Lunch", time: "13:00", place: "Riverside", menu: "Thali", diets: ["veg"] }],
        stay: "Camp",
        overnightTransit: true,
      },
    ],
    departures: [
      { id: "d1", start: "2026-12-12", end: "2026-12-15", seatsTotal: 18, priceDelta: 0 },
      { id: "d2", seatsTotal: 12, priceDelta: 1500, longWeekend: "Christmas" },
    ],
    rooms: [{ id: "r1", label: "Twin share", occupancy: 2, price: 9999, beds: "2 single" }],
    packing: { clothing: ["Fleece", ""], documents: [], gear: ["Torch"] },
    faqs: [{ q: "Is it safe?", a: "Yes" }, {}],
    difficulty: "moderate",
    gender: "womenOnly",
    ageMin: 18,
    refund: "strict",
    bookingCutoffDays: 2,
    altitude: 3500,
  });
  it("normalizes the itinerary", () => {
    expect(draft.days).toHaveLength(1);
    expect(draft.days[0]!.activities).toEqual([{ time: "07:00", title: "Pickup", detail: "Majestic", icon: "🚌" }]);
    expect(draft.days[0]!.mealPlan[0]).toMatchObject({ meal: "Lunch", place: "Riverside", diets: ["veg"] });
    expect(draft.days[0]!.overnightTransit).toBe(true);
  });
  it("keeps departures, rooms, packing and FAQs", () => {
    expect(draft.departures.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(totalSeats(draft.departures)).toBe(30);
    expect(totalSeats([])).toBeNull();
    expect(draft.rooms[0]).toEqual({ id: "r1", label: "Twin share", occupancy: 2, price: 9999, beds: "2 single" });
    expect(draft.packing).toEqual([{ category: "clothing", items: ["Fleece"] }, { category: "gear", items: ["Torch"] }]);
    expect(draft.faqs).toEqual([{ q: "Is it safe?", a: "Yes" }]);
  });
  it("labels the at-a-glance facts", () => {
    const facts = Object.fromEntries(draftFacts(draft).map((f) => [f.label, f.value]));
    expect(facts).toMatchObject({ Difficulty: "Moderate", "Who can join": "Women only", Ages: "18+", "Refund policy": "Strict", "Booking closes": "2 days before departure", Altitude: "3500" });
  });
});

describe("decision", () => {
  it("requires a 10+ character note unless approved", () => {
    expect(noteMin("approved")).toBe(0);
    expect(noteMin("rejected")).toBe(10);
    const row = trip("a");
    expect(validateTripDecision(row, "approved", "")).toBeNull();
    expect(validateTripDecision(row, "changes-requested", "too short")).toMatch(/at least 10/);
    expect(validateTripDecision(row, "rejected", "Pricing is misleading.")).toBeNull();
    expect(validateTripDecision(row, "rejected", "x".repeat(1001))).toMatch(/at most 1000/);
  });
  it("only decides trips in review", () => {
    expect(isDecidable(trip("a"))).toBe(true);
    expect(isDecidable(trip("b", { status: "live" }))).toBe(false);
    expect(validateTripDecision(trip("c", { status: "changes-requested" }), "approved", "")).toMatch(/Only trips in review/);
  });
  it("keys the request id on the trip, outcome, version and status", () => {
    const row = trip("a");
    expect(tripDecisionKey(row, "approved")).toBe(tripDecisionKey(trip("a"), "approved"));
    expect(tripDecisionKey(row, "approved")).not.toBe(tripDecisionKey(row, "rejected"));
    expect(tripDecisionKey(row, "approved")).not.toBe(tripDecisionKey(trip("a", { version: 5 }), "approved"));
    expect(tripDecisionKey(row, "approved")).toBe("trip|a|approved|4|in-review");
  });
  it("builds the reviewTrip payload", () => {
    const payload = buildReviewTripPayload({ requestId: "trip-approved-123456", hostTripId: " ht1 ", expectedVersion: 4, outcome: "approved", note: "  " });
    expect(payload).toEqual({ requestId: "trip-approved-123456", hostTripId: "ht1", expectedVersion: 4, outcome: "approved", note: "" });
    expect(buildReviewTripPayload({ requestId: "trip-rejected-123456", hostTripId: "ht1", expectedVersion: 0, outcome: "rejected", note: " Duplicate listing. " }).note).toBe("Duplicate listing.");
  });
  it("refuses invalid payloads before calling the server", () => {
    const base = { requestId: "trip-x-12345678", hostTripId: "ht1", expectedVersion: 1, note: "Fix the pickup times please." };
    expect(() => buildReviewTripPayload({ ...base, outcome: "changes-requested", note: "short" })).toThrow(CommandValidationError);
    expect(() => buildReviewTripPayload({ ...base, outcome: "approved", requestId: "bad id" })).toThrow(/request ID/);
    expect(() => buildReviewTripPayload({ ...base, outcome: "approved", hostTripId: "a/b" })).toThrow(/trip ID/);
    expect(() => buildReviewTripPayload({ ...base, outcome: "approved", expectedVersion: 1.5 })).toThrow(/version/);
    expect(() => buildReviewTripPayload({ ...base, outcome: "live" as never })).toThrow(CommandValidationError);
  });
  it("describes the outcome, including replays", () => {
    expect(tripOutcomeMessage("approved", { status: "live", tripId: "trip_1" }, false)).toBe("The trip is live in PULSE. Trip trip_1.");
    expect(tripOutcomeMessage("approved", { status: "live", tripId: "trip_1", replayed: true }, true)).toMatch(/^The live trip now shows this revision\..*safe retry/);
    expect(tripOutcomeMessage("changes-requested", { status: "changes-requested", tripId: null }, false)).toMatch(/resubmit/);
  });
});

describe("route and nav", () => {
  it("adds Trips next to Approvals, admins only", () => {
    const hrefs = NAV.map((n) => n.href);
    expect(hrefs.indexOf("/trips")).toBe(hrefs.indexOf("/approvals") + 1);
    expect(NAV.find((n) => n.href === "/trips")?.badge).toBe("trips");
    expect(canViewRoute("super-admin", "/trips")).toBe(true);
    expect(canViewRoute("auditor", "/trips")).toBe(false);
    expect(rolesAllowedFor("reviewTrip")).toEqual(["platform-owner", "super-admin"]);
  });
});
