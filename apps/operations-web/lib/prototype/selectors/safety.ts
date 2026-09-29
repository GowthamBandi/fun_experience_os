import type { PrototypeState } from "../scenarios/state";
import type { Incident, IncidentSeverity } from "../entities";
import { venueName, sessionTitle, operatorName, territoryName } from "./lookups";
import { normaliseIncident } from "../services/safety";
import { toMillis, formatDuration } from "@/lib/safety/time";

/**
 * Response targets by severity (minutes to acknowledge, hours to resolve).
 * Operational defaults for the console; a critical incident must be picked up
 * within 15 minutes and closed out within a day.
 */
export const INCIDENT_SLA: Record<IncidentSeverity, { acknowledgeMins: number; resolveHours: number }> = {
  critical: { acknowledgeMins: 15, resolveHours: 24 },
  high: { acknowledgeMins: 60, resolveHours: 72 },
  medium: { acknowledgeMins: 240, resolveHours: 168 },
  low: { acknowledgeMins: 1440, resolveHours: 336 },
};

export type IncidentSlaState = {
  phase: "acknowledge" | "resolve" | "met" | "unknown";
  overdue: boolean;
  dueAt?: string;
  label: string;
};

const OPEN = (status?: string) => status !== "resolved" && status !== "closed";

/** Where the incident stands against its response targets at `now`. */
export function incidentSla(raw: Incident, now: number = Date.now()): IncidentSlaState {
  const i = normaliseIncident(raw);
  const sev = (i.severity ?? "medium") as IncidentSeverity;
  const start = toMillis(i.reportedAt ?? i.createdAt);
  if (!Number.isFinite(start)) return { phase: "unknown", overdue: false, label: "No timestamp" };
  if (!OPEN(i.status)) {
    const done = toMillis(i.resolvedAt ?? i.closedAt);
    const target = start + INCIDENT_SLA[sev].resolveHours * 3600000;
    return { phase: "met", overdue: Number.isFinite(done) && done > target, label: Number.isFinite(done) && done > target ? "Resolved late" : "Resolved" };
  }
  const needsAck = i.status === "reported";
  const due = needsAck ? start + INCIDENT_SLA[sev].acknowledgeMins * 60000 : start + INCIDENT_SLA[sev].resolveHours * 3600000;
  const mins = (due - now) / 60000;
  const what = needsAck ? "Acknowledge" : "Resolve";
  return {
    phase: needsAck ? "acknowledge" : "resolve",
    overdue: mins < 0,
    dueAt: new Date(due).toISOString(),
    label: mins < 0 ? `${what} overdue ${formatDuration(-mins)}` : `${what} within ${formatDuration(mins)}`,
  };
}

export function incidentAgeMinutes(raw: Incident, now: number = Date.now()): number | undefined {
  const t = toMillis(raw.occurredAt ?? raw.reportedAt ?? raw.createdAt);
  return Number.isFinite(t) ? Math.max(0, (now - t) / 60000) : undefined;
}

export interface IncidentRow {
  id: string;
  incidentCode: string;
  category: string;
  severity: IncidentSeverity;
  status: string;
  reportedAt?: string;
  reportedByName: string;
  territoryId?: string;
  territoryName: string;
  venueName: string;
  contextLabel: string;
  investigatorName?: string;
  summary: string;
  sla: IncidentSlaState;
  ageMinutes?: number;
  evidenceCount: number;
}

const SEVERITY_RANK: Record<IncidentSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function incidentRows(state: PrototypeState, territoryId?: string, now: number = Date.now()): IncidentRow[] {
  const list = (state.incidents ?? []).map(normaliseIncident).filter((i) => !territoryId || i.territoryId === territoryId);
  return list
    .map((i) => {
      const tournament = i.tournamentId ? state.tournaments.find((t) => t.id === i.tournamentId) : undefined;
      return {
        id: i.id,
        incidentCode: i.incidentCode ?? i.id,
        category: i.category ?? "other",
        severity: (i.severity ?? "medium") as IncidentSeverity,
        status: i.status ?? "reported",
        reportedAt: i.reportedAt,
        reportedByName: operatorName(state, i.reportedBy),
        territoryId: i.territoryId,
        territoryName: i.territoryId ? territoryName(state, i.territoryId) : "—",
        venueName: i.venueId ? venueName(state, i.venueId) : "No venue linked",
        contextLabel: tournament ? tournament.name : i.sessionId ? sessionTitle(state, i.sessionId) : "No session linked",
        investigatorName: i.investigatorId ? operatorName(state, i.investigatorId) : undefined,
        summary: i.notes ?? "",
        sla: incidentSla(i, now),
        ageMinutes: incidentAgeMinutes(i, now),
        evidenceCount: (state.evidenceItems ?? []).filter((e) => e.incidentId === i.id).length,
      };
    })
    .sort((a, b) => {
      const openA = OPEN(a.status) ? 0 : 1;
      const openB = OPEN(b.status) ? 0 : 1;
      if (openA !== openB) return openA - openB;
      if (a.sla.overdue !== b.sla.overdue) return a.sla.overdue ? -1 : 1;
      if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      return (toMillis(b.reportedAt) || 0) - (toMillis(a.reportedAt) || 0);
    });
}

export function incidentDetail(state: PrototypeState, id: string, now: number = Date.now()) {
  const raw = (state.incidents ?? []).find((x) => x.id === id);
  if (!raw) return undefined;
  const i = normaliseIncident(raw);
  return {
    ...i,
    severity: (i.severity ?? "medium") as IncidentSeverity,
    status: i.status ?? "reported",
    venueName: i.venueId ? venueName(state, i.venueId) : "No venue linked",
    sessionTitle: i.sessionId ? sessionTitle(state, i.sessionId) : undefined,
    tournamentName: i.tournamentId ? state.tournaments.find((t) => t.id === i.tournamentId)?.name : undefined,
    territoryName: i.territoryId ? territoryName(state, i.territoryId) : "—",
    reportedByName: operatorName(state, i.reportedBy),
    investigatorName: i.investigatorId ? operatorName(state, i.investigatorId) : undefined,
    followUpOwnerName: i.followUpOwnerId ? operatorName(state, i.followUpOwnerId) : undefined,
    evidence: (state.evidenceItems ?? []).filter((ev) => ev.incidentId === id),
    cases: (state.moderationCases ?? []).filter((c) => c.relatedIncidentIds?.includes(id)),
    exceptions: (state.refundExceptions ?? []).filter((re) => re.incidentId === id),
    sla: incidentSla(i, now),
  };
}

export function safetyCommandMetrics(state: PrototypeState, territoryId?: string, now: number = Date.now()) {
  const list = (state.incidents ?? []).map(normaliseIncident).filter((i) => !territoryId || i.territoryId === territoryId);
  const open = list.filter((i) => OPEN(i.status));
  return {
    openIncidents: open.length,
    criticalActive: open.filter((i) => i.severity === "critical" || i.severity === "high").length,
    awaitingTriage: open.filter((i) => ["reported", "acknowledged", "active"].includes(i.status ?? "")).length,
    slaBreaches: open.filter((i) => incidentSla(i, now).overdue).length,
    totalIncidents: list.length,
  };
}

/** Incidents with a follow-up owner whose due date has passed and that are still open. */
export function overdueFollowUps(state: PrototypeState, territoryId?: string, now: number = Date.now()): Incident[] {
  return (state.incidents ?? [])
    .map(normaliseIncident)
    .filter((i) => (!territoryId || i.territoryId === territoryId) && i.followUpOwnerId && OPEN(i.status))
    .filter((i) => {
      const due = toMillis(i.followUpDueAt);
      return Number.isFinite(due) && due < now;
    });
}
