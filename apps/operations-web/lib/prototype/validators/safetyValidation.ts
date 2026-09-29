import type { PrototypeState } from "../scenarios/state";
import type { Incident, IncidentCategory, IncidentSeverity, IncidentStatus } from "../entities";

type Validation = { isValid: boolean; error?: string };
const ok: Validation = { isValid: true };
const fail = (error: string): Validation => ({ isValid: false, error });

export const INCIDENT_CATEGORIES: IncidentCategory[] = [
  "injury", "medical", "misconduct", "harassment", "safeguarding", "equipment", "venue", "weather", "crowd", "staff", "participant", "other",
];
export const INCIDENT_SEVERITIES: IncidentSeverity[] = ["low", "medium", "high", "critical"];
export const OPEN_INCIDENT_STATUSES: IncidentStatus[] = ["reported", "acknowledged", "active", "triaged", "investigating", "escalated", "monitoring"];

export function validateIncidentReport(params: {
  category: IncidentCategory;
  severity: IncidentSeverity;
  notes: string;
  immediateAction?: string;
  reportedBy: string;
}): Validation {
  if (!params.category || !INCIDENT_CATEGORIES.includes(params.category)) return fail("Choose what kind of incident this is.");
  if (!params.severity || !INCIDENT_SEVERITIES.includes(params.severity)) return fail("Choose the incident severity.");
  if (!params.notes || params.notes.trim().length < 10) return fail("Describe what happened (at least 10 characters).");
  if ((params.severity === "high" || params.severity === "critical") && (!params.immediateAction || params.immediateAction.trim().length < 5)) {
    return fail("For high and critical incidents, record the immediate action taken.");
  }
  if (!params.reportedBy) return fail("The reporting operator is required.");
  return ok;
}

export function validateIncidentOpen(incident: Incident): Validation {
  const status = incident.status ?? "reported";
  if (status === "closed") return fail("This incident is closed.");
  return ok;
}

export function validateIncidentTriage(incident: Incident, params: { immediateRisk: string; recommendation: string }): Validation {
  const status = incident.status ?? "reported";
  if (!["reported", "acknowledged", "active"].includes(status)) return fail("This incident has already been triaged.");
  if (!params.immediateRisk || params.immediateRisk.trim().length < 5) return fail("Describe the immediate risk (at least 5 characters).");
  if (!params.recommendation || params.recommendation.trim().length < 10) return fail("Record the triage recommendation (at least 10 characters).");
  return ok;
}

export function validateIncidentResolution(incident: Incident, resolution: string): Validation {
  const status = incident.status ?? "reported";
  if (["reported", "acknowledged", "active"].includes(status)) return fail("Triage the incident before resolving it.");
  if (status === "resolved" || status === "closed") return fail(`This incident is already ${status}.`);
  const min = incident.severity === "critical" || incident.severity === "high" ? 20 : 10;
  if (!resolution || resolution.trim().length < min) return fail(`Write the resolution summary (at least ${min} characters for ${incident.severity ?? "this"} severity).`);
  return ok;
}

export function validateIncidentClosure(state: PrototypeState, incident: Incident): Validation {
  if ((incident.status ?? "reported") !== "resolved") return fail("Only a resolved incident can be closed.");
  if (incident.severity === "critical" && (!incident.resolution || incident.resolution.trim().length < 10)) {
    return fail("Critical incidents cannot be closed without a comprehensive resolution summary (at least 10 characters).");
  }
  const pending = (state.evidenceItems ?? []).filter((e) => e.incidentId === incident.id && e.status === "pending");
  if (pending.length) return fail(`${pending.length} evidence item${pending.length === 1 ? " is" : "s are"} still pending collection. Collect or archive them before closing.`);
  return ok;
}
