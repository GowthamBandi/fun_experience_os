import { describe, expect, it } from "vitest";
import { getEmptyState, getInitialState } from "../scenarios";
import { labelDay, reportToCsv, selectOperationsReport } from "./analytics";

const NOW = new Date("2026-09-29T12:00:00");

describe("operations report", () => {
  it("computes totals from records in range", () => {
    const r = selectOperationsReport(getInitialState(), 7, { now: NOW });
    expect(r.days).toHaveLength(7);
    expect(r.to).toBe("2026-09-29");
    expect(r.totals.sessions).toBeGreaterThan(0);
    expect(r.totals.bookings).toBeGreaterThan(0);
    expect(r.totals.fillPct).not.toBeNull();
    expect(r.totals.netRevenue).toBe(r.totals.revenue - r.totals.refunds);
    // Tomorrow's sessions are outside a "last 7 days" range
    const tomorrow = getInitialState().sessions.filter((s) => s.date === "Tomorrow").length;
    expect(r.totals.sessions + r.totals.cancelledSessions).toBe(getInitialState().sessions.length - tomorrow);
  });

  it("scopes by territory", () => {
    const all = selectOperationsReport(getInitialState(), 30, { now: NOW });
    const hyd = selectOperationsReport(getInitialState(), 30, { now: NOW, territoryId: "hvd-central" });
    expect(hyd.totals.sessions).toBeLessThan(all.totals.sessions);
  });

  it("works on an empty workspace", () => {
    const r = selectOperationsReport(getEmptyState(), "all", { now: NOW });
    expect(r.totals.sessions).toBe(0);
    expect(r.totals.fillPct).toBeNull();
    expect(reportToCsv(r).split("\n")[0]).toMatch(/^date,sessions/);
  });

  it("parses timestamp labels", () => {
    expect(labelDay("Yesterday, 17:02", NOW)).toBe("2026-09-28");
    expect(labelDay("5 Days ago", NOW)).toBe("2026-09-24");
    expect(labelDay("2026-09-01", NOW)).toBe("2026-09-01");
  });
});
