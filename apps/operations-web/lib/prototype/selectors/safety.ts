import type { PrototypeState } from "../scenarios/state";
import type { Incident } from "../entities";
import { venueName, sessionTitle } from "./lookups";

export interface IncidentRow {
  id: string;
  incidentCode: string;
  category: string;
  severity: string;
  status: string;
  reportedAt: string;
  venueName: string;
  sessionTitle: string;
  investigatorId?: string;
  immediateAction: string;
}

export function incidentRows(state: PrototypeState, territoryId?: string): IncidentRow[] {
  const list = territoryId ? state.incidents.filter((i) => i.territoryId === territoryId) : state.incidents;
  return list.map((i) => ({
    id: i.id,
    incidentCode: i.incidentCode || i.id,
    category: i.category || i.type || "other",
    severity: i.severity || "medium",
    status: i.status || "reported",
    reportedAt: i.reportedAt || i.time || "—",
    venueName: i.venueId ? venueName(state, i.venueId) : "No linked venue",
    sessionTitle: i.sessionId ? sessionTitle(state, i.sessionId) : "No linked session",
    investigatorId: i.investigatorId,
    immediateAction: i.immediateAction || "—"
  }));
}

export function incidentDetail(state: PrototypeState, id: string) {
  const i = state.incidents.find((x) => x.id === id);
  if (!i) return undefined;
  const evidence = (state.evidenceItems ?? []).filter((ev) => ev.incidentId === id);
  const cases = (state.moderationCases ?? []).filter((c) => c.relatedIncidentIds?.includes(id));
  const exceptions = (state.refundExceptions ?? []).filter((re) => re.incidentId === id);
  
  return {
    ...i,
    category: i.category || i.type || "other",
    severity: i.severity || "medium",
    status: i.status || "reported",
    reportedAt: i.reportedAt || i.time || "—",
    venueName: i.venueId ? venueName(state, i.venueId) : "No linked venue",
    sessionTitle: i.sessionId ? sessionTitle(state, i.sessionId) : "No linked session",
    evidence,
    cases,
    exceptions
  };
}

export function incidentTriageQueue(state: PrototypeState, territoryId?: string): Incident[] {
  const list = territoryId ? state.incidents.filter((i) => i.territoryId === territoryId) : state.incidents;
  return list.filter((i) => i.status === "reported" || i.status === "acknowledged");
}

export function criticalActiveIncidents(state: PrototypeState, territoryId?: string): Incident[] {
  const list = territoryId ? state.incidents.filter((i) => i.territoryId === territoryId) : state.incidents;
  return list.filter(
    (i) => i.severity === "critical" && i.status !== "resolved" && i.status !== "closed"
  );
}

export function overdueFollowUps(state: PrototypeState, territoryId?: string): Incident[] {
  const list = territoryId ? state.incidents.filter((i) => i.territoryId === territoryId) : state.incidents;
  // In a real database we would parse date. In prototype, any incident with a follow-up date is listed
  return list.filter((i) => i.followUpOwnerId && i.status !== "resolved" && i.status !== "closed");
}

export function venueIncidentHistory(state: PrototypeState, venueId: string): Incident[] {
  return state.incidents.filter((i) => i.venueId === venueId);
}

export function safetyCommandMetrics(state: PrototypeState, territoryId?: string) {
  const list = territoryId ? state.incidents.filter((i) => i.territoryId === territoryId) : state.incidents;
  const criticalActive = list.filter((i) => i.severity === "critical" && i.status !== "resolved" && i.status !== "closed").length;
  const activeIncidentsCount = list.filter((i) => i.status !== "resolved" && i.status !== "closed").length;
  const triageQueueCount = list.filter((i) => i.status === "reported" || i.status === "acknowledged").length;

  return {
    criticalActive,
    activeIncidentsCount,
    triageQueueCount,
    totalIncidents: list.length
  };
}
