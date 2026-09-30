/**
 * Pure mapping of server results → operator-facing outcome messages.
 */

export const AWAITING_SECOND_APPROVER = "Awaiting second approver";

export function refundOutcome(status: string, decision: "approve" | "reject"): { message: string; tone: "success" | "info" } {
  if (status === "awaiting-second-approval") {
    return {
      tone: "info",
      message: `${AWAITING_SECOND_APPROVER}: your approval is recorded. This refund is above ₹10,000, so a different Platform Owner or Super Admin must approve it before money moves.`,
    };
  }
  if (decision === "reject" || status === "rejected") return { tone: "success", message: "Refund rejected. The organizer and audit trail have the reason." };
  if (status === "completed") return { tone: "success", message: "Refund approved and completed by the payment provider." };
  if (status === "processing") return { tone: "success", message: "Refund approved and sent to the payment provider (processing)." };
  if (status === "failed") return { tone: "info", message: "Refund approved, but the payment provider reported a failure. It will need follow-up." };
  return { tone: "success", message: "Refund approved." };
}

export interface CaseResultLike {
  status?: string;
  organizerCode?: string;
  orgId?: string;
  codeExpiresAt?: string | null;
  codeAlreadyIssued?: boolean;
  replayed?: boolean;
}

export function caseOutcome(kind: string, outcome: string, result: CaseResultLike): { message: string; tone: "success" | "info"; showCode: boolean } {
  if (kind === "organizer-kyc" && outcome === "approved") {
    if (typeof result.organizerCode === "string" && result.organizerCode) {
      return { tone: "success", showCode: true, message: "Organizer approved. The one-time Organizer Code is displayed now and will not be shown again." };
    }
    if (!result.codeAlreadyIssued) {
      return { tone: "success", showCode: false, message: "Organizer approved. No Organizer Code was issued because this case is not linked to an organizer application (legacy record)." };
    }
    return {
      tone: "info",
      showCode: false,
      message: "Organizer approved, but the Organizer Code was already issued for this request and cannot be shown again. Use “Re-issue Organizer Code” on the application if it was not delivered.",
    };
  }
  const verb = outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : "sent back for more information";
  return { tone: "success", showCode: false, message: `Case ${verb}.${result.replayed ? " (This request had already been applied; no duplicate change was made.)" : ""}` };
}

export function settlementOutcome(action: string, status: string): string {
  switch (action) {
    case "approve": return `Settlement approved (status: ${status}). Above ₹50,000 a different admin must mark it paid.`;
    case "hold": return "Settlement placed on hold.";
    case "release-hold": return `Hold released (status: ${status}).`;
    case "mark-paid": return "Settlement marked paid with the payout reference.";
    default: return `Settlement updated (status: ${status}).`;
  }
}
