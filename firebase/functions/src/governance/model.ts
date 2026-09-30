export const CASE_KINDS = [
  "organizer-kyc",
  "arena-verification",
  "experience-approval",
  "event-approval",
  "commission-proposal",
  "fraud-alert",
  "refund-exception",
  "settlement-release",
] as const;

export type GovernanceCaseKind = (typeof CASE_KINDS)[number];
export type GovernanceOutcome = "approved" | "rejected" | "information-requested";
export type GovernanceCaseStatus = "pending" | "under-review" | GovernanceOutcome | "cancelled";

export interface GovernanceDecisionCommand {
  requestId: string;
  caseId: string;
  expectedVersion: number;
  outcome: GovernanceOutcome;
  note: string;
}

export interface EntityStatusCommand {
  requestId: string;
  entityType: "organizer" | "arena" | "event" | "risk-alert";
  entityId: string;
  expectedVersion: number;
  status: "active" | "paused" | "blocked" | "under-review" | "resolved";
  reason: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The command body is invalid.");
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== "string") throw new Error(`${name} is required.`);
  const clean = value.trim();
  if (clean.length < min || clean.length > max) throw new Error(`${name} must be ${min}-${max} characters.`);
  return clean;
}

function id(value: unknown, name: string): string {
  const clean = text(value, name, 8, 128);
  if (!ID.test(clean)) throw new Error(`${name} contains unsupported characters.`);
  return clean;
}

function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("expectedVersion must be a non-negative integer.");
  return value as number;
}

export function parseDecisionCommand(value: unknown): GovernanceDecisionCommand {
  const data = object(value);
  const outcome = data.outcome;
  if (outcome !== "approved" && outcome !== "rejected" && outcome !== "information-requested") {
    throw new Error("outcome is not supported.");
  }
  const note = typeof data.note === "string" ? data.note.trim() : "";
  if (outcome !== "approved" && note.length < 10) throw new Error("A reason of at least 10 characters is required.");
  if (note.length > 2000) throw new Error("The decision note is too long.");
  return { requestId: id(data.requestId, "requestId"), caseId: id(data.caseId, "caseId"), expectedVersion: version(data.expectedVersion), outcome, note };
}

export function parseEntityStatusCommand(value: unknown): EntityStatusCommand {
  const data = object(value);
  const entityType = data.entityType;
  const status = data.status;
  if (!["organizer", "arena", "event", "risk-alert"].includes(String(entityType))) throw new Error("entityType is not supported.");
  if (!["active", "paused", "blocked", "under-review", "resolved"].includes(String(status))) throw new Error("status is not supported.");
  return {
    requestId: id(data.requestId, "requestId"),
    entityType: entityType as EntityStatusCommand["entityType"],
    entityId: id(data.entityId, "entityId"),
    expectedVersion: version(data.expectedVersion),
    status: status as EntityStatusCommand["status"],
    reason: text(data.reason, "reason", 10, 2000),
  };
}

export interface ReissueOrganizerCodeCommand {
  requestId: string;
  applicantUid: string;
  /** Why the code is being re-issued (audited). */
  reason?: string;
}

export function parseReissueOrganizerCodeCommand(value: unknown): ReissueOrganizerCodeCommand {
  const data = object(value);
  const applicantUid = text(data.applicantUid, "applicantUid", 4, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(applicantUid)) throw new Error("applicantUid contains unsupported characters.");
  const reason = typeof data.reason === "string" && data.reason.trim().length >= 10
    ? data.reason.trim().slice(0, 1000)
    : "Organizer code re-issued.";
  return { requestId: id(data.requestId, "requestId"), applicantUid, reason };
}
