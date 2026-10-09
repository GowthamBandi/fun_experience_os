import { describe, expect, it } from "vitest";
import { chartPath } from "@/components/pulse/chart-math";

describe("chartPath", () => {
  it("maps values into the box, top = max", () => {
    const { line } = chartPath([0, 10], 100, 50);
    expect(line).toBe("M0,50 L100,0");
  });
  it("handles flat and single series without NaN", () => {
    expect(chartPath([5, 5], 100, 50).line).not.toMatch(/NaN/);
    expect(chartPath([7], 100, 50).line).toBe("M0,25 L100,25");
    expect(chartPath([], 100, 50).line).toBe("");
  });
  it("closes the area along the bottom edge", () => {
    expect(chartPath([0, 10], 100, 50).area).toBe("M0,50 L100,0 L100,50 L0,50 Z");
    expect(chartPath([], 100, 50).area).toBe("");
  });
  it("ignores non-finite values", () => {
    expect(chartPath([0, Number.NaN, 10], 100, 50).line).not.toMatch(/NaN|Infinity/);
  });
});
