/**
 * Pure view helpers for Refunds, Settlements and Commercials (no Firebase imports).
 * The decision rules stay in lib/console: dual control (money.ts), refundStage
 * (records.ts), settlementActionsFor / CONFIRM_PHRASES (actions.ts) and the
 * outcome copy (outcomes.ts). This file only shapes rows, tabs and buttons.
 * Field names verified in firebase/functions/src/commerce: refunds (types.ts RefundDoc,
 * refunds.ts), settlements (settlements.ts SettlementDoc), commercialAgreements (agreements.ts).
 */

import type { BadgeTone } from "@/components/pulse/Badge";
import type { ToastInput } from "@/components/pulse/Toast";
import { CONFIRM_PHRASES, commissionPercentToBps, decisionKey, settlementActionsFor, type SettlementAction } from "./console/actions";
import { isMinorAmount, needsRefundDualControl, needsSettlementDualControl } from "./console/money";
import { AWAITING_SECOND_APPROVER, refundOutcome } from "./console/outcomes";
import { REFUND_REASON_LABEL, refundStage, toDate, type RefundStage } from "./console/records";
import { refundBadge } from "./customers";
import { agreementBadge, settlementBadge } from "./organizers";

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const minor = (v: unknown): number | null => (isMinorAmount(v) ? v : null);
const ms = (d: Date | null) => d?.getTime() ?? null;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);

export type ViewBadge = { label: string; tone: BadgeTone };
export type Tab<T extends string> = { id: T; label: string };

function countBy<T extends string, R>(tabs: Array<Tab<T>>, rows: R[], tabOf: (row: R) => T | null): Record<T, number> {
  const counts = Object.fromEntries(tabs.map((t) => [t.id, 0])) as Record<T, number>;
  for (const row of rows) {
    const tab = tabOf(row);
    if (tab) counts[tab] += 1;
  }
  counts["all" as T] = rows.length;
  return counts;
}

/** The uid, marked when it is the signed-in admin (dual control is about who). */
export function who(uid: string | null, me: string | null | undefined): string {
  if (!uid) return "—";
  return me && uid === me ? `${uid} (you)` : uid;
}

/** Today's date in India as YYYY-MM-DD (the latest period end a settlement can take). */
export function todayIst(now: Date): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ refunds */

export type RefundTab = "decide" | "second" | "decided" | "all";

export const REFUND_TABS: Array<Tab<RefundTab>> = [
  { id: "decide", label: "Needs decision" },
  { id: "second", label: "2nd approver" },
  { id: "decided", label: "Decided" },
  { id: "all", label: "All" },
];

const REFUND_TAB_OF: Record<RefundStage, RefundTab> = { "needs-decision": "decide", "awaiting-second-approver": "second", decided: "decided" };

export interface RefundRow {
  id: string;
  amountMinor: number | null;
  currency: string;
  reason: string | null;
  reasonLabel: string;
  note: string | null;
  status: string | null;
  stage: RefundStage;
  /** Above ₹10,000: two different admins must approve. */
  dual: boolean;
  approvals: string[];
  orgId: string | null;
  eventId: string | null;
  bookingId: string | null;
  requestedBy: string | null;
  decidedBy: string | null;
  providerRefundId: string | null;
  lastError: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export function toRefundRow(id: string, raw: Raw): RefundRow {
  const reason = str(raw.reason);
  return {
    id,
    amountMinor: minor(raw.amountMinor),
    currency: str(raw.currency) ?? "INR",
    reason,
    reasonLabel: reason ? REFUND_REASON_LABEL[reason] ?? reason : "—",
    note: str(raw.note),
    status: str(raw.status),
    stage: refundStage(raw),
    dual: needsRefundDualControl(raw.amountMinor),
    approvals: strings(raw.approvals),
    orgId: str(raw.orgId),
    eventId: str(raw.eventId),
    bookingId: str(raw.bookingId),
    requestedBy: str(raw.requestedBy),
    decidedBy: str(raw.decidedBy),
    providerRefundId: str(raw.providerRefundId),
    lastError: str(raw.lastError),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

export const refundTabOf = (row: RefundRow): RefundTab => REFUND_TAB_OF[row.stage];

export function refundCounts(rows: RefundRow[]): Record<RefundTab, number> {
  return countBy(REFUND_TABS, rows, refundTabOf);
}

export function filterRefunds(rows: RefundRow[], tab: RefundTab): RefundRow[] {
  return tab === "all" ? rows : rows.filter((r) => refundTabOf(r) === tab);
}

/** Total amount still waiting on a decision (either stage). Null when an amount is unreadable. */
export function waitingAmount(rows: RefundRow[]): number | null {
  let total = 0;
  for (const r of rows) {
    if (r.stage === "decided") continue;
    if (r.amountMinor === null) return null;
    total += r.amountMinor;
  }
  return total;
}

export function refundStageBadge(row: RefundRow): ViewBadge {
  if (row.stage === "awaiting-second-approver") return { label: "Needs 2nd approver", tone: "warn" };
  if (row.stage === "needs-decision") return { label: "Needs decision", tone: "violet" };
  return refundBadge(row.status);
}

export interface RefundDecision {
  approveLabel: string;
  /** Typed phrase for approvals above ₹10,000. */
  phrase: string | null;
  /** Why neither decision is available (already decided), else null. */
  closed: string | null;
  approvedByMe: boolean;
}

export function refundDecision(row: RefundRow, uid: string | null | undefined): RefundDecision {
  return {
    approveLabel: row.stage === "awaiting-second-approver" ? "Give second approval" : "Approve refund",
    phrase: row.dual ? CONFIRM_PHRASES.largeRefund : null,
    closed: row.stage === "decided" ? `This refund is ${row.status ?? "—"}; there is nothing to decide.` : null,
    approvedByMe: !!uid && row.approvals.includes(uid),
  };
}

export function refundApproveConsequence(row: RefundRow, amount: string): string {
  if (!row.dual) return `Approves a refund of ${amount}; it is sent to the payment provider immediately.`;
  return `Approves a refund of ${amount} (above ₹10,000). ${
    row.stage === "awaiting-second-approver"
      ? "This is the second approval: money moves to the customer when it succeeds."
      : "This records the first approval; a different admin must approve before money moves."
  }`;
}

/** decideRefund key: the decision against this exact state (status, approvals, updatedAt). */
export function refundKey(row: RefundRow, decision: "approve" | "reject"): string {
  return decisionKey("refund", row.id, decision, row.status, row.approvals.length, ms(row.updatedAt));
}

/** The toast for a decideRefund result, titled from the server status (refundOutcome copy as the body). */
export function refundToast(status: string, decision: "approve" | "reject", amount: string): ToastInput {
  const { message } = refundOutcome(status, decision);
  if (status === "awaiting-second-approval") return { tone: "info", title: AWAITING_SECOND_APPROVER, body: message };
  if (decision === "reject" || status === "rejected") return { tone: "ok", title: `Refund rejected · ${amount}`, body: message };
  if (status === "failed") return { tone: "err", title: "Refund approved · provider failed", body: message };
  return { tone: "ok", title: `Refund approved · ${amount}`, body: message };
}

export const REFUND_REJECT_CONSEQUENCE = "Rejects this refund request. The customer keeps their booking; the reason is recorded in the audit trail.";

/* -------------------------------------------------------------- settlements */

export type SettlementTab = "approve" | "pay" | "held" | "paid" | "all";

export const SETTLEMENT_TABS: Array<Tab<SettlementTab>> = [
  { id: "approve", label: "To approve" },
  { id: "pay", label: "To pay" },
  { id: "held", label: "On hold" },
  { id: "paid", label: "Paid" },
  { id: "all", label: "All" },
];

const SETTLEMENT_TAB_OF: Record<string, SettlementTab> = { "pending-approval": "approve", approved: "pay", held: "held", paid: "paid" };

export interface SettlementRow {
  id: string;
  orgId: string | null;
  periodEnd: Date | null;
  grossMinor: number | null;
  commissionMinor: number | null;
  refundsMinor: number | null;
  netMinor: number | null;
  currency: string;
  entryCount: number | null;
  status: string | null;
  heldFrom: string | null;
  builtBy: string | null;
  approvedBy: string | null;
  paidBy: string | null;
  payoutReference: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** Above ₹50,000: the admin who approved can't also mark it paid. */
  dual: boolean;
}

export function toSettlementRow(id: string, raw: Raw): SettlementRow {
  return {
    id,
    orgId: str(raw.orgId),
    periodEnd: toDate(raw.periodEnd),
    grossMinor: minor(raw.grossMinor),
    commissionMinor: minor(raw.commissionMinor),
    refundsMinor: minor(raw.refundsMinor),
    netMinor: minor(raw.netMinor),
    currency: str(raw.currency) ?? "INR",
    entryCount: typeof raw.entryCount === "number" && Number.isFinite(raw.entryCount) ? raw.entryCount : null,
    status: str(raw.status),
    heldFrom: str(raw.heldFrom),
    builtBy: str(raw.builtBy),
    approvedBy: str(raw.approvedBy),
    paidBy: str(raw.paidBy),
    payoutReference: str(raw.payoutReference),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    dual: needsSettlementDualControl(raw.netMinor),
  };
}

export const settlementTabOf = (row: SettlementRow): SettlementTab | null => (row.status ? SETTLEMENT_TAB_OF[row.status] ?? null : null);

export function settlementCounts(rows: SettlementRow[]): Record<SettlementTab, number> {
  return countBy(SETTLEMENT_TABS, rows, settlementTabOf);
}

export function filterSettlements(rows: SettlementRow[], tab: SettlementTab): SettlementRow[] {
  return tab === "all" ? rows : rows.filter((r) => settlementTabOf(r) === tab);
}

/** Settlements waiting on an admin (the old "Need action" metric). */
export const needsSettlementAction = (row: SettlementRow) => row.status === "pending-approval" || row.status === "approved" || row.status === "held";

export function settlementStatusBadge(row: SettlementRow): ViewBadge {
  return settlementBadge(row.status);
}

/** Approved, above ₹50,000: a different admin must mark it paid. */
export const needsSecondPayer = (row: SettlementRow) => row.status === "approved" && row.dual;

/**
 * The forward step from each status gets the drawer's single volt button. Mark paid
 * never does: it records money that left the bank and stays a danger action behind
 * a typed phrase, as it was before.
 */
export function primarySettlementAction(status: unknown): SettlementAction | null {
  if (status === "pending-approval") return "approve";
  if (status === "held") return "release-hold";
  return null;
}

export const SETTLEMENT_ACTION_LABEL: Record<SettlementAction, string> = {
  approve: "Approve settlement",
  hold: "Put on hold",
  "release-hold": "Release hold",
  "mark-paid": "Mark paid",
};

export interface SettlementButton {
  action: SettlementAction;
  label: string;
  variant: "volt" | "ghost" | "danger";
  /** Sheet tone: volt for the forward step, danger for hold and mark paid. */
  tone: "volt" | "danger";
  phrase: string | null;
}

/** The buttons a settlement offers, in settlementActionsFor's server-mirrored set, in a stable order. */
export function settlementButtons(status: unknown): SettlementButton[] {
  const allowed = settlementActionsFor(status);
  const primary = primarySettlementAction(status);
  return (Object.keys(SETTLEMENT_ACTION_LABEL) as SettlementAction[])
    .filter((a) => allowed.includes(a))
    .map((action) => ({
      action,
      label: SETTLEMENT_ACTION_LABEL[action],
      variant: action === primary ? "volt" : action === "hold" || action === "mark-paid" ? "danger" : "ghost",
      tone: action === "hold" || action === "mark-paid" ? "danger" : "volt",
      phrase: action === "mark-paid" ? CONFIRM_PHRASES.markPaid : null,
    }));
}

export function settlementConsequence(action: SettlementAction, net: string, dual: boolean): string {
  switch (action) {
    case "mark-paid":
      return `Records that ${net} was paid to the organizer, with the bank/payout reference. Do this only after the transfer is confirmed. This console does not move money.`;
    case "approve":
      return `Approves the payout of ${net}.${dual ? " Above ₹50,000 a different admin must mark it paid." : ""}`;
    case "hold":
      return "Blocks the payout until the hold is released (e.g. pending a fraud or dispute review).";
    default:
      return "Returns the settlement to the state it was in before the hold.";
  }
}

/** decideSettlement key: the action against this state; mark paid also carries the UTR. */
export function settlementKey(row: SettlementRow, action: SettlementAction, payoutReference = ""): string {
  return decisionKey("settlement", row.id, action, row.status, ms(row.updatedAt), action === "mark-paid" ? payoutReference : null);
}

/** buildSettlement key: the organizer and period end (the server derives the settlement id from the request id). */
export function buildKey(orgId: string, periodEndDate: string): string {
  return decisionKey("build", orgId, periodEndDate);
}

export const BUILD_SETTLEMENT_CONSEQUENCE =
  "Claims every unsettled organizer-payable ledger entry of this organizer's COMPLETED events up to the period end into one settlement (pending approval). An entry can never be in two settlements.";

/* -------------------------------------------------------------- commercials */

export type AgreementTab = "pending" | "inforce" | "history" | "all";

export const AGREEMENT_TABS: Array<Tab<AgreementTab>> = [
  { id: "pending", label: "Pending approval" },
  { id: "inforce", label: "In force" },
  { id: "history", label: "History" },
  { id: "all", label: "All" },
];

const AGREEMENT_TAB_OF: Record<string, AgreementTab> = { "pending-approval": "pending", approved: "inforce", rejected: "history", superseded: "history" };

export interface AgreementRow {
  id: string;
  orgId: string | null;
  commissionBps: number | null;
  cadence: string | null;
  status: string | null;
  note: string | null;
  proposedBy: string | null;
  proposedAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  supersededBy: string | null;
  updatedAt: Date | null;
}

export function toAgreementRow(id: string, raw: Raw): AgreementRow {
  return {
    id,
    orgId: str(raw.orgId),
    commissionBps: typeof raw.commissionBps === "number" && Number.isFinite(raw.commissionBps) ? raw.commissionBps : null,
    cadence: str(raw.payoutCadence),
    status: str(raw.status),
    note: str(raw.note),
    proposedBy: str(raw.proposedBy),
    proposedAt: toDate(raw.proposedAt) ?? toDate(raw.createdAt),
    decidedBy: str(raw.decidedBy),
    decidedAt: toDate(raw.decidedAt),
    decisionNote: str(raw.decisionNote),
    supersededBy: str(raw.supersededBy),
    updatedAt: toDate(raw.updatedAt),
  };
}

/** Pending first (oldest waiting first), then everything else newest first. */
export function sortAgreements(rows: AgreementRow[]): AgreementRow[] {
  const t = (d: Date | null) => d?.getTime() ?? 0;
  return [...rows].sort((a, b) => {
    const pa = a.status === "pending-approval" ? 0 : 1;
    const pb = b.status === "pending-approval" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return pa === 0 ? t(a.proposedAt) - t(b.proposedAt) : t(b.decidedAt ?? b.proposedAt) - t(a.decidedAt ?? a.proposedAt);
  });
}

export const agreementTabOf = (row: AgreementRow): AgreementTab | null => (row.status ? AGREEMENT_TAB_OF[row.status] ?? null : null);

export function agreementCounts(rows: AgreementRow[]): Record<AgreementTab, number> {
  return countBy(AGREEMENT_TABS, rows, agreementTabOf);
}

export function filterAgreements(rows: AgreementRow[], tab: AgreementTab): AgreementRow[] {
  return tab === "all" ? rows : rows.filter((r) => agreementTabOf(r) === tab);
}

export function agreementStatusBadge(row: AgreementRow): ViewBadge {
  return agreementBadge(row.status);
}

export interface AgreementDecision {
  pending: boolean;
  proposedByMe: boolean;
  /** Set when this admin may not decide (the server refuses the proposer). */
  blocked: string | null;
}

export function agreementDecision(row: AgreementRow, uid: string | null | undefined): AgreementDecision {
  const proposedByMe = !!uid && row.proposedBy === uid;
  return {
    pending: row.status === "pending-approval",
    proposedByMe,
    blocked: proposedByMe ? "You proposed these terms. A different admin must decide them." : null,
  };
}

export function agreementConsequence(action: "approve" | "reject", percent: string): string {
  return action === "approve"
    ? `Applies ${percent} commission to events this organizer publishes from now on. Their current approved terms are superseded; events already published keep their commission.`
    : "Rejects this version. The organizer's current terms (if any) stay in force.";
}

/** decideCommercialAgreement key: the outcome against this state. */
export function agreementKey(row: AgreementRow, action: "approve" | "reject"): string {
  return decisionKey("agreement", row.id, action, row.status, ms(row.updatedAt));
}

/** proposeCommercialAgreement key: organizer, commission (as bps when it parses) and cadence. */
export function proposeKey(orgId: string, percent: string, cadence: string): string {
  let bps: number | string;
  try {
    bps = commissionPercentToBps(percent);
  } catch {
    bps = percent.trim();
  }
  return decisionKey("propose", orgId, bps, cadence);
}

/** The approved terms in force for one organizer (newest decision wins), for pre-filling a proposal. */
export function termsInForce(rows: AgreementRow[], orgId: string | null): { bps: number | null; cadence: string | null } {
  if (!orgId) return { bps: null, cadence: null };
  const t = (r: AgreementRow) => (r.decidedAt ?? r.proposedAt)?.getTime() ?? 0;
  const current = rows.filter((r) => r.orgId === orgId && r.status === "approved").sort((a, b) => t(b) - t(a))[0];
  return { bps: current?.commissionBps ?? null, cadence: current?.cadence ?? null };
}
