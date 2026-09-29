/**
 * Safety incident commands.
 *
 * Lifecycle: reported → acknowledged → triaged → investigating ⇄ escalated →
 * resolved → closed. Every command authorises the acting operator against the
 * Trust & Safety matrix (lib/safety/access.ts, territory-scoped for chain
 * roles), validates, and returns `{ state, error }`.
 */
import type { PrototypeState } from "../scenarios/state";
import type {
  Incident,
  IncidentCategory,
  IncidentSeverity,
  EvidenceItem,
  EvidenceType,
  EvidenceSensitivity,
  EvidenceStatus,
} from "../entities";
import { nextId, pushAudit, pushSignal } from "./helpers";
import { isoNow, refuse, type CommandResult } from "./outcome";
import { authorizeSafetyAction, canPerformSafetyAction, type SafetyAction } from "@/lib/safety/access";
import {
  validateIncidentClosure,
  validateIncidentOpen,
  validateIncidentReport,
  validateIncidentResolution,
  validateIncidentTriage,
  INCIDENT_CATEGORIES,
} from "../validators/safetyValidation";

/* ------------------------------ normalisation ------------------------------ */

const LEGACY_CATEGORY: Array<[RegExp, IncidentCategory]> = [
  [/injur/i, "injury"],
  [/medic/i, "medical"],
  [/harass/i, "harassment"],
  [/safeguard/i, "safeguarding"],
  [/conduct|behav/i, "misconduct"],
  [/equip/i, "equipment"],
  [/weather|rain|storm|lightning/i, "weather"],
  [/crowd/i, "crowd"],
  [/venue|facility/i, "venue"],
  [/staff/i, "staff"],
];

export function legacyCategory(type?: string): IncidentCategory {
  if (!type) return "other";
  if ((INCIDENT_CATEGORIES as string[]).includes(type)) return type as IncidentCategory;
  return LEGACY_CATEGORY.find(([re]) => re.test(type))?.[1] ?? "other";
}

/**
 * Map deprecated incident fields (reporterId, type, time, peopleInvolved,
 * escalatedToVenue, ownerId) onto the canonical ones and drop them.
 * Idempotent: a canonical incident is returned unchanged in content.
 */
export function normaliseIncident(i: Incident): Incident {
  const { reporterId, type, time, peopleInvolved, escalatedToVenue, ownerId, ...rest } = i;
  const hasLegacy = reporterId !== undefined || type !== undefined || time !== undefined || peopleInvolved !== undefined || escalatedToVenue !== undefined || ownerId !== undefined;
  const needsDefaults = !i.category || !i.severity || !i.status || !i.incidentCode;
  if (!hasLegacy && !needsDefaults) return i;
  const out: Incident = {
    ...rest,
    category: i.category ?? legacyCategory(type),
    severity: i.severity ?? "medium",
    status: i.status ?? "reported",
    reportedBy: i.reportedBy ?? reporterId,
    reportedAt: i.reportedAt ?? i.createdAt ?? time,
    occurredAt: i.occurredAt ?? i.reportedAt ?? i.createdAt ?? time,
    participantTemporaryIds: i.participantTemporaryIds ?? peopleInvolved ?? [],
    venueEscalated: i.venueEscalated ?? escalatedToVenue ?? false,
    followUpOwnerId: i.followUpOwnerId ?? ownerId,
    incidentCode: i.incidentCode ?? `INC-${(i.territoryId ?? "gen").slice(0, 3).toUpperCase()}-${i.id}`,
    evidenceItemIds: i.evidenceItemIds ?? [],
  };
  return out;
}

/* --------------------------------- helpers -------------------------------- */

function load(state: PrototypeState, id: string): Incident | undefined {
  const found = (state.incidents ?? []).find((i) => i.id === id);
  return found ? normaliseIncident(found) : undefined;
}

function guard(state: PrototypeState, actorId: string, action: SafetyAction, scope?: { territoryId?: string }): string | undefined {
  const auth = authorizeSafetyAction(state, actorId, action, { territoryId: scope?.territoryId });
  return auth.ok ? undefined : auth.error;
}

function patch(state: PrototypeState, id: string, change: Partial<Incident>): PrototypeState {
  return {
    ...state,
    incidents: state.incidents.map((i) => (i.id === id ? { ...normaliseIncident(i), ...change, updatedAt: isoNow() } : i)),
  };
}

const code = (i: Incident) => i.incidentCode ?? i.id;

function appendNote(existing: string | undefined, label: string, text: string): string {
  const line = `${label} (${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}): ${text.trim()}`;
  return existing ? `${existing}\n${line}` : line;
}

/* --------------------------------- commands -------------------------------- */

export interface IncidentReportInput {
  category: IncidentCategory;
  severity: IncidentSeverity;
  notes: string;
  immediateAction?: string;
  medicalAssistance?: boolean;
  sessionId?: string;
  tournamentId?: string;
  matchId?: string;
  territoryId?: string;
  venueId?: string;
  participantTemporaryIds?: string[];
  occurredAt?: string;
}

/** 1. Report an incident. Location is derived from the linked session or tournament. */
export function reportIncident(state: PrototypeState, params: IncidentReportInput, operatorId: string): CommandResult<{ id: string }> {
  const session = params.sessionId ? state.sessions.find((s) => s.id === params.sessionId) : undefined;
  const tournament = params.tournamentId ? state.tournaments.find((t) => t.id === params.tournamentId) : undefined;
  const territoryId = params.territoryId ?? session?.territoryId ?? tournament?.territoryId;
  const venueId = params.venueId ?? session?.venueId ?? tournament?.venueId;
  const cityId = session?.cityId ?? tournament?.cityId ?? state.venues.find((v) => v.id === venueId)?.cityId;

  const denied = guard(state, operatorId, "incident.report", { territoryId });
  if (denied) return refuse(state, denied);
  const check = validateIncidentReport({ ...params, reportedBy: operatorId });
  if (!check.isValid) return refuse(state, check.error!);
  if (!territoryId) return refuse(state, "Link the incident to a session or tournament, or choose a territory.");

  const incidents = state.incidents ?? [];
  const id = nextId("i", incidents.map((i) => i.id));
  const prefix = `INC-${territoryId.slice(0, 3).toUpperCase()}-`;
  const seq = incidents.reduce((max, i) => {
    const m = i.incidentCode?.startsWith(prefix) ? i.incidentCode.slice(prefix.length).match(/^(\d+)$/) : null;
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  const now = isoNow();
  const incident: Incident = {
    id,
    incidentCode: `${prefix}${String(seq + 1).padStart(3, "0")}`,
    sessionId: params.sessionId,
    tournamentId: params.tournamentId,
    matchId: params.matchId,
    territoryId,
    cityId,
    venueId,
    category: params.category,
    severity: params.severity,
    status: "reported",
    reportedBy: operatorId,
    reportedAt: now,
    occurredAt: params.occurredAt ?? now,
    participantTemporaryIds: params.participantTemporaryIds ?? [],
    staffIds: [operatorId],
    immediateAction: params.immediateAction?.trim() || undefined,
    medicalAssistance: !!params.medicalAssistance,
    venueEscalated: false,
    evidenceItemIds: [],
    notes: params.notes.trim(),
    createdAt: now,
    updatedAt: now,
  };

  let next: PrototypeState = { ...state, incidents: [...incidents, incident] };
  next = pushAudit(next, {
    action: "Incident Reported",
    description: `Reported ${incident.incidentCode}: ${params.category}, ${params.severity} severity.`,
    operatorId,
    sessionId: params.sessionId,
  });
  next = pushSignal(next, {
    kind: "alert",
    message: `${params.severity === "critical" ? "Critical" : "New"} safety incident ${incident.incidentCode} (${params.category})`,
    sessionId: params.sessionId,
  });
  return { state: next, id };
}

/** 2. Acknowledge: someone owns the first response. */
export function acknowledgeIncident(state: PrototypeState, incidentId: string, operatorId: string): CommandResult {
  const i = load(state, incidentId);
  if (!i) return refuse(state, "This incident no longer exists.");
  const denied = guard(state, operatorId, "incident.acknowledge", i);
  if (denied) return refuse(state, denied);
  if (i.status !== "reported") return refuse(state, "This incident has already been acknowledged.");
  let next = patch(state, incidentId, { status: "acknowledged", acknowledgedAt: isoNow(), acknowledgedBy: operatorId });
  next = pushAudit(next, { action: "Incident Acknowledged", description: `Acknowledged ${code(i)}.`, operatorId, sessionId: i.sessionId });
  return { state: next };
}

export interface IncidentTriageInput {
  incidentId: string;
  severity: IncidentSeverity;
  immediateRisk: string;
  recommendation: string;
  protectionActions?: string;
  venueImpact?: string;
  sessionImpact?: string;
}

/** 3. Triage: confirm severity, assess risk, record the recommendation. */
export function triageIncident(state: PrototypeState, params: IncidentTriageInput, operatorId: string): CommandResult {
  const i = load(state, params.incidentId);
  if (!i) return refuse(state, "This incident no longer exists.");
  const denied = guard(state, operatorId, "incident.triage", i);
  if (denied) return refuse(state, denied);
  const check = validateIncidentTriage(i, params);
  if (!check.isValid) return refuse(state, check.error!);

  const changed = params.severity !== i.severity;
  let next = patch(state, params.incidentId, {
    status: "triaged",
    severity: params.severity,
    triageSeverityReview: changed ? `Severity changed from ${i.severity} to ${params.severity}` : `Severity confirmed as ${params.severity}`,
    triageImmediateRisk: params.immediateRisk.trim(),
    triageRecommendation: params.recommendation.trim(),
    triageProtectionActions: params.protectionActions?.trim() || undefined,
    triageVenueImpact: params.venueImpact?.trim() || undefined,
    triageSessionImpact: params.sessionImpact?.trim() || undefined,
    triagedAt: isoNow(),
    triagedBy: operatorId,
    acknowledgedAt: i.acknowledgedAt ?? isoNow(),
    acknowledgedBy: i.acknowledgedBy ?? operatorId,
  });
  next = pushAudit(next, {
    action: "Incident Triaged",
    description: `Triaged ${code(i)} as ${params.severity}${changed ? ` (was ${i.severity})` : ""}. Recommendation: ${params.recommendation.trim()}`,
    operatorId,
    sessionId: i.sessionId,
  });
  return { state: next };
}

/** 4. Assign an investigator (a Safety Officer or manager who can investigate). */
export function assignInvestigator(state: PrototypeState, incidentId: string, investigatorId: string, operatorId: string): CommandResult {
  const i = load(state, incidentId);
  if (!i) return refuse(state, "This incident no longer exists.");
  const denied = guard(state, operatorId, "incident.assign", i);
  if (denied) return refuse(state, denied);
  if (!["triaged", "investigating", "escalated", "monitoring"].includes(i.status ?? "")) return refuse(state, "Triage the incident before assigning an investigator.");
  const investigator = state.operators.find((o) => o.id === investigatorId);
  if (!investigator || investigator.status === "suspended") return refuse(state, "Choose an active operator as investigator.");
  if (!canPerformSafetyAction(investigator.role, "incident.investigate")) {
    return refuse(state, `${investigator.name} can't run investigations in their role. Choose a Safety & Moderation Officer, Super Admin or Platform Owner.`);
  }
  let next = patch(state, incidentId, { investigatorId, status: i.status === "escalated" ? "escalated" : "investigating" });
  next = pushAudit(next, { action: "Investigator Assigned", description: `${investigator.name} is investigating ${code(i)}.`, operatorId, sessionId: i.sessionId });
  return { state: next };
}

/** 5. Escalate to venue management and senior safety. */
export function escalateIncident(state: PrototypeState, incidentId: string, reason: string, operatorId: string): CommandResult {
  const i = load(state, incidentId);
  if (!i) return refuse(state, "This incident no longer exists.");
  const denied = guard(state, operatorId, "incident.escalate", i);
  if (denied) return refuse(state, denied);
  if (i.status === "resolved" || i.status === "closed") return refuse(state, `This incident is already ${i.status}.`);
  if (i.status === "escalated") return refuse(state, "This incident is already escalated.");
  if (!reason || reason.trim().length < 10) return refuse(state, "Give the reason for escalating (at least 10 characters).");
  let next = patch(state, incidentId, {
    status: "escalated",
    venueEscalated: true,
    escalatedAt: isoNow(),
    escalationReason: reason.trim(),
    notes: appendNote(i.notes, "Escalated", reason),
  });
  next = pushAudit(next, { action: "Incident Escalated", description: `Escalated ${code(i)}. Reason: ${reason.trim()}`, operatorId, sessionId: i.sessionId });
  next = pushSignal(next, { kind: "alert", message: `Incident escalated: ${code(i)}`, sessionId: i.sessionId });
  return { state: next };
}

/** 6. Record investigation findings. */
export function updateInvestigation(state: PrototypeState, incidentId: string, summary: string, operatorId: string): CommandResult {
  const i = load(state, incidentId);
  if (!i) return refuse(state, "This incident no longer exists.");
  const denied = guard(state, operatorId, "incident.investigate", i);
  if (denied) return refuse(state, denied);
  if (!["triaged", "investigating", "escalated", "monitoring"].includes(i.status ?? "")) return refuse(state, "Investigation notes can be recorded once the incident is triaged and before it is resolved.");
  if (!summary || summary.trim().length < 10) return refuse(state, "Write the investigation findings (at least 10 characters).");
  let next = patch(state, incidentId, { investigationSummary: summary.trim() });
  next = pushAudit(next, { action: "Investigation Updated", description: `Updated investigation findings for ${code(i)}.`, operatorId, sessionId: i.sessionId });
  return { state: next };
}

/** 7. Resolve with a written resolution. */
export function resolveIncident(state: PrototypeState, incidentId: string, resolution: string, operatorId: string): CommandResult {
  const i = load(state, incidentId);
  if (!i) return refuse(state, "This incident no longer exists.");
  const denied = guard(state, operatorId, "incident.resolve", i);
  if (denied) return refuse(state, denied);
  const check = validateIncidentResolution(i, resolution);
  if (!check.isValid) return refuse(state, check.error!);
  let next = patch(state, incidentId, { status: "resolved", resolution: resolution.trim(), resolvedAt: isoNow(), resolvedBy: operatorId });
  next = pushAudit(next, { action: "Incident Resolved", description: `Resolved ${code(i)}: ${resolution.trim()}`, operatorId, sessionId: i.sessionId });
  return { state: next };
}

/** 8. Close a resolved incident. Closing is final. */
export function closeIncident(state: PrototypeState, incidentId: string, notes: string, operatorId: string): CommandResult {
  const i = load(state, incidentId);
  if (!i) return refuse(state, "This incident no longer exists.");
  const denied = guard(state, operatorId, "incident.close", i);
  if (denied) return refuse(state, denied);
  const check = validateIncidentClosure(state, i);
  if (!check.isValid) return refuse(state, check.error!);
  let next = patch(state, incidentId, {
    status: "closed",
    closedAt: isoNow(),
    closedBy: operatorId,
    notes: notes?.trim() ? appendNote(i.notes, "Closure", notes) : i.notes,
  });
  next = pushAudit(next, { action: "Incident Closed", description: `Closed ${code(i)}.`, operatorId, sessionId: i.sessionId });
  return { state: next };
}

export interface EvidenceInput {
  incidentId: string;
  type: EvidenceType;
  label: string;
  description?: string;
  /** Where the original is kept (file name, drive link or physical location). No upload happens. */
  placeholderFileName?: string;
  sensitivity: EvidenceSensitivity;
  status?: EvidenceStatus;
}

/** 9. Add an entry to the incident's evidence register (metadata only — files are not uploaded). */
export function addEvidenceRecord(state: PrototypeState, params: EvidenceInput, operatorId: string): CommandResult<{ id: string }> {
  const i = load(state, params.incidentId);
  if (!i) return refuse(state, "This incident no longer exists.");
  const denied = guard(state, operatorId, "incident.evidence", i);
  if (denied) return refuse(state, denied);
  const open = validateIncidentOpen(i);
  if (!open.isValid) return refuse(state, "Evidence can't be added to a closed incident.");
  if (!params.label || params.label.trim().length < 3) return refuse(state, "Give the evidence a label (at least 3 characters).");
  if (!params.type) return refuse(state, "Choose the evidence type.");
  if (!params.sensitivity) return refuse(state, "Choose how sensitive the evidence is.");

  const items = state.evidenceItems ?? [];
  const id = nextId("ev", items.map((e) => e.id));
  const now = isoNow();
  const item: EvidenceItem = {
    id,
    incidentId: params.incidentId,
    type: params.type,
    label: params.label.trim(),
    description: params.description?.trim() || undefined,
    placeholderFileName: params.placeholderFileName?.trim() || undefined,
    capturedBy: operatorId,
    capturedAt: now,
    sensitivity: params.sensitivity,
    status: params.status ?? "collected",
    createdAt: now,
    updatedAt: now,
  };
  let next: PrototypeState = { ...state, evidenceItems: [...items, item] };
  next = patch(next, params.incidentId, { evidenceItemIds: [...(i.evidenceItemIds ?? []), id] });
  next = pushAudit(next, { action: "Evidence Recorded", description: `Recorded evidence "${item.label}" (${id}, ${params.sensitivity}) on ${code(i)}.`, operatorId, sessionId: i.sessionId });
  return { state: next, id };
}

/** 10. Move an evidence item through pending → collected → reviewed → archived. */
export function updateEvidenceStatus(state: PrototypeState, evidenceId: string, status: EvidenceStatus, operatorId: string): CommandResult {
  const item = (state.evidenceItems ?? []).find((e) => e.id === evidenceId);
  if (!item) return refuse(state, "This evidence record no longer exists.");
  const i = load(state, item.incidentId);
  if (!i) return refuse(state, "The incident for this evidence no longer exists.");
  const denied = guard(state, operatorId, status === "reviewed" ? "incident.investigate" : "incident.evidence", i);
  if (denied) return refuse(state, denied);
  if (i.status === "closed") return refuse(state, "The incident is closed; its evidence register is final.");
  if (item.status === status) return refuse(state, `This evidence is already ${status}.`);
  let next: PrototypeState = {
    ...state,
    evidenceItems: state.evidenceItems.map((e) => (e.id === evidenceId ? { ...e, status, updatedAt: isoNow() } : e)),
  };
  next = pushAudit(next, { action: "Evidence Updated", description: `Evidence "${item.label}" on ${code(i)} marked ${status}.`, operatorId, sessionId: i.sessionId });
  return { state: next };
}

/** 11. Assign a follow-up owner and due date. */
export function createFollowUp(state: PrototypeState, incidentId: string, followUpOwnerId: string, dueAt: string, operatorId: string): CommandResult {
  const i = load(state, incidentId);
  if (!i) return refuse(state, "This incident no longer exists.");
  const denied = guard(state, operatorId, "incident.follow-up", i);
  if (denied) return refuse(state, denied);
  if (i.status === "closed") return refuse(state, "This incident is closed.");
  const owner = state.operators.find((o) => o.id === followUpOwnerId);
  if (!owner || owner.status === "suspended") return refuse(state, "Choose an active operator to own the follow-up.");
  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return refuse(state, "Choose a due date for the follow-up.");
  if (due < Date.now() - 24 * 3600 * 1000) return refuse(state, "The follow-up due date can't be in the past.");
  let next = patch(state, incidentId, { followUpOwnerId, followUpDueAt: new Date(due).toISOString() });
  next = pushAudit(next, { action: "Follow-up Assigned", description: `${owner.name} owns the follow-up on ${code(i)}, due ${new Date(due).toLocaleDateString("en-IN", { dateStyle: "medium" })}.`, operatorId, sessionId: i.sessionId });
  return { state: next };
}

/** Data migration: every stored incident uses canonical fields only (see normaliseIncident). Idempotent. */
export function migrateLegacyIncidents(state: PrototypeState): PrototypeState {
  const incidents = state.incidents ?? [];
  let changed = false;
  const next = incidents.map((i) => {
    const n = normaliseIncident(i);
    if (n !== i) changed = true;
    return n;
  });
  return changed ? { ...state, incidents: next } : state;
}
