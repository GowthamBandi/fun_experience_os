/**
 * Marketplace governance commands (local workspace implementation).
 *
 * These mirror the Cloud Functions in firebase/functions/src/governance so the
 * console behaves identically against the local workspace and Firestore:
 *   - optimistic concurrency on `version`
 *   - finalized cases cannot be re-decided
 *   - explicit status transition rules per entity type
 *   - a reason is mandatory for every non-approval decision
 *   - every change writes an audit event with the acting operator
 */
import type { GovernanceCollectionName, GovernanceDoc } from "../entities";
import type { PrototypeState } from "../scenarios";

export type GovernanceOutcome = "approved" | "rejected" | "information-requested";
export type GovernanceEntityType = "organizer" | "arena" | "event" | "risk-alert";
export type GovernanceEntityStatus = "active" | "paused" | "blocked" | "under-review" | "resolved";

export interface GovernanceActor {
  id: string;
  name: string;
  roleId: string;
}

export interface CommandResult {
  state: PrototypeState;
  error?: string;
}

export const CASE_TARGET: Record<string, { collection: GovernanceCollectionName; approvedStatus: string }> = {
  "organizer-kyc": { collection: "organizers", approvedStatus: "active" },
  "arena-verification": { collection: "arenas", approvedStatus: "active" },
  "event-approval": { collection: "events", approvedStatus: "active" },
  "commission-proposal": { collection: "commercialAgreements", approvedStatus: "approved" },
  "fraud-alert": { collection: "riskAlerts", approvedStatus: "resolved" },
  "refund-exception": { collection: "refundCases", approvedStatus: "approved" },
  "settlement-release": { collection: "settlementControls", approvedStatus: "approved-for-release" },
};

export const CASE_KIND_LABEL: Record<string, string> = {
  "organizer-kyc": "Organizer KYC",
  "arena-verification": "Arena verification",
  "event-approval": "Event approval",
  "commission-proposal": "Commission proposal",
  "fraud-alert": "Fraud alert",
  "refund-exception": "Refund exception",
  "settlement-release": "Settlement release",
};

export const OPEN_CASE_STATUSES = ["pending", "under-review", "information-requested"];

export const ENTITY_COLLECTION: Record<GovernanceEntityType, GovernanceCollectionName> = {
  organizer: "organizers",
  arena: "arenas",
  event: "events",
  "risk-alert": "riskAlerts",
};

/**
 * Allowed target statuses per entity type. Kept identical to
 * firebase/functions/src/governance/model.ts `ENTITY_TRANSITIONS`.
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

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function findDoc(state: PrototypeState, collection: GovernanceCollectionName, id: string): GovernanceDoc | undefined {
  return state.governance.find((d) => d.collection === collection && d.id === id);
}

function replaceDoc(state: PrototypeState, next: GovernanceDoc): PrototypeState {
  return {
    ...state,
    governance: state.governance.map((d) => (d.collection === next.collection && d.id === next.id ? next : d)),
  };
}

function appendAudit(
  state: PrototypeState,
  actor: GovernanceActor,
  entry: { action: string; subject: string; summary: string; entityType: string; entityId: string; before?: unknown; after?: unknown },
): PrototypeState {
  const at = nowIso();
  const audit: GovernanceDoc = {
    collection: "auditEvents",
    id: newId("audit"),
    version: 0,
    createdAt: at,
    updatedAt: at,
    data: { ...entry, actorUid: actor.id, actorName: actor.name, actorRoleId: actor.roleId, at, schemaVersion: 1 },
  };
  return { ...state, governance: [audit, ...state.governance] };
}

function subjectOf(d: GovernanceDoc): string {
  const v = d.data.subject ?? d.data.name ?? d.data.title ?? d.id;
  return String(v);
}

export function decideGovernanceCase(
  state: PrototypeState,
  cmd: { caseId: string; expectedVersion: number; outcome: GovernanceOutcome; note: string },
  actor: GovernanceActor,
): CommandResult {
  const note = (cmd.note ?? "").trim();
  if (cmd.outcome !== "approved" && note.length < 10) return { state, error: "Add a reason of at least 10 characters." };
  if (note.length > 2000) return { state, error: "The decision note is too long (2,000 characters maximum)." };
  const kase = findDoc(state, "governanceCases", cmd.caseId);
  if (!kase) return { state, error: "This case no longer exists." };
  if (kase.version !== cmd.expectedVersion) return { state, error: "Someone else changed this case. Reopen it to see the latest version." };
  const status = String(kase.data.status ?? "pending");
  if (!OPEN_CASE_STATUSES.includes(status)) return { state, error: `This case is already ${status.replace(/-/g, " ")} and cannot be decided again.` };

  const at = nowIso();
  const decided: GovernanceDoc = {
    ...kase,
    version: kase.version + 1,
    updatedAt: at,
    data: {
      ...kase.data,
      status: cmd.outcome,
      decision: { outcome: cmd.outcome, note, actorUid: actor.id, actorName: actor.name, actorRoleId: actor.roleId, decidedAt: at },
    },
  };
  let next = replaceDoc(state, decided);

  const target = CASE_TARGET[String(kase.data.kind)];
  const targetId = typeof kase.data.targetId === "string" ? kase.data.targetId : undefined;
  if (target && targetId) {
    const t = findDoc(next, target.collection, targetId);
    if (t) {
      const targetStatus = cmd.outcome === "approved" ? target.approvedStatus : cmd.outcome;
      next = replaceDoc(next, {
        ...t,
        version: t.version + 1,
        updatedAt: at,
        data: { ...t.data, status: targetStatus, statusReason: note || "Approved through the decision queue" },
      });
    }
  }

  const verb = cmd.outcome === "approved" ? "approved" : cmd.outcome === "rejected" ? "rejected" : "sent back for information";
  next = appendAudit(next, actor, {
    action: "governance.case-decided",
    subject: `${CASE_KIND_LABEL[String(kase.data.kind)] ?? "Case"} ${verb} — ${subjectOf(kase)}`,
    summary: note || "Approved",
    entityType: "governanceCase",
    entityId: kase.id,
    before: { status },
    after: { status: cmd.outcome },
  });
  return { state: next };
}

export function setGovernanceEntityStatus(
  state: PrototypeState,
  cmd: { entityType: GovernanceEntityType; entityId: string; expectedVersion: number; status: GovernanceEntityStatus; reason: string },
  actor: GovernanceActor,
): CommandResult {
  const reason = (cmd.reason ?? "").trim();
  if (reason.length < 10) return { state, error: "Add a reason of at least 10 characters." };
  if (reason.length > 2000) return { state, error: "The reason is too long (2,000 characters maximum)." };
  const collection = ENTITY_COLLECTION[cmd.entityType];
  const d = findDoc(state, collection, cmd.entityId);
  if (!d) return { state, error: "This record no longer exists." };
  if (d.version !== cmd.expectedVersion) return { state, error: "Someone else changed this record. Reopen it to see the latest version." };
  const current = String(d.data.status ?? "pending");
  if (current === cmd.status) return { state, error: `This record is already ${current.replace(/-/g, " ")}.` };
  const allowed = allowedEntityTransitions(cmd.entityType, current);
  if (!allowed.includes(cmd.status)) {
    return { state, error: `A ${cmd.entityType.replace("-", " ")} that is ${current.replace(/-/g, " ")} cannot be set to ${cmd.status.replace(/-/g, " ")}.` };
  }
  const at = nowIso();
  let next = replaceDoc(state, { ...d, version: d.version + 1, updatedAt: at, data: { ...d.data, status: cmd.status, statusReason: reason } });
  next = appendAudit(next, actor, {
    action: "governance.entity-status-changed",
    subject: `${subjectOf(d)} → ${cmd.status.replace(/-/g, " ")}`,
    summary: reason,
    entityType: cmd.entityType,
    entityId: d.id,
    before: { status: current },
    after: { status: cmd.status },
  });
  return { state: next };
}

export type IntakeKind = "organizer" | "arena" | "event" | "commission" | "policy";

export interface IntakeInput {
  kind: IntakeKind;
  name: string;
  location?: string;
  organizerName?: string;
  contactEmail?: string;
  summary?: string;
  capacity?: number;
  projectedGmv?: number;
  commissionPercent?: number;
  effectiveFrom?: string;
  risk?: "low" | "medium" | "high";
}

const INTAKE: Record<IntakeKind, { collection: GovernanceCollectionName; caseKind?: string; prefix: string; policy: string }> = {
  organizer: { collection: "organizers", caseKind: "organizer-kyc", prefix: "organizer", policy: "KYC-2.0" },
  arena: { collection: "arenas", caseKind: "arena-verification", prefix: "arena", policy: "ARENA-3.2" },
  event: { collection: "events", caseKind: "event-approval", prefix: "event", policy: "EVENT-4.1" },
  commission: { collection: "commercialAgreements", caseKind: "commission-proposal", prefix: "commercial", policy: "COMM-1.3" },
  policy: { collection: "policyVersions", prefix: "policy", policy: "POLICY" },
};

/** Record an incoming application / submission and open its review case. */
export function submitGovernanceIntake(state: PrototypeState, input: IntakeInput, actor: GovernanceActor): CommandResult & { id?: string } {
  const name = (input.name ?? "").trim();
  if (name.length < 3) return { state, error: "Enter a name of at least 3 characters." };
  if (input.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) return { state, error: "Enter a valid contact email." };
  if (input.commissionPercent !== undefined && (input.commissionPercent < 0 || input.commissionPercent > 50)) {
    return { state, error: "Commission must be between 0% and 50%." };
  }
  const spec = INTAKE[input.kind];
  const at = nowIso();
  const id = newId(spec.prefix);
  const data: Record<string, unknown> = {
    name,
    status: input.kind === "policy" ? "published" : input.kind === "commission" ? "pending" : "under-review",
    summary: input.summary?.trim() || (input.kind === "policy" ? "Policy version" : "Submitted for review"),
    submittedBy: actor.name,
  };
  if (input.location) data.location = input.location.trim();
  if (input.organizerName) data.organizerName = input.organizerName.trim();
  if (input.contactEmail) data.contactEmail = input.contactEmail.trim();
  if (input.capacity) data.displayValue = `${input.capacity.toLocaleString("en-IN")} capacity`;
  if (input.projectedGmv) {
    data.projectedGmvMinor = Math.round(input.projectedGmv * 100);
    data.currency = "INR";
  }
  if (input.commissionPercent !== undefined) data.commissionBps = Math.round(input.commissionPercent * 100);
  if (input.effectiveFrom) data.effectiveFrom = input.effectiveFrom;

  let next: PrototypeState = {
    ...state,
    governance: [{ collection: spec.collection, id, version: 0, createdAt: at, updatedAt: at, data }, ...state.governance],
  };
  if (spec.caseKind) {
    const caseDoc: GovernanceDoc = {
      collection: "governanceCases",
      id: newId("case"),
      version: 0,
      createdAt: at,
      updatedAt: at,
      data: {
        subject: name,
        kind: spec.caseKind,
        targetId: id,
        status: "pending",
        location: input.location ?? "",
        summary: data.summary,
        policyVersion: spec.policy,
        risk: input.risk ?? "medium",
        submittedAt: at,
        ...(data.displayValue ? { displayValue: data.displayValue } : {}),
        ...(data.projectedGmvMinor ? { projectedGmvMinor: data.projectedGmvMinor, currency: "INR" } : {}),
        ...(input.commissionPercent !== undefined ? { displayValue: `${input.commissionPercent}% proposed` } : {}),
      },
    };
    next = { ...next, governance: [caseDoc, ...next.governance] };
  }
  next = appendAudit(next, actor, {
    action: "governance.intake-recorded",
    subject: `${spec.caseKind ? CASE_KIND_LABEL[spec.caseKind] : "Policy"} recorded — ${name}`,
    summary: data.summary as string,
    entityType: input.kind,
    entityId: id,
  });
  return { state: next, id };
}
