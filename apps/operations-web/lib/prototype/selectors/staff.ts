import type { PrototypeState } from "../scenarios";
import type { CrewMember, ScheduledSession } from "../entities";
import type { RoleId } from "@/lib/types";
import {
  STAFF_SLOTS,
  STAFF_SLOT_ORDER,
  activeSessionsFor,
  crewConflicts,
  isActiveSession,
  resolveCrewId,
  type StaffSlot,
} from "../services/staff";

/**
 * Staff read models. Crew members are referenced from sessions by crew id;
 * older operator-id references are resolved through `resolveCrewId`.
 * Nothing here invents data: fields not recorded on the crew member are
 * returned as undefined so pages can say "Not recorded".
 */

export interface StaffSessionRef {
  sessionId: string;
  title: string;
  date: string;
  startTime: string;
  status: ScheduledSession["status"];
  slots: StaffSlot[];
  slotLabels: string[];
}

export interface StaffViewItem {
  id: string;
  name: string;
  role: RoleId;
  roleLabel: string;
  status: CrewMember["status"];
  territoryId: string;
  territoryName: string;
  venueId: string;
  venueName: string;
  cityName: string;
  assignment: string;
  /** The next upcoming session this person is staffed on. */
  currentSessionId?: string;
  currentSessionTitle?: string;
  sessionStartTime?: string;
  /** Every upcoming session this person is staffed on. */
  sessions: StaffSessionRef[];
  /** True when two of their upcoming sessions overlap in time. */
  doubleBooked: boolean;
  shiftFrom?: string;
  shiftTo?: string;
  phone?: string;
  email?: string;
  emergencyContact?: string;
  notes?: string;
  skills: string[];
  /** Completed sessions this person was staffed on. */
  attendanceCount: number;
}

export interface StaffHealthSummary {
  totalStaff: number;
  workingToday: number;
  availableCount: number;
  assignedCount: number;
  offCount: number;
  unassignedCount: number;
  checkedInCount: number;
  safetyStaffCount: number;
  leadCoordinatorCount: number;
  doubleAssignedCount: number;
  eventsMissingCoordinatorCount: number;
  eventsMissingSafetyCount: number;
  eventsMissingStaffCount: number;
  upcomingSessionCount: number;
  status: "ready" | "needs-attention" | "blocked" | "empty";
  label: string;
}

export interface EventStaffingSummary {
  sessionId: string;
  sessionTitle: string;
  date: string;
  startTime: string;
  venueId: string;
  venueName: string;
  territoryId: string;
  status: "ready" | "needs-attention" | "missing";
  leadCoordinatorId?: string;
  leadCoordinatorName?: string;
  leadCoordinatorCheckedIn: boolean;
  safetyContactId?: string;
  safetyContactName?: string;
  safetyContactCheckedIn: boolean;
  slots: Array<{ slot: StaffSlot; label: string; crewId?: string; name?: string; checkedIn: boolean; required: boolean }>;
  assignedStaff: Array<{ id: string; name: string; role: string; checkedIn: boolean }>;
  isFullyStaffed: boolean;
  missingRoles: string[];
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

const ROLE_LABELS: Partial<Record<RoleId, string>> = {
  coordinator: "Coordinator",
  safety: "Safety officer",
  "venue-manager": "Venue manager",
  "ops-manager": "Operations manager",
  "city-manager": "City manager",
  support: "Support",
  staff: "Floor staff",
};

/** Human-readable crew role. */
export function formatStaffRole(role: string): string {
  return ROLE_LABELS[role as RoleId] ?? role.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export const sessionLabel = (state: PrototypeState, s: ScheduledSession): string =>
  (state.templates ?? []).find((t) => t.id === s.templateId)?.name ?? `Session ${s.id}`;

/** Staff list enriched with venue, territory, sessions and shift data. */
export function selectStaffDirectory(state: PrototypeState, territoryId?: string): StaffViewItem[] {
  const crew = state.crew ?? [];
  const venues = state.venues ?? [];
  const territories = state.territories ?? [];
  const cities = state.cities ?? [];
  const shifts = state.shifts ?? [];

  return crew
    .filter((c) => !territoryId || c.territoryId === territoryId)
    .map((c) => {
      const venue = venues.find((v) => v.id === c.venueId);
      const territory = territories.find((t) => t.id === c.territoryId);
      const city = cities.find((ct) => ct.id === venue?.cityId);
      const shift = shifts.find((sh) => sh.crewId === c.id);
      const sessions = activeSessionsFor(state, c.id).map(({ session, slots }) => ({
        sessionId: session.id,
        title: sessionLabel(state, session),
        date: session.date,
        startTime: session.startTime,
        status: session.status,
        slots,
        slotLabels: slots.map((s) => STAFF_SLOTS[s].label),
      }));
      const rawSessions = activeSessionsFor(state, c.id).map((x) => x.session);
      const doubleBooked = rawSessions.some((s) => crewConflicts(state, c.id, s).length > 0);
      const attendanceCount = (state.sessions ?? []).filter(
        (s) => s.status === "completed" && STAFF_SLOT_ORDER.some((slot) => resolveCrewId(state, s[STAFF_SLOTS[slot].field]) === c.id),
      ).length;
      const next = sessions[0];

      return {
        id: c.id,
        name: c.name,
        role: c.role,
        roleLabel: formatStaffRole(c.role),
        status: c.status,
        territoryId: c.territoryId,
        territoryName: territory?.name ?? "Unknown territory",
        venueId: c.venueId,
        venueName: venue?.name ?? "Unknown venue",
        cityName: city?.name ?? "—",
        assignment: c.assignment || "Not assigned",
        currentSessionId: next?.sessionId,
        currentSessionTitle: next ? `${next.title} · ${next.date} ${next.startTime}` : undefined,
        sessionStartTime: next?.startTime,
        sessions,
        doubleBooked,
        shiftFrom: shift?.from,
        shiftTo: shift?.to,
        phone: c.phone,
        email: c.email,
        emergencyContact: c.emergencyContact,
        notes: c.notes,
        skills: c.skills ?? [],
        attendanceCount,
      };
    });
}

export function selectStaffMemberById(state: PrototypeState, id: string): StaffViewItem | undefined {
  return selectStaffDirectory(state).find((s) => s.id === id);
}

export function selectWorkingToday(state: PrototypeState, territoryId?: string): StaffViewItem[] {
  return selectStaffDirectory(state, territoryId).filter((s) => s.status === "assigned" || s.status === "checked-in");
}

export function selectAvailableStaff(state: PrototypeState, territoryId?: string): StaffViewItem[] {
  return selectStaffDirectory(state, territoryId).filter((s) => s.status === "available");
}

export function selectAssignedStaff(state: PrototypeState, territoryId?: string): StaffViewItem[] {
  return selectStaffDirectory(state, territoryId).filter((s) => s.status === "assigned" || s.status === "checked-in");
}

export function selectUnassignedStaff(state: PrototypeState, territoryId?: string): StaffViewItem[] {
  return selectStaffDirectory(state, territoryId).filter((s) => s.status === "available" || s.status === "off");
}

export function selectCheckedInStaff(state: PrototypeState, territoryId?: string): StaffViewItem[] {
  return selectStaffDirectory(state, territoryId).filter((s) => s.status === "checked-in");
}

/** Staff staffed on two upcoming sessions whose times overlap. */
export function selectDoubleAssignedStaff(state: PrototypeState, territoryId?: string): StaffViewItem[] {
  return selectStaffDirectory(state, territoryId).filter((s) => s.doubleBooked);
}

const upcoming = (state: PrototypeState, territoryId?: string) =>
  (state.sessions ?? []).filter((s) => isActiveSession(s) && s.status !== "draft" && (!territoryId || s.territoryId === territoryId));

export function selectEventsMissingCoordinator(state: PrototypeState, territoryId?: string): ScheduledSession[] {
  return upcoming(state, territoryId).filter((s) => !resolveCrewId(state, s.leadCoordinatorId));
}

export function selectEventsMissingSafety(state: PrototypeState, territoryId?: string): ScheduledSession[] {
  return upcoming(state, territoryId).filter((s) => {
    const tpl = (state.templates ?? []).find((t) => t.id === s.templateId);
    const needed = tpl ? tpl.safetyContactRequired !== false : true;
    return needed && !resolveCrewId(state, s.safetyContactId);
  });
}

/** Upcoming (not draft) sessions with their staffing status, soonest first. */
export function selectSessionsForStaffing(state: PrototypeState, territoryId?: string): EventStaffingSummary[] {
  return upcoming(state, territoryId)
    .map((s) => selectEventStaffingSummary(state, s.id)!)
    .filter(Boolean);
}

export function selectEventStaffingSummary(state: PrototypeState, sessionId: string): EventStaffingSummary | undefined {
  const session = (state.sessions ?? []).find((s) => s.id === sessionId);
  if (!session) return undefined;
  const crew = state.crew ?? [];
  const venue = (state.venues ?? []).find((v) => v.id === session.venueId);
  const tpl = (state.templates ?? []).find((t) => t.id === session.templateId);
  const required: Record<StaffSlot, boolean> = {
    lead: true,
    safety: tpl ? tpl.safetyContactRequired !== false : true,
    referee: !!tpl?.refereeRequired,
    support: (tpl?.coordinatorsCount ?? 1) > 1,
    equipment: !!tpl?.equipmentHandlerRequired,
  };
  const slots = STAFF_SLOT_ORDER.map((slot) => {
    const crewId = resolveCrewId(state, session[STAFF_SLOTS[slot].field]);
    const member = crewId ? crew.find((c) => c.id === crewId) : undefined;
    return { slot, label: STAFF_SLOTS[slot].label, crewId, name: member?.name, checkedIn: member?.status === "checked-in", required: required[slot] };
  });
  const lead = slots.find((s) => s.slot === "lead")!;
  const safety = slots.find((s) => s.slot === "safety")!;
  const missingRoles = slots.filter((s) => s.required && !s.crewId).map((s) => s.label);
  const isFullyStaffed = missingRoles.length === 0;
  return {
    sessionId: session.id,
    sessionTitle: tpl?.name ?? `Session ${session.id}`,
    date: session.date,
    startTime: session.startTime,
    venueId: session.venueId,
    venueName: venue?.name ?? "Unknown venue",
    territoryId: session.territoryId,
    status: isFullyStaffed ? "ready" : !lead.crewId ? "missing" : "needs-attention",
    leadCoordinatorId: lead.crewId,
    leadCoordinatorName: lead.name,
    leadCoordinatorCheckedIn: lead.checkedIn,
    safetyContactId: safety.crewId,
    safetyContactName: safety.name,
    safetyContactCheckedIn: safety.checkedIn,
    slots,
    assignedStaff: slots
      .filter((s) => s.crewId)
      .map((s) => ({ id: s.crewId!, name: s.name ?? s.crewId!, role: s.label, checkedIn: s.checkedIn })),
    isFullyStaffed,
    missingRoles,
  };
}

/** Today's roster: people who are assigned or checked in, then everyone else. */
export function selectTodayStaffRoster(state: PrototypeState, territoryId?: string): StaffViewItem[] {
  const order: Record<string, number> = { "checked-in": 0, assigned: 1, available: 2, off: 3 };
  return selectStaffDirectory(state, territoryId).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name));
}

/** Participants directory with privacy masking. */
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
      tempId: b.tempId || "—",
      alias: b.alias || "Participant",
      sessionId: b.sessionId,
      sessionTitle: session ? `${sessionLabel(state, session)} · ${session.date} ${session.startTime}` : "Session removed",
      date: session?.date || "—",
      bookingStatus: b.status,
      paymentStatus: b.paymentStatus || "—",
      teamId: assignment?.teamId,
      teamName: team?.name,
      isRevealed: session?.status === "revealed" || session?.status === "live" || session?.status === "completed",
      isCheckedIn: b.checkedIn || false,
      maskedPhone: b.phoneMask || "Not recorded",
      joinedAt: b.createdAt || "—",
    };
  });
}

/** Overall staffing health for the territory in scope (all territories when omitted). */
export function selectStaffHealth(state: PrototypeState, territoryId?: string): StaffHealthSummary {
  const crew = selectStaffDirectory(state, territoryId);
  const sessions = upcoming(state, territoryId);

  const totalStaff = crew.length;
  const workingToday = crew.filter((c) => c.status === "assigned" || c.status === "checked-in").length;
  const availableCount = crew.filter((c) => c.status === "available").length;
  const assignedCount = crew.filter((c) => c.status === "assigned").length;
  const offCount = crew.filter((c) => c.status === "off").length;
  const checkedInCount = crew.filter((c) => c.status === "checked-in").length;
  const doubleAssignedCount = crew.filter((c) => c.doubleBooked).length;
  const eventsMissingCoordinatorCount = selectEventsMissingCoordinator(state, territoryId).length;
  const eventsMissingSafetyCount = selectEventsMissingSafety(state, territoryId).length;

  let status: StaffHealthSummary["status"] = "ready";
  let label = sessions.length ? "Every upcoming session has a lead coordinator and safety contact" : "No upcoming sessions to staff";
  if (totalStaff === 0 && sessions.length === 0) {
    status = "empty";
    label = "No staff added yet";
  } else if (eventsMissingCoordinatorCount > 0) {
    status = "blocked";
    label = `${eventsMissingCoordinatorCount} session${eventsMissingCoordinatorCount === 1 ? " has" : "s have"} no lead coordinator`;
  } else if (eventsMissingSafetyCount > 0 || doubleAssignedCount > 0) {
    status = "needs-attention";
    label =
      eventsMissingSafetyCount > 0
        ? `${eventsMissingSafetyCount} session${eventsMissingSafetyCount === 1 ? " has" : "s have"} no safety contact`
        : `${doubleAssignedCount} staff member${doubleAssignedCount === 1 ? " is" : "s are"} on overlapping sessions`;
  }

  return {
    totalStaff,
    workingToday,
    availableCount,
    assignedCount,
    offCount,
    unassignedCount: availableCount + offCount,
    checkedInCount,
    safetyStaffCount: crew.filter((c) => c.role === "safety").length,
    leadCoordinatorCount: crew.filter((c) => c.role === "coordinator").length,
    doubleAssignedCount,
    eventsMissingCoordinatorCount,
    eventsMissingSafetyCount,
    eventsMissingStaffCount: eventsMissingCoordinatorCount + eventsMissingSafetyCount,
    upcomingSessionCount: sessions.length,
    status,
    label,
  };
}

/** The single most useful next staffing action. */
export function selectStaffNextAction(state: PrototypeState, territoryId?: string): { label: string; href: string; actionKey: string; detail: string } {
  const health = selectStaffHealth(state, territoryId);
  if (health.totalStaff === 0) return { actionKey: "add-staff", label: "Add your first staff member", href: "/people/staff/new", detail: "Staff must be on the list before they can be assigned to sessions." };
  if (health.eventsMissingCoordinatorCount > 0) return { actionKey: "assign-coordinator", label: "Assign lead coordinators", href: "/staffing/assign", detail: "A session cannot open for check-in until it has a lead coordinator." };
  if (health.eventsMissingSafetyCount > 0) return { actionKey: "assign-safety", label: "Assign safety contacts", href: "/staffing/assign", detail: "These sessions' experiences require a named safety contact." };
  if (health.doubleAssignedCount > 0) return { actionKey: "fix-overlaps", label: "Review overlapping assignments", href: "/staffing/health", detail: "One person cannot run two sessions at the same time." };
  if (health.assignedCount > 0) return { actionKey: "check-in-staff", label: "Check in arriving staff", href: "/staffing/check-in", detail: `${health.assignedCount} assigned, ${health.checkedInCount} checked in.` };
  return { actionKey: "add-staff", label: "Add a staff member", href: "/people/staff/new", detail: "Every upcoming session is staffed." };
}
