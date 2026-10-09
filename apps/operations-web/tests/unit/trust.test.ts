import { describe, expect, it } from "vitest";
import {
  alertActions,
  blockTarget,
  filterReviews,
  filterRisks,
  distinctIds,
  moderationAction,
  nameOrId,
  reviewCounts,
  riskCounts,
  riskDetailRows,
  riskEntityLinks,
  riskGlyph,
  riskStatusBadge,
  sortReviews,
  sortRisks,
  toModReview,
  toRiskAlert,
} from "@/lib/trust";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

// The exact shape raiseRiskAlert writes (commerce/shared.ts).
const mismatch = toRiskAlert("amount-mismatch_pay_1", {
  id: "amount-mismatch_pay_1",
  kind: "payment-amount-mismatch",
  severity: "high",
  status: "open",
  orgId: "org1",
  summary: "A captured payment did not match the booking amount.",
  detail: { paymentId: "p1", expectedMinor: 1000, receivedMinor: 900 },
  createdAt: ts("2026-10-09T08:00:00Z"),
});
const dup = toRiskAlert("dup-capture_pay_2", { kind: "payment-duplicate-capture", severity: "medium", status: "open", orgId: null, summary: "Paid twice", detail: { paymentId: "p2" }, createdAt: ts("2026-10-09T09:00:00Z") });
const refund = toRiskAlert("evc-failed_b1", { kind: "event-cancel-refund-failed", severity: "high", orgId: "org2", detail: { eventId: "e1", bookingId: "b1" }, createdAt: ts("2026-10-09T10:00:00Z"), lastSeenAt: ts("2026-10-09T10:30:00Z") });
const kyc = toRiskAlert("kyc-purged-under-hold_u1", { kind: "kyc-purged-under-hold", severity: "low", status: "resolved", version: 3, statusReason: "checked with legal", detail: { uid: "u1", filesDeleted: 2 } });
const critical = toRiskAlert("legacy-1", { severity: "critical", status: "under-review", version: 1.5 });
const odd = toRiskAlert("odd-0001", { severity: "urgent", detail: "nope" });

describe("toRiskAlert", () => {
  it("reads the raiseRiskAlert shape", () => {
    expect(mismatch).toMatchObject({ title: "Payment amount mismatch", severity: "high", status: "open", open: true, orgId: "org1", version: 0, eventId: null });
    expect(refund).toMatchObject({ status: null, open: true, eventId: "e1", bookingId: "b1" });
    expect(kyc).toMatchObject({ open: false, uid: "u1", version: 3, statusReason: "checked with legal" });
  });
  it("never invents missing values", () => {
    expect(odd).toMatchObject({ title: "Risk alert", severity: null, summary: null, detail: {}, createdAt: null, version: 0 });
    expect(critical.version).toBe(0);
  });
});

describe("risk list", () => {
  const all = [kyc, dup, mismatch, odd, refund, critical];
  it("sorts critical first, then by severity, newest first inside one", () => {
    expect(sortRisks(all).map((a) => a.id)).toEqual(["legacy-1", "evc-failed_b1", "amount-mismatch_pay_1", "dup-capture_pay_2", "kyc-purged-under-hold_u1", "odd-0001"]);
  });
  it("counts and filters open vs closed, and searches ids in the detail", () => {
    expect(riskCounts(all)).toEqual({ open: 5, closed: 1, all: 6 });
    expect(filterRisks(all, "closed", "").map((a) => a.id)).toEqual(["kyc-purged-under-hold_u1"]);
    expect(filterRisks(all, "open", "b1").map((a) => a.id)).toEqual(["evc-failed_b1"]);
    expect(filterRisks(all, "all", "org1").map((a) => a.id)).toEqual(["amount-mismatch_pay_1"]);
  });
  it("uses 🚨 for high and critical, ⚠️ otherwise", () => {
    expect(riskGlyph("critical").emoji).toBe("🚨");
    expect(riskGlyph("high")).toEqual({ emoji: "🚨", tone: "err" });
    expect(riskGlyph("medium")).toEqual({ emoji: "⚠️", tone: "warn" });
    expect(riskGlyph(null).tone).toBe("muted");
  });
  it("labels a missing status as open", () => {
    expect(riskStatusBadge(null).label).toBe("Open");
    expect(riskStatusBadge("under-review").label).toBe("Investigating");
    expect(riskStatusBadge("weird-state").label).toBe("Weird state");
  });
});

describe("entity links and block target", () => {
  it("links organizer, event, booking and customer", () => {
    expect(riskEntityLinks(refund).map((l) => l.href)).toEqual(["/partners/org2", "/events/e1", "/events/e1?booking=b1"]);
    expect(riskEntityLinks(kyc).map((l) => l.href)).toEqual(["/customers/u1"]);
    expect(riskEntityLinks(dup)).toEqual([]);
  });
  it("only ever targets an organizer, never an event", () => {
    expect(blockTarget(refund)).toEqual({ entityType: "organizer", id: "org2" });
    expect(blockTarget(dup)).toBeNull();
    expect(blockTarget(toRiskAlert("evc-dropped_e9", { detail: { eventId: "e9" } }))).toBeNull();
  });
  it("lists detail scalars with readable labels", () => {
    expect(riskDetailRows({ receivedMinor: 900, lastError: null, nested: { a: 1 } })).toEqual([
      { label: "Last error", value: "—" },
      { label: "Nested", value: '{"a":1}' },
      { label: "Received minor", value: "900" },
    ]);
  });
});

describe("alertActions", () => {
  it("keeps Resolve (resolved) and Pause exposure (paused) and adds Keep open (under-review)", () => {
    expect(alertActions("open").map((a) => [a.label, a.status])).toEqual([["Resolve", "resolved"], ["Keep open", "under-review"], ["Pause exposure", "paused"], ["Close as blocked", "blocked"]]);
    expect(alertActions(null).map((a) => a.status)).toEqual(["resolved", "under-review", "paused", "blocked"]);
  });
  it("restores the alert-level block as a closed disposition behind the BLOCK phrase", () => {
    const block = alertActions("open").find((a) => a.status === "blocked")!;
    expect(block).toMatchObject({ label: "Close as blocked", phrase: "BLOCK", tone: "danger" });
    expect(block.consequence).toBe("Closes this alert as blocked. To stop the organizer from operating, use Block organizer below.");
    expect(alertActions("blocked").map((a) => a.status)).toEqual(["under-review"]);
  });
  it("hides no-ops and offers Reopen on a closed alert", () => {
    expect(alertActions("under-review").map((a) => a.status)).toEqual(["resolved", "paused", "blocked"]);
    expect(alertActions("paused").map((a) => a.status)).toEqual(["resolved", "under-review", "blocked"]);
    expect(alertActions("resolved").map((a) => a.label)).toEqual(["Reopen"]);
    expect(alertActions("blocked").map((a) => a.label)).toEqual(["Reopen"]);
  });
  it("never offers a status the alert can't take", () => {
    for (const s of ["open", "under-review", "paused", "resolved", null]) for (const a of alertActions(s)) expect(["resolved", "under-review", "paused", "blocked"]).toContain(a.status);
  });
});

/* ---------------------------------------------------------------- reviews */

// The exact shape submitReview writes (catalog/reviews.ts).
const r1 = toModReview("e1__u1", { eventId: "e1", experienceId: "x1", orgId: "o1", authorUid: "u1", authorName: "Asha", rating: 5, comment: "Loved it", status: "published", version: 1, createdAt: ts("2026-10-08T10:00:00Z"), updatedAt: ts("2026-10-08T10:00:00Z"), moderation: null });
const r2 = toModReview("e1__u2", { eventId: "e1", authorName: "PULSE member", rating: 2, comment: "Rude staff, call 98765", status: "hidden", updatedAt: ts("2026-10-09T10:00:00Z"), moderation: { by: "admin", reason: "Personal data", at: ts("2026-10-09T10:00:00Z") } });
const r3 = toModReview("e2__u3", { eventId: "e2", rating: 9, status: "published" });

describe("reviews", () => {
  it("reads the submitReview shape and rejects out-of-range ratings", () => {
    expect(r1).toMatchObject({ rating: 5, author: "Asha", eventId: "e1", status: "published", moderationReason: null, version: 1 });
    expect(r2).toMatchObject({ moderationReason: "Personal data", status: "hidden" });
    expect(r3).toMatchObject({ rating: null, comment: null, author: null, at: null, postedAt: null });
    expect(r2.postedAt).toBeNull();
    expect(r1.postedAt?.toISOString()).toBe("2026-10-08T10:00:00.000Z");
  });
  it("sorts newest first and counts by status", () => {
    expect(sortReviews([r3, r1, r2]).map((r) => r.id)).toEqual(["e1__u2", "e1__u1", "e2__u3"]);
    expect(reviewCounts([r1, r2, r3])).toEqual({ all: 3, published: 2, hidden: 1 });
  });
  it("filters by status and searches text, author and event title", () => {
    expect(filterReviews([r1, r2, r3], "hidden", "").map((r) => r.id)).toEqual(["e1__u2"]);
    expect(filterReviews([r1, r2, r3], "all", "asha").map((r) => r.id)).toEqual(["e1__u1"]);
    expect(filterReviews([r1, r2, r3], "all", "sunburn", { e2: "Sunburn Arena" }).map((r) => r.id)).toEqual(["e2__u3"]);
  });
  it("batches distinct ids and falls back to the id when no name resolves", () => {
    expect(distinctIds(["o2", null, "o1", "o2", ""], 40)).toEqual(["o1", "o2"]);
    expect(distinctIds(["c", "b", "a"], 2)).toEqual(["a", "b"]);
    expect(nameOrId("o1", { o1: "Harbor Events" })).toEqual({ text: "Harbor Events", isName: true });
    expect(nameOrId("o2", { o2: null })).toEqual({ text: "o2", isName: false });
    expect(nameOrId("o3", {})).toEqual({ text: "o3", isName: false });
  });
  it("offers the opposite moderation status", () => {
    expect(moderationAction("published")).toMatchObject({ status: "hidden", label: "Hide", tone: "danger" });
    expect(moderationAction("hidden")).toMatchObject({ status: "published", label: "Publish", tone: "volt" });
  });
});
