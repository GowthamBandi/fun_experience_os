import { describe, expect, it } from "vitest";
import { adaptRefund, adaptSettlement, canReissueOrganizerCode, caseTargetFields, displayStatus, refundStage } from "@/lib/console/records";
import { buildAttentionQueue, formatCount, groupBySeverity, isPrivilegedAudit } from "@/lib/console/attention";

describe("refund stages", () => {
  it("detects awaiting second approver only above ₹10,000 with one approval", () => {
    expect(refundStage({ status: "under-review", amountMinor: 2_000_000, approvals: ["a"] })).toBe("awaiting-second-approver");
    expect(refundStage({ status: "under-review", amountMinor: 2_000_000, approvals: [] })).toBe("needs-decision");
    expect(refundStage({ status: "under-review", amountMinor: 500_000, approvals: [] })).toBe("needs-decision");
    expect(refundStage({ status: "approved", amountMinor: 2_000_000, approvals: ["a", "b"] })).toBe("decided");
  });
  it("renders refund rows from paise", () => {
    const row = adaptRefund("req_1", { status: "under-review", amountMinor: 1_500_000, currency: "INR", approvals: ["a"], reason: "organizer-request", orgId: "org1", bookingId: "b1" });
    expect(row.value).toBe("₹15,000.00");
    expect(row.meta).toContain("Awaiting second approver");
    expect(row.status).toBe("Under review");
  });
});

describe("settlement rows", () => {
  it("shows gross/commission/refunds/net formatted from paise", () => {
    const row = adaptSettlement("stl_1", { orgId: "org1", status: "pending-approval", grossMinor: 1_000_000, commissionMinor: 100_000, refundsMinor: 50_000, netMinor: 850_000, currency: "INR", entryCount: 3 });
    expect(row.value).toBe("₹8,500.00 net");
    expect(row.meta).toContain("Gross ₹10,000.00");
    expect(row.meta).toContain("Commission ₹1,000.00");
    expect(row.meta).toContain("Refunds ₹500.00");
  });
});

describe("status mapping", () => {
  it("maps canonical statuses", () => {
    expect(displayStatus("paid")).toBe("Approved");
    expect(displayStatus("hidden")).toBe("Hidden");
    expect(displayStatus("held")).toBe("On hold");
    expect(displayStatus("pending-approval")).toBe("Pending");
  });
});

describe("case target key fields", () => {
  it("shows the event fields a reviewer needs", () => {
    const fields = caseTargetFields("event-approval", {
      title: "Sunset Trek", category: "outdoor", eligibility: { ageMin: 18, ageMax: null, genderRule: "women-only" },
      priceMinor: 149_900, currency: "INR", capacity: { max: 20, min: 4 }, startsAt: "2026-10-10T12:30:00.000Z",
      venue: { name: "Base Camp", area: "Hills", city: "Pune" }, responsibility: { primaryUid: "uid_lead" },
    });
    const byLabel = Object.fromEntries(fields.map((f) => [f.label, f.value]));
    expect(byLabel.Title).toBe("Sunset Trek");
    expect(byLabel.Price).toBe("₹1,499.00");
    expect(byLabel.Eligibility).toBe("Age 18+ · Women only");
    expect(byLabel.Capacity).toBe("4–20 spots");
    expect(byLabel.Venue).toBe("Base Camp, Hills, Pune");
    expect(byLabel["Responsible (primaryUid)"]).toBe("uid_lead");
    expect(byLabel.Starts).not.toBe("—");
  });
  it("flags a missing responsible person", () => {
    const fields = caseTargetFields("event-approval", { title: "x" });
    expect(fields.find((f) => f.label === "Responsible (primaryUid)")!.value).toMatch(/missing/);
  });
});

describe("organizer code re-issue eligibility", () => {
  it("requires an approved, not-yet-activated application", () => {
    expect(canReissueOrganizerCode({ status: "approved", orgId: "org1", activationPending: true })).toBe(true);
    expect(canReissueOrganizerCode({ status: "approved", orgId: "org1", activationPending: false })).toBe(false);
    expect(canReissueOrganizerCode({ status: "submitted" })).toBe(false);
  });
});

describe("attention queue", () => {
  const doc = (id: string, raw: Record<string, unknown>) => ({ id, raw });
  it("groups live counts by severity", () => {
    const items = buildAttentionQueue({
      governanceCases: [
        doc("c1", { kind: "organizer-kyc", status: "pending" }),
        doc("c2", { kind: "organizer-kyc", status: "approved" }),
        doc("c3", { kind: "experience-approval", status: "under-review" }),
        doc("c4", { kind: "event-approval", status: "information-requested" }),
        doc("c5", { kind: "arena-verification", status: "pending" }),
      ],
      riskAlerts: [doc("r1", { status: "open", severity: "high" }), doc("r2", { status: "open", severity: "low" }), doc("r3", { status: "resolved", severity: "high" })],
      refunds: [doc("f1", { status: "under-review", amountMinor: 2_000_000, approvals: ["a"] }), doc("f2", { status: "under-review", amountMinor: 1000, approvals: [] }), doc("f3", { status: "completed" })],
      settlements: [doc("s1", { status: "held" }), doc("s2", { status: "pending-approval" }), doc("s3", { status: "approved", netMinor: 6_000_000 }), doc("s4", { status: "paid" })],
      truncated: { governanceCases: true },
    });
    const count = (key: string) => items.find((i) => i.key === key)!.count;
    expect(count("organizer-approvals")).toBe(1);
    expect(count("experience-approvals")).toBe(1);
    expect(count("event-approvals")).toBe(1);
    expect(count("other-cases")).toBe(1);
    expect(count("risk-high")).toBe(1);
    expect(count("risk-open")).toBe(1);
    expect(count("refund-second-approver")).toBe(1);
    expect(count("refund-decisions")).toBe(1);
    expect(count("settlements-held")).toBe(1);
    expect(count("settlements-pending")).toBe(1);
    expect(count("settlements-to-pay")).toBe(1);
    const groups = groupBySeverity(items);
    expect(groups.critical.map((i) => i.key)).toContain("refund-second-approver");
    expect(items.find((i) => i.key === "organizer-approvals")!.truncated).toBe(true);
    expect(formatCount(250, true)).toBe("250+");
  });
  it("identifies privileged audit rows", () => {
    expect(isPrivilegedAudit({ source: "operations-console", action: "x" })).toBe(true);
    expect(isPrivilegedAudit({ action: "settlement.mark-paid" })).toBe(true);
    expect(isPrivilegedAudit({ action: "booking.cancelled", source: "pulse-app" })).toBe(false);
  });
});
