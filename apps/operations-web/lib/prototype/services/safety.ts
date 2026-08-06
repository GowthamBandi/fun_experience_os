import type { PrototypeState } from "../scenarios/state";
import type {
  Incident,
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  EvidenceItem,
  EvidenceType,
  EvidenceSensitivity,
  EvidenceStatus
} from "../entities";
import { uid, nextId, pushAudit, pushSignal } from "./helpers";

/** 1. Report Incident */
export function reportIncident(
  state: PrototypeState,
  params: {
    category: IncidentCategory;
    severity: IncidentSeverity;
    sessionId?: string;
    tournamentId?: string;
    matchId?: string;
    territoryId?: string;
    cityId?: string;
    venueId?: string;
    notes: string;
    immediateAction: string;
    medicalAssistance: boolean;
    reportedBy: string;
    participantTemporaryIds?: string[];
  },
  operatorId: string = "op-master"
): PrototypeState {
  const incidents = state.incidents ?? [];
  const id = nextId("i", incidents.map((i) => i.id));
  const incidentCode = `INC-${(params.territoryId ?? "SYS").substring(0, 3).toUpperCase()}-${String(incidents.length + 1).padStart(3, "0")}`;

  const newIncident: Incident = {
    id,
    incidentCode,
    sessionId: params.sessionId,
    tournamentId: params.tournamentId,
    matchId: params.matchId,
    territoryId: params.territoryId,
    cityId: params.cityId,
    venueId: params.venueId,
    category: params.category,
    severity: params.severity,
    status: "reported",
    reportedBy: params.reportedBy,
    reportedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    occurredAt: new Date().toISOString(),
    participantTemporaryIds: params.participantTemporaryIds ?? [],
    staffIds: [operatorId],
    immediateAction: params.immediateAction,
    medicalAssistance: params.medicalAssistance,
    venueEscalated: false,
    evidenceItemIds: [],
    notes: params.notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    /* deprecated compat */
    reporterId: params.reportedBy,
    type: params.category,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    peopleInvolved: params.participantTemporaryIds ?? [],
    escalatedToVenue: false,
    ownerId: operatorId
  };

  let next = {
    ...state,
    incidents: [...incidents, newIncident]
  };

  next = pushAudit(next, {
    action: "Incident Reported",
    description: `Reported safety incident ${incidentCode} (Category: ${params.category}, Severity: ${params.severity})`,
    operatorId,
    sessionId: params.sessionId
  });

  next = pushSignal(next, {
    kind: "alert",
    message: `Safety incident reported: ${incidentCode}`,
    sessionId: params.sessionId
  });

  return next;
}

/** 2. Acknowledge Incident */
export function acknowledgeIncident(
  state: PrototypeState,
  incidentId: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    incidents: state.incidents.map((i) =>
      i.id === incidentId
        ? { ...i, status: "acknowledged" as IncidentStatus, updatedAt: new Date().toISOString() }
        : i
    )
  };

  next = pushAudit(next, {
    action: "Incident Acknowledged",
    description: `Acknowledged incident ${incidentId}`,
    operatorId
  });

  return next;
}

/** 3. Triage Incident */
export function triageIncident(
  state: PrototypeState,
  params: {
    incidentId: string;
    triageSeverityReview: string;
    triageImmediateRisk: string;
    triageVenueImpact: string;
    triageSessionImpact: string;
    triageProtectionActions: string;
    triageRecommendation: string;
  },
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    incidents: state.incidents.map((i) =>
      i.id === params.incidentId
        ? {
            ...i,
            status: "triaged" as IncidentStatus,
            triageSeverityReview: params.triageSeverityReview,
            triageImmediateRisk: params.triageImmediateRisk,
            triageVenueImpact: params.triageVenueImpact,
            triageSessionImpact: params.triageSessionImpact,
            triageProtectionActions: params.triageProtectionActions,
            triageRecommendation: params.triageRecommendation,
            updatedAt: new Date().toISOString()
          }
        : i
    )
  };

  next = pushAudit(next, {
    action: "Incident Triaged",
    description: `Triaged incident ${params.incidentId}. Recommendation: ${params.triageRecommendation}`,
    operatorId
  });

  return next;
}

/** 4. Assign Investigator */
export function assignInvestigator(
  state: PrototypeState,
  incidentId: string,
  investigatorId: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    incidents: state.incidents.map((i) =>
      i.id === incidentId
        ? {
            ...i,
            status: "investigating" as IncidentStatus,
            investigatorId,
            updatedAt: new Date().toISOString()
          }
        : i
    )
  };

  next = pushAudit(next, {
    action: "Investigator Assigned",
    description: `Assigned investigator ${investigatorId} to incident ${incidentId}`,
    operatorId
  });

  return next;
}

/** 5. Escalate Incident */
export function escalateIncident(
  state: PrototypeState,
  incidentId: string,
  reason: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    incidents: state.incidents.map((i) =>
      i.id === incidentId
        ? {
            ...i,
            status: "escalated" as IncidentStatus,
            venueEscalated: true,
            notes: i.notes + `\nEscalation notes (${new Date().toISOString()}): ${reason}`,
            updatedAt: new Date().toISOString(),
            escalatedToVenue: true // deprecated compat
          }
        : i
    )
  };

  next = pushAudit(next, {
    action: "Incident Escalated",
    description: `Escalated incident ${incidentId} to venue management. Reason: ${reason}`,
    operatorId
  });

  next = pushSignal(next, {
    kind: "alert",
    message: `CRITICAL: Safety incident escalated: ${incidentId}`
  });

  return next;
}

/** 6. Update Investigation */
export function updateInvestigation(
  state: PrototypeState,
  incidentId: string,
  summary: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    incidents: state.incidents.map((i) =>
      i.id === incidentId
        ? {
            ...i,
            investigationSummary: summary,
            updatedAt: new Date().toISOString()
          }
        : i
    )
  };

  next = pushAudit(next, {
    action: "Incident Investigation Updated",
    description: `Updated investigation summary for incident ${incidentId}`,
    operatorId
  });

  return next;
}

/** 7. Resolve Incident */
export function resolveIncident(
  state: PrototypeState,
  incidentId: string,
  resolution: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    incidents: state.incidents.map((i) =>
      i.id === incidentId
        ? {
            ...i,
            status: "resolved" as IncidentStatus,
            resolution,
            updatedAt: new Date().toISOString()
          }
        : i
    )
  };

  next = pushAudit(next, {
    action: "Incident Resolved",
    description: `Resolved incident ${incidentId}. Resolution: ${resolution}`,
    operatorId
  });

  return next;
}

/** 8. Close Incident */
export function closeIncident(
  state: PrototypeState,
  incidentId: string,
  notes: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    incidents: state.incidents.map((i) =>
      i.id === incidentId
        ? {
            ...i,
            status: "closed" as IncidentStatus,
            closedAt: new Date().toISOString(),
            closedBy: operatorId,
            notes: i.notes + `\nClosure notes: ${notes}`,
            updatedAt: new Date().toISOString()
          }
        : i
    )
  };

  next = pushAudit(next, {
    action: "Incident Closed",
    description: `Closed incident ${incidentId}`,
    operatorId
  });

  return next;
}

/** 9. Add Evidence Placeholder */
export function addEvidencePlaceholder(
  state: PrototypeState,
  params: {
    incidentId: string;
    type: EvidenceType;
    label: string;
    description?: string;
    placeholderFileName?: string;
    sensitivity: EvidenceSensitivity;
  },
  operatorId: string = "op-master"
): PrototypeState {
  const evidenceItems = state.evidenceItems ?? [];
  const id = nextId("ev", evidenceItems.map((e) => e.id));

  const newItem: EvidenceItem = {
    id,
    incidentId: params.incidentId,
    type: params.type,
    label: params.label,
    description: params.description,
    placeholderFileName: params.placeholderFileName,
    capturedBy: operatorId,
    capturedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    sensitivity: params.sensitivity,
    status: "collected",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  let next = {
    ...state,
    evidenceItems: [...evidenceItems, newItem],
    incidents: state.incidents.map((i) =>
      i.id === params.incidentId
        ? {
            ...i,
            evidenceItemIds: [...(i.evidenceItemIds ?? []), id],
            updatedAt: new Date().toISOString()
          }
        : i
    )
  };

  next = pushAudit(next, {
    action: "Evidence Added",
    description: `Added evidence "${params.label}" (${id}) to incident ${params.incidentId}`,
    operatorId
  });

  return next;
}

/** 10. Create Follow Up */
export function createFollowUp(
  state: PrototypeState,
  incidentId: string,
  followUpOwnerId: string,
  dueAt: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    incidents: state.incidents.map((i) =>
      i.id === incidentId
        ? {
            ...i,
            followUpOwnerId,
            followUpDueAt: dueAt,
            updatedAt: new Date().toISOString(),
            ownerId: followUpOwnerId // deprecated compat
          }
        : i
    )
  };

  next = pushAudit(next, {
    action: "Follow Up Assigned",
    description: `Assigned follow-up for incident ${incidentId} to ${followUpOwnerId}, due ${dueAt}`,
    operatorId
  });

  return next;
}
