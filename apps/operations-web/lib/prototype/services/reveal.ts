import type { PrototypeState } from "../scenarios/state";
import { calculateRevealReadiness } from "../selectors/reveal";
import { pushAudit, pushSignal } from "./helpers";

export function triggerReveal(
  state: PrototypeState,
  sessionId: string,
  overrideReason?: string,
  operatorId: string = "op-master"
): { state: PrototypeState; error?: string } {
  const readiness = calculateRevealReadiness(state, sessionId);

  if (!readiness.isReadyToReveal && (!overrideReason || !overrideReason.trim())) {
    return {
      state,
      error: `Reveal blocked: ${readiness.criticalBlockers.join("; ")}. Provide an audited override reason to proceed.`,
    };
  }

  const now = new Date().toISOString();

  // Update session status to revealed
  const sessions = state.sessions.map((s) =>
    s.id === sessionId ? { ...s, status: "revealed" as const, revealAt: now } : s
  );

  // Update identities to revealed
  const temporaryIdentities = (state.temporaryIdentities ?? []).map((t) =>
    t.sessionId === sessionId ? { ...t, status: "revealed" as const, revealedAt: now, updatedAt: now } : t
  );

  // Update teams to revealed
  const teams = (state.teams ?? []).map((t) =>
    t.sessionId === sessionId ? { ...t, status: "revealed" as const, revealedAt: now, updatedAt: now } : t
  );

  let next: PrototypeState = {
    ...state,
    sessions,
    temporaryIdentities,
    teams,
  };

  next = pushAudit(next, {
    sessionId,
    action: "trigger-reveal",
    operatorId,
    description: overrideReason
      ? `Triggered reveal with audited override: ${overrideReason}`
      : `Triggered reveal successfully for session ${sessionId}`,
  });

  next = pushSignal(next, {
    kind: "system",
    sessionId,
    message: `Reveal triggered for session ${sessionId}`,
    at: "Just now",
  });

  return { state: next };
}

export function delayReveal(
  state: PrototypeState,
  sessionId: string,
  newRevealTime: string,
  reason: string,
  operatorId: string = "op-master"
): PrototypeState {
  const sessions = state.sessions.map((s) =>
    s.id === sessionId ? { ...s, revealAt: newRevealTime } : s
  );

  let next = { ...state, sessions };

  next = pushAudit(next, {
    sessionId,
    action: "delay-reveal",
    operatorId,
    description: `Delayed reveal for session ${sessionId} to ${newRevealTime}. Reason: ${reason}`,
  });

  return next;
}

export function cancelReveal(
  state: PrototypeState,
  sessionId: string,
  reason: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = pushAudit(state, {
    sessionId,
    action: "cancel-reveal",
    operatorId,
    description: `Cancelled scheduled reveal for session ${sessionId}. Reason: ${reason}`,
  });

  return next;
}
