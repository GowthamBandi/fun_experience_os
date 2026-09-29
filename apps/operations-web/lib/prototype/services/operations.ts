import type { Booking, SessionStatus } from "../entities";
import type { PrototypeState } from "../scenarios";
import { isConfirmedSeat, seatClass } from "../selectors/status";
import { bookingRefundTotals, currentPaymentForBooking } from "../selectors/money";
import { pushAudit, pushSignal } from "./helpers";
import { newRecordId, type CommandResult } from "./bookings";
import { syncLedger } from "./money";

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
  const missing = sessionBookings.filter((b) => !b.tempId && isConfirmedSeat(b));
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

  const roster = state.bookings.filter((b) => b.sessionId === sessionId && isConfirmedSeat(b));
  if (roster.length === 0) return state;

  const next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) => {
      const idx = roster.findIndex((r) => r.id === b.id);
      return idx >= 0 ? { ...b, team: teams[idx % numTeams] } : b;
    })
  };
  return pushAudit(
    pushSignal(next, { kind: "system", message: `Teams allocated for ${sessionId} — ${numTeams} teams, ${roster.length} participants.`, sessionId }),
    { action: "Teams Allocated", description: `Random team separator assigned ${roster.length} participants into ${numTeams} teams.`, sessionId, operatorId }
  );
}

/**
 * Finish a session: open payment holds and waitlist entries are closed (the
 * session can no longer be attended) and the status becomes completed.
 */
export function completeSession(state: PrototypeState, sessionId: string, operatorId?: string, nowIso: string = new Date().toISOString()): CommandResult {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return { state, error: "This session could not be found." };
  if (session.status === "completed") return { state, error: "This session is already completed." };
  if (session.status === "cancelled" || session.status === "archived") return { state, error: `A ${session.status} session can't be completed.` };

  let closed = 0;
  const bookings = state.bookings.map((b): Booking => {
    if (b.sessionId !== sessionId) return b;
    const cls = seatClass(b);
    if (cls === "hold" || cls === "offer" || cls === "waitlist") {
      closed++;
      return { ...b, status: "reservation-expired", reservationStatus: "expired", reservationExpiresAt: undefined, waitlistOfferExpiresAt: undefined, updatedAt: nowIso };
    }
    return b;
  });
  const payments = (state.payments ?? []).map((p) =>
    p.sessionId === sessionId && (p.status === "pending" || p.status === "initiated")
      ? { ...p, status: "cancelled" as const, cancelledAt: nowIso, failureReason: "Session completed before payment", updatedAt: nowIso }
      : p
  );
  const next: PrototypeState = {
    ...state,
    bookings,
    payments,
    sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, status: "completed" as const } : s)),
  };
  return {
    state: syncLedger(
      pushAudit(pushSignal(next, { kind: "close", message: `Session ${sessionId} completed — attendance and revenue finalised.`, sessionId }), {
        action: "Session Completed",
        description: `Session ${sessionId} completed.${closed ? ` ${closed} unpaid hold${closed === 1 ? "" : "s"} or waitlist entr${closed === 1 ? "y" : "ies"} closed.` : ""}`,
        sessionId,
        operatorId,
      })
    ),
  };
}

/**
 * Cancel a session. Every booking is cancelled by the company; every paid
 * booking gets a Refund request for everything that can still be refunded
 * (cumulative guard respected); open payment holds are cancelled.
 */
export function cancelSession(
  state: PrototypeState,
  sessionId: string,
  reason: string,
  operatorId?: string,
  nowIso: string = new Date().toISOString()
): CommandResult<{ refundCount?: number }> {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return { state, error: "This session could not be found." };
  if (session.status === "cancelled") return { state, error: "This session is already cancelled." };
  if (session.status === "completed" || session.status === "archived") return { state, error: `A ${session.status} session can't be cancelled.` };
  const why = reason?.trim() ?? "";
  if (why.length < 5) return { state, error: "Give a reason for cancelling the session (at least 5 characters)." };

  let refunds = [...(state.refunds ?? [])];
  let affected = 0;
  let refundTotal = 0;
  const bookings = state.bookings.map((b): Booking => {
    if (b.sessionId !== sessionId || seatClass(b) === "none") return b;
    affected++;
    const totals = bookingRefundTotals({ payments: state.payments, refunds }, b.id);
    if (totals.refundable > 0) {
      const id = newRecordId("ref", refunds);
      refunds = [
        ...refunds,
        {
          id,
          paymentId: currentPaymentForBooking(state, b.id)?.id,
          bookingId: b.id,
          sessionId,
          type: "company-cancellation",
          amount: totals.refundable,
          reason: `Session cancelled: ${why}`,
          status: "requested",
          requestedAt: nowIso,
          requestedBy: operatorId,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ];
      refundTotal += totals.refundable;
    }
    return {
      ...b,
      status: "cancelled-company",
      reservationStatus: "released",
      paymentStatus: totals.refundable > 0 ? "refund-pending" : totals.paid > 0 ? b.paymentStatus : "not-started",
      reservationExpiresAt: undefined,
      waitlistOfferExpiresAt: undefined,
      cancelledAt: nowIso,
      cancelledBy: operatorId,
      cancellationReason: `Session cancelled: ${why}`,
      updatedAt: nowIso,
    };
  });
  const refundCount = refunds.length - (state.refunds ?? []).length;
  const payments = (state.payments ?? []).map((p) =>
    p.sessionId === sessionId && (p.status === "pending" || p.status === "initiated")
      ? { ...p, status: "cancelled" as const, cancelledAt: nowIso, failureReason: "Session cancelled", updatedAt: nowIso }
      : p
  );

  const next: PrototypeState = {
    ...state,
    sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, status: "cancelled" as const } : s)),
    bookings,
    payments,
    refunds,
  };
  return {
    refundCount,
    state: syncLedger(
      pushAudit(
        pushSignal(next, {
          kind: "alert",
          message: `Session ${sessionId} cancelled — ${why}. ${refundCount} refund request${refundCount === 1 ? "" : "s"} created.`,
          sessionId,
        }),
        {
          action: "Session Cancelled",
          description: `Session ${sessionId} cancelled (${why}); ${affected} booking${affected === 1 ? "" : "s"} cancelled, ${refundCount} refund request${refundCount === 1 ? "" : "s"} totalling ₹${refundTotal} created for Finance approval.`,
          sessionId,
          operatorId,
        }
      )
    ),
  };
}

export function updateSessionStatus(state: PrototypeState, sessionId: string, status: SessionStatus, operatorId?: string): PrototypeState {
  return pushAudit(
    { ...state, sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, status } : s)) },
    { action: "Session Status Updated", description: `Session ${sessionId} moved to ${status}.`, sessionId, operatorId }
  );
}

