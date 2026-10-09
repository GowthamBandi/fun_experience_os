import { describe, expect, it } from "vitest";
import { classifyQuery, pageMatches } from "@/lib/search";
import { NAV } from "@/lib/nav";
describe("classifyQuery", () => {
  it("detects phones in any typed form", () => {
    for (const raw of ["98765 43210", "+91 98765-43210", "09876543210", "9876543210"]) {
      expect(classifyQuery(raw)).toEqual({ kind: "phone", value: "+919876543210" });
    }
  });
  it("detects booking references", () => {
    expect(classifyQuery("pls-7hk2qx")).toEqual({ kind: "reference", value: "PLS-7HK2QX" });
  });
  it("detects document ids", () => {
    expect(classifyQuery("wD6QcJ9C3nqQFjNwa1cLLqAj4kCQ").kind).toBe("id");
  });
  it("falls back to text", () => {
    expect(classifyQuery("  Weekend Cricket ")).toEqual({ kind: "text", value: "weekend cricket" });
  });
});
describe("pageMatches", () => {
  it("finds pages by label or keyword, label first", () => {
    expect(pageMatches("refund", NAV)[0]?.href).toBe("/refunds");
    expect(pageMatches("kyc", NAV).map((n) => n.href)).toContain("/approvals");
  });
});
