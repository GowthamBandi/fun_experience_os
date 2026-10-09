import { describe, expect, it } from "vitest";
import { formatCountable, parseCountable } from "@/components/pulse/count-up";

describe("parseCountable", () => {
  it("reads money, percentages and plain counts", () => {
    expect(parseCountable("₹1,84,320")).toMatchObject({ prefix: "₹", target: 184320, grouped: true, suffix: "" });
    expect(parseCountable("1.6%")).toMatchObject({ target: 1.6, decimals: 1, suffix: "%" });
    expect(parseCountable("412")).toMatchObject({ target: 412, decimals: 0 });
    expect(parseCountable("₹1.84L")).toMatchObject({ prefix: "₹", target: 1.84, suffix: "L" });
  });
  it("refuses values it cannot reformat identically", () => {
    expect(parseCountable("—")).toBeNull();
    expect(parseCountable("14/16")).toBeNull();
    expect(parseCountable("100,000")).toBeNull();
  });
  it("formats intermediate frames in the same shape", () => {
    const c = parseCountable("₹1,84,320")!;
    expect(formatCountable(c, 92160)).toBe("₹92,160");
  });
});
