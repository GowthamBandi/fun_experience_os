import { describe, expect, it } from "vitest";
import {
  agreementSummary,
  averageRating,
  commissionLabel,
  filterOrganizers,
  mergeOrganizer,
  orgCounts,
  orgStatusBadge,
  orgTimeline,
  sortMembers,
  sortOrganizers,
  statusActions,
  toMember,
  toOrgEvent,
  toOrgExperience,
} from "@/lib/organizers";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

const cricket = mergeOrganizer(
  "o1",
  { name: "Weekend Cricket Club (org)", city: "Bengaluru", categories: ["sports"], status: "active", version: 3, createdAt: ts("2026-10-01T00:00:00Z") },
  { name: "Weekend Cricket Club", handle: "weekend-cricket-club-fsbd", city: "Bengaluru", categories: ["sports"], verified: true, hostingSince: ts("2026-10-02T00:00:00Z"), ratingAverage: 4.5, ratingCount: 2 },
);
const treks = mergeOrganizer("o2", { name: "Trailblazers Treks", city: "Pune", categories: ["trips", "wellness"], status: "paused", version: 1 }, null);
const clay = mergeOrganizer("o3", { name: "Clay & Coffee", city: "Hyderabad", categories: ["workshops"], status: "blocked" }, { name: "Clay & Coffee", city: "Hyderabad" });
const odd = mergeOrganizer("o4", { status: "under-review" }, undefined);

describe("mergeOrganizer", () => {
  it("prefers publicOrganizers display fields and keeps the organizer's status and version", () => {
    expect(cricket).toMatchObject({ name: "Weekend Cricket Club", handle: "weekend-cricket-club-fsbd", status: "active", version: 3, verified: true, rating: 4.5, ratingCount: 2 });
    expect(cricket.since?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
  });
  it("falls back to the organizer doc when the public projection is missing", () => {
    expect(treks).toMatchObject({ name: "Trailblazers Treks", city: "Pune", categories: ["trips", "wellness"], verified: false, rating: null, ratingCount: 0 });
    expect(clay.categories).toEqual(["workshops"]);
  });
  it("shows a dash, never an invented value, when fields are missing", () => {
    expect(odd).toMatchObject({ name: "—", city: null, handle: null, since: null, version: 0 });
  });
});

describe("grid filters", () => {
  const all = [cricket, treks, clay, odd];
  it("counts by status", () => {
    expect(orgCounts(all)).toEqual({ all: 4, active: 1, paused: 1, blocked: 1 });
  });
  it("filters by status and searches name, city, handle, category and id", () => {
    expect(filterOrganizers(all, "paused", "").map((c) => c.id)).toEqual(["o2"]);
    expect(filterOrganizers(all, "all", "  PUNE ").map((c) => c.id)).toEqual(["o2"]);
    expect(filterOrganizers(all, "all", "wellness").map((c) => c.id)).toEqual(["o2"]);
    expect(filterOrganizers(all, "all", "fsbd").map((c) => c.id)).toEqual(["o1"]);
    expect(filterOrganizers(all, "all", "o3").map((c) => c.id)).toEqual(["o3"]);
    expect(filterOrganizers(all, "active", "pune")).toEqual([]);
  });
  it("orders active, paused, blocked, then the rest", () => {
    expect(sortOrganizers([odd, clay, treks, cricket]).map((c) => c.id)).toEqual(["o1", "o2", "o3", "o4"]);
  });
});

describe("status", () => {
  it("maps statuses to badges", () => {
    expect(orgStatusBadge("active")).toEqual({ label: "Active", tone: "ok" });
    expect(orgStatusBadge("paused").tone).toBe("warn");
    expect(orgStatusBadge("blocked").tone).toBe("err");
    expect(orgStatusBadge(undefined)).toEqual({ label: "—", tone: "muted" });
    expect(orgStatusBadge("on-hold").label).toBe("On hold");
  });
  it("offers only meaningful status changes, with the suspend phrase on pause and block", () => {
    expect(statusActions("active").map((a) => a.status)).toEqual(["paused", "blocked"]);
    expect(statusActions("paused").map((a) => a.status)).toEqual(["active", "blocked"]);
    expect(statusActions("blocked").map((a) => a.status)).toEqual(["active"]);
    expect(statusActions("under-review").map((a) => a.status)).toEqual(["active", "paused", "blocked"]);
    expect(statusActions("active").every((a) => a.phrase === "SUSPEND ORGANIZER")).toBe(true);
    expect(statusActions("blocked")[0]).toMatchObject({ phrase: null, tone: "volt" });
  });
});

describe("averageRating", () => {
  it("averages published 1–5 ratings to one decimal", () => {
    expect(averageRating([{ rating: 5, status: "published" }, { rating: 4, status: "published" }, { rating: 4 }])).toEqual({ average: 4.3, count: 3 });
  });
  it("ignores hidden and malformed reviews, and returns null with none", () => {
    expect(averageRating([{ rating: 1, status: "hidden" }, { rating: "5" }, { rating: 9 }, { rating: Number.NaN }])).toEqual({ average: null, count: 0 });
    expect(averageRating([])).toEqual({ average: null, count: 0 });
  });
});

describe("money", () => {
  it("formats commission basis points", () => {
    expect(commissionLabel(1000)).toBe("10%");
    expect(commissionLabel(1250)).toBe("12.5%");
    expect(commissionLabel(1275)).toBe("12.75%");
    expect(commissionLabel(0)).toBe("0%");
    expect(commissionLabel(undefined)).toBe("—");
  });
  it("finds the agreement in force and pending proposals", () => {
    const rows = [
      { id: "a1", raw: { status: "superseded", createdAt: ts("2026-09-01T00:00:00Z") } },
      { id: "a2", raw: { status: "approved", decidedAt: ts("2026-10-01T00:00:00Z") } },
      { id: "a3", raw: { status: "pending-approval", createdAt: ts("2026-10-05T00:00:00Z") } },
    ];
    const s = agreementSummary(rows);
    expect(s.current?.id).toBe("a2");
    expect(s.pending.map((a) => a.id)).toEqual(["a3"]);
    expect(s.history.map((a) => a.id)).toEqual(["a3", "a2", "a1"]);
    expect(agreementSummary([]).current).toBeNull();
  });
});

describe("rows", () => {
  it("shapes an event, counting paid and complimentary seats against physical capacity", () => {
    const e = toOrgEvent("e1", {
      title: "Sunday Box Cricket",
      category: "sports",
      venue: { name: "Turf Park", city: "Bengaluru" },
      startsAt: ts("2026-10-09T11:00:00Z"),
      status: "live",
      occupancy: { confirmedPaidBookings: 12, confirmedComplimentaryBookings: 2 },
      capacity: { maxPhysicalCapacity: 16 },
      priceMinor: 39900,
    });
    expect(e).toMatchObject({ title: "Sunday Box Cricket", venue: "Turf Park · Bengaluru", sold: 14, capacity: 16, priceMinor: 39900, status: "live" });
    expect(toOrgEvent("e2", { capacity: { max: 10 } })).toMatchObject({ title: "—", sold: null, capacity: 10, startsAt: null, priceMinor: null });
  });
  it("shapes an experience rating from ratingSum / ratingCount", () => {
    expect(toOrgExperience("x1", { title: "Pottery", ratingCount: 3, ratingSum: 13, coverStyle: { seed: 7 } })).toMatchObject({ rating: 4.3, ratingCount: 3, seed: 7 });
    expect(toOrgExperience("x2", { ratingCount: 0, ratingSum: 0 }).rating).toBeNull();
  });
  it("shapes memberships and puts owners first", () => {
    const owner = toMember("o1__u1", { uid: "u1", role: "owner", status: "active", permissions: ["staff.manage"], eventScope: { all: true, eventIds: [] }, activatedAt: ts("2026-10-01T00:00:00Z") });
    const staff = toMember("o1__u2", { uid: "u2", role: "staff", status: "active", permissions: ["tickets.scan"], eventScope: { all: false, eventIds: ["e1", "e2"] }, createdAt: ts("2026-10-05T00:00:00Z") });
    const revoked = toMember("o1__u3", { role: "staff", status: "revoked", eventScope: { all: false, eventIds: ["e1"] } });
    expect(staff.scope).toBe("2 events");
    expect(owner.scope).toBe("All events");
    expect(revoked).toMatchObject({ uid: "u3", scope: "1 event", permissions: [] });
    expect(sortMembers([revoked, staff, owner]).map((m) => m.uid)).toEqual(["u1", "u2", "u3"]);
  });
});

describe("orgTimeline", () => {
  it("merges both audit reads, de-duplicates by id and sorts newest first", () => {
    const byOrg = [
      { id: "a1", raw: { action: "booking.seat-reserved", actorRole: "customer", at: ts("2026-10-09T10:00:00Z") } },
      { id: "a2", raw: { action: "catalog.event-published", actorRole: "org:o1:owner", at: ts("2026-10-09T09:00:00Z") } },
    ];
    const byResource = [
      { id: "a3", raw: { action: "governance.entity-status-changed", actorRoleId: "super-admin", before: { status: "active" }, after: { status: "paused" }, reason: "Chargebacks under review", at: ts("2026-10-09T11:00:00Z") } },
      { id: "a2", raw: { action: "catalog.event-published", actorRole: "org:o1:owner", at: ts("2026-10-09T09:00:00Z") } },
    ];
    const items = orgTimeline(byOrg, byResource);
    expect(items.map((i) => i.id)).toEqual(["a3", "a1", "a2"]);
    expect(items[0]).toMatchObject({ title: "Governance · entity status changed", body: "active → paused · “Chargebacks under review”", actor: "Super Admin" });
    expect(items[1].actor).toBe("Customer");
    expect(items[2]).toMatchObject({ actor: "Organizer owner", tone: "ok", body: undefined });
  });
});
