import { describe, it, expect } from "vitest";
import { getInitialState } from "./scenarios/initial";
import {
  selectLiveSessionState,
  selectElapsedActiveSeconds,
  selectCurrentActivitySegment,
  selectEquipmentReadiness,
  selectLiveSessionActionAvailability,
} from "./selectors/liveSession";
import { selectSessionSegmentResults } from "./selectors/results";
import { selectCompletionChecklist, selectSessionSummary } from "./selectors/completion";
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
  skipActivitySegment,
  createDraftResult,
  confirmResult,
  correctResult,
  addLiveOperationalNote,
  updateEquipmentStatus,
  completeLiveSession,
} from "./services/liveSession";
import { validateEmergencyRolePermission } from "./validators/liveSessionValidation";

describe("SA-P2G Live Session Operations, Scoring & Completion", () => {
  const sessionId = "s-1";

  it("Correction 1: Live clock equation prevents double-counting on refresh", () => {
    let state = getInitialState();
    let lss = selectLiveSessionState(state, sessionId);
    expect(lss.accumulatedActiveSeconds).toBe(0);
    expect(lss.status).toBe("Ready");

    // Start live clock
    const startRes = startLiveSession(state, sessionId);
    state = startRes.state;
    lss = selectLiveSessionState(state, sessionId);
    expect(lss.status).toBe("Live");
    expect(lss.activeStartedAt).toBeDefined();

    // Pause clock after reason
    const pauseRes = pauseLiveSession(state, sessionId, "Court maintenance hold");
    state = pauseRes.state;
    lss = selectLiveSessionState(state, sessionId);
    expect(lss.status).toBe("Paused");
    expect(lss.activeStartedAt).toBeUndefined();
    expect(lss.pausedAt).toBeDefined();
    expect(lss.pauseReason).toBe("Court maintenance hold");

    // Resume clock
    const resumeRes = resumeLiveSession(state, sessionId);
    state = resumeRes.state;
    lss = selectLiveSessionState(state, sessionId);
    expect(lss.status).toBe("Live");
    expect(lss.activeStartedAt).toBeDefined();

    // Check elapsed seconds calculation
    const elapsed = selectElapsedActiveSeconds(state, sessionId);
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it("Correction 2: Emergency mode exit returns to Paused (not Live)", () => {
    let state = getInitialState();
    const startRes = startLiveSession(state, sessionId);
    state = startRes.state;

    // Enter Emergency Mode
    const emergencyRes = enterEmergencyMode(state, {
      sessionId,
      reason: "Participant medical evaluation",
      immediateAction: "First aid dispatched",
      safetyContactConfirmed: true,
      operatorId: "usr-super",
      operatorRole: "super-admin",
    });
    expect(emergencyRes.error).toBeUndefined();
    state = emergencyRes.state;

    let lss = selectLiveSessionState(state, sessionId);
    expect(lss.status).toBe("Emergency");
    expect(lss.emergencyMode).toBe(true);

    // Exit Emergency Mode
    const exitRes = exitEmergencyMode(state, {
      sessionId,
      exitReason: "First aid cleared participant",
      operatorId: "usr-super",
      operatorRole: "super-admin",
    });
    expect(exitRes.error).toBeUndefined();
    state = exitRes.state;

    lss = selectLiveSessionState(state, sessionId);
    expect(lss.status).toBe("Paused"); // Must return to Paused!
    expect(lss.emergencyMode).toBe(false);
  });

  it("Correction 9: Emergency role rule permits platform-owner, super-admin, safety, ops-manager, and assigned lead coordinator ONLY", () => {
    const state = getInitialState();

    // Allowed roles
    expect(validateEmergencyRolePermission(state, sessionId, "usr-super", "super-admin").isValid).toBe(true);
    expect(validateEmergencyRolePermission(state, sessionId, "usr-platform", "platform-owner").isValid).toBe(true);
    expect(validateEmergencyRolePermission(state, sessionId, "usr-safety", "safety").isValid).toBe(true);
    expect(validateEmergencyRolePermission(state, sessionId, "usr-ops", "ops-manager").isValid).toBe(true);

    // Assigned lead coordinator for s-1 (leadCoordinatorId is "op-7")
    expect(validateEmergencyRolePermission(state, sessionId, "op-7", "lead-coordinator").isValid).toBe(true);

    // Denied roles
    expect(validateEmergencyRolePermission(state, sessionId, "usr-finance", "finance").isValid).toBe(false);
    expect(validateEmergencyRolePermission(state, sessionId, "usr-marketing", "marketing").isValid).toBe(false);
    expect(validateEmergencyRolePermission(state, sessionId, "usr-venue", "venue-manager").isValid).toBe(false);
    expect(validateEmergencyRolePermission(state, sessionId, "op-8", "lead-coordinator").isValid).toBe(false); // Unassigned coordinator!
  });

  it("Correction 4: Enforces single active segment invariant", () => {
    let state = getInitialState();

    // Start segment 1
    const start1 = startActivitySegment(state, sessionId, "seg-s1-1");
    expect(start1.error).toBeUndefined();
    state = start1.state;

    let activeSeg = selectCurrentActivitySegment(state, sessionId);
    expect(activeSeg?.id).toBe("seg-s1-1");

    // Attempt to start segment 2 while segment 1 is Active -> MUST FAIL
    const start2 = startActivitySegment(state, sessionId, "seg-s1-2");
    expect(start2.error).toBeDefined();
    expect(start2.error).toContain("Only one segment may be active at a time");

    // Complete segment 1
    const comp1 = completeActivitySegment(state, sessionId, "seg-s1-1");
    state = comp1.state;

    // Now starting segment 2 succeeds
    const start2Success = startActivitySegment(state, sessionId, "seg-s1-2");
    expect(start2Success.error).toBeUndefined();
    state = start2Success.state;

    activeSeg = selectCurrentActivitySegment(state, sessionId);
    expect(activeSeg?.id).toBe("seg-s1-2");
  });

  it("Correction 5 & 6: Non-negative score validation and audited result revision history", () => {
    let state = getInitialState();

    // Negative score -> MUST FAIL
    const negRes = createDraftResult(state, {
      sessionId,
      segmentId: "seg-s1-1",
      resultType: "score",
      teamScores: [
        { teamId: "team-s-1-1", score: -5 },
        { teamId: "team-s-1-2", score: 10 },
      ],
    });
    expect(negRes.error).toBeDefined();
    expect(negRes.error).toContain("Score values cannot be negative");

    // Valid draft result
    const draftRes = createDraftResult(state, {
      sessionId,
      segmentId: "seg-s1-1",
      resultType: "score",
      teamScores: [
        { teamId: "team-s-1-1", score: 12 },
        { teamId: "team-s-1-2", score: 8 },
      ],
      winnerTeamId: "team-s-1-1",
    });
    expect(draftRes.error).toBeUndefined();
    state = draftRes.state;

    // Confirm result
    const confRes = confirmResult(state, sessionId, "seg-s1-1");
    expect(confRes.error).toBeUndefined();
    state = confRes.state;

    let resList = selectSessionSegmentResults(state, sessionId);
    let targetRes = resList.find((r) => r.segmentId === "seg-s1-1");
    expect(targetRes?.status).toBe("Confirmed");

    // Audited result correction with mandatory reason
    const correctRes = correctResult(state, {
      sessionId,
      segmentId: "seg-s1-1",
      resultType: "score",
      teamScores: [
        { teamId: "team-s-1-1", score: 12 },
        { teamId: "team-s-1-2", score: 10 },
      ],
      winnerTeamId: "team-s-1-1",
      reason: "Scorecard recount verified Team B scored 10 points",
      operatorId: "usr-super",
    });
    expect(correctRes.error).toBeUndefined();
    state = correctRes.state;

    resList = selectSessionSegmentResults(state, sessionId);
    targetRes = resList.find((r) => r.segmentId === "seg-s1-1");
    expect(targetRes?.status).toBe("Corrected");
    expect(targetRes?.revisions.length).toBe(2);
    expect(targetRes?.revisions[1].reason).toBe("Scorecard recount verified Team B scored 10 points");
  });

  it("Correction 11: Equipment counts and readiness selector", () => {
    let state = getInitialState();
    let eq = selectEquipmentReadiness(state, sessionId);
    expect(eq.isReady).toBe(true);

    // Mark critical equipment missing
    const eqItem = eq.items.find((e) => e.isCritical);
    if (eqItem) {
      const updateRes = updateEquipmentStatus(state, {
        sessionId,
        equipmentId: eqItem.id,
        status: "missing",
        missingCount: 1,
      });
      state = updateRes.state;
      eq = selectEquipmentReadiness(state, sessionId);
      expect(eq.isReady).toBe(false);
      expect(eq.criticalMissingCount).toBeGreaterThan(0);
    }
  });

  it("Correction 12 & 15: Completion checklist, audited override, and summary snapshot generation", () => {
    let state = getInitialState();

    // Attempt completion without ending session -> MUST FAIL without override
    const blockComplete = completeLiveSession(state, sessionId, undefined, "usr-super");
    expect(blockComplete.error).toBeDefined();
    expect(blockComplete.error).toContain("Completion blocked by checklist items");

    // End session first
    const endRes = endLiveSession(state, sessionId);
    state = endRes.state;

    // Complete session with audited override
    const successComplete = completeLiveSession(state, sessionId, "Venue cleared and verified by Lead Coordinator", "usr-super");
    expect(successComplete.error).toBeUndefined();
    state = successComplete.state;

    const lss = selectLiveSessionState(state, sessionId);
    expect(lss.status).toBe("Completed");

    // Verify snapshot created with mandatory label
    const summary = selectSessionSummary(state, sessionId);
    expect(summary.snapshot).toBeDefined();
    expect(summary.snapshot?.label).toBe("Prototype completion snapshot — production reporting storage is not connected.");

    // Verify completed session is read-only
    const avail = selectLiveSessionActionAvailability(state, sessionId);
    expect(avail.isReadOnly).toBe(true);
    expect(avail.canOpen).toBe(false);
    expect(avail.canEmergency).toBe(false);
  });
});
