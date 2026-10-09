import { describe, expect, it } from "vitest";
import { toEv } from "@/lib/overview";
import { bookedMinor, bookedValueBy, netMinor, seriesSummary } from "@/lib/revenue";

const ev = (id: string, data: Record<string, unknown>) => toEv(id, { status: "published", ...data });

describe("netMinor", () => {
  it("is gross minus refunds and may go negative", () => {
    expect(netMinor(2496600, 96600)).toBe(2400000);
    expect(netMinor(0, 95000)).toBe(-95000);
  });
  it("is null, never NaN, when a side is missing", () => {
    expect(netMinor(null, 100)).toBeNull();
    expect(netMinor(100, null)).toBeNull();
    expect(netMinor(Number.NaN, 0)).toBeNull();
  });
});

describe("bookedMinor", () => {
  it("counts paid spots only", () => {
    const e = ev("e1", { priceMinor: 39900, occupancy: { confirmedPaidBookings: 10, confirmedComplimentaryBookings: 4 } });
    expect(e.paid).toBe(10);
    expect(e.taken).toBe(14);
    expect(bookedMinor(e)).toBe(399000);
  });
  it("never guesses a missing price or paid count", () => {
    expect(bookedMinor(ev("e2", { occupancy: { confirmedPaidBookings: 3 } }))).toBeNull();
    expect(bookedMinor(ev("e3", { priceMinor: 100 }))).toBeNull();
    expect(bookedMinor(ev("e4", { priceMinor: "100", occupancy: { confirmedPaidBookings: 3 } }))).toBeNull();
  });
});

describe("bookedValueBy", () => {
  const events = [
    ev("a", { venue: { city: "Bengaluru" }, category: "sports", priceMinor: 39900, occupancy: { confirmedPaidBookings: 10 } }),
    ev("b", { venue: { city: "Pune" }, category: "trips", priceMinor: 89900, occupancy: { confirmedPaidBookings: 10 } }),
    ev("c", { venue: { city: "Bengaluru" }, category: "music", priceMinor: 69900, occupancy: { confirmedPaidBookings: 5 } }),
    ev("free", { venue: { city: "Mysuru" }, category: "social", priceMinor: 0, occupancy: { confirmedPaidBookings: 0, confirmedComplimentaryBookings: 8 } }),
    ev("cancelled", { status: "cancelled", venue: { city: "Delhi" }, priceMinor: 100000, occupancy: { confirmedPaidBookings: 50 } }),
    ev("draft", { status: "draft", venue: { city: "Delhi" }, priceMinor: 100000, occupancy: { confirmedPaidBookings: 50 } }),
    ev("unpriced", { venue: { city: "Pune" }, occupancy: { confirmedPaidBookings: 5 } }),
    ev("nowhere", { category: "food-walks", priceMinor: 10000, occupancy: { confirmedPaidBookings: 1 } }),
  ];
  it("groups scheduled events by city, largest first", () => {
    const out = bookedValueBy(events, "city");
    expect(out.rows.map((r) => [r.label, r.value, r.events])).toEqual([
      ["Pune", 899000, 1],
      ["Bengaluru", 748500, 2],
      ["City not set", 10000, 1],
    ]);
    expect(out.total).toBe(748500 + 899000 + 10000);
    expect(out.events).toBe(5);
    expect(out.unknown).toBe(1);
  });
  it("labels categories and drops zero-value groups", () => {
    const out = bookedValueBy(events, "category");
    expect(out.rows.map((r) => r.label)).toEqual(["Trips", "Sports", "Music", "Food walks"]);
  });
});

describe("seriesSummary", () => {
  it("totals, averages and finds the best day", () => {
    const s = seriesSummary([
      { label: "7 Oct", value: 0 },
      { label: "8 Oct", value: 500 },
      { label: "9 Oct", value: 2500 },
      { label: "10 Oct", value: 2500 },
    ]);
    expect(s).toEqual({ total: 5500, average: 1375, best: { label: "9 Oct", value: 2500 }, activeDays: 3 });
  });
  it("has no best day when nothing moved", () => {
    expect(seriesSummary([{ label: "9 Oct", value: 0 }]).best).toBeNull();
    expect(seriesSummary([]).average).toBe(0);
  });
});
