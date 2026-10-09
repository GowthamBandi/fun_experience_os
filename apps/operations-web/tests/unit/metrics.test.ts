import { describe, expect, it } from "vitest";
import { dailyBuckets, metricErrorMessage, previousRange, rangeFor, ratio, readNumber } from "@/lib/metrics";

describe("IST ranges", () => {
  it("today starts at IST midnight even just after it", () => {
    const now = new Date("2026-10-08T19:00:00Z"); // 00:30 IST on 9 Oct
    const r = rangeFor("today", now);
    expect(r.start.toISOString()).toBe("2026-10-08T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-09T18:30:00.000Z");
  });
  it("7d covers six previous days plus today", () => {
    const r = rangeFor("7d", new Date("2026-10-09T06:00:00Z"));
    expect(r.start.toISOString()).toBe("2026-10-02T18:30:00.000Z");
  });
  it("previous range is the same length right before", () => {
    const r = rangeFor("7d", new Date("2026-10-09T06:00:00Z"));
    const p = previousRange(r);
    expect(p.end.getTime()).toBe(r.start.getTime());
    expect(p.end.getTime() - p.start.getTime()).toBe(r.end.getTime() - r.start.getTime());
  });
  it("daily buckets are 30 contiguous IST days, oldest first", () => {
    const b = dailyBuckets(30, new Date("2026-10-09T06:00:00Z"));
    expect(b).toHaveLength(30);
    expect(b[29]!.start.toISOString()).toBe("2026-10-08T18:30:00.000Z");
    for (let i = 1; i < b.length; i++) expect(b[i]!.start.getTime()).toBe(b[i - 1]!.end.getTime());
  });
});

describe("defensive numbers", () => {
  it("reads only finite numbers", () => {
    expect(readNumber(5)).toBe(5);
    expect(readNumber(undefined)).toBeNull();
    expect(readNumber("12")).toBeNull();
    expect(readNumber(Number.NaN)).toBeNull();
  });
  it("ratio never divides by zero", () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(null, 4)).toBeNull();
  });
});

describe("metric errors", () => {
  it("explains index, permission and network failures", () => {
    expect(metricErrorMessage({ code: "failed-precondition" })).toMatch(/index/);
    expect(metricErrorMessage({ code: "permission-denied" })).toMatch(/role/);
    expect(metricErrorMessage({ code: "unavailable" })).toMatch(/connection/);
    expect(metricErrorMessage(new Error("x"))).toBe("This number couldn't load.");
  });
});
