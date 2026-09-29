import { describe, it, expect } from "vitest";
import { getInitialState } from "./scenarios/initial";
import type { PrototypeState } from "./scenarios/state";
import type { CrewMember, OperatorAccount } from "./entities";
import {
  selectLiveSessionState,
  selectElapsedActiveSeconds,
  selectCurrentActivitySegment,
  selectEquipmentReadiness,
  selectLiveSessionActionAvailability,
} from "./selectors/liveSession";
import { selectSessionSegmentResults } from "./selectors/results";
import { selectCompletionChecklist, selectSessionSummary } from "./selectors/completion";
import { resolveSessionPerson, selectStaffReadiness } from "./selectors/checkIn";
import {
  openSession,
  startLiveSession,
  pauseLiveSession,
  resumeLiveSession,
  enterEmergencyMode,
  exitEmergencyMode,
  endLiveSession,
  startActivitySegment,
  completeActivitySegment,
  createDraftResult,
  confirmResult,
  correctResult,
  updateEquipmentStatus,
  completeLiveSession,
} from "./services/liveSession";
import { validateEmergencyRolePermission } from "./validators/liveSessionValidation";

const sessionId = "s-1";
const OVERRIDE = "Opened by duty manager for test";

/** A lead coordinator who exists both as a crew member and as a console operator (linked by name). */
function withLead(base: PrototypeState, ref: "crew" | "operator"): PrototypeState {
  const crew: CrewMember = { id: "c-lead-test", territoryId: "hvd-central", venueId: "v-3", name: "Test Lead", role: "coordinator", status: "assigned", assignment: "Lead" };
  const op: OperatorAccount = { id: "op-lead-test", name: "Test Lead", title: "Coordinator", role: "coordinator", territoryId: "hvd-central", initials: "TL", status: "active" };
  const other: OperatorAccount = { id: "op-other-test", name: "Other Coordinator", title: "Coordinator", role: "coordinator", territoryId: "hvd-central", initials: "OC", status: "active" };
  return {
    ...base,
    crew: [...base.crew, crew],
    operators: [...base.operators, op, other],
    sessions: base.sessions.map((s) => (s.id === sessionId ? { ...s, leadCoordinatorId: ref === "crew" ? crew.id : op.id } : s)),
  };
}

function live(state: PrototypeState = getInitialState()): PrototypeState {
  const res = startLiveSession(state, sessionId, OVERRIDE);
  expect(res.error).toBeUndefined();
  return res.state;
}

describe("Live session clock and state machine", () => {
  it("never double-counts active time across pause and resume", () => {
    let state = getInitialState();
    expect(selectLiveSessionState(state, sessionId).status).toBe("Ready");

    state = live(state);
    let lss = selectLiveSessionState(state, sessionId);
    expect(lss.status).toBe("Live");
    expect(lss.activeStartedAt).toBeDefined();

    state = pauseLiveSession(state, sessionId, "Court maintenance hold").state;
    lss = selectLiveSessionState(state, sessionId);
    expect(lss.status).toBe("Paused");
    expect(lss.activeStartedAt).toBeUndefined();
    expect(lss.pauseReason).toBe("Court maintenance hold");

    state = resumeLiveSession(state, sessionId).state;
    expect(selectLiveSessionState(state, sessionId).status).toBe("Live");

    const start = new Date(selectLiveSessionState(state, sessionId).activeStartedAt!).getTime();
    expect(selectElapsedActiveSeconds(state, sessionId, start + 90_000)).toBe((lss.accumulatedActiveSeconds ?? 0) + 90);
  });

  it("start from Paused is refused (resume is the only way back to Live)", () => {
    let state = live();
    state = pauseLiveSession(state, sessionId, "Short hold").state;
    const res = startLiveSession(state, sessionId);
    expect(res.error).toMatch(/Resume/);
  });

  it("emergency exit returns to Paused, not Live, and records a safety note", () => {
    let state = live();
    const enter = enterEmergencyMode(state, {
      sessionId,
      reason: "Participant medical evaluation",
      immediateAction: "First aid dispatched",
      safetyContactConfirmed: true,
      operatorId: "op-2",
      operatorRole: "super-admin",
    });
    expect(enter.error).toBeUndefined();
    state = enter.state;
    expect(selectLiveSessionState(state, sessionId).status).toBe("Emergency");
    expect(state.liveOperationalNotes.some((n) => n.sessionId === sessionId && n.type === "safety" && n.severity === "critical")).toBe(true);

    const exit = exitEmergencyMode(state, { sessionId, exitReason: "First aid cleared participant", operatorId: "op-2", operatorRole: "super-admin" });
    expect(exit.error).toBeUndefined();
    const lss = selectLiveSessionState(exit.state, sessionId);
    expect(lss.status).toBe("Paused");
    expect(lss.emergencyMode).toBe(false);
  });
});

describe("Emergency control permission (BLOCKER-006)", () => {
  it("allows owner, super admin, safety and ops manager by role id; denies display names and other roles", () => {
    const state = getInitialState();
    for (const role of ["platform-owner", "super-admin", "safety", "ops-manager"]) {
      expect(validateEmergencyRolePermission(state, sessionId, "op-any", role).isValid).toBe(true);
    }
    // Display names are not role ids and must not grant access.
    expect(validateEmergencyRolePermission(state, sessionId, "op-any", "Super Admin").isValid).toBe(false);
    for (const role of ["finance", "marketing", "venue-manager", "analyst", "support", "coordinator", "staff"]) {
      expect(validateEmergencyRolePermission(state, sessionId, "op-not-lead", role).isValid).toBe(false);
    }
  });

  it("allows the session's lead coordinator whether the session stores a crew id or an operator id", () => {
    for (const ref of ["crew", "operator"] as const) {
      const state = withLead(getInitialState(), ref);
      expect(validateEmergencyRolePermission(state, sessionId, "op-lead-test", "coordinator").isValid).toBe(true);
      expect(validateEmergencyRolePermission(state, sessionId, "op-other-test", "coordinator").isValid).toBe(false);
    }
  });

  it("lets every permitted actor enter and exit emergency mode end to end", () => {
    const actors: Array<[string, string]> = [
      ["op-1", "platform-owner"],
      ["op-2", "super-admin"],
      ["op-9", "safety"],
      ["op-5", "ops-manager"],
      ["op-lead-test", "coordinator"],
    ];
    for (const [operatorId, operatorRole] of actors) {
      let state = live(withLead(getInitialState(), "crew"));
      const enter = enterEmergencyMode(state, { sessionId, reason: "Crowd surge at gate", immediateAction: "Play stopped", safetyContactConfirmed: true, operatorId, operatorRole });
      expect(enter.error, `${operatorRole} enter`).toBeUndefined();
      state = enter.state;
      const exit = exitEmergencyMode(state, { sessionId, exitReason: "Gate cleared by security", operatorId, operatorRole });
      expect(exit.error, `${operatorRole} exit`).toBeUndefined();
      expect(selectLiveSessionState(exit.state, sessionId).status).toBe("Paused");
    }

    const denied = enterEmergencyMode(live(withLead(getInitialState(), "crew")), {
      sessionId,
      reason: "Crowd surge at gate",
      immediateAction: "Play stopped",
      safetyContactConfirmed: true,
      operatorId: "op-other-test",
      operatorRole: "coordinator",
    });
    expect(denied.error).toMatch(/lead coordinator/);
  });
});

describe("Staff resolution (crew id or legacy operator id)", () => {
  it("resolves both references to the same person and reads crew check-in status", () => {
    const viaCrew = withLead(getInitialState(), "crew");
    const viaOp = withLead(getInitialState(), "operator");
    const a = resolveSessionPerson(viaCrew, "c-lead-test");
    const b = resolveSessionPerson(viaOp, "op-lead-test");
    expect(a?.crewId).toBe("c-lead-test");
    expect(b?.crewId).toBe("c-lead-test");
    expect(a?.operatorId).toBe("op-lead-test");
    expect(b?.operatorId).toBe("op-lead-test");
    expect(selectStaffReadiness(viaOp, sessionId).leadCoordinator?.name).toBe("Test Lead");

    const checked = { ...viaOp, crew: viaOp.crew.map((c) => (c.id === "c-lead-test" ? { ...c, status: "checked-in" as const } : c)) };
    expect(selectStaffReadiness(checked, sessionId).isLeadPresent).toBe(true);
  });
});

describe("Opening a session (validateSessionOpenReadiness)", () => {
  it("blocks opening when handover checks fail, unless an override reason is given", () => {
    const state = getInitialState();
    const blocked = openSession(state, sessionId);
    expect(blocked.error).toMatch(/Not ready to open/);
    expect(selectLiveSessionState(blocked.state, sessionId).status).toBe("Ready");

    const short = openSession(state, sessionId, "ok");
    expect(short.error).toMatch(/at least/);

    const ok = openSession(state, sessionId, OVERRIDE);
    expect(ok.error).toBeUndefined();
    expect(selectLiveSessionState(ok.state, sessionId).status).toBe("Opening");
    expect(ok.state.audits[0].description).toContain(OVERRIDE);
  });

  it("never opens a cancelled session or one missing critical equipment, even with an override", () => {
    const base = getInitialState();
    const cancelled = { ...base, sessions: base.sessions.map((s) => (s.id === sessionId ? { ...s, status: "cancelled" as const } : s)) };
    expect(openSession(cancelled, sessionId, OVERRIDE).error).toMatch(/cancelled/);

    const item = selectEquipmentReadiness(base, sessionId).items.find((e) => e.isCritical)!;
    const missing = updateEquipmentStatus(base, { sessionId, equipmentId: item.id, status: "missing", missingCount: 1, returnedCount: item.returnedCount - 1 }).state;
    expect(openSession(missing, sessionId, OVERRIDE).error).toMatch(/Critical equipment/);
  });
});

describe("Ending a session (BLOCKER: Ending vs Ended)", () => {
  it("moves Live → Ending → Ended, banks the clock and closes open steps", () => {
    let state = live();
    state = startActivitySegment(state, sessionId, "seg-s1-1").state;
    const res = endLiveSession(state, sessionId);
    expect(res.error).toBeUndefined();
    const lss = selectLiveSessionState(res.state, sessionId);
    expect(lss.status).toBe("Ended");
    expect(lss.endedAt).toBeDefined();
    expect(lss.activeStartedAt).toBeUndefined();
    expect(res.state.activitySegments.find((s) => s.id === "seg-s1-1")?.status).toBe("Completed");
    expect(res.state.audits[0].description).toContain("Ending");
  });

  it("refuses to end a session that never started or is in an emergency", () => {
    expect(endLiveSession(getInitialState(), sessionId).error).toBeDefined();
    const emergency = enterEmergencyMode(live(), { sessionId, reason: "Injury on court", immediateAction: "First aid", safetyContactConfirmed: true, operatorId: "op-2", operatorRole: "super-admin" }).state;
    expect(endLiveSession(emergency, sessionId).error).toMatch(/emergency/);
  });
});

describe("Run of show and results", () => {
  it("enforces one active step and needs the clock running", () => {
    let state = getInitialState();
    expect(startActivitySegment(state, sessionId, "seg-s1-1").error).toMatch(/clock/);

    state = live(state);
    state = startActivitySegment(state, sessionId, "seg-s1-1").state;
    expect(selectCurrentActivitySegment(state, sessionId)?.id).toBe("seg-s1-1");

    const second = startActivitySegment(state, sessionId, "seg-s1-2");
    expect(second.error).toContain("Only one segment may be active at a time");

    state = completeActivitySegment(state, sessionId, "seg-s1-1").state;
    const ok = startActivitySegment(state, sessionId, "seg-s1-2");
    expect(ok.error).toBeUndefined();
    expect(selectCurrentActivitySegment(ok.state, sessionId)?.id).toBe("seg-s1-2");
  });

  it("rejects negative scores and keeps an audited revision history", () => {
    let state = live();
    const teams = state.teams.filter((t) => t.sessionId === sessionId).map((t) => t.id);
    state = startActivitySegment(state, sessionId, "seg-s1-3").state;
    state = completeActivitySegment(state, sessionId, "seg-s1-3").state;

    const neg = createDraftResult(state, { sessionId, segmentId: "seg-s1-3", resultType: "score", teamScores: [{ teamId: teams[0], score: -5 }, { teamId: teams[1], score: 10 }] });
    expect(neg.error).toContain("Score values cannot be negative");

    const draft = createDraftResult(state, { sessionId, segmentId: "seg-s1-3", resultType: "score", teamScores: [{ teamId: teams[0], score: 12 }, { teamId: teams[1], score: 8 }], winnerTeamId: teams[0] });
    expect(draft.error).toBeUndefined();
    state = confirmResult(draft.state, sessionId, "seg-s1-3").state;
    expect(selectSessionSegmentResults(state, sessionId).find((r) => r.segmentId === "seg-s1-3")?.status).toBe("Confirmed");

    const corrected = correctResult(state, {
      sessionId,
      segmentId: "seg-s1-3",
      resultType: "score",
      teamScores: [{ teamId: teams[0], score: 12 }, { teamId: teams[1], score: 10 }],
      winnerTeamId: teams[0],
      reason: "Scorecard recount verified Team B scored 10 points",
      operatorId: "op-2",
    });
    expect(corrected.error).toBeUndefined();
    const r = selectSessionSegmentResults(corrected.state, sessionId).find((x) => x.segmentId === "seg-s1-3");
    expect(r?.status).toBe("Corrected");
    expect(r?.revisions.length).toBe(2);
    expect(r?.revisions[1].reason).toBe("Scorecard recount verified Team B scored 10 points");
  });

  it("refuses results for steps that have not run", () => {
    const state = live();
    const teams = state.teams.filter((t) => t.sessionId === sessionId).map((t) => t.id);
    const res = createDraftResult(state, { sessionId, segmentId: "seg-s1-5", resultType: "score", teamScores: [{ teamId: teams[0], score: 1 }, { teamId: teams[1], score: 0 }] });
    expect(res.error).toMatch(/not started/);
  });
});

describe("Equipment", () => {
  it("marks readiness false when a critical item goes missing and validates counts", () => {
    const state = getInitialState();
    const item = selectEquipmentReadiness(state, sessionId).items.find((e) => e.isCritical)!;
    const bad = updateEquipmentStatus(state, { sessionId, equipmentId: item.id, returnedCount: item.issuedCount, missingCount: 1 });
    expect(bad.error).toMatch(/cannot exceed issued/);
    const res = updateEquipmentStatus(state, { sessionId, equipmentId: item.id, status: "missing", missingCount: 1, returnedCount: item.issuedCount - 1 });
    expect(res.error).toBeUndefined();
    expect(selectEquipmentReadiness(res.state, sessionId).isReady).toBe(false);
  });
});

describe("Completion", () => {
  it("requires the session to have ended, then completes with an override and writes a snapshot", () => {
    let state = getInitialState();
    const early = completeLiveSession(state, sessionId, "Venue cleared and verified by lead", "op-2");
    expect(early.error).toMatch(/End the session/);

    state = live(state);
    state = endLiveSession(state, sessionId).state;
    expect(selectCompletionChecklist(state, sessionId).items.find((i) => i.key === "session-ended")?.status).toBe("passed");

    const done = completeLiveSession(state, sessionId, "Venue cleared and verified by lead", "op-2", "One ball lost in the car park.");
    expect(done.error).toBeUndefined();
    expect(selectLiveSessionState(done.state, sessionId).status).toBe("Completed");

    const summary = selectSessionSummary(done.state, sessionId);
    expect(summary.snapshot?.closingNote).toBe("One ball lost in the car park.");
    expect(summary.isCompleted).toBe(true);

    const avail = selectLiveSessionActionAvailability(done.state, sessionId);
    expect(avail.isReadOnly).toBe(true);
    expect(avail.canOpen).toBe(false);
    expect(avail.canEmergency).toBe(false);
  });
});
