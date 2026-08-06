import type { PrototypeState } from "../scenarios/state";
import type { Incident, IncidentCategory, IncidentSeverity, IncidentStatus } from "../entities";

export function validateIncidentReport(
  params: {
    category: IncidentCategory;
    severity: IncidentSeverity;
    notes: string;
    reportedBy: string;
  }
): { isValid: boolean; error?: string } {
  if (!params.category) return { isValid: false, error: "Incident category is required." };
  if (!params.severity) return { isValid: false, error: "Incident severity is required." };
  if (!params.notes || params.notes.trim().length < 5) {
    return { isValid: false, error: "Detailed incident notes are required (at least 5 characters)." };
  }
  if (!params.reportedBy) return { isValid: false, error: "Reporter identity is required." };
  return { isValid: true };
}

export function validateIncidentClosure(
  state: PrototypeState,
  incident: Incident
): { isValid: boolean; error?: string } {
  if (incident.severity === "critical" && (!incident.resolution || incident.resolution.trim().length < 10)) {
    return { isValid: false, error: "Critical incidents cannot be closed without a comprehensive resolution summary (at least 10 characters)." };
  }
  return { isValid: true };
}
