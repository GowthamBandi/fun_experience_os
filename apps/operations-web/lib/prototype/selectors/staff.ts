import type { PrototypeState } from "../scenarios";
import type { CrewMember, Shift, ScheduledSession } from "../entities";
import type { RoleId } from "@/lib/types";

export interface StaffViewItem {
  id: string;
  name: string;
  role: RoleId;
  roleLabel: string;
  status: "available" | "assigned" | "checked-in" | "off" | "late";
  territoryId: string;
  territoryName: string;
  venueId: string;
  venueName: string;
  cityName: string;
  assignment: string;
  currentSessionId?: string;
  currentSessionTitle?: string;
  sessionStartTime?: string;
  shiftFrom?: string;
  shiftTo?: string;
  phone?: string;
  email?: string;
  emergencyContact?: string;
  skills: string[];
  attendanceCount: number;
}

export interface StaffHealthSummary {
  totalStaff: number;
  workingToday: number;
  availableCount: number;
  assignedCount: number;
  unassignedCount: number;
  checkedInCount: number;
  lateCount: number;
  safetyStaffCount: number;
  leadCoordinatorCount: number;
  doubleAssignedCount: number;
  eventsMissingCoordinatorCount: number;
  eventsMissingSafetyCount: number;
  eventsMissingStaffCount: number;
  status: "ready" | "needs-attention" | "blocked";
  label: string;
}

export interface EventStaffingSummary {
  sessionId: string;
  sessionTitle: string;
  date: string;
  startTime: string;
  venueId: string;
  venueName: string;
  leadCoordinatorId?: string;
  leadCoordinatorName?: string;
  leadCoordinatorCheckedIn: boolean;
  safetyContactId?: string;
  safetyContactName?: string;
  safetyContactCheckedIn: boolean;
  assignedStaff: Array<{ id: string; name: string; role: string; checkedIn: boolean }>;
  isFullyStaffed: boolean;
  missingRoles: string[];
  status: "ready" | "needs-attention" | "missing";
}

export interface ParticipantViewItem {
  id: string;
  tempId: string;
  alias: string;
  sessionId: string;
  sessionTitle: string;
  date: string;
  bookingStatus: string;
  paymentStatus: string;
  teamId?: string;
  teamName?: string;
  isRevealed: boolean;
  isCheckedIn: boolean;
  maskedPhone: string;
  joinedAt: string;
}

/** Formats role ID to human readable label */
export function formatStaffRole(role: string): string {
  switch (role) {
    case "coordinator":
      return "Lead Coordinator";
    case "safety":
      return "Safety Officer";
    case "venue-manager":
      return "Venue Manager";
    case "ops-manager":
      return "Operations Manager";
    case "referee":
      return "Match Official / Referee";
    case "support":
      return "Support Staff";
    case "staff":
    default:
      return "Event Host / Staff";
  }
}

/** Pure selector: Selects all staff items enriched with venue, session, and shift data */
export function selectStaffDirectory(state: PrototypeState, territoryId?: string): StaffViewItem[] {
  const crew = state.crew ?? [];
  const venues = state.venues ?? [];
  const territories = state.territories ?? [];
  const cities = state.cities ?? [];
  const shifts = state.shifts ?? [];
  const sessions = state.sessions ?? [];

  return crew
    .filter((c) => !territoryId || c.territoryId === territoryId)
    .map((c) => {
      const venue = venues.find((v) => v.id === c.venueId);
      const territory = territories.find((t) => t.id === c.territoryId);
      const city = cities.find((ct) => ct.id === venue?.cityId);
      const shift = shifts.find((sh) => sh.crewId === c.id);

      // Find current session where staff is assigned
      const currentSession = sessions.find(
        (s) =>
          s.leadCoordinatorId === c.id ||
          s.safetyContactId === c.id ||
          c.assignment.includes(s.id) ||
          c.assignment.includes(s.templateId)
      );

      return {
        id: c.id,
        name: c.name,
        role: c.role,
        roleLabel: formatStaffRole(c.role),
        status: c.status,
        territoryId: c.territoryId,
        territoryName: territory?.name || "Territory Scope",
        venueId: c.venueId,
        venueName: venue?.name || "Assigned Venue",
        cityName: city?.name || "City Center",
        assignment: c.assignment || "General Floor Support",
        currentSessionId: currentSession?.id,
        currentSessionTitle: currentSession ? `${currentSession.date} @ ${currentSession.startTime}` : undefined,
        sessionStartTime: currentSession?.startTime,
        shiftFrom: shift?.from || "18:00",
        shiftTo: shift?.to || "23:00",
        phone: "+91 98765 43210 (Prototype)",
        email: `${c.name.toLowerCase().replace(/\s+/g, ".")}@experienceos.com`,
        emergencyContact: "Emergency Support (+91 99000 11223)",
        skills: [
          c.role === "coordinator" ? "Event Management" : "Customer Support",
          c.role === "safety" ? "First Aid & CPR" : "Check-in Operations",
          "Crowd Handling",
        ],
        attendanceCount: 12,
      };
    });
}

/** Pure selector: Select staff member by ID */
export function selectStaffMemberById(state: PrototypeState, id: string): StaffViewItem | undefined {
  return selectStaffDirectory(state).find((s) => s.id === id);
}

/** Pure selector: Working today list */
export function selectWorkingToday(state: PrototypeState): StaffViewItem[] {
  return selectStaffDirectory(state).filter((s) => s.status === "assigned" || s.status === "checked-in");
}

/** Pure selector: Available staff */
export function selectAvailableStaff(state: PrototypeState): StaffViewItem[] {
  return selectStaffDirectory(state).filter((s) => s.status === "available");
}

/** Pure selector: Assigned staff */
export function selectAssignedStaff(state: PrototypeState): StaffViewItem[] {
  return selectStaffDirectory(state).filter((s) => s.status === "assigned" || s.status === "checked-in");
}

/** Pure selector: Unassigned staff */
export function selectUnassignedStaff(state: PrototypeState): StaffViewItem[] {
  return selectStaffDirectory(state).filter((s) => s.status === "available" || s.status === "off");
}

/** Pure selector: Checked-in staff */
export function selectCheckedInStaff(state: PrototypeState): StaffViewItem[] {
  return selectStaffDirectory(state).filter((s) => s.status === "checked-in");
}

/** Pure selector: Late staff */
export function selectLateStaff(state: PrototypeState): StaffViewItem[] {
  return selectStaffDirectory(state).filter((s) => s.status === "late");
}

/** Pure selector: Double assigned staff */
export function selectDoubleAssignedStaff(state: PrototypeState): StaffViewItem[] {
  // Prototype check for any staff assigned to multiple sessions at same time
  return [];
}

/** Pure selector: Events missing coordinator */
export function selectEventsMissingCoordinator(state: PrototypeState): ScheduledSession[] {
  const sessions = state.sessions ?? [];
  return sessions.filter((s) => !s.leadCoordinatorId || s.leadCoordinatorId === "");
}

/** Pure selector: Events missing safety staff */
export function selectEventsMissingSafety(state: PrototypeState): ScheduledSession[] {
  const sessions = state.sessions ?? [];
  return sessions.filter((s) => !s.safetyContactId || s.safetyContactId === "");
}

/** Pure selector: Detailed event staffing summary */
export function selectEventStaffingSummary(state: PrototypeState, sessionId: string): EventStaffingSummary | undefined {
  const session = (state.sessions ?? []).find((s) => s.id === sessionId);
  if (!session) return undefined;

  const crew = state.crew ?? [];
  const venue = (state.venues ?? []).find((v) => v.id === session.venueId);

  const lead = crew.find((c) => c.id === session.leadCoordinatorId);
  const safety = crew.find((c) => c.id === session.safetyContactId);

  const assignedStaff = crew
    .filter(
      (c) =>
        c.id === session.leadCoordinatorId ||
        c.id === session.safetyContactId ||
        c.assignment.includes(session.id) ||
        c.venueId === session.venueId
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      role: formatStaffRole(c.role),
      checkedIn: c.status === "checked-in",
    }));

  const missingRoles: string[] = [];
  if (!session.leadCoordinatorId) missingRoles.push("Lead Coordinator");
  if (!session.safetyContactId) missingRoles.push("Safety Officer");

  const isFullyStaffed = missingRoles.length === 0;

  return {
    sessionId: session.id,
    sessionTitle: `Event #${session.id} (${session.date} @ ${session.startTime})`,
    date: session.date,
    startTime: session.startTime,
    venueId: session.venueId,
    venueName: venue?.name || "Event Venue",
    leadCoordinatorId: session.leadCoordinatorId,
    leadCoordinatorName: lead?.name,
    leadCoordinatorCheckedIn: lead?.status === "checked-in",
    safetyContactId: session.safetyContactId,
    safetyContactName: safety?.name,
    safetyContactCheckedIn: safety?.status === "checked-in",
    assignedStaff,
    isFullyStaffed,
    missingRoles,
    status: isFullyStaffed ? "ready" : missingRoles.includes("Lead Coordinator") ? "missing" : "needs-attention",
  };
}

/** Pure selector: Staff Availability overview */
export function selectStaffAvailability(state: PrototypeState): Array<{ staffId: string; name: string; role: string; state: "available" | "assigned" | "off" | "outside-shift" }> {
  return selectStaffDirectory(state).map((s) => ({
    staffId: s.id,
    name: s.name,
    role: s.roleLabel,
    state: s.status === "checked-in" ? "assigned" : s.status === "assigned" ? "assigned" : s.status === "off" ? "off" : "available",
  }));
}

/** Pure selector: Today's staff roster */
export function selectTodayStaffRoster(state: PrototypeState): StaffViewItem[] {
  return selectStaffDirectory(state);
}

/** Pure selector: Participants directory with privacy masking */
export function selectParticipantDirectory(state: PrototypeState): ParticipantViewItem[] {
  const bookings = state.bookings ?? [];
  const sessions = state.sessions ?? [];
  const teams = state.teams ?? [];
  const teamAssignments = state.teamAssignments ?? [];

  return bookings.map((b) => {
    const session = sessions.find((s) => s.id === b.sessionId);
    const assignment = teamAssignments.find((ta) => ta.bookingId === b.id);
    const team = teams.find((t) => t.id === assignment?.teamId);

    return {
      id: b.id,
      tempId: b.tempId || `PX-${b.id.replace("b-", "00")}`,
      alias: b.alias || "Mystery Participant",
      sessionId: b.sessionId,
      sessionTitle: session ? `${session.date} @ ${session.startTime}` : "Scheduled Session",
      date: session?.date || "Today",
      bookingStatus: b.status,
      paymentStatus: b.paymentStatus || "confirmed",
      teamId: assignment?.teamId,
      teamName: team?.name || "Unassigned Team",
      isRevealed: session?.status === "revealed" || session?.status === "live" || session?.status === "completed",
      isCheckedIn: b.checkedIn || false,
      maskedPhone: b.phoneMask || "•••• 9876",
      joinedAt: (b as any).createdAt || "Recently",
    };
  });
}

/** Pure selector: Overall Staff Health */
export function selectStaffHealth(state: PrototypeState): StaffHealthSummary {
  const crew = selectStaffDirectory(state);
  const sessions = state.sessions ?? [];

  const totalStaff = crew.length;
  const workingToday = crew.filter((c) => c.status === "assigned" || c.status === "checked-in").length;
  const availableCount = crew.filter((c) => c.status === "available").length;
  const assignedCount = crew.filter((c) => c.status === "assigned").length;
  const unassignedCount = crew.filter((c) => c.status === "available" || c.status === "off").length;
  const checkedInCount = crew.filter((c) => c.status === "checked-in").length;
  const lateCount = crew.filter((c) => c.status === "late").length;
  const safetyStaffCount = crew.filter((c) => c.role === "safety").length;
  const leadCoordinatorCount = crew.filter((c) => c.role === "coordinator").length;

  const eventsMissingCoordinatorCount = sessions.filter((s) => !s.leadCoordinatorId).length;
  const eventsMissingSafetyCount = sessions.filter((s) => !s.safetyContactId).length;
  const eventsMissingStaffCount = eventsMissingCoordinatorCount + eventsMissingSafetyCount;

  let status: "ready" | "needs-attention" | "blocked" = "ready";
  let label = "All events fully staffed and ready";

  if (eventsMissingCoordinatorCount > 0) {
    status = "blocked";
    label = `${eventsMissingCoordinatorCount} event(s) missing lead coordinator`;
  } else if (eventsMissingSafetyCount > 0 || lateCount > 0) {
    status = "needs-attention";
    label = `${eventsMissingSafetyCount} event(s) missing safety lead`;
  }

  return {
    totalStaff,
    workingToday,
    availableCount,
    assignedCount,
    unassignedCount,
    checkedInCount,
    lateCount,
    safetyStaffCount,
    leadCoordinatorCount,
    doubleAssignedCount: 0,
    eventsMissingCoordinatorCount,
    eventsMissingSafetyCount,
    eventsMissingStaffCount,
    status,
    label,
  };
}

/** Pure selector: Staff Next Action Engine */
export function selectStaffNextAction(state: PrototypeState): { label: string; href: string; actionKey: string } {
  const health = selectStaffHealth(state);

  if (health.eventsMissingCoordinatorCount > 0) {
    return {
      actionKey: "assign-coordinator",
      label: "Assign Lead Coordinator",
      href: "/staffing/assign",
    };
  }

  if (health.eventsMissingSafetyCount > 0) {
    return {
      actionKey: "assign-safety",
      label: "Assign Safety Lead",
      href: "/staffing/assign",
    };
  }

  if (health.workingToday > health.checkedInCount) {
    return {
      actionKey: "check-in-staff",
      label: "Check In Arrived Staff",
      href: "/staffing/check-in",
    };
  }

  return {
    actionKey: "add-staff",
    label: "Add Staff Member",
    href: "/people/staff/new",
  };
}
