import { describe, expect, it } from "vitest";
import {
  CONFIRM_PHRASES,
  CommandValidationError,
  REQUEST_ID_PATTERN,
  RequestIdBook,
  buildAdminCancelEventPayload,
  buildBuildSettlementPayload,
  buildDecideCasePayload,
  buildDecideRefundPayload,
  buildDecideSettlementPayload,
  buildEntityStatusPayload,
  buildModerateReviewPayload,
  buildReissueOrganizerCodePayload,
  isConfirmed,
  newRequestId,
  periodEndFromDate,
  settlementActionsFor,
} from "@/lib/console/actions";

const rid = () => newRequestId("test");

describe("request IDs", () => {
  it("satisfy both server validators", () => {
    for (let i = 0; i < 20; i++) {
      const id = newRequestId("decision");
      expect(id).toMatch(REQUEST_ID_PATTERN);
      expect(id).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    }
  });
  it("sanitises the prefix", () => {
    expect(newRequestId("a b/c")).toMatch(/^abc-/);
  });
  it("RequestIdBook keeps one id per action until reset (retries replay)", () => {
    const book = new RequestIdBook("refund");
    const first = book.idFor("approve");
    expect(book.idFor("approve")).toBe(first);
    expect(book.idFor("reject")).not.toBe(first);
    book.reset();
    expect(book.idFor("approve")).not.toBe(first);
  });
});

describe("governance payloads", () => {
  it("decideCase includes requestId, version and allows an empty approval note", () => {
    const requestId = rid();
    const p = buildDecideCasePayload({ requestId, caseId: "case-12345678", expectedVersion: 3, outcome: "approved", note: "  " });
    expect(p).toEqual({ requestId, caseId: "case-12345678", expectedVersion: 3, outcome: "approved", note: "" });
  });
  it("decideCase requires a 10+ char reason to reject or request info", () => {
    expect(() => buildDecideCasePayload({ requestId: rid(), caseId: "c", expectedVersion: 0, outcome: "rejected", note: "short" })).toThrow(CommandValidationError);
    expect(buildDecideCasePayload({ requestId: rid(), caseId: "c", expectedVersion: 0, outcome: "information-requested", note: "Missing PAN document" }).note).toBe("Missing PAN document");
  });
  it("rejects an invalid version or request id", () => {
    expect(() => buildDecideCasePayload({ requestId: rid(), caseId: "c", expectedVersion: -1, outcome: "approved", note: "" })).toThrow(/version/);
    expect(() => buildDecideCasePayload({ requestId: "bad id!", caseId: "c", expectedVersion: 1, outcome: "approved", note: "" })).toThrow(/request ID/);
  });
  it("entity status requires a reason", () => {
    expect(() => buildEntityStatusPayload({ requestId: rid(), entityType: "organizer", entityId: "org-1", expectedVersion: 1, status: "blocked", reason: "no" })).toThrow();
    const p = buildEntityStatusPayload({ requestId: rid(), entityType: "organizer", entityId: "org-1", expectedVersion: 1, status: "blocked", reason: "Chargeback fraud confirmed" });
    expect(p.requestId).toMatch(REQUEST_ID_PATTERN);
    expect(p.status).toBe("blocked");
  });
  it("reissueOrganizerCode carries applicantUid, requestId and reason", () => {
    const requestId = rid();
    expect(buildReissueOrganizerCodePayload({ requestId, applicantUid: "uid_abc123", reason: "Applicant lost the code" })).toEqual({ requestId, applicantUid: "uid_abc123", reason: "Applicant lost the code" });
    expect(() => buildReissueOrganizerCodePayload({ requestId, applicantUid: "../etc", reason: "Applicant lost the code" })).toThrow();
  });
});

describe("commerce payloads", () => {
  it("decideRefund", () => {
    const requestId = rid();
    expect(buildDecideRefundPayload({ requestId, refundId: "req_x_1", decision: "approve", note: "Organizer confirmed no-show" })).toEqual({ requestId, refundId: "req_x_1", decision: "approve", note: "Organizer confirmed no-show" });
    expect(() => buildDecideRefundPayload({ requestId, refundId: "r", decision: "approve", note: "ok" })).toThrow(CommandValidationError);
  });
  it("buildSettlement converts a date to a past ISO instant (end of day IST, clamped to now)", () => {
    const now = new Date("2026-09-30T06:00:00.000Z");
    expect(periodEndFromDate("2026-09-28", now)).toBe("2026-09-28T18:29:59.999Z");
    expect(periodEndFromDate("2026-09-30", now)).toBe(now.toISOString());
    expect(() => periodEndFromDate("2026-10-02", now)).toThrow(/future/);
    expect(() => periodEndFromDate("", now)).toThrow();
    const p = buildBuildSettlementPayload({ requestId: rid(), orgId: "org_abc", periodEndDate: "2026-09-28", now });
    expect(p.orgId).toBe("org_abc");
    expect(p.requestId).toMatch(REQUEST_ID_PATTERN);
    expect(() => buildBuildSettlementPayload({ requestId: rid(), orgId: "x", periodEndDate: "2026-09-28", now })).toThrow(/Organizer ID/);
  });
  it("decideSettlement requires payoutReference only for mark-paid", () => {
    const base = { requestId: rid(), settlementId: "stl_org_1", note: "Bank transfer confirmed" };
    expect(buildDecideSettlementPayload({ ...base, action: "approve" })).not.toHaveProperty("payoutReference");
    expect(() => buildDecideSettlementPayload({ ...base, action: "mark-paid" })).toThrow(/payout reference/);
    expect(buildDecideSettlementPayload({ ...base, action: "mark-paid", payoutReference: " UTR123 " }).payoutReference).toBe("UTR123");
  });
  it("settlement actions mirror the server state machine", () => {
    expect(settlementActionsFor("pending-approval")).toEqual(["approve", "hold"]);
    expect(settlementActionsFor("approved")).toEqual(["mark-paid", "hold"]);
    expect(settlementActionsFor("held")).toEqual(["release-hold"]);
    expect(settlementActionsFor("paid")).toEqual([]);
  });
});

describe("catalog payloads", () => {
  it("adminCancelEvent requires a 10+ char reason", () => {
    expect(() => buildAdminCancelEventPayload({ requestId: rid(), eventId: "ev1", reason: "unsafe" })).toThrow();
    expect(buildAdminCancelEventPayload({ requestId: rid(), eventId: "ev1", reason: "Venue fire NOC revoked" }).eventId).toBe("ev1");
  });
  it("moderateReview validates the review id shape", () => {
    expect(() => buildModerateReviewPayload({ requestId: rid(), reviewId: "bad", status: "hidden", reason: "Contains a phone number" })).toThrow();
    expect(buildModerateReviewPayload({ requestId: rid(), reviewId: "ev1__uid1", status: "hidden", reason: "Contains a phone number" }).status).toBe("hidden");
  });
});

describe("typed confirmation", () => {
  it("matches the phrase exactly (case/whitespace-insensitive)", () => {
    expect(isConfirmed("cancel  event", CONFIRM_PHRASES.cancelEvent)).toBe(true);
    expect(isConfirmed("CANCEL", CONFIRM_PHRASES.cancelEvent)).toBe(false);
    expect(isConfirmed("", CONFIRM_PHRASES.markPaid)).toBe(false);
  });
});
