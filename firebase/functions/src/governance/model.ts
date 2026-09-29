/**
 * Marketplace governance model: command shapes, validation and the entity
 * status state machine.
 *
 * Kept identical to the console's local workspace implementation in
 * apps/operations-web/lib/prototype/governance/commands.ts (CASE_TARGET,
 * ENTITY_TRANSITIONS, intake mapping and operator-facing messages).
 */

import { invalidInput } from "../platform/errors";

export const CASE_KINDS = [
  "organizer-kyc",
  "arena-verification",
  "event-approval",
  "commission-proposal",
  "fraud-alert",
  "refund-exception",
  "settlement-release",
] as const;

export type GovernanceCaseKind = (typeof CASE_KINDS)[number];
export type GovernanceOutcome = "approved" | "rejected" | "information-requested";
export type GovernanceCaseStatus = "pending" | "under-review" | GovernanceOutcome | "cancelled";
export type GovernanceEntityType = "organizer" | "arena" | "event" | "risk-alert";
export type GovernanceEntityStatus = "active" | "paused" | "blocked" | "under-review" | "resolved";

export const OPEN_CASE_STATUSES = ["pending", "under-review", "information-requested"];

export const CASE_KIND_LABEL: Record<GovernanceCaseKind, string> = {
  "organizer-kyc": "Organizer KYC",
  "arena-verification": "Arena verification",
  "event-approval": "Event approval",
  "commission-proposal": "Commission proposal",
  "fraud-alert": "Fraud alert",
  "refund-exception": "Refund exception",
  "settlement-release": "Settlement release",
};

/**
 * Allowed target statuses per entity type, keyed by the entity's CURRENT
 * status. Anything not listed is refused. Identical to the console's
 * `ENTITY_TRANSITIONS`.
 */
export const ENTITY_TRANSITIONS: Record<GovernanceEntityType, Record<string, GovernanceEntityStatus[]>> = {
  organizer: {
    "under-review": ["active", "paused", "blocked"],
    pending: ["active", "paused", "blocked", "under-review"],
    active: ["paused", "blocked", "under-review"],
    paused: ["active", "blocked", "under-review"],
    blocked: ["under-review"],
    rejected: ["under-review"],
    "information-requested": ["under-review", "active", "blocked"],
  },
  arena: {
    "under-review": ["active", "paused", "blocked"],
    pending: ["active", "paused", "blocked", "under-review"],
    active: ["paused", "blocked", "under-review"],
    paused: ["active", "blocked", "under-review"],
    blocked: ["under-review"],
    rejected: ["under-review"],
    "information-requested": ["under-review", "active", "blocked"],
  },
  event: {
    "under-review": ["active", "paused", "blocked"],
    pending: ["active", "paused", "blocked", "under-review"],
    active: ["paused", "blocked"],
    paused: ["active", "blocked"],
    blocked: ["under-review"],
    rejected: ["under-review"],
    "information-requested": ["under-review", "active", "blocked"],
  },
  "risk-alert": {
    "under-review": ["resolved", "blocked"],
    "on-hold": ["under-review", "resolved", "blocked"],
    pending: ["under-review", "resolved"],
    blocked: ["under-review", "resolved"],
    resolved: ["under-review"],
  },
};

export function allowedEntityTransitions(entityType: GovernanceEntityType, current: string): GovernanceEntityStatus[] {
  return ENTITY_TRANSITIONS[entityType][current] ?? [];
}

/** Risk-alert statuses that no longer block anything. */
export const CLOSED_RISK_ALERT_STATUSES = ["resolved"];

export interface GovernanceDecisionCommand {
  requestId: string;
  caseId: string;
  expectedVersion: number;
  outcome: GovernanceOutcome;
  note: string;
}

export interface EntityStatusCommand {
  requestId: string;
  entityType: GovernanceEntityType;
  entityId: string;
  expectedVersion: number;
  status: GovernanceEntityStatus;
  reason: string;
}

export type IntakeKind = "organizer" | "arena" | "event" | "commission" | "policy";

export interface IntakeCommand {
  requestId: string;
  kind: IntakeKind;
  name: string;
  location?: string;
  organizerName?: string;
  contactEmail?: string;
  summary?: string;
  capacity?: number;
  /** Rupees, as typed by the operator. Stored as integer paise. */
  projectedGmv?: number;
  commissionPercent?: number;
  effectiveFrom?: string;
  risk?: "low" | "medium" | "high";
}

export const INTAKE: Record<IntakeKind, { collection: string; caseKind?: GovernanceCaseKind; prefix: string; policy: string }> = {
  organizer: { collection: "organizers", caseKind: "organizer-kyc", prefix: "organizer", policy: "KYC-2.0" },
  arena: { collection: "arenas", caseKind: "arena-verification", prefix: "arena", policy: "ARENA-3.2" },
  event: { collection: "events", caseKind: "event-approval", prefix: "event", policy: "EVENT-4.1" },
  commission: { collection: "commercialAgreements", caseKind: "commission-proposal", prefix: "commercial", policy: "COMM-1.3" },
  policy: { collection: "policyVersions", prefix: "policy", policy: "POLICY" },
};

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidInput("The command body is invalid.");
  return value as Record<string, unknown>;
}

function id(value: unknown, name: string): string {
  if (typeof value !== "string") throw invalidInput(`${name} is required.`);
  const clean = value.trim();
  if (!ID.test(clean)) throw invalidInput(`${name} must be 8-128 letters, digits, dashes or underscores.`);
  return clean;
}

function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalidInput("expectedVersion must be a non-negative integer.");
  return value as number;
}

function optionalText(value: unknown, name: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw invalidInput(`${name} must be text.`);
  const clean = value.trim();
  if (clean.length > max) throw invalidInput(`${name} is too long (${max.toLocaleString("en-IN")} characters maximum).`);
  return clean || undefined;
}

function optionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalidInput(`${name} must be a number.`);
  return value;
}

/** Validates a reason / note exactly as the console does. */
function reasonText(value: unknown, required: boolean, tooLong: string): string {
  const clean = typeof value === "string" ? value.trim() : "";
  if (required && clean.length < 10) throw invalidInput("Add a reason of at least 10 characters.");
  if (clean.length > 2000) throw invalidInput(tooLong);
  return clean;
}

export function parseDecisionCommand(value: unknown): GovernanceDecisionCommand {
  const data = object(value);
  const outcome = data.outcome;
  if (outcome !== "approved" && outcome !== "rejected" && outcome !== "information-requested") {
    throw invalidInput("Choose approve, reject or request information.");
  }
  const note = reasonText(data.note, outcome !== "approved", "The decision note is too long (2,000 characters maximum).");
  return { requestId: id(data.requestId, "requestId"), caseId: id(data.caseId, "caseId"), expectedVersion: version(data.expectedVersion), outcome, note };
}

export function parseEntityStatusCommand(value: unknown): EntityStatusCommand {
  const data = object(value);
  const entityType = data.entityType;
  const status = data.status;
  if (!["organizer", "arena", "event", "risk-alert"].includes(String(entityType))) throw invalidInput("This kind of record cannot be changed here.");
  if (!["active", "paused", "blocked", "under-review", "resolved"].includes(String(status))) throw invalidInput("That status is not supported.");
  return {
    requestId: id(data.requestId, "requestId"),
    entityType: entityType as GovernanceEntityType,
    entityId: id(data.entityId, "entityId"),
    expectedVersion: version(data.expectedVersion),
    status: status as GovernanceEntityStatus,
    reason: reasonText(data.reason, true, "The reason is too long (2,000 characters maximum)."),
  };
}

export function parseIntakeCommand(value: unknown): IntakeCommand {
  const data = object(value);
  const kind = data.kind;
  if (!Object.prototype.hasOwnProperty.call(INTAKE, String(kind))) throw invalidInput("Choose what you are recording.");
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (name.length < 3) throw invalidInput("Enter a name of at least 3 characters.");
  if (name.length > 200) throw invalidInput("The name is too long (200 characters maximum).");

  const contactEmail = optionalText(data.contactEmail, "Contact email", 254);
  if (contactEmail && !EMAIL.test(contactEmail)) throw invalidInput("Enter a valid contact email.");

  const commissionPercent = optionalNumber(data.commissionPercent, "Commission");
  if (commissionPercent !== undefined && (commissionPercent < 0 || commissionPercent > 50)) {
    throw invalidInput("Commission must be between 0% and 50%.");
  }
  const capacity = optionalNumber(data.capacity, "Capacity");
  if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 0 || capacity > 1_000_000)) {
    throw invalidInput("Capacity must be a whole number up to 10,00,000.");
  }
  const projectedGmv = optionalNumber(data.projectedGmv, "Projected GMV");
  if (projectedGmv !== undefined && (projectedGmv < 0 || projectedGmv > 100_000_000_000)) {
    throw invalidInput("Projected GMV must be between ₹0 and ₹10,000 crore.");
  }
  const risk = data.risk;
  if (risk !== undefined && risk !== null && risk !== "low" && risk !== "medium" && risk !== "high") {
    throw invalidInput("Risk must be low, medium or high.");
  }

  return {
    requestId: id(data.requestId, "requestId"),
    kind: kind as IntakeKind,
    name,
    location: optionalText(data.location, "Location", 200),
    organizerName: optionalText(data.organizerName, "Organizer name", 200),
    contactEmail,
    summary: optionalText(data.summary, "Summary", 2000),
    capacity,
    projectedGmv,
    commissionPercent,
    effectiveFrom: optionalText(data.effectiveFrom, "Effective from", 40),
    risk: (risk ?? undefined) as IntakeCommand["risk"],
  };
}
