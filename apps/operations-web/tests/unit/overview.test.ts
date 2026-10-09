import { describe, expect, it } from "vitest";
import { buildAttentionQueue } from "@/lib/console/attention";
import {
  auditTitle,
  cityCounts,
  greetingFor,
  headlineFor,
  liveCutMatters,
  needsYouRows,
  parseRange,
  percent,
  splitLive,
  toEv,
} from "@/lib/overview";

const NOW = new Date("2026-10-09T14:00:00Z"); // 19:30 IST, Fri 9 Oct
const at = (iso: string) => ({ toDate: () => new Date(iso) });

describe("toEv", () => {
  it("reads the stored event shape", () => {
    const ev = toEv("e1", {
      title: "Box Cricket",
      orgId: "o1",
      status: "published",
      venue: { city: "Bengaluru", area: "HSR" },
      startsAt: at("2026-10-09T13:00:00Z"),
      endsAt: at("2026-10-09T15:00:00Z"),
      capacity: { maxPhysicalCapacity: 16, blockedSlots: 0 },
      occupancy: { confirmedPaidBookings: 12, confirmedComplimentaryBookings: 2 },
    });
    expect(ev).toMatchObject({ city: "Bengaluru", capacity: 16, taken: 14, endsAssumed: false });
  });
  it("assumes 3 h when endsAt is missing and never invents numbers", () => {
    const ev = toEv("e2", { startsAt: at("2026-10-09T13:00:00Z"), occupancy: { confirmedPaidBookings: "x" } });
    expect(ev.endsAt?.toISOString()).toBe("2026-10-09T16:00:00.000Z");
    expect(ev.endsAssumed).toBe(true);
    expect(ev.taken).toBeNull();
    expect(ev.capacity).toBeNull();
    expect(ev.city).toBeNull();
  });
  it("falls back to capacity.max", () => {
    expect(toEv("e3", { capacity: { max: 40 } }).capacity).toBe(40);
  });
});

describe("splitLive", () => {
  const base = { venue: { city: "Pune" }, status: "published" };
  const evs = [
    toEv("live", { ...base, startsAt: at("2026-10-09T13:00:00Z"), endsAt: at("2026-10-09T15:00:00Z") }),
    toEv("ended", { ...base, startsAt: at("2026-10-09T10:00:00Z"), endsAt: at("2026-10-09T14:00:00Z") }),
    toEv("cancelled", { ...base, status: "cancelled", startsAt: at("2026-10-09T13:00:00Z"), endsAt: at("2026-10-09T15:00:00Z") }),
    toEv("draft", { ...base, status: "draft", startsAt: at("2026-10-09T13:00:00Z"), endsAt: at("2026-10-09T15:00:00Z") }),
    toEv("soon", { ...base, startsAt: at("2026-10-09T18:00:00Z") }),
    toEv("later", { ...base, startsAt: at("2026-10-10T03:00:00Z") }),
    toEv("no-end", { ...base, status: "live", startsAt: at("2026-10-09T12:00:00Z") }),
  ];
  it("live is start ≤ now < end on a running status; end is exclusive", () => {
    const { live, soon } = splitLive(evs, NOW);
    expect(live.map((e) => e.id)).toEqual(["live", "no-end"]);
    expect(soon.map((e) => e.id)).toEqual(["soon"]);
  });
});

describe("multi-day events and the +1 probe", () => {
  it("keeps a trip that started days ago live until its endsAt", () => {
    const trip = toEv("trip", { status: "live", startsAt: at("2026-10-07T02:00:00Z"), endsAt: at("2026-10-11T10:00:00Z") });
    expect(splitLive([trip], NOW).live.map((e) => e.id)).toEqual(["trip"]);
  });
  it("flags truncation only when the left-out event is live or soon", () => {
    const ev = (id: string, starts: string) => toEv(id, { status: "published", startsAt: at(starts), endsAt: at("2026-12-01T00:00:00Z") });
    const kept = [ev("a", "2026-10-09T13:00:00Z")];
    expect(liveCutMatters(kept, 1, NOW)).toBe(false);
    expect(liveCutMatters([...kept, ev("soon", "2026-10-09T20:00:00Z")], 1, NOW)).toBe(true);
    expect(liveCutMatters([...kept, ev("far", "2026-10-20T00:00:00Z")], 1, NOW)).toBe(false);
  });
});

describe("cityCounts", () => {
  it("groups scheduled events by venue city, biggest first", () => {
    const evs = [
      toEv("a", { status: "published", venue: { city: "Pune" } }),
      toEv("b", { status: "completed", venue: { city: "Bengaluru" } }),
      toEv("c", { status: "live", venue: { city: "Bengaluru" } }),
      toEv("d", { status: "cancelled", venue: { city: "Hyderabad" } }),
      toEv("e", { status: "published" }),
    ];
    expect(cityCounts(evs)).toEqual([
      { city: "Bengaluru", count: 2 },
      { city: "City not set", count: 1 },
      { city: "Pune", count: 1 },
    ]);
  });
});

describe("needsYouRows", () => {
  const input = {
    governanceCases: [
      { id: "k1", raw: { kind: "organizer-kyc", status: "pending", subject: "Weekend Cricket Club", location: "Bengaluru", createdAt: at("2026-10-09T10:00:00Z") } },
      { id: "k2", raw: { kind: "organizer-kyc", status: "approved", subject: "Done" } },
      { id: "x1", raw: { kind: "experience-approval", status: "under-review", subject: "Pottery 101", createdAt: at("2026-10-08T10:00:00Z") } },
    ],
    riskAlerts: [{ id: "r1", raw: { severity: "high", status: "open", summary: "Chargeback on Sunrise Trek", createdAt: at("2026-10-09T13:48:00Z") } }],
    refunds: [
      { id: "f1", raw: { status: "under-review", amountMinor: 240000, reason: "event-cancelled", createdAt: at("2026-10-09T12:00:00Z") } },
      { id: "f2", raw: { status: "approved", amountMinor: 1000 } },
    ],
    settlements: [{ id: "s1", raw: { status: "pending-approval", netMinor: 1864000, orgId: "o1", createdAt: at("2026-10-07T10:00:00Z") } }],
  };
  const rows = needsYouRows(input, NOW);

  it("lists each open item once, most severe first, longest-waiting first within a severity", () => {
    expect(rows.map((r) => r.key)).toEqual(["risk-r1", "settlement-s1", "case-k1", "refund-f1", "case-x1"]);
  });
  it("matches the attention queue's counts", () => {
    const total = buildAttentionQueue(input).reduce((n, i) => n + i.count, 0);
    expect(rows).toHaveLength(total);
  });
  it("labels rows with glyph, title, relative time and a deep link", () => {
    expect(rows.find((r) => r.key === "case-k1")).toMatchObject({
      emoji: "🪪",
      title: "Weekend Cricket Club wants to host",
      meta: "Organizer KYC · Bengaluru · 4 h ago",
      href: "/approvals?case=k1",
    });
    expect(rows[0]).toMatchObject({ emoji: "🚨", meta: "Risk · high · opened 12 min ago" });
    expect(rows.find((r) => r.kind === "refund")?.title).toMatch(/₹2,400$/);
  });
});

describe("headline and labels", () => {
  it("picks the headline from state", () => {
    expect(headlineFor(3, 5)).toEqual({ kind: "buzzing" });
    expect(headlineFor(0, 5)).toEqual({ kind: "needs", n: 5 });
    expect(headlineFor(0, 0)).toEqual({ kind: "quiet" });
  });
  it("goes neutral when a source failed rather than claiming quiet or a count", () => {
    expect(headlineFor(0, 0, true)).toEqual({ kind: "neutral" });
    expect(headlineFor(2, 3, true)).toEqual({ kind: "neutral" });
  });
  it("parses the range param defensively", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("bogus")).toBe("today");
    expect(parseRange(null)).toBe("today");
  });
  it("formats rates honestly", () => {
    expect(percent(0.873)).toBe("87%");
    expect(percent(0.016)).toBe("1.6%");
    expect(percent(0)).toBe("0%");
    expect(percent(null)).toBe("—");
  });
  it("greets in IST", () => {
    expect(greetingFor(NOW)).toEqual({ date: "Fri, 9 Oct", greeting: "Good evening" });
    expect(greetingFor(new Date("2026-10-09T03:00:00Z")).greeting).toBe("Good morning");
  });
  it("humanises audit actions", () => {
    expect(auditTitle("governance.case-decided")).toBe("Governance · case decided");
    expect(auditTitle(undefined)).toBe("Unnamed action");
  });
});
