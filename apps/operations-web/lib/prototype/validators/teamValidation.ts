import type { PrototypeState } from "../scenarios/state";
import { isEligibleBooking } from "../selectors/identity";

/** Rules for placing one participant in a team (used by move and swap). */
export function validateTeamAssignment(
  state: PrototypeState,
  sessionId: string,
  teamId: string,
  bookingId: string,
  options: { ignoreCapacity?: boolean } = {},
): { isValid: boolean; error?: string } {
  const team = (state.teams ?? []).find((t) => t.id === teamId && t.sessionId === sessionId);
  const booking = state.bookings.find((b) => b.id === bookingId);
  const activeAssignments = (state.teamAssignments ?? []).filter((ta) => ta.sessionId === sessionId && ta.status === "active");

  if (!team) return { isValid: false, error: "Target team does not exist in this session." };
  if (!booking || booking.sessionId !== sessionId) return { isValid: false, error: "Participant is not booked on this session." };
  if (!isEligibleBooking(booking)) return { isValid: false, error: `${booking.alias} does not hold a confirmed place.` };

  if (team.status === "locked" || team.status === "revealed") {
    return { isValid: false, error: `Team '${team.name}' is ${team.status}. Unlock teams with a reason before changing members.` };
  }

  const current = activeAssignments.find((ta) => ta.bookingId === bookingId);
  if (current?.teamId === teamId) return { isValid: false, error: `${booking.alias} is already in '${team.name}'.` };

  if (!options.ignoreCapacity) {
    const members = activeAssignments.filter((ta) => ta.teamId === teamId).length;
    if (members >= team.capacity) {
      return { isValid: false, error: `Team '${team.name}' is full (${team.capacity}). Swap two participants instead.` };
    }
  }

  return { isValid: true };
}
