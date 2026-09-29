import { describe, it, expect } from "vitest";
import { getInitialState } from "./scenarios/initial";
import type { PrototypeState } from "./scenarios/state";
import { allocateTeamsRandomly, createTeams, lockTeams, moveTeamParticipant, swapTeamParticipants, unlockTeamsWithOverride } from "./services/teams";
import { cancelReveal, delayReveal, triggerReveal } from "./services/reveal";
import { createCheckInRecords, updateCheckInStatus } from "./services/checkIn";
import { createIdentityPattern, generateTemporaryIdentities, lockTemporaryIdentities, revokeTemporaryIdentity } from "./services/identity";
import { closeEmergencyIdentityAccess, requestEmergencyIdentityAccess } from "./services/emergencyAccess";
import { startLiveSession } from "./services/liveSession";
import { selectSessionParticipantPool, selectActiveEmergencyAccess, EMERGENCY_ACCESS_MINUTES } from "./selectors/identity";
import { selectCheckInSummary } from "./selectors/checkIn";
import { selectPostRevealPreview, selectPreRevealPreview } from "./selectors/reveal";
import { validatePatternSafety } from "./validators/identityValidation";
import { migrateState } from "./migrations";

/** A fresh session with confirmed bookings and no teams, identities or check-ins. */
function blankSession(): { state: PrototypeState; sessionId: string } {
  const base = getInitialState();
  const sessionId = "s-2";
  return {
    sessionId,
    state: {
      ...base,
      teams: base.teams.filter((t) => t.sessionId !== sessionId),
      teamAssignments: base.teamAssignments.filter((t) => t.sessionId !== sessionId),
      temporaryIdentities: base.temporaryIdentities.filter((t) => t.sessionId !== sessionId),
      checkInRecords: base.checkInRecords.filter((c) => c.sessionId !== sessionId),
    },
  };
}

const eligibleCount = (state: PrototypeState, sessionId: string) => selectSessionParticipantPool(state, sessionId).filter((p) => p.isEligible).length;

describe("Team allocation", () => {
  it("persists the teams it auto-creates so every assignment points at a real team", () => {
    const { state, sessionId } = blankSession();
    expect(state.teams.filter((t) => t.sessionId === sessionId)).toHaveLength(0);

    const res = allocateTeamsRandomly(state, sessionId, "op-2");
    expect(res.error).toBeUndefined();
    const teams = res.state.teams.filter((t) => t.sessionId === sessionId);
    const active = res.state.teamAssignments.filter((ta) => ta.sessionId === sessionId && ta.status === "active");
    expect(teams).toHaveLength(2);
    expect(active).toHaveLength(eligibleCount(state, sessionId));
    const teamIds = new Set(teams.map((t) => t.id));
    expect(active.every((ta) => teamIds.has(ta.teamId))).toBe(true);
    expect(teams.every((t) => t.status === "allocated")).toBe(true);
  });

  it("keeps assignment history when re-allocating and never exceeds team capacity", () => {
    const { state, sessionId } = blankSession();
    let next = createTeams(state, sessionId, 3, 6, "op-2").state;
    next = allocateTeamsRandomly(next, sessionId, "op-2", () => 0.3).state;
    const firstRound = next.teamAssignments.filter((ta) => ta.sessionId === sessionId).length;
    next = allocateTeamsRandomly(next, sessionId, "op-2", () => 0.7).state;
    const all = next.teamAssignments.filter((ta) => ta.sessionId === sessionId);
    expect(all.length).toBe(firstRound * 2);
    expect(all.filter((ta) => ta.status === "active")).toHaveLength(firstRound);
    for (const t of next.teams.filter((x) => x.sessionId === sessionId)) {
      expect(all.filter((ta) => ta.status === "active" && ta.teamId === t.id).length).toBeLessThanOrEqual(t.capacity);
    }
  });

  it("refuses teams too small for the confirmed pool", () => {
    const { state, sessionId } = blankSession();
    expect(createTeams(state, sessionId, 2, 1).error).toMatch(/seat only/);
  });

  it("swaps two members of full teams and blocks changes once locked", () => {
    const { state, sessionId } = blankSession();
    const n = eligibleCount(state, sessionId);
    let next = createTeams(state, sessionId, 2, Math.ceil(n / 2)).state;
    next = allocateTeamsRandomly(next, sessionId, "op-2").state;
    const active = next.teamAssignments.filter((ta) => ta.sessionId === sessionId && ta.status === "active");
    const cap = Math.ceil(n / 2);
    const fullTeam = [...new Set(active.map((x) => x.teamId))].find((id) => active.filter((x) => x.teamId === id).length === cap)!;
    const b = active.find((x) => x.teamId === fullTeam)!;
    const a = active.find((x) => x.teamId !== fullTeam)!;

    // Moving into a full team is refused; swapping is allowed.
    expect(moveTeamParticipant(next, { sessionId, bookingId: a.bookingId, targetTeamId: b.teamId, reason: "Balance skill levels" }).error).toMatch(/full/);
    const swapped = swapTeamParticipants(next, { sessionId, bookingIdA: a.bookingId, bookingIdB: b.bookingId, reason: "Friends asked to split" });
    expect(swapped.error).toBeUndefined();
    const after = swapped.state.teamAssignments.filter((ta) => ta.sessionId === sessionId && ta.status === "active");
    expect(after.find((x) => x.bookingId === a.bookingId)?.teamId).toBe(b.teamId);
    expect(after.find((x) => x.bookingId === b.bookingId)?.teamId).toBe(a.teamId);

    const locked = lockTeams(swapped.state, sessionId);
    expect(locked.error).toBeUndefined();
    expect(swapTeamParticipants(locked.state, { sessionId, bookingIdA: a.bookingId, bookingIdB: b.bookingId, reason: "Friends asked to split" }).error).toMatch(/locked/);
    expect(unlockTeamsWithOverride(locked.state, sessionId, "").error).toMatch(/reason/);
    expect(unlockTeamsWithOverride(locked.state, sessionId, "Late replacement arrived").error).toBeUndefined();
  });

  it("will not lock while a confirmed participant has no team", () => {
    const { state, sessionId } = blankSession();
    const next = createTeams(state, sessionId, 2, 12).state;
    expect(lockTeams(next, sessionId).error).toMatch(/no team/);
  });
});

describe("Reveal", () => {
  function revealed() {
    const { state, sessionId } = blankSession();
    let next = generateTemporaryIdentities(state, sessionId).state;
    next = lockTemporaryIdentities(next, sessionId).state;
    next = allocateTeamsRandomly(next, sessionId, "op-2").state;
    next = lockTeams(next, sessionId).state;
    const before = next.sessions.find((s) => s.id === sessionId)!.status;
    const res = triggerReveal(next, sessionId, "Coordinator confirmed venue on site", "op-2");
    expect(res.error).toBeUndefined();
    return { state: res.state, sessionId, before };
  }

  it("cancelReveal refuses when the session has not been revealed", () => {
    const { state, sessionId } = blankSession();
    const res = cancelReveal(state, sessionId, "Venue flooded, reveal later");
    expect(res.error).toMatch(/has not been revealed/);
    expect(res.state).toBe(state);
  });

  it("cancelReveal restores the session status and re-locks identities and teams", () => {
    const { state, sessionId, before } = revealed();
    expect(state.sessions.find((s) => s.id === sessionId)?.status).toBe("revealed");
    expect(state.teams.filter((t) => t.sessionId === sessionId).every((t) => t.status === "revealed")).toBe(true);

    expect(cancelReveal(state, sessionId, "").error).toMatch(/reason/);
    const res = cancelReveal(state, sessionId, "Venue flooded, reveal moved");
    expect(res.error).toBeUndefined();
    expect(res.state.sessions.find((s) => s.id === sessionId)?.status).toBe(before);
    expect(res.state.temporaryIdentities.filter((t) => t.sessionId === sessionId).every((t) => t.status === "locked")).toBe(true);
    expect(res.state.teams.filter((t) => t.sessionId === sessionId).every((t) => t.status === "locked")).toBe(true);

    // Revealing twice is refused; rescheduling after the reveal is refused.
    expect(triggerReveal(state, sessionId, "again please").error).toMatch(/already happened/);
    expect(delayReveal(state, sessionId, "Tomorrow, 18:00", "Weather").error).toMatch(/already happened/);
  });

  it("cancelReveal is refused once the session has been opened", () => {
    const { state, sessionId } = revealed();
    const opened = startLiveSession(state, sessionId, "Opened for the cancel test").state;
    expect(cancelReveal(opened, sessionId, "Too late to cancel").error).toMatch(/opened/);
  });

  it("previews never expose contact details", () => {
    const { state, sessionId } = revealed();
    const booking = selectSessionParticipantPool(state, sessionId).find((p) => p.isEligible)!.booking;
    const serialized = JSON.stringify([selectPreRevealPreview(state, sessionId), selectPostRevealPreview(state, sessionId, booking.id)]);
    for (const forbidden of ["phone", "email", "legalName", "dateOfBirth", booking.phoneMask]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("Check-in", () => {
  it("opens check-in only after the reveal and counts undecided participants as missing", () => {
    const { state, sessionId } = blankSession();
    expect(createCheckInRecords(state, sessionId).error).toMatch(/after the reveal/);

    const revealedState = triggerReveal(state, sessionId, "Reveal for check-in test").state;
    const opened = createCheckInRecords(revealedState, sessionId);
    expect(opened.error).toBeUndefined();
    expect(opened.state.sessions.find((s) => s.id === sessionId)?.status).toBe("check-in-open");

    const n = eligibleCount(state, sessionId);
    expect(selectCheckInSummary(opened.state, sessionId).missingCount).toBe(n);

    const booking = selectSessionParticipantPool(opened.state, sessionId).find((p) => p.isEligible)!.booking;
    let next = updateCheckInStatus(opened.state, { sessionId, bookingId: booking.id, targetStatus: "no-show" }).state;
    expect(updateCheckInStatus(next, { sessionId, bookingId: booking.id, targetStatus: "checked-in" }).error).toMatch(/correction reason/);
    next = updateCheckInStatus(next, { sessionId, bookingId: booking.id, targetStatus: "checked-in", auditOverrideReason: "Arrived after roll call" }).state;
    const summary = selectCheckInSummary(next, sessionId);
    expect(summary.checkedInCount).toBe(1);
    expect(summary.missingCount).toBe(n - 1);
  });
});

describe("Temporary identities", () => {
  it("rejects unsafe or colliding patterns", () => {
    expect(validatePatternSafety({ prefix: "CR9", separator: "-", numberLength: 2 }).safe).toBe(false);
    expect(validatePatternSafety({ prefix: "NIGHT", separator: "-", numberLength: 2 }).safe).toBe(true);
    const state = getInitialState();
    expect(createIdentityPattern(state, { name: "Phone digits", prefix: "98", separator: "-" }).error).toMatch(/letters/);
    expect(createIdentityPattern(state, { name: "Copy of cricket", prefix: "cr", separator: "-" }).error).toMatch(/already used/);
    const ok = createIdentityPattern(state, { name: "Padel League", prefix: "pdl", separator: "#", numberLength: 3 });
    expect(ok.error).toBeUndefined();
    expect(ok.pattern?.example).toBe("PDL#007");
  });

  it("keeps locked codes, never duplicates them and regenerates revoked codes", () => {
    const { state, sessionId } = blankSession();
    let next = generateTemporaryIdentities(state, sessionId, "pat-cr").state;
    next = lockTemporaryIdentities(next, sessionId).state;
    const first = next.temporaryIdentities.filter((t) => t.sessionId === sessionId)[0];
    next = revokeTemporaryIdentity(next, first.id, "Code shared in public chat").state;
    expect(next.temporaryIdentities.find((t) => t.id === first.id)?.status).toBe("revoked");

    const regen = generateTemporaryIdentities(next, sessionId, "pat-cr");
    expect(regen.error).toBeUndefined();
    const ids = regen.state.temporaryIdentities.filter((t) => t.sessionId === sessionId);
    expect(ids.find((t) => t.id === first.id)?.status).toBe("generated");
    expect(new Set(ids.map((t) => t.temporaryCode)).size).toBe(ids.length);
  });
});

describe("Emergency identity access (BLOCKER-005)", () => {
  const bookingId = "b-1";
  const now = Date.parse("2026-09-29T12:00:00Z");

  it("allows only permitted roles with a real reason and records the actor", () => {
    const state = getInitialState();
    for (const role of ["finance", "marketing", "coordinator", "staff", "analyst"]) {
      expect(requestEmergencyIdentityAccess(state, { bookingId, operatorId: "op-x", operatorRole: role, reason: "Medical emergency on court 2" }).error).toBeDefined();
    }
    expect(requestEmergencyIdentityAccess(state, { bookingId, operatorId: "op-9", operatorRole: "safety", reason: "help" }).error).toMatch(/at least/);

    const res = requestEmergencyIdentityAccess(state, { bookingId, operatorId: "op-9", operatorRole: "safety", reason: "Medical emergency on court 2" }, now);
    expect(res.error).toBeUndefined();
    expect(res.accessLog?.operatorId).toBe("op-9");
    expect(res.accessLog?.operatorRole).toBe("safety");
    expect(Date.parse(res.accessLog!.expiresAt) - now).toBe(EMERGENCY_ACCESS_MINUTES * 60_000);
  });

  it("shows identity only to the requester while the grant is active", () => {
    const res = requestEmergencyIdentityAccess(getInitialState(), { bookingId, operatorId: "op-9", operatorRole: "safety", reason: "Medical emergency on court 2" }, now);
    const log = res.accessLog!;
    expect(selectActiveEmergencyAccess(res.state, bookingId, "op-9", now + 1000)?.id).toBe(log.id);
    expect(selectActiveEmergencyAccess(res.state, bookingId, "op-2", now + 1000)).toBeUndefined();
    expect(selectActiveEmergencyAccess(res.state, bookingId, "op-9", now + EMERGENCY_ACCESS_MINUTES * 60_000 + 1)).toBeUndefined();

    expect(closeEmergencyIdentityAccess(res.state, log.id, "op-5", "ops-manager", now + 1000).error).toMatch(/Only the operator/);
    const closed = closeEmergencyIdentityAccess(res.state, log.id, "op-9", "safety", now + 1000);
    expect(closed.error).toBeUndefined();
    expect(selectActiveEmergencyAccess(closed.state, bookingId, "op-9", now + 2000)).toBeUndefined();
  });
});

describe("Migrations", () => {
  it("recreates teams that orphaned assignments point at (idempotent)", () => {
    const base = getInitialState();
    const broken: PrototypeState = {
      ...base,
      teamAssignments: [
        ...base.teamAssignments,
        { id: "ta-orphan-1", sessionId: "s-2", teamId: "team-s-2-1", bookingId: "b-10", assignmentMethod: "random", assignedAt: "2026-09-29T10:00:00Z", status: "active" },
      ],
    };
    const once = migrateState(broken);
    expect(once.teams.some((t) => t.id === "team-s-2-1")).toBe(true);
    const twice = migrateState(once);
    expect(twice.teams.filter((t) => t.id === "team-s-2-1")).toHaveLength(1);
  });
});

describe("Empty workspace", () => {
  it("selectors used by the session pages do not throw when every slice is empty", async () => {
    const { getEmptyState } = await import("./scenarios/initial");
    const { calculateRevealReadiness } = await import("./selectors/reveal");
    const { selectSessionOpenReadiness, selectStaffReadiness } = await import("./selectors/checkIn");
    const { selectCompletionChecklist, selectSessionSummary } = await import("./selectors/completion");
    const { selectParticipantRows, selectParticipantProfile } = await import("./selectors/identity");
    const { selectResultsProgress } = await import("./selectors/results");
    const empty = getEmptyState();
    expect(() => {
      calculateRevealReadiness(empty, "s-1");
      selectSessionOpenReadiness(empty, "s-1");
      selectStaffReadiness(empty, "s-1");
      selectCompletionChecklist(empty, "s-1");
      selectSessionSummary(empty, "s-1");
      selectResultsProgress(empty, "s-1");
      selectParticipantRows(empty);
      selectParticipantProfile(empty, "b-1");
    }).not.toThrow();
    expect(selectParticipantProfile(empty, "b-1")).toBeNull();
  });
});
