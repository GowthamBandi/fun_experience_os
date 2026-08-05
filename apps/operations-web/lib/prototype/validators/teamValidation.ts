import type { PrototypeState } from "../scenarios/state";

export function validateTeamAssignment(
  state: PrototypeState,
  sessionId: string,
  teamId: string,
  bookingId: string
): { isValid: boolean; error?: string } {
  const team = (state.teams ?? []).find((t) => t.id === teamId);
  const booking = state.bookings.find((b) => b.id === bookingId);
  const activeAssignments = (state.teamAssignments ?? []).filter((ta) => ta.sessionId === sessionId && ta.status === "active");

  if (!team) return { isValid: false, error: "Target team does not exist." };
  if (!booking) return { isValid: false, error: "Booking does not exist." };

  if (booking.status.includes("cancelled")) {
    return { isValid: false, error: "Cannot assign cancelled booking to a team." };
  }

  // Check team lock / reveal status
  if (team.status === "locked" || team.status === "revealed") {
    return { isValid: false, error: "Team is locked. Manual override required for reassignment." };
  }

  // Check team capacity
  const teamMembers = activeAssignments.filter((ta) => ta.teamId === teamId);
  if (teamMembers.length >= team.capacity) {
    return { isValid: false, error: `Team '${team.name}' has reached maximum capacity (${team.capacity}).` };
  }

  return { isValid: true };
}
