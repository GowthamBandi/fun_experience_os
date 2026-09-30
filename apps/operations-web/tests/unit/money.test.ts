import { describe, expect, it } from "vitest";
import { formatPaise, needsRefundDualControl, needsSettlementDualControl } from "@/lib/console/money";

describe("formatPaise", () => {
  it("formats integer paise as INR with two decimals", () => {
    expect(formatPaise(1234567)).toBe("₹12,345.67");
    expect(formatPaise(100)).toBe("₹1.00");
    expect(formatPaise(5)).toBe("₹0.05");
    expect(formatPaise(0)).toBe("₹0.00");
  });
  it("uses Indian digit grouping", () => {
    expect(formatPaise(1_00_00_000_00)).toBe("₹1,00,00,000.00");
  });
  it("handles negatives", () => {
    expect(formatPaise(-2550)).toBe("-₹25.50");
  });
  it("refuses non-integer or non-number input rather than guessing", () => {
    expect(formatPaise(12.5)).toBe("—");
    expect(formatPaise("100")).toBe("—");
    expect(formatPaise(undefined)).toBe("—");
    expect(formatPaise(Number.NaN)).toBe("—");
  });
  it("falls back to INR for an invalid currency code", () => {
    expect(formatPaise(100, "rupees")).toBe("₹1.00");
  });
});

describe("dual-control thresholds (display only)", () => {
  it("refunds: strictly above ₹10,000", () => {
    expect(needsRefundDualControl(1_000_000)).toBe(false);
    expect(needsRefundDualControl(1_000_001)).toBe(true);
  });
  it("settlements: strictly above ₹50,000", () => {
    expect(needsSettlementDualControl(5_000_000)).toBe(false);
    expect(needsSettlementDualControl(5_000_001)).toBe(true);
  });
});
