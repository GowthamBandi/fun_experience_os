/**
 * Pure builders for privileged console commands.
 *
 * Every builder validates client-side (mirroring the server's validators in
 * firebase/functions/src) and returns the exact callable payload, always
 * including an idempotency `requestId`. The server remains the authority: it
 * re-validates, enforces dual control and writes the audit record.
 */

export class CommandValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandValidationError";
  }
}

/** Matches both server validators: governance `^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$` and platform `[A-Za-z0-9_-]{8,128}`. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

function randomToken(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("A secure random source is required to create request IDs.");
}

export function newRequestId(prefix: string): string {
  const clean = prefix.replace(/[^A-Za-z0-9]/g, "").slice(0, 24) || "cmd";
  return `${clean}-${randomToken()}`;
}

/**
 * Keeps one requestId per intended action (e.g. "approve", "reject") so a
 * retry after a network failure replays the same command instead of creating
 * a second one. Call `reset()` after a definitive outcome or a refresh.
 */
export class RequestIdBook {
  private ids = new Map<string, string>();
  constructor(private readonly prefix: string) {}
  idFor(action: string): string {
    let id = this.ids.get(action);
    if (!id) {
      id = newRequestId(`${this.prefix}${action}`);
      this.ids.set(action, id);
    }
    return id;
  }
  reset(): void {
    this.ids.clear();
  }
}

function requireRequestId(requestId: string): string {
  if (!REQUEST_ID_PATTERN.test(requestId)) throw new CommandValidationError("Internal error: the request ID is invalid.");
  return requestId;
}

function reason(value: string, min: number, max: number, label = "reason"): string {
  const clean = value.trim();
  if (clean.length < min) throw new CommandValidationError(`Add a ${label} of at least ${min} characters.`);
  if (clean.length > max) throw new CommandValidationError(`The ${label} must be at most ${max} characters.`);
  return clean;
}

function version(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new CommandValidationError("This record has no valid version. Refresh and try again.");
  return value;
}

const DOC_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{3,127}$/;
function docId(value: string, label: string): string {
  const clean = value.trim();
  if (!DOC_ID.test(clean)) throw new CommandValidationError(`${label} is not valid.`);
  return clean;
}

/* ----------------------------------------------------------- governance */

export type CaseOutcome = "approved" | "rejected" | "information-requested";

export function buildDecideCasePayload(input: { requestId: string; caseId: string; expectedVersion: number; outcome: CaseOutcome; note: string }) {
  const note = input.outcome === "approved" ? input.note.trim() : reason(input.note, 10, 2000);
  if (note.length > 2000) throw new CommandValidationError("The decision note must be at most 2000 characters.");
  return {
    requestId: requireRequestId(input.requestId),
    caseId: input.caseId,
    expectedVersion: version(input.expectedVersion),
    outcome: input.outcome,
    note,
  };
}

export type EntityType = "organizer" | "arena" | "event" | "risk-alert";
export type EntityStatus = "active" | "paused" | "blocked" | "under-review" | "resolved";

export function buildEntityStatusPayload(input: { requestId: string; entityType: EntityType; entityId: string; expectedVersion: number; status: EntityStatus; reason: string }) {
  return {
    requestId: requireRequestId(input.requestId),
    entityType: input.entityType,
    entityId: input.entityId,
    expectedVersion: version(input.expectedVersion),
    status: input.status,
    reason: reason(input.reason, 10, 2000),
  };
}

/**
 * `reason` is required by the console (operator accountability). The current
 * server contract `{ requestId, applicantUid }` ignores extra fields and audits
 * the re-issue with a fixed reason; sending it is forward-compatible.
 */
export function buildReissueOrganizerCodePayload(input: { requestId: string; applicantUid: string; reason: string }) {
  const applicantUid = input.applicantUid.trim();
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(applicantUid)) throw new CommandValidationError("The applicant ID is not valid.");
  return { requestId: requireRequestId(input.requestId), applicantUid, reason: reason(input.reason, 10, 500) };
}

/* ------------------------------------------------------------- commerce */

export function buildDecideRefundPayload(input: { requestId: string; refundId: string; decision: "approve" | "reject"; note: string }) {
  if (input.decision !== "approve" && input.decision !== "reject") throw new CommandValidationError("Choose approve or reject.");
  return {
    requestId: requireRequestId(input.requestId),
    refundId: input.refundId,
    decision: input.decision,
    note: reason(input.note, 10, 500),
  };
}

/**
 * The server requires periodEnd to be a past instant. A date picked in the
 * console means "through the end of that day in India"; today is clamped to now.
 */
export function periodEndFromDate(date: string, now: Date = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new CommandValidationError("Choose the period end date.");
  const endOfDay = new Date(`${date}T23:59:59.999+05:30`);
  if (Number.isNaN(endOfDay.getTime())) throw new CommandValidationError("Choose a valid period end date.");
  const startOfDay = new Date(`${date}T00:00:00.000+05:30`);
  if (startOfDay.getTime() > now.getTime()) throw new CommandValidationError("The period end can't be in the future.");
  return (endOfDay.getTime() > now.getTime() ? now : endOfDay).toISOString();
}

export function buildBuildSettlementPayload(input: { requestId: string; orgId: string; periodEndDate: string; now?: Date }) {
  return {
    requestId: requireRequestId(input.requestId),
    orgId: docId(input.orgId, "Organizer ID"),
    periodEnd: periodEndFromDate(input.periodEndDate, input.now),
  };
}

export type SettlementAction = "approve" | "hold" | "release-hold" | "mark-paid";

export function buildDecideSettlementPayload(input: { requestId: string; settlementId: string; action: SettlementAction; note: string; payoutReference?: string }) {
  const payload: { requestId: string; settlementId: string; action: SettlementAction; note: string; payoutReference?: string } = {
    requestId: requireRequestId(input.requestId),
    settlementId: input.settlementId,
    action: input.action,
    note: reason(input.note, 10, 500),
  };
  if (input.action === "mark-paid") {
    const ref = (input.payoutReference ?? "").trim();
    if (ref.length < 3 || ref.length > 100) throw new CommandValidationError("Enter the bank or payout reference (3–100 characters).");
    payload.payoutReference = ref;
  }
  return payload;
}

/** Which settlement actions the server accepts from each status (mirrors settlements.ts). */
export function settlementActionsFor(status: unknown): SettlementAction[] {
  switch (status) {
    case "pending-approval": return ["approve", "hold"];
    case "approved": return ["mark-paid", "hold"];
    case "held": return ["release-hold"];
    default: return [];
  }
}

/* -------------------------------------------------------------- catalog */

export function buildAdminCancelEventPayload(input: { requestId: string; eventId: string; reason: string }) {
  return { requestId: requireRequestId(input.requestId), eventId: input.eventId, reason: reason(input.reason, 10, 500) };
}

export function buildModerateReviewPayload(input: { requestId: string; reviewId: string; status: "published" | "hidden"; reason: string }) {
  if (!/^[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/.test(input.reviewId)) throw new CommandValidationError("The review ID is not valid.");
  return { requestId: requireRequestId(input.requestId), reviewId: input.reviewId, status: input.status, reason: reason(input.reason, 10, 500) };
}

/* ------------------------------------------------------ typed confirmation */

/** High-risk actions require the operator to type an exact phrase. */
export const CONFIRM_PHRASES = {
  approveOrganizer: "APPROVE ORGANIZER",
  suspendOrganizer: "SUSPEND ORGANIZER",
  reissueCode: "REISSUE CODE",
  cancelEvent: "CANCEL EVENT",
  largeRefund: "APPROVE REFUND",
  markPaid: "MARK PAID",
  blockEntity: "BLOCK",
} as const;

export function isConfirmed(typed: string, phrase: string): boolean {
  return typed.trim().replace(/\s+/g, " ").toUpperCase() === phrase;
}
