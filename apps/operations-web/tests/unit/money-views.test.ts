import { describe, expect, it } from "vitest";
import { RequestIdBook, decisionKey } from "@/lib/console/actions";
import {
  agreementCounts,
  agreementDecision,
  agreementKey,
  buildKey,
  proposeKey,
  refundKey,
  refundToast,
  settlementKey,
  filterAgreements,
  filterRefunds,
  filterSettlements,
  needsSecondPayer,
  primarySettlementAction,
  refundApproveConsequence,
  refundCounts,
  refundDecision,
  refundStageBadge,
  settlementButtons,
  settlementConsequence,
  settlementCounts,
  sortAgreements,
  termsInForce,
  toAgreementRow,
  toRefundRow,
  toSettlementRow,
  todayIst,
  waitingAmount,
  who,
} from "@/lib/money-views";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

// RefundDoc shape (commerce/types.ts, refunds.ts).
const small = toRefundRow("rf_small", { status: "under-review", amountMinor: 45_000, currency: "INR", reason: "organizer-request", note: "Guest fell ill", orgId: "org1", bookingId: "bk1", approvals: [], createdAt: ts("2026-10-08T10:00:00Z") });
const bigFresh = toRefundRow("rf_big", { status: "under-review", amountMinor: 1_200_000, reason: "event-cancelled", approvals: [] });
const bigHalf = toRefundRow("rf_half", { status: "under-review", amountMinor: 1_200_000, reason: "duplicate-capture", approvals: ["adminA"] });
const exactly10k = toRefundRow("rf_10k", { status: "under-review", amountMinor: 1_000_000, approvals: ["adminA"] });
const done = toRefundRow("rf_done", { status: "completed", amountMinor: 5_000, approvals: ["adminA"] });
const odd = toRefundRow("rf_odd", { status: "under-review", amountMinor: "450" });

describe("refund rows", () => {
  it("maps fields and keeps missing ones null", () => {
    expect(small).toMatchObject({ amountMinor: 45_000, reasonLabel: "Organizer-requested refund", note: "Guest fell ill", stage: "needs-decision", dual: false, orgId: "org1", eventId: null });
    expect(small.createdAt?.toISOString()).toBe("2026-10-08T10:00:00.000Z");
    expect(odd.amountMinor).toBeNull();
    expect(odd.reasonLabel).toBe("—");
  });

  it("stages follow refundStage: dual control is strictly above ₹10,000, as the server", () => {
    expect(bigFresh.stage).toBe("needs-decision");
    expect(bigFresh.dual).toBe(true);
    expect(bigHalf.stage).toBe("awaiting-second-approver");
    expect(exactly10k.dual).toBe(false);
    expect(exactly10k.stage).toBe("needs-decision");
    expect(done.stage).toBe("decided");
  });

  it("counts and filters by tab", () => {
    const rows = [small, bigFresh, bigHalf, done];
    expect(refundCounts(rows)).toEqual({ decide: 2, second: 1, decided: 1, all: 4 });
    expect(filterRefunds(rows, "second").map((r) => r.id)).toEqual(["rf_half"]);
    expect(filterRefunds(rows, "all")).toHaveLength(4);
  });

  it("sums what is waiting, and refuses to guess with an unreadable amount", () => {
    expect(waitingAmount([small, bigHalf, done])).toBe(1_245_000);
    expect(waitingAmount([small, odd])).toBeNull();
    expect(waitingAmount([])).toBe(0);
  });

  it("badges: second approver in warn, decided by status", () => {
    expect(refundStageBadge(bigHalf)).toEqual({ label: "Needs 2nd approver", tone: "warn" });
    expect(refundStageBadge(small).label).toBe("Needs decision");
    expect(refundStageBadge(done)).toEqual({ label: "Refunded", tone: "ok" });
  });

  it("decision: phrase only for dual control, labels by stage, approver detection", () => {
    expect(refundDecision(small, "adminA")).toEqual({ approveLabel: "Approve refund", phrase: null, closed: null, approvedByMe: false });
    expect(refundDecision(bigFresh, "adminA").phrase).toBe("APPROVE REFUND");
    expect(refundDecision(bigHalf, "adminA")).toMatchObject({ approveLabel: "Give second approval", approvedByMe: true });
    expect(refundDecision(bigHalf, "adminB").approvedByMe).toBe(false);
    expect(refundDecision(done, "adminB").closed).toBe("This refund is completed; there is nothing to decide.");
  });

  it("approve consequence keeps the original copy", () => {
    expect(refundApproveConsequence(small, "₹450.00")).toBe("Approves a refund of ₹450.00; it is sent to the payment provider immediately.");
    expect(refundApproveConsequence(bigHalf, "₹12,000.00")).toContain("This is the second approval");
    expect(refundApproveConsequence(bigFresh, "₹12,000.00")).toContain("a different admin must approve before money moves");
  });
});

// SettlementDoc shape (commerce/settlements.ts).
const stl = (id: string, status: string, netMinor: number, extra: Record<string, unknown> = {}) =>
  toSettlementRow(id, { id, orgId: "org1", status, netMinor, grossMinor: netMinor + 100, commissionMinor: 100, refundsMinor: 0, entryCount: 3, periodEnd: ts("2026-10-01T18:29:59Z"), ...extra });

describe("settlement rows", () => {
  it("maps fields; missing money stays null", () => {
    const row = toSettlementRow("s0", { status: "empty", orgId: "org1" });
    expect(row).toMatchObject({ status: "empty", netMinor: null, entryCount: null, dual: false, payoutReference: null });
  });

  it("counts by stage; accruing and empty appear only under All", () => {
    const rows = [stl("a", "pending-approval", 10), stl("b", "approved", 10), stl("c", "held", 10), stl("d", "paid", 10), stl("e", "empty", 0), stl("f", "accruing", 0)];
    expect(settlementCounts(rows)).toEqual({ approve: 1, pay: 1, held: 1, paid: 1, all: 6 });
    expect(filterSettlements(rows, "pay").map((r) => r.id)).toEqual(["b"]);
  });

  it("dual control strictly above ₹50,000 and only flags approved ones for a second payer", () => {
    expect(needsSecondPayer(stl("x", "approved", 5_000_001))).toBe(true);
    expect(needsSecondPayer(stl("x", "approved", 5_000_000))).toBe(false);
    expect(needsSecondPayer(stl("x", "pending-approval", 9_000_000))).toBe(false);
  });

  it("buttons mirror settlementActionsFor with one volt at most; mark paid is a danger with a phrase", () => {
    expect(settlementButtons("pending-approval").map((b) => [b.action, b.variant])).toEqual([["approve", "volt"], ["hold", "danger"]]);
    expect(settlementButtons("approved").map((b) => [b.action, b.variant, b.phrase])).toEqual([["hold", "danger", null], ["mark-paid", "danger", "MARK PAID"]]);
    expect(settlementButtons("held").map((b) => [b.action, b.variant])).toEqual([["release-hold", "volt"]]);
    expect(settlementButtons("paid")).toEqual([]);
    expect(settlementButtons("empty")).toEqual([]);
    for (const s of ["pending-approval", "approved", "held"]) expect(settlementButtons(s).filter((b) => b.variant === "volt").length).toBeLessThanOrEqual(1);
    expect(primarySettlementAction("approved")).toBeNull();
  });

  it("consequences keep the original copy", () => {
    expect(settlementConsequence("approve", "₹60,000.00", true)).toBe("Approves the payout of ₹60,000.00. Above ₹50,000 a different admin must mark it paid.");
    expect(settlementConsequence("approve", "₹600.00", false)).toBe("Approves the payout of ₹600.00.");
    expect(settlementConsequence("mark-paid", "₹600.00", false)).toContain("This console does not move money.");
  });
});

// commercialAgreements shape (commerce/agreements.ts).
const agr = (id: string, status: string, extra: Record<string, unknown> = {}) =>
  toAgreementRow(id, { orgId: "org1", commissionBps: 1000, payoutCadence: "weekly", status, proposedBy: "adminA", createdAt: ts("2026-10-01T00:00:00Z"), ...extra });

describe("agreement rows", () => {
  it("maps fields and falls back to createdAt for the proposal time", () => {
    const row = agr("a1", "pending-approval", { note: "Signed MSA v2" });
    expect(row).toMatchObject({ commissionBps: 1000, cadence: "weekly", note: "Signed MSA v2", proposedBy: "adminA", decidedBy: null });
    expect(row.proposedAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("counts, filters and sorts pending first", () => {
    const rows = [agr("old", "superseded", { decidedAt: ts("2026-09-01T00:00:00Z") }), agr("p2", "pending-approval", { proposedAt: ts("2026-10-05T00:00:00Z") }), agr("live", "approved", { decidedAt: ts("2026-09-20T00:00:00Z") }), agr("p1", "pending-approval", { proposedAt: ts("2026-10-02T00:00:00Z") }), agr("no", "rejected")];
    expect(agreementCounts(rows)).toEqual({ pending: 2, inforce: 1, history: 2, all: 5 });
    expect(filterAgreements(rows, "history").map((r) => r.id).sort()).toEqual(["no", "old"]);
    expect(sortAgreements(rows).map((r) => r.id).slice(0, 3)).toEqual(["p1", "p2", "no"]);
  });

  it("the proposer can't decide; anyone else can", () => {
    expect(agreementDecision(agr("p", "pending-approval"), "adminA")).toEqual({ pending: true, proposedByMe: true, blocked: "You proposed these terms. A different admin must decide them." });
    expect(agreementDecision(agr("p", "pending-approval"), "adminB")).toEqual({ pending: true, proposedByMe: false, blocked: null });
    expect(agreementDecision(agr("p", "approved"), "adminB").pending).toBe(false);
  });

  it("terms in force: the newest approved for that organizer", () => {
    const rows = [agr("a", "approved", { commissionBps: 1000, decidedAt: ts("2026-01-01T00:00:00Z") }), agr("b", "approved", { commissionBps: 1250, payoutCadence: "monthly", decidedAt: ts("2026-06-01T00:00:00Z") }), agr("c", "pending-approval", { commissionBps: 900 }), agr("d", "approved", { orgId: "org2", commissionBps: 500 })];
    expect(termsInForce(rows, "org1")).toEqual({ bps: 1250, cadence: "monthly" });
    expect(termsInForce(rows, "org3")).toEqual({ bps: null, cadence: null });
    expect(termsInForce(rows, null)).toEqual({ bps: null, cadence: null });
  });
});

describe("small helpers", () => {
  it("marks the signed-in admin", () => {
    expect(who("adminA", "adminA")).toBe("adminA (you)");
    expect(who("adminA", "adminB")).toBe("adminA");
    expect(who(null, "adminA")).toBe("—");
  });

  it("today in IST rolls over at 18:30Z", () => {
    expect(todayIst(new Date("2026-10-09T18:29:00Z"))).toBe("2026-10-09");
    expect(todayIst(new Date("2026-10-09T18:30:00Z"))).toBe("2026-10-10");
  });
});

describe("refund outcome toast", () => {
  it("titles from the server status, never calling a provider failure a second approval", () => {
    expect(refundToast("awaiting-second-approval", "approve", "₹12,000")).toMatchObject({ tone: "info", title: "Awaiting second approver" });
    const failed = refundToast("failed", "approve", "₹449.50");
    expect(failed).toMatchObject({ tone: "err", title: "Refund approved · provider failed" });
    expect(failed.body).toContain("payment provider reported a failure");
    expect(refundToast("processing", "approve", "₹449.50")).toEqual({ tone: "ok", title: "Refund approved · ₹449.50", body: "Refund approved and sent to the payment provider (processing)." });
    expect(refundToast("completed", "approve", "₹449.50").title).toBe("Refund approved · ₹449.50");
    expect(refundToast("rejected", "reject", "₹449.50")).toMatchObject({ tone: "ok", title: "Refund rejected · ₹449.50" });
  });
});

describe("command keys (the server replays by requestId alone)", () => {
  const book = () => new RequestIdBook("t");

  it("decisionKey trims and joins every part", () => {
    expect(decisionKey("a", " b ", 3, null, undefined, false)).toBe("a|b|3|||false");
  });

  it("an identical retry replays; a changed payload gets a fresh id", () => {
    const b = book();
    expect(b.idFor(proposeKey("org1", "10", "weekly"))).toBe(b.idFor(proposeKey("org1", "10.00", "weekly")));
    expect(b.idFor(proposeKey("org1", "10", "weekly"))).not.toBe(b.idFor(proposeKey("org1", "11", "weekly")));
    expect(proposeKey("org1", "10", "weekly")).not.toBe(proposeKey("org1", "10", "monthly"));
    expect(proposeKey("org1", "10", "weekly")).not.toBe(proposeKey("org2", "10", "weekly"));
  });

  it("mark paid carries the UTR; other settlement actions don't", () => {
    const row = stl("s1", "approved", 10_000, { updatedAt: ts("2026-10-09T10:00:00Z") });
    expect(settlementKey(row, "mark-paid", "UTR111")).not.toBe(settlementKey(row, "mark-paid", "UTR112"));
    expect(settlementKey(row, "mark-paid", " UTR111 ")).toBe(settlementKey(row, "mark-paid", "UTR111"));
    expect(settlementKey(row, "hold", "UTR111")).toBe(settlementKey(row, "hold", ""));
    expect(settlementKey(row, "hold")).not.toBe(settlementKey(row, "mark-paid", ""));
  });

  it("a repeat after the record moved is a new command", () => {
    const before = stl("s1", "approved", 10_000, { updatedAt: ts("2026-10-09T10:00:00Z") });
    const after = stl("s1", "approved", 10_000, { updatedAt: ts("2026-10-09T11:00:00Z") });
    expect(settlementKey(before, "hold")).not.toBe(settlementKey(after, "hold"));
    const r1 = toRefundRow("r", { status: "under-review", amountMinor: 1_200_000, approvals: [], updatedAt: ts("2026-10-09T10:00:00Z") });
    const r2 = toRefundRow("r", { status: "under-review", amountMinor: 1_200_000, approvals: ["a"], updatedAt: ts("2026-10-09T10:00:00Z") });
    expect(refundKey(r1, "approve")).not.toBe(refundKey(r2, "approve"));
    expect(refundKey(r1, "approve")).not.toBe(refundKey(r1, "reject"));
    const a1 = agr("g", "pending-approval", { updatedAt: ts("2026-10-09T10:00:00Z") });
    expect(agreementKey(a1, "approve")).toBe(agreementKey(agr("g", "pending-approval", { updatedAt: ts("2026-10-09T10:00:00Z") }), "approve"));
    expect(agreementKey(a1, "approve")).not.toBe(agreementKey(a1, "reject"));
  });

  it("build is keyed by organizer and period end", () => {
    expect(buildKey("org1", "2026-10-09")).toBe(buildKey("org1", "2026-10-09"));
    expect(buildKey("org1", "2026-10-09")).not.toBe(buildKey("org1", "2026-10-08"));
    expect(buildKey("org1", "2026-10-09")).not.toBe(buildKey("org2", "2026-10-09"));
  });

  it("status changes key by entity version (StatusSheet)", () => {
    expect(decisionKey("organizer", "o1", "paused", 1)).not.toBe(decisionKey("organizer", "o1", "paused", 2));
  });
});
