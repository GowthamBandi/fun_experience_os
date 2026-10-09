import { describe, expect, it } from "vitest";
import {
  ageFrom,
  customerLookup,
  customerName,
  eligibilitySummary,
  formatPhone,
  genderLabel,
  holdBadge,
  isPermissionDenied,
  newestCustomers,
  openRefunds,
  paymentBadge,
  paymentTotals,
  refundBadge,
  refundReasonLabel,
  toCustomer,
  toCustomerBooking,
  toCustomerReview,
  toLegalHold,
  toPayment,
  toRefund,
  userStatusBadge,
} from "@/lib/customers";
import { maskPhone } from "@/lib/format";
import { METRIC_SPECS, scopeWhere } from "@/lib/metrics";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe("customerLookup", () => {
  it("normalises any typed phone to E.164", () => {
    for (const q of ["98765 43210", "+91 98765-43210", "09876543210", "9876543210"]) {
      expect(customerLookup(q)).toEqual({ kind: "phone", value: "+919876543210" });
    }
  });
  it("routes IDs and booking references, and refuses free text (users has no name)", () => {
    expect(customerLookup("aBcDeFgHiJkLmNoPqRsT1234")).toEqual({ kind: "id", value: "aBcDeFgHiJkLmNoPqRsT1234" });
    expect(customerLookup("pls-abc234")).toEqual({ kind: "reference", value: "PLS-ABC234" });
    expect(customerLookup("Aarav")).toEqual({ kind: "unsupported" });
    expect(customerLookup("   ")).toEqual({ kind: "empty" });
  });
});

describe("users", () => {
  it("maps a customer doc and treats scope platform as an operator", () => {
    const c = toCustomer("u1", { phone: "+919100000001", createdAt: ts("2026-10-01T10:00:00Z") });
    expect(c).toEqual({ uid: "u1", phone: "+919100000001", createdAt: new Date("2026-10-01T10:00:00Z"), operator: false, status: null });
    expect(toCustomer("o1", { scope: "platform", status: "active" }).operator).toBe(true);
  });
  it("drops operators from the newest list and caps it", () => {
    const rows = [toCustomer("o1", { scope: "platform" }), ...Array.from({ length: 25 }, (_, i) => toCustomer(`c${i}`, {}))];
    const out = newestCustomers(rows);
    expect(out).toHaveLength(20);
    expect(out[0]!.uid).toBe("c0");
    expect(out.some((r) => r.operator)).toBe(false);
  });
  it("names the customer or falls back like the app does", () => {
    expect(customerName("  Diya ")).toBe("Diya");
    expect(customerName(null)).toBe("PULSE member");
    expect(customerName("")).toBe("PULSE member");
  });
  it("shows no status badge when the doc records none", () => {
    expect(userStatusBadge(undefined)).toBeNull();
    expect(userStatusBadge("disabled")).toEqual({ label: "Disabled", tone: "err" });
  });
  it("never shows the middle digits of a phone", () => {
    expect(maskPhone("+919100000007")).toBe("+91 91•••••007");
    expect(maskPhone(null)).toBe("—");
  });
  it("groups a revealed phone for reading", () => {
    expect(formatPhone("+919100000004")).toBe("+91 91000 00004");
    expect(formatPhone("+447700900123")).toBe("+447700900123");
    expect(formatPhone(null)).toBe("—");
  });
});

describe("bookings and eligibility", () => {
  it("reads eligibility and refundedMinor without inventing values", () => {
    const b = toCustomerBooking("b1", { amountMinor: 49900, refundedMinor: 0, eligibility: { ageVerifiedOk: true, genderOk: false } });
    expect(b.amountMinor).toBe(49900);
    expect(b.eligibility).toEqual({ age: true, gender: false });
    const old = toCustomerBooking("b2", {});
    expect(old.amountMinor).toBeNull();
    expect(old.refundedMinor).toBeNull();
    expect(old.eligibility).toBeNull();
  });
  it("summarises the checks recorded at booking", () => {
    const rows = [
      toCustomerBooking("a", { eligibility: { ageVerifiedOk: true, genderOk: true } }),
      toCustomerBooking("b", { eligibility: { ageVerifiedOk: false, genderOk: true } }),
      toCustomerBooking("c", {}),
    ];
    expect(eligibilitySummary(rows)).toEqual({ checked: 2, failed: 1, unrecorded: 1 });
  });
});

describe("payments and refunds", () => {
  it("totals captured money and refunds, skipping missing amounts", () => {
    const rows = [
      toPayment("p1", { amountMinor: 50000, status: "captured", refundedMinor: 0 }),
      toPayment("p2", { amountMinor: 20000, status: "partially-refunded", refundedMinor: 10000 }),
      toPayment("p3", { amountMinor: 30000, status: "failed" }),
      toPayment("p4", { status: "captured" }),
    ];
    expect(paymentTotals(rows)).toEqual({ captured: 70000, refunded: 10000 });
    expect(paymentBadge("created").label).toBe("Awaiting payment");
    expect(paymentBadge(undefined)).toEqual({ label: "—", tone: "muted" });
  });
  it("counts refunds still in flight", () => {
    const rows = [
      toRefund("r1", { status: "under-review", amountMinor: 24950 }),
      toRefund("r2", { status: "completed", amountMinor: 1000 }),
      toRefund("r3", { status: "rejected", amountMinor: 500 }),
      toRefund("r4", { status: "processing" }),
    ];
    expect(openRefunds(rows)).toEqual({ count: 2, amountMinor: 24950 });
    expect(refundBadge("completed").label).toBe("Refunded");
    expect(refundReasonLabel("organizer-request")).toBe("Organizer request");
    expect(refundReasonLabel("new-reason")).toBe("new-reason");
    expect(refundReasonLabel(null)).toBe("—");
  });
});

describe("reviews, holds and safety", () => {
  it("keeps the event on a customer's review", () => {
    const r = toCustomerReview("e1__u1", { eventId: "e1", rating: 4, authorName: "Diya", status: "published", updatedAt: ts("2026-10-02T00:00:00Z") });
    expect(r).toMatchObject({ eventId: "e1", rating: 4, author: "Diya" });
  });
  it("maps a legal hold", () => {
    const h = toLegalHold("user_u1", { status: "active", reason: "Chargeback dispute", reference: null, placedAt: ts("2026-10-03T00:00:00Z") });
    expect(h).toMatchObject({ status: "active", reason: "Chargeback dispute", reference: null, releasedAt: null });
    expect(holdBadge("active").tone).toBe("err");
  });
  it("computes age on the IST date", () => {
    // 2026-10-08T19:00Z is already 9 Oct in IST.
    expect(ageFrom("1990-10-09", new Date("2026-10-08T19:00:00Z"))).toBe(36);
    expect(ageFrom("1990-10-09", new Date("2026-10-08T17:00:00Z"))).toBe(35);
    expect(ageFrom("not-a-date", new Date())).toBeNull();
    expect(genderLabel("non-binary")).toBe("Non-binary");
    expect(genderLabel(undefined)).toBe("—");
  });
  it("recognises a permission-denied read", () => {
    expect(isPermissionDenied({ code: "permission-denied" })).toBe(true);
    expect(isPermissionDenied(new Error("Missing or insufficient permissions."))).toBe(true);
    expect(isPermissionDenied(new Error("offline"))).toBe(false);
  });
});

describe("customer-scoped metrics", () => {
  it("filters on the customer's own field", () => {
    expect(scopeWhere(METRIC_SPECS.customerSpent, { customerUid: "u1" })).toEqual([["customerUid", "==", "u1"]]);
    expect(scopeWhere(METRIC_SPECS.customerReviews, { customerUid: "u1" })).toEqual([["authorUid", "==", "u1"]]);
    expect(METRIC_SPECS.customerSpent.where).toEqual([["status", "in", ["confirmed", "completed"]]]);
  });
  it("refuses to narrow a ledger metric to a customer (ledger lines carry no customerUid)", () => {
    expect(() => scopeWhere(METRIC_SPECS.grossBookings, { customerUid: "u1" })).toThrow();
  });
  it("keeps org and event scopes as before", () => {
    expect(scopeWhere(METRIC_SPECS.grossBookings, { orgId: "o1", eventId: "e1" })).toEqual([
      ["orgId", "==", "o1"],
      ["eventId", "==", "e1"],
    ]);
    expect(scopeWhere(METRIC_SPECS.grossBookings)).toEqual([]);
  });
});
