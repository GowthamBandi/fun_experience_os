import { describe, expect, it } from "vitest";
import { countCompact, deltaPct, inrCompact, inrMinor, maskPhone, normalizePhone, relTime } from "@/lib/format";

describe("money", () => {
  it("formats paise as en-IN rupees", () => {
    expect(inrMinor(18432000)).toBe("₹1,84,320");
    expect(inrMinor(0)).toBe("₹0");
    expect(inrMinor(undefined)).toBe("—");
    expect(inrMinor(Number.NaN)).toBe("—");
  });
  it("keeps paise when there are any", () => {
    expect(inrMinor(44950)).toBe("₹449.50");
    expect(inrMinor(45000)).toBe("₹450");
    expect(inrMinor(1)).toBe("₹0.01");
    expect(inrMinor(18432005)).toBe("₹1,84,320.05");
    expect(inrMinor(-44950)).toBe("−₹449.50");
    expect(inrMinor(-40)).toBe("−₹0.40");
  });
  it("compacts with k / L / Cr", () => {
    expect(inrCompact(95000)).toBe("₹950");
    expect(inrCompact(1864000)).toBe("₹18.6k");
    expect(inrCompact(18432000)).toBe("₹1.84L");
    expect(inrCompact(2100000000)).toBe("₹2.1Cr");
    expect(inrCompact(null)).toBe("—");
  });
  it("compacts counts", () => {
    expect(countCompact(412)).toBe("412");
    expect(countCompact(1200)).toBe("1.2k");
    expect(countCompact(340000)).toBe("3.4L");
  });
  it("signs negatives with a true minus before the rupee", () => {
    expect(inrMinor(-95000)).toBe("−₹950");
    expect(inrMinor(-18432000)).toBe("−₹1,84,320");
    expect(inrCompact(-95000)).toBe("−₹950");
    expect(inrCompact(-18432000)).toBe("−₹1.84L");
    expect(inrCompact(-900)).toBe("−₹9");
    expect(countCompact(-1200)).toBe("−1.2k");
  });
  it("never shows a minus on zero", () => {
    expect(inrCompact(-40)).toBe("₹0");
    expect(inrMinor(-0)).toBe("₹0");
  });
  it("moves up a unit when rounding reaches it", () => {
    expect(inrCompact(99960)).toBe("₹1k");
    expect(inrCompact(100000)).toBe("₹1k");
    expect(inrCompact(9999990)).toBe("₹1L");
    expect(inrCompact(999999900)).toBe("₹1Cr");
    expect(inrCompact(-999999900)).toBe("−₹1Cr");
    expect(inrCompact(99940)).toBe("₹999");
    expect(countCompact(999.6)).toBe("1k");
    expect(countCompact(99960)).toBe("1L");
    expect(countCompact(9_999_000)).toBe("1Cr");
  });
});

describe("deltaPct", () => {
  it("compares with the previous period", () => {
    expect(deltaPct(118, 100)).toEqual({ label: "▲ 18%", tone: "up" });
    expect(deltaPct(90, 100)).toEqual({ label: "▼ 10%", tone: "down" });
    expect(deltaPct(100, 100)).toEqual({ label: "0%", tone: "flat" });
  });
  it("reads direction correctly from a negative baseline", () => {
    expect(deltaPct(-50, -100)).toEqual({ label: "▲ 50%", tone: "up" });
    expect(deltaPct(50, -100)).toEqual({ label: "▲ 150%", tone: "up" });
    expect(deltaPct(-150, -100)).toEqual({ label: "▼ 50%", tone: "down" });
  });
  it("never shows Infinity or NaN", () => {
    expect(deltaPct(5, 0)).toEqual({ label: "new", tone: "new" });
    expect(deltaPct(0, 0)).toEqual({ label: "0%", tone: "flat" });
    expect(deltaPct(null, 10)).toEqual({ label: "", tone: "none" });
  });
});

describe("relTime", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  it("reads naturally", () => {
    expect(relTime(new Date("2026-10-09T11:59:40Z"), now)).toBe("just now");
    expect(relTime(new Date("2026-10-09T11:48:00Z"), now)).toBe("12 min ago");
    expect(relTime(new Date("2026-10-09T09:00:00Z"), now)).toBe("3 h ago");
    expect(relTime(new Date("2026-10-08T10:00:00Z"), now)).toBe("yesterday");
    expect(relTime(new Date("2026-10-04T10:00:00Z"), now)).toBe("4 Oct");
    expect(relTime(new Date("2026-10-09T14:00:00Z"), now)).toBe("in 2 h");
    expect(relTime(null, now)).toBe("—");
  });
});

describe("phones", () => {
  it("masks", () => {
    expect(maskPhone("+919876543210")).toBe("+91 98•••••210");
    expect(maskPhone(null)).toBe("—");
  });
  it("normalises every typed form", () => {
    for (const raw of ["98765 43210", "+91 98765-43210", "09876543210", "9876543210", "919876543210"]) {
      expect(normalizePhone(raw)).toBe("+919876543210");
    }
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull(); // Indian mobiles start 6–9
  });
});

describe("countFull", () => {
  it("groups en-IN and shows — when missing", async () => {
    const { countFull } = await import("@/lib/format");
    expect(countFull(184320)).toBe("1,84,320");
    expect(countFull(0)).toBe("0");
    expect(countFull(null)).toBe("—");
    expect(countFull(Number.NaN)).toBe("—");
  });
});
