import { describe, expect, it } from "vitest";
import { countCompact, deltaPct, inrCompact, inrMinor, maskPhone, normalizePhone, relTime } from "@/lib/format";

describe("money", () => {
  it("formats paise as en-IN rupees", () => {
    expect(inrMinor(18432000)).toBe("₹1,84,320");
    expect(inrMinor(0)).toBe("₹0");
    expect(inrMinor(undefined)).toBe("—");
    expect(inrMinor(Number.NaN)).toBe("—");
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
});

describe("deltaPct", () => {
  it("compares with the previous period", () => {
    expect(deltaPct(118, 100)).toEqual({ label: "▲ 18%", tone: "up" });
    expect(deltaPct(90, 100)).toEqual({ label: "▼ 10%", tone: "down" });
    expect(deltaPct(100, 100)).toEqual({ label: "0%", tone: "flat" });
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
