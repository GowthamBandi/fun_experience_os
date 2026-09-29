import { describe, it, expect } from "vitest";
import { getInitialState } from "../scenarios/initial";
import { applyScenario } from "../scenarios/definitions";
import { migrateState } from "../migrations";
import type { PrototypeState } from "../scenarios/state";
import type { Incident } from "../entities";
import {
  reportIncident,
  acknowledgeIncident,
  triageIncident,
  assignInvestigator,
  escalateIncident,
  resolveIncident,
  closeIncident,
  addEvidenceRecord,
  updateEvidenceStatus,
  createFollowUp,
  normaliseIncident,
  migrateLegacyIncidents,
} from "./safety";
import { submitDispute, assignDisputeReviewer, requestDisputeEvidence, decideDispute, closeDispute } from "./disputes";
import {
  createModerationCase,
  proposeModerationAction,
  approveModerationAction,
  rejectModerationAction,
  revokeModerationAction,
  evaluateSubjectEligibility,
} from "./moderation";
import { incidentSla } from "../selectors/safety";

const OWNER = "op-1";
const SUPER = "op-2";
const OPS = "op-5"; // ops-manager, hvd-central
const COORD = "op-7"; // coordinator, hvd-central
const SUPPORT = "op-8";
const SAFETY = "op-9"; // Priya Menon
const FINANCE = "op-10"; // Ishaan Gupta

function ok<T extends { state: PrototypeState; error?: string }>(r: T): PrototypeState {
  expect(r.error).toBeUndefined();
  return r.state;
}
const incident = (s: PrototypeState, id: string) => s.incidents.find((i) => i.id === id)!;

describe("incident service enforces the permission matrix", () => {
  it("the safety officer can take an incident from report to close", () => {
    let s = getInitialState();
    const r = reportIncident(s, { category: "injury", severity: "high", notes: "Player twisted an ankle on court 2", immediateAction: "Ice pack applied", sessionId: "s-2" }, COORD);
    s = ok(r);
    const id = r.id!;
    expect(incident(s, id).reportedBy).toBe(COORD);
    expect(incident(s, id).territoryId).toBe("hvd-central");
    expect(incident(s, id).incidentCode).toMatch(/^INC-HVD-\d{3}$/);
    s = ok(acknowledgeIncident(s, id, SAFETY));
    s = ok(triageIncident(s, { incidentId: id, severity: "medium", immediateRisk: "Low risk of recurrence", recommendation: "Check court surface before next session" }, SAFETY));
    expect(incident(s, id).severity).toBe("medium");
    s = ok(assignInvestigator(s, id, SAFETY, SAFETY));
    s = ok(escalateIncident(s, id, "Venue floor needs repair before reuse", SAFETY));
    s = ok(resolveIncident(s, id, "Floor patched by the venue; participant recovered", SAFETY));
    s = ok(closeIncident(s, id, "", SAFETY));
    expect(incident(s, id).status).toBe("closed");
    expect(incident(s, id).closedBy).toBe(SAFETY);
  });

  it("finance and support cannot handle incidents; support can report", () => {
    const s = getInitialState();
    expect(acknowledgeIncident(s, "i-6", FINANCE).error).toMatch(/Only a/);
    expect(triageIncident(s, { incidentId: "i-6", severity: "critical", immediateRisk: "Head injury", recommendation: "Escalate to venue medical" }, SUPPORT).error).toMatch(/Only a/);
    expect(reportIncident(s, { category: "other", severity: "low", notes: "Customer reported a loose railing", sessionId: "s-2" }, SUPPORT).error).toBeUndefined();
    expect(reportIncident(s, { category: "other", severity: "low", notes: "Customer reported a loose railing", sessionId: "s-2" }, FINANCE).error).toMatch(/Only a/);
  });

  it("chain roles only act inside their own territory", () => {
    const s = getInitialState();
    // i-2 is in Mumbai West; Ravi (ops-manager) is Hyderabad Central.
    expect(triageIncident(s, { incidentId: "i-2", severity: "low", immediateRisk: "none", recommendation: "Monitor the queue" }, OPS).error).toMatch(/own territory/);
    expect(acknowledgeIncident(s, "i-6", OPS).error).toBeUndefined();
    // Coordinators cannot close incidents anywhere.
    expect(closeIncident(s, "i-4", "", COORD).error).toMatch(/Only a/);
  });

  it("validates the lifecycle and required reasons", () => {
    const s = getInitialState();
    expect(acknowledgeIncident(s, "i-1", SAFETY).error).toMatch(/already been acknowledged/);
    expect(resolveIncident(s, "i-6", "Resolved at the venue with the medical team", SAFETY).error).toMatch(/Triage/);
    expect(escalateIncident(s, "i-6", "short", SAFETY).error).toMatch(/at least 10/);
    expect(closeIncident(s, "i-5", "", SAFETY).error).toMatch(/Only a resolved/);
    expect(reportIncident(s, { category: "injury", severity: "critical", notes: "Head injury on pitch 1", sessionId: "s-1" }, COORD).error).toMatch(/immediate action/);
    expect(assignInvestigator(s, "i-5", FINANCE, SAFETY).error).toMatch(/can't run investigations/);
  });

  it("evidence: attach needs permission, closure waits for pending evidence", () => {
    let s = getInitialState();
    expect(addEvidenceRecord(s, { incidentId: "i-6", type: "staff-note", label: "Coordinator notes", sensitivity: "medium" }, FINANCE).error).toMatch(/Only a/);
    expect(addEvidenceRecord(s, { incidentId: "i-3", type: "staff-note", label: "Late note", sensitivity: "low" }, SAFETY).error).toMatch(/closed incident/);
    const added = addEvidenceRecord(s, { incidentId: "i-6", type: "staff-note", label: "Coordinator notes", sensitivity: "medium" }, COORD);
    s = ok(added);
    expect(s.incidents.find((i) => i.id === "i-6")?.evidenceItemIds).toContain(added.id);
    // i-6 has pending evidence ev-7 and ev-8; resolve then try to close.
    s = ok(triageIncident(s, { incidentId: "i-6", severity: "critical", immediateRisk: "Possible concussion", recommendation: "Hand over to venue medical team" }, SAFETY));
    s = ok(resolveIncident(s, "i-6", "Participant assessed by venue medics and sent home with family", SAFETY));
    expect(closeIncident(s, "i-6", "", SAFETY).error).toMatch(/pending collection/);
    s = ok(updateEvidenceStatus(s, "ev-7", "collected", SAFETY));
    s = ok(updateEvidenceStatus(s, "ev-8", "archived", SAFETY));
    expect(closeIncident(s, "i-6", "", SAFETY).error).toBeUndefined();
  });

  it("follow-ups need an active operator and a valid date", () => {
    const s = getInitialState();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    expect(createFollowUp(s, "i-5", "nobody", tomorrow, SAFETY).error).toMatch(/active operator/);
    expect(createFollowUp(s, "i-5", OPS, "someday", SAFETY).error).toMatch(/due date/);
    expect(createFollowUp(s, "i-5", OPS, tomorrow, COORD).error).toMatch(/Only a/);
    expect(createFollowUp(s, "i-5", OPS, tomorrow, SAFETY).error).toBeUndefined();
  });

  it("SLA flags an unacknowledged critical incident after 15 minutes", () => {
    const now = Date.now();
    const i: Incident = { id: "x", severity: "critical", status: "reported", reportedAt: new Date(now - 20 * 60000).toISOString() };
    expect(incidentSla(i, now).overdue).toBe(true);
    expect(incidentSla({ ...i, reportedAt: new Date(now - 5 * 60000).toISOString() }, now).overdue).toBe(false);
  });
});

describe("incident data normalisation", () => {
  const legacy: Incident = {
    id: "i-legacy",
    sessionId: "s-1",
    territoryId: "hvd-central",
    reporterId: "op-7",
    type: "Participant injury",
    severity: "high",
    time: "Just now",
    peopleInvolved: ["CR-06"],
    escalatedToVenue: true,
    status: "escalated",
    ownerId: "op-4",
  };

  it("maps deprecated fields to canonical ones and drops them", () => {
    const n = normaliseIncident(legacy);
    expect(n).toMatchObject({ category: "injury", reportedBy: "op-7", participantTemporaryIds: ["CR-06"], venueEscalated: true, followUpOwnerId: "op-4", reportedAt: "Just now" });
    for (const k of ["reporterId", "type", "time", "peopleInvolved", "escalatedToVenue", "ownerId"]) expect(k in n).toBe(false);
  });

  it("migration is idempotent", () => {
    const s = { ...getInitialState(), incidents: [legacy] };
    const once = migrateLegacyIncidents(s);
    const twice = migrateLegacyIncidents(once);
    expect(twice.incidents).toEqual(once.incidents);
    expect(twice).toBe(once);
  });

  it("seed and the Safety Incident scenario only use canonical fields", () => {
    const s = applyScenario("Safety Incident", migrateState(getInitialState()));
    for (const i of s.incidents) {
      for (const k of ["reporterId", "type", "time", "peopleInvolved", "escalatedToVenue", "ownerId"]) expect(k in i).toBe(false);
      expect(i.category && i.severity && i.status && i.reportedBy).toBeTruthy();
    }
    expect(s.incidents.find((i) => i.id === "i-si-1")?.reportedBy).toBe("op-7");
  });
});

describe("dispute service", () => {
  it("supports partially upheld decisions end to end", () => {
    let s = getInitialState();
    const r = submitDispute(s, { type: "match-result", reason: "Score in game two was recorded wrongly", submittedBy: "Backline (captain)", relatedEntityType: "tournament-match", relatedEntityId: "m-3", tournamentId: "tr-2", matchId: "m-3" }, SUPPORT);
    s = ok(r);
    const id = r.id!;
    expect(decideDispute(s, { disputeId: id, outcome: "partially-upheld", decision: "Game two replayed", decisionReason: "Referee confirmed one miscounted point" }, SAFETY).error).toMatch(/Assign a reviewer/);
    expect(assignDisputeReviewer(s, id, FINANCE, SAFETY).error).toMatch(/can't decide disputes/);
    s = ok(assignDisputeReviewer(s, id, SAFETY, SAFETY));
    s = ok(requestDisputeEvidence(s, id, "Scorecard photo from the referee", SAFETY));
    expect(closeDispute(s, id, SAFETY).error).toMatch(/Record a decision/);
    expect(decideDispute(s, { disputeId: id, outcome: "partially-upheld", decision: "Game two replayed", decisionReason: "Referee confirmed one miscounted point" }, SUPPORT).error).toMatch(/Only a/);
    s = ok(decideDispute(s, { disputeId: id, outcome: "partially-upheld", decision: "Game two replayed", decisionReason: "Referee confirmed one miscounted point" }, SAFETY));
    expect(s.disputes.find((d) => d.id === id)?.status).toBe("partially-upheld");
    s = ok(closeDispute(s, id, SAFETY));
    expect(s.disputes.find((d) => d.id === id)?.status).toBe("closed");
  });

  it("finance cannot log disputes; short reasons are refused", () => {
    const s = getInitialState();
    const input = { type: "other" as const, reason: "Too short", submittedBy: "Customer", relatedEntityType: "session", relatedEntityId: "s-2", sessionId: "s-2" };
    expect(submitDispute(s, input, FINANCE).error).toMatch(/Only a/);
    expect(submitDispute(s, input, SUPPORT).error).toMatch(/at least 10/);
  });
});

describe("moderation service", () => {
  const day = 86400000;
  const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);

  it("safety proposes and approves a warning; a permanent ban needs an owner", () => {
    let s = getInitialState();
    s = ok(approveModerationAction(s, "mod-act-1", SAFETY));
    expect(s.moderationActions.find((a) => a.id === "mod-act-1")?.status).toBe("active");

    const c = createModerationCase(s, { subjectTemporaryId: "CR-99", category: "harassment", severity: "critical", originType: "incident", originId: "i-1", notes: "Harassed staff member at check-in desk" }, SAFETY);
    s = ok(c);
    const p = proposeModerationAction(s, { caseId: c.id!, type: "permanent-ban", reason: "Repeated harassment of staff after warnings", scope: "platform", effectiveDate: iso(0) }, SAFETY);
    s = ok(p);
    expect(approveModerationAction(s, p.id!, SAFETY).error).toBe("Only a Platform Owner or Super Admin can approve permanent platform bans.");
    s = ok(approveModerationAction(s, p.id!, SUPER));
    expect(evaluateSubjectEligibility(s, "CR-99", {}).isEligible).toBe(false);
    expect(revokeModerationAction(s, p.id!, "Appeal upheld by the owner", SAFETY).error).toMatch(/Only a/);
    s = ok(revokeModerationAction(s, p.id!, "Appeal upheld by the owner", OWNER));
    expect(evaluateSubjectEligibility(s, "CR-99", {}).isEligible).toBe(true);
  });

  it("suspensions need a second approver", () => {
    let s = getInitialState();
    const c = createModerationCase(s, { subjectTemporaryId: "CR-50", category: "misconduct", severity: "high", originType: "incident", originId: "i-1", notes: "Threw a bat after being given out" }, SAFETY);
    s = ok(c);
    const p = proposeModerationAction(s, { caseId: c.id!, type: "temporary-suspension", reason: "Dangerous conduct with equipment", scope: "territory", scopeEntityId: "hvd-central", effectiveDate: iso(0), expiryDate: iso(7) }, SAFETY);
    s = ok(p);
    expect(approveModerationAction(s, p.id!, SAFETY).error).toMatch(/second person/);
    expect(approveModerationAction(s, p.id!, SUPER).error).toBeUndefined();
  });

  it("proposal validation: expiry required and after the effective date; one pending proposal per case", () => {
    const s = getInitialState();
    const c = createModerationCase(s, { subjectTemporaryId: "CR-51", category: "misconduct", severity: "medium", originType: "incident", originId: "i-1", notes: "Verbal abuse towards another player" }, SAFETY);
    const s1 = ok(c);
    const base = { caseId: c.id!, type: "temporary-suspension" as const, reason: "Verbal abuse during play", scope: "platform" as const, effectiveDate: iso(0) };
    expect(proposeModerationAction(s1, base, SAFETY).error).toMatch(/expires/);
    expect(proposeModerationAction(s1, { ...base, expiryDate: iso(-1) }, SAFETY).error).toMatch(/after the effective date/);
    expect(proposeModerationAction(s1, { ...base, type: "permanent-ban", scope: "territory", scopeEntityId: "hvd-central" }, SAFETY).error).toMatch(/whole platform/);
    expect(proposeModerationAction(s1, base, OPS).error).toMatch(/Only a/);
    const s2 = ok(proposeModerationAction(s1, { ...base, expiryDate: iso(3) }, SAFETY));
    expect(proposeModerationAction(s2, { ...base, type: "formal-warning" }, SAFETY).error).toMatch(/already has a proposal/);
  });

  it("rejecting requires a reason and a permitted role", () => {
    const s = getInitialState();
    expect(rejectModerationAction(s, "mod-act-2", "Evidence is thin", FINANCE).error).toMatch(/Only a/);
    expect(rejectModerationAction(s, "mod-act-2", "thin", SAFETY).error).toMatch(/at least 10/);
    const r = ok(rejectModerationAction(s, "mod-act-2", "Evidence does not support a suspension yet", SAFETY));
    expect(r.moderationActions.find((a) => a.id === "mod-act-2")?.status).toBe("rejected");
    expect(r.moderationCases.find((c) => c.id === "mod-case-2")?.status).toBe("reviewing");
  });

  it("expired suspensions and restrictions no longer block the subject", () => {
    const s = getInitialState();
    // Seed mod-act-4 suspended CR-17 platform-wide but expired six days ago.
    expect(evaluateSubjectEligibility(s, "CR-17", { territoryId: "hvd-central" }).isEligible).toBe(true);
    const now = Date.now();
    const act = { id: "a", caseId: "c", type: "venue-restriction" as const, subjectTemporaryId: "CR-60", reason: "Damaged venue property", scope: "venue" as const, scopeEntityId: "v-1", status: "active" as const, createdBy: SAFETY, createdAt: "", updatedAt: "" };
    const active = { ...s, moderationActions: [{ ...act, effectiveDate: new Date(now - 2 * day).toISOString(), expiryDate: new Date(now + day).toISOString() }] };
    expect(evaluateSubjectEligibility(active, "CR-60", { venueId: "v-1" }).isEligible).toBe(false);
    expect(evaluateSubjectEligibility(active, "CR-60", { venueId: "v-2" }).isEligible).toBe(true);
    const expired = { ...s, moderationActions: [{ ...act, effectiveDate: new Date(now - 5 * day).toISOString(), expiryDate: new Date(now - day).toISOString() }] };
    expect(evaluateSubjectEligibility(expired, "CR-60", { venueId: "v-1" }).isEligible).toBe(true);
    const future = { ...s, moderationActions: [{ ...act, effectiveDate: new Date(now + day).toISOString(), expiryDate: new Date(now + 5 * day).toISOString() }] };
    expect(evaluateSubjectEligibility(future, "CR-60", { venueId: "v-1" }).isEligible).toBe(true);
    // A suspension scoped to a territory does not block elsewhere.
    const susp = { ...s, moderationActions: [{ ...act, type: "temporary-suspension" as const, scope: "territory" as const, scopeEntityId: "hvd-central", effectiveDate: new Date(now - day).toISOString(), expiryDate: new Date(now + day).toISOString() }] };
    expect(evaluateSubjectEligibility(susp, "CR-60", { territoryId: "hvd-central" }).isEligible).toBe(false);
    expect(evaluateSubjectEligibility(susp, "CR-60", { territoryId: "blr-south" }).isEligible).toBe(true);
  });
});
