import type { PrototypeState } from "../scenarios/state";
import { calculateRevealReadiness } from "../selectors/reveal";
import { selectLiveSessionState } from "../selectors/liveSession";
import { pushAudit, pushSignal } from "./helpers";

type Result = { state: PrototypeState; error?: string };
const MIN_REASON = 5;
const REVEALED_STATES = new Set(["revealed", "check-in-open", "live"]);

/**
 * Reveal teams and codes to participants. Blockers can be overridden with an
 * audited reason; a cancelled/completed session or a repeat reveal cannot.
 */
export function triggerReveal(state: PrototypeState, sessionId: string, overrideReason?: string, operatorId: string = "system"): Result {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return { state, error: "Session not found." };
  if (REVEALED_STATES.has(session.status)) return { state, error: "The reveal has already happened for this session." };
  if (session.status === "cancelled" || session.status === "completed" || session.status === "archived") {
    return { state, error: `The session is ${session.status}; it cannot be revealed.` };
  }

  const readiness = calculateRevealReadiness(state, sessionId);
  const override = overrideReason?.trim() ?? "";
  if (!readiness.isReadyToReveal) {
    if (!override) return { state, error: `Reveal blocked: ${readiness.criticalBlockers.join(" ")} Give an override reason to reveal anyway.` };
    if (override.length < MIN_REASON) return { state, error: `The override reason must be at least ${MIN_REASON} characters.` };
  }

  const now = new Date().toISOString();
  let next: PrototypeState = {
    ...state,
    sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, status: "revealed" as const, statusBeforeReveal: s.status } : s)),
    temporaryIdentities: (state.temporaryIdentities ?? []).map((t) =>
      t.sessionId === sessionId && (t.status === "locked" || t.status === "generated") ? { ...t, status: "revealed" as const, revealedAt: now, updatedAt: now } : t,
    ),
    teams: (state.teams ?? []).map((t) => (t.sessionId === sessionId ? { ...t, status: "revealed" as const, revealedAt: now, updatedAt: now } : t)),
  };

  next = pushAudit(next, {
    sessionId,
    action: "trigger-reveal",
    operatorId,
    description: !readiness.isReadyToReveal
      ? `Revealed with override (${readiness.criticalBlockers.length} blocker(s)). Reason: ${override}`
      : `Revealed teams and codes for session ${sessionId}.`,
  });
  next = pushSignal(next, { kind: "system", sessionId, message: `Reveal sent for session ${sessionId}` });
  return { state: next };
}

/** Move a scheduled reveal. Not possible once the reveal has happened. */
export function delayReveal(state: PrototypeState, sessionId: string, newRevealTime: string, reason: string, operatorId: string = "system"): Result {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return { state, error: "Session not found." };
  if (REVEALED_STATES.has(session.status) || session.status === "completed") return { state, error: "The reveal has already happened; it cannot be rescheduled." };
  if (!newRevealTime?.trim()) return { state, error: "Choose the new reveal time." };
  if (!reason || reason.trim().length < MIN_REASON) return { state, error: `Give a reason (at least ${MIN_REASON} characters) for rescheduling.` };

  let next: PrototypeState = { ...state, sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, revealAt: newRevealTime.trim() } : s)) };
  next = pushAudit(next, {
    sessionId,
    action: "delay-reveal",
    operatorId,
    description: `Reveal moved from ${session.revealAt} to ${newRevealTime.trim()}. Reason: ${reason.trim()}`,
  });
  return { state: next };
}

/**
 * Undo a reveal: the session returns to its pre-reveal status and identities
 * and teams return to locked. Refused if the session was never revealed or the
 * live session has already been opened.
 */
export function cancelReveal(state: PrototypeState, sessionId: string, reason: string, operatorId: string = "system"): Result {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return { state, error: "Session not found." };
  if (!REVEALED_STATES.has(session.status)) {
    return { state, error: "This session has not been revealed, so there is nothing to cancel. To move a scheduled reveal, reschedule it instead." };
  }
  const lss = selectLiveSessionState(state, sessionId);
  if (session.status === "live" || lss.status !== "Ready") {
    return { state, error: "The session has already been opened for live operations; the reveal can no longer be cancelled." };
  }
  if (!reason || reason.trim().length < MIN_REASON) return { state, error: `Give a reason (at least ${MIN_REASON} characters) for cancelling the reveal.` };

  const restored = session.statusBeforeReveal && !REVEALED_STATES.has(session.statusBeforeReveal) ? session.statusBeforeReveal : "booking-closed";
  const now = new Date().toISOString();
  let next: PrototypeState = {
    ...state,
    sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, status: restored, statusBeforeReveal: undefined } : s)),
    temporaryIdentities: (state.temporaryIdentities ?? []).map((t) =>
      t.sessionId === sessionId && t.status === "revealed" ? { ...t, status: "locked" as const, revealedAt: undefined, updatedAt: now } : t,
    ),
    teams: (state.teams ?? []).map((t) => (t.sessionId === sessionId && t.status === "revealed" ? { ...t, status: "locked" as const, revealedAt: undefined, updatedAt: now } : t)),
  };

  next = pushAudit(next, {
    sessionId,
    action: "cancel-reveal",
    operatorId,
    description: `Reveal cancelled; session returned to '${restored}', identities and teams locked again. Reason: ${reason.trim()}`,
  });
  next = pushSignal(next, { kind: "alert", sessionId, message: `Reveal cancelled for session ${sessionId}` });
  return { state: next };
}
