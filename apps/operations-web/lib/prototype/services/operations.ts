import type { SessionStatus } from "../entities";
import type { PrototypeState } from "../scenarios";
import { SEAT_STATUSES, type SeatStatus } from "../selectors";
import { pushAudit, pushSignal } from "./helpers";

function tempIdNumber(existing: string[], format: string): number {
  const marker = format.indexOf("#");
  const prefix = marker >= 0 ? format.slice(0, marker) : format;
  const nums = existing
    .filter((t) => t.startsWith(prefix))
    .map((t) => parseInt(t.replace(prefix, ""), 10) || 0);
  return Math.max(0, ...nums) + 1;
}

function nextTempId(format: string, number: number): string {
  const marker = format.indexOf("#");
  if (marker < 0) return `${format}-${number}`;
  const digits = format.split("#").length - 1;
  return format.replace(/#+/, String(number).padStart(digits, "0"));
}

/** Assign masked temporary IDs to every booking in a session missing one. */
export function generateTemporaryIds(state: PrototypeState, sessionId: string, operatorId?: string): PrototypeState {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return state;
  const template = state.templates.find((t) => t.id === session.templateId);
  const format = template?.tempIdFormat ?? "ID-##";
  const sessionBookings = state.bookings.filter((b) => b.sessionId === sessionId);
  const missing = sessionBookings.filter((b) => !b.tempId && b.status !== "cancelled");
  if (missing.length === 0) return state;

  let counter = tempIdNumber(
    sessionBookings.map((b) => b.tempId).filter((x): x is string => Boolean(x)),
    format
  );
  const ids: Record<string, string> = {};
  for (const b of missing) {
    ids[b.id] = nextTempId(format, counter);
    counter += 1;
  }

  const next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) => (ids[b.id] ? { ...b, tempId: ids[b.id] } : b))
  };
  return pushAudit(
    pushSignal(next, { kind: "system", message: `Temporary IDs generated for ${Object.keys(ids).length} participants on ${sessionId}.`, sessionId }),
    { action: "Temp IDs Generated", description: `Assigned masked temp IDs (${format}) to ${Object.keys(ids).length} bookings.`, sessionId, operatorId }
  );
}

/** Random-ish team allocation for the seated roster of a session. */
export function allocateTeams(state: PrototypeState, sessionId: string, operatorId?: string): PrototypeState {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return state;
  const template = state.templates.find((t) => t.id === session.templateId);
  const numTeams = template?.numTeams ?? Math.max(2, Math.ceil(session.maxParticipants / 6));
  const teams = Array.from({ length: numTeams }, (_, i) => `Team ${i + 1}`);

  const roster = state.bookings.filter(
    (b) => b.sessionId === sessionId && SEAT_STATUSES.has(b.status as SeatStatus)
  );
  if (roster.length === 0) return state;

  const next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b, i) => {
      const idx = roster.findIndex((r) => r.id === b.id);
      return idx >= 0 ? { ...b, team: teams[idx % numTeams] } : b;
    })
  };
  return pushAudit(
    pushSignal(next, { kind: "system", message: `Teams allocated for ${sessionId} — ${numTeams} teams, ${roster.length} participants.`, sessionId }),
    { action: "Teams Allocated", description: `Random team separator assigned ${roster.length} participants into ${numTeams} teams.`, sessionId, operatorId }
  );
}

/** Finish a session: settle pending transactions, close the status. */
export function completeSession(state: PrototypeState, sessionId: string, operatorId?: string): PrototypeState {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return state;
  const next: PrototypeState = {
    ...state,
    sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, status: "completed" as const } : s)),
    transactions: state.transactions.map((t) =>
      t.sessionId === sessionId && t.status === "pending" ? { ...t, status: "settled" as const } : t
    )
  };
  return pushAudit(
    pushSignal(next, { kind: "close", message: `${sessionId} wrapped — attendance and revenue finalized.`, sessionId }),
    { action: "Session Completed", description: `Session ${sessionId} completed; pending transactions settled.`, sessionId, operatorId }
  );
}

/** Cancel a session: cancel all bookings, queue refunds, log incident-worthy signal. */
export function cancelSession(state: PrototypeState, sessionId: string, reason: string, operatorId?: string): PrototypeState {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return state;

  const next: PrototypeState = {
    ...state,
    sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, status: "cancelled" as const } : s)),
    bookings: state.bookings.map((b) =>
      b.sessionId === sessionId && b.status !== "cancelled" ? { ...b, status: "cancelled" as const } : b
    ),
    transactions: [
      ...state.transactions,
      ...state.bookings
        .filter((b) => b.sessionId === sessionId && b.amount > 0 && (b.status === "payment-confirmed" || b.status === "checked-in"))
        .map(
          (b) =>
            ({
              id: `t-scx-${Date.now()}-${b.id}`,
              sessionId,
              territoryId: session.territoryId,
              bookingId: b.id,
              kind: "refund",
              amount: -b.amount,
              method: "card",
              status: "pending",
              at: "Just now"
            }) as const
        )
    ]
  };
  return pushAudit(
    pushSignal(next, { kind: "system", message: `Session ${sessionId} cancelled — ${reason}. Refunds queued.`, sessionId }),
    { action: "Session Cancelled", description: `Session ${sessionId} cancelled (${reason}); ${next.bookings.filter((b) => b.sessionId === sessionId).length} bookings affected.`, sessionId, operatorId }
  );
}

export function updateSessionStatus(state: PrototypeState, sessionId: string, status: SessionStatus, operatorId?: string): PrototypeState {
  return pushAudit(
    { ...state, sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, status } : s)) },
    { action: "Session Status Updated", description: `Session ${sessionId} moved to ${status}.`, sessionId, operatorId }
  );
}

export function updateMatchScore(
  state: PrototypeState,
  tournamentId: string,
  matchId: string,
  scoreA: number,
  scoreB: number,
  winner: string,
  status: "scheduled" | "live" | "completed" | "walkover" | "abandoned",
  operatorId?: string
): PrototypeState {
  const next: PrototypeState = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) =>
      m.id === matchId && m.tournamentId === tournamentId
        ? { ...m, scoreA, scoreB, winnerTeamId: winner, winner, status }
        : m
    )
  };
  return pushAudit(next, {
    action: "Match Score Submitted",
    description: `Match ${matchId} in ${tournamentId}: ${scoreA}–${scoreB}, winner ${winner || "—"}.`,
    operatorId
  });
}
