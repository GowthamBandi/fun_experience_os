import { describe, expect, it } from "vitest";
import { CommandValidationError } from "@/lib/console/actions";
import { CONFLICT_MESSAGE, describeReadError, mapConsoleError } from "@/lib/console/errors";
import { AWAITING_SECOND_APPROVER, caseOutcome, refundOutcome } from "@/lib/console/outcomes";

function fnError(code: string, message: string, details?: Record<string, unknown>) {
  return Object.assign(new Error(message), { code: `functions/${code}`, details });
}

describe("mapConsoleError", () => {
  it("maps the refund dual-control refusal verbatim", () => {
    const e = mapConsoleError(fnError("permission-denied", "A different admin must give the second approval.", {
      code: "NOT_PERMITTED",
      message: "A different admin must give the second approval.",
      nextStep: "Ask another Platform Owner or Super Admin to approve this refund.",
    }));
    expect(e.kind).toBe("dual-control");
    expect(e.message).toBe("A different admin must give the second approval.");
    expect(e.nextStep).toBe("Ask another Platform Owner or Super Admin to approve this refund.");
  });
  it("maps the settlement mark-paid dual-control refusal verbatim", () => {
    const e = mapConsoleError(fnError("permission-denied", "A different admin must mark this settlement as paid.", {
      code: "NOT_PERMITTED", message: "A different admin must mark this settlement as paid.", nextStep: "Settlements above ₹50,000 need two different admins.",
    }));
    expect(e.kind).toBe("dual-control");
    expect(e.message).toBe("A different admin must mark this settlement as paid.");
  });
  it("keeps ordinary permission errors separate from dual control", () => {
    expect(mapConsoleError(fnError("permission-denied", "You are not permitted to decide governance cases.")).kind).toBe("permission");
  });
  it("maps aborted (stale version) to the refresh conflict", () => {
    const e = mapConsoleError(fnError("aborted", "Someone else changed this case while you were reviewing it.", { code: "CONFLICT" }));
    expect(e.kind).toBe("conflict");
    expect(e.message).toContain(CONFLICT_MESSAGE);
  });
  it("maps validation, transport and unknown errors", () => {
    expect(mapConsoleError(new CommandValidationError("Add a reason")).kind).toBe("validation");
    expect(mapConsoleError(fnError("unavailable", "fetch failed")).kind).toBe("unavailable");
    expect(mapConsoleError(fnError("failed-precondition", "Only an approved settlement can be marked paid.")).message).toBe("Only an approved settlement can be marked paid.");
    expect(mapConsoleError("boom").kind).toBe("unknown");
  });
  it("describes Firestore read failures", () => {
    expect(describeReadError("Missing or insufficient permissions.")).toMatch(/Super Admin/);
  });
});

describe("outcomes", () => {
  it("refund first approval above the threshold reports awaiting second approver", () => {
    const o = refundOutcome("awaiting-second-approval", "approve");
    expect(o.tone).toBe("info");
    expect(o.message.startsWith(AWAITING_SECOND_APPROVER)).toBe(true);
  });
  it("organizer approval shows the code only when the server returned it", () => {
    expect(caseOutcome("organizer-kyc", "approved", { organizerCode: "ABCD-1234" }).showCode).toBe(true);
    const replay = caseOutcome("organizer-kyc", "approved", { codeAlreadyIssued: true, replayed: true });
    expect(replay.showCode).toBe(false);
    expect(replay.message).toMatch(/Re-issue/);
    expect(caseOutcome("event-approval", "approved", {}).showCode).toBe(false);
  });
});
