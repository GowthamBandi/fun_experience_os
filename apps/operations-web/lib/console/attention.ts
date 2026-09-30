/**
 * Operations Command Center: "what requires governance attention", computed
 * purely from live Firestore documents (raw data) so it can be unit-tested.
 */

import { needsSettlementDualControl } from "./money";
import { refundStage } from "./records";

export type Severity = "critical" | "high" | "normal";

export interface AttentionItem {
  key: string;
  severity: Severity;
  label: string;
  detail: string;
  count: number;
  /** True when the underlying query hit its limit, so the count is a lower bound. */
  truncated: boolean;
  href: string;
}

type Doc = { id: string; raw: Record<string, unknown> };

export interface AttentionInput {
  governanceCases: Doc[];
  riskAlerts: Doc[];
  refunds: Doc[];
  settlements: Doc[];
  /** Per-source "hit the query limit" flags. */
  truncated?: Partial<Record<"governanceCases" | "riskAlerts" | "refunds" | "settlements", boolean>>;
}

export const OPEN_CASE_STATUSES = new Set(["pending", "under-review", "information-requested"]);
const CLOSED_RISK_STATUSES = new Set(["resolved", "closed", "dismissed", "blocked"]);

export function isOpenCase(raw: Record<string, unknown>): boolean {
  return OPEN_CASE_STATUSES.has(String(raw.status ?? "pending"));
}

export function isOpenRisk(raw: Record<string, unknown>): boolean {
  return !CLOSED_RISK_STATUSES.has(String(raw.status ?? "open"));
}

function openCasesOf(cases: Doc[], kind: string) {
  return cases.filter((c) => c.raw.kind === kind && isOpenCase(c.raw)).length;
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "normal"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical — act now",
  high: "High — decide today",
  normal: "Routine review",
};

export function buildAttentionQueue(input: AttentionInput): AttentionItem[] {
  const t = input.truncated ?? {};
  const openRisks = input.riskAlerts.filter((r) => isOpenRisk(r.raw));
  const highRisks = openRisks.filter((r) => r.raw.severity === "high" || r.raw.severity === "critical" || r.raw.status === "on-hold").length;
  const refundStages = input.refunds.map((r) => refundStage(r.raw));
  const secondApprover = refundStages.filter((s) => s === "awaiting-second-approver").length;
  const refundDecisions = refundStages.filter((s) => s === "needs-decision").length;
  const settlementsHeld = input.settlements.filter((s) => s.raw.status === "held").length;
  const settlementsPending = input.settlements.filter((s) => s.raw.status === "pending-approval").length;
  const settlementsToPay = input.settlements.filter((s) => s.raw.status === "approved");
  const otherCases = input.governanceCases.filter((c) => isOpenCase(c.raw) && !["organizer-kyc", "experience-approval", "event-approval"].includes(String(c.raw.kind))).length;

  const items: AttentionItem[] = [
    { key: "risk-high", severity: "critical", label: "High-severity risk alerts", detail: "Fraud, chargeback or payout anomalies with exposure on hold.", count: highRisks, truncated: !!t.riskAlerts, href: "/risk" },
    { key: "refund-second-approver", severity: "critical", label: "Refunds needing a second approver", detail: "Above ₹10,000: one admin approved; a different admin must confirm.", count: secondApprover, truncated: !!t.refunds, href: "/refunds" },
    { key: "settlements-held", severity: "critical", label: "Settlements on hold", detail: "Organizer payouts blocked pending investigation.", count: settlementsHeld, truncated: !!t.settlements, href: "/settlements" },
    { key: "organizer-approvals", severity: "high", label: "Organizer approvals", detail: "KYC review; approval issues a one-time Organizer Code.", count: openCasesOf(input.governanceCases, "organizer-kyc"), truncated: !!t.governanceCases, href: "/approvals" },
    { key: "refund-decisions", severity: "high", label: "Refunds awaiting decision", detail: "Organizer-requested or out-of-policy refunds under review.", count: refundDecisions, truncated: !!t.refunds, href: "/refunds" },
    { key: "settlements-pending", severity: "high", label: "Settlements pending approval", detail: "Built from completed events; approve or hold.", count: settlementsPending, truncated: !!t.settlements, href: "/settlements" },
    { key: "settlements-to-pay", severity: "high", label: "Approved settlements awaiting payout", detail: `${settlementsToPay.filter((s) => needsSettlementDualControl(s.raw.netMinor)).length} above ₹50,000 need a different admin to mark paid.`, count: settlementsToPay.length, truncated: !!t.settlements, href: "/settlements" },
    { key: "risk-open", severity: "normal", label: "Other open risk alerts", detail: "Lower-severity alerts to investigate.", count: openRisks.length - highRisks, truncated: !!t.riskAlerts, href: "/risk" },
    { key: "experience-approvals", severity: "normal", label: "Experience approvals", detail: "New or revised organizer offerings.", count: openCasesOf(input.governanceCases, "experience-approval"), truncated: !!t.governanceCases, href: "/approvals" },
    { key: "event-approvals", severity: "normal", label: "Event approvals", detail: "Dated occurrences: price, capacity, venue, responsible person.", count: openCasesOf(input.governanceCases, "event-approval"), truncated: !!t.governanceCases, href: "/approvals" },
    { key: "other-cases", severity: "normal", label: "Other governance cases", detail: "Arena verification, commissions, exceptions.", count: otherCases, truncated: !!t.governanceCases, href: "/approvals" },
  ];
  return items;
}

export function groupBySeverity(items: AttentionItem[]): Record<Severity, AttentionItem[]> {
  return {
    critical: items.filter((i) => i.severity === "critical"),
    high: items.filter((i) => i.severity === "high"),
    normal: items.filter((i) => i.severity === "normal"),
  };
}

export function formatCount(count: number, truncated: boolean): string {
  return truncated ? `${count}+` : String(count);
}

const PRIVILEGED = /^(governance\.|refund\.(approve|reject)|settlement\.|catalog\.(event-cancelled-by-admin|review-moderated)|operator\.|access\.)/;

/** Audit rows written by console/admin actions (the privileged trail). */
export function isPrivilegedAudit(raw: Record<string, unknown>): boolean {
  if (raw.source === "operations-console") return true;
  return typeof raw.action === "string" && PRIVILEGED.test(raw.action);
}
