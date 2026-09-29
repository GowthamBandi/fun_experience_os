/**
 * Staff (crew) commands.
 *
 * Crew members are the people who work sessions on the floor. A session's
 * staffing slots (lead coordinator, safety contact, referee, …) always hold a
 * CREW MEMBER id (`c-*`). Console operator ids (`op-*`) are not valid staffing
 * references; `resolveCrewId` exists only to read older records.
 *
 * Every command is a pure transform returning `{ state, error }`. On error the
 * returned state is the input state, unchanged.
 */
import type { RoleId } from "@/lib/types";
import type { CrewMember, ScheduledSession } from "../entities";
import type { PrototypeState } from "../scenarios";
import { nextId, pushAudit } from "./helpers";

export type StaffResult = { state: PrototypeState; error?: string; id?: string };

export type CrewStatus = CrewMember["status"];

export type StaffSlot = "lead" | "support" | "referee" | "safety" | "equipment";

type SlotField = "leadCoordinatorId" | "supportingCoordinatorId" | "refereeId" | "safetyContactId" | "equipmentHandlerId";

/** Which roles may fill each session staffing slot (null = any floor role). */
export const STAFF_SLOTS: Record<StaffSlot, { field: SlotField; label: string; roles: RoleId[] | null }> = {
  lead: { field: "leadCoordinatorId", label: "Lead coordinator", roles: ["coordinator", "ops-manager", "venue-manager", "city-manager"] },
  support: { field: "supportingCoordinatorId", label: "Supporting coordinator", roles: ["coordinator", "staff", "ops-manager", "venue-manager"] },
  referee: { field: "refereeId", label: "Referee", roles: ["staff", "coordinator", "ops-manager", "venue-manager"] },
  safety: { field: "safetyContactId", label: "Safety contact", roles: ["safety", "staff", "coordinator", "ops-manager", "venue-manager"] },
  equipment: { field: "equipmentHandlerId", label: "Equipment handler", roles: ["staff", "coordinator", "venue-manager"] },
};

export const STAFF_SLOT_ORDER: StaffSlot[] = ["lead", "safety", "support", "referee", "equipment"];

/** Roles a crew member can hold. Office-only roles (finance, marketing, analyst) do not work the floor. */
export const CREW_ROLES: RoleId[] = ["coordinator", "staff", "safety", "support", "venue-manager", "ops-manager", "city-manager"];

const CLOSED_SESSION: ReadonlyArray<ScheduledSession["status"]> = ["cancelled", "completed", "archived"];

export const isActiveSession = (s: ScheduledSession): boolean => !CLOSED_SESSION.includes(s.status);

/* ------------------------------ references ------------------------------ */

/**
 * Resolve a staffing reference to a crew member id. Accepts a crew id, or —
 * for records written before crew ids became canonical — an operator id whose
 * account name matches a crew member.
 */
export function resolveCrewId(state: PrototypeState, ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const crew = state.crew ?? [];
  if (crew.some((c) => c.id === ref)) return ref;
  const operator = (state.operators ?? []).find((o) => o.id === ref);
  if (!operator) return undefined;
  const key = operator.name.trim().toLowerCase();
  return crew.find((c) => c.name.trim().toLowerCase() === key)?.id;
}

/** The slots a crew member currently fills on one session. */
export function slotsHeldBy(state: PrototypeState, session: ScheduledSession, crewId: string): StaffSlot[] {
  return STAFF_SLOT_ORDER.filter((slot) => resolveCrewId(state, session[STAFF_SLOTS[slot].field]) === crewId);
}

/** Every active (not cancelled/completed/archived) session a crew member is staffed on. */
export function activeSessionsFor(state: PrototypeState, crewId: string): Array<{ session: ScheduledSession; slots: StaffSlot[] }> {
  return (state.sessions ?? [])
    .filter(isActiveSession)
    .map((session) => ({ session, slots: slotsHeldBy(state, session, crewId) }))
    .filter((x) => x.slots.length > 0);
}

/* ----------------------------- time windows ----------------------------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** Normalise a session date label ("Today", "Tomorrow", "Yesterday" or ISO) to YYYY-MM-DD. */
export function sessionDay(label: string, now: Date = new Date()): string {
  const rel: Record<string, number> = { today: 0, tomorrow: 1, yesterday: -1 };
  const key = label.trim().toLowerCase();
  if (key in rel) {
    const d = new Date(now);
    d.setDate(d.getDate() + rel[key]);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const iso = label.match(/^\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : key;
}

const minutes = (hhmm: string): number => {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
};

/** True when two sessions happen on the same day with overlapping time windows. */
export function sessionsOverlap(a: ScheduledSession, b: ScheduledSession, now: Date = new Date()): boolean {
  if (sessionDay(a.date, now) !== sessionDay(b.date, now)) return false;
  const aStart = minutes(a.startTime);
  const bStart = minutes(b.startTime);
  const aEnd = aStart + Math.max(1, a.duration || 0);
  const bEnd = bStart + Math.max(1, b.duration || 0);
  return aStart < bEnd && bStart < aEnd;
}

/** Other active sessions this crew member is already staffed on that overlap the given session. */
export function crewConflicts(state: PrototypeState, crewId: string, session: ScheduledSession, now: Date = new Date()): ScheduledSession[] {
  return activeSessionsFor(state, crewId)
    .map((x) => x.session)
    .filter((other) => other.id !== session.id && sessionsOverlap(other, session, now));
}

/* ------------------------------ validation ------------------------------ */

export interface CrewInput {
  name: string;
  role: RoleId;
  territoryId: string;
  venueId: string;
  status?: CrewStatus;
  assignment?: string;
  phone?: string;
  email?: string;
  emergencyContact?: string;
  skills?: string[];
  notes?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d][\d\s-]{6,}$/;

function validateCrew(state: PrototypeState, c: CrewInput, selfId?: string): string | undefined {
  const name = c.name?.trim() ?? "";
  if (name.length < 2) return "Enter the staff member's full name.";
  if (!c.role || !CREW_ROLES.includes(c.role)) return "Choose a floor role (coordinator, staff, safety, support or a manager role).";
  if (!c.territoryId) return "Choose the territory this person works in.";
  const territory = (state.territories ?? []).find((t) => t.id === c.territoryId);
  if (!territory) return "The selected territory no longer exists.";
  if (!c.venueId) return "Choose the venue this person is based at.";
  const venue = (state.venues ?? []).find((v) => v.id === c.venueId);
  if (!venue) return "The selected venue no longer exists.";
  if (venue.territoryId !== c.territoryId) return `${venue.name} is not in ${territory.name}. Choose a venue inside the selected territory.`;
  if (c.email && !EMAIL.test(c.email.trim())) return "Enter a valid email address, or leave it blank.";
  if (c.phone && !PHONE.test(c.phone.trim())) return "Enter a valid phone number (digits, spaces, + and - only), or leave it blank.";
  const dup = (state.crew ?? []).find(
    (x) => x.id !== selfId && x.territoryId === c.territoryId && x.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (dup) return `${dup.name} is already on the staff list for ${territory.name}.`;
  return undefined;
}

const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);

/* ------------------------------- commands ------------------------------- */

export function createCrewMember(state: PrototypeState, input: CrewInput, operatorId?: string): StaffResult {
  const error = validateCrew(state, input);
  if (error) return { state, error };
  const status: CrewStatus = input.status === "off" ? "off" : "available";
  const id = nextId("c", (state.crew ?? []).map((c) => c.id));
  const at = new Date().toISOString();
  const member: CrewMember = {
    id,
    name: input.name.trim(),
    role: input.role,
    territoryId: input.territoryId,
    venueId: input.venueId,
    status,
    assignment: clean(input.assignment) ?? "Not assigned",
    phone: clean(input.phone),
    email: clean(input.email),
    emergencyContact: clean(input.emergencyContact),
    skills: (input.skills ?? []).map((s) => s.trim()).filter(Boolean),
    notes: clean(input.notes),
    createdAt: at,
    updatedAt: at,
  };
  const next = pushAudit(
    { ...state, crew: [...(state.crew ?? []), member] },
    { action: "Staff Member Added", description: `${member.name} added as ${member.role} (${id}).`, operatorId },
  );
  return { state: next, id };
}

export function updateCrewMember(state: PrototypeState, id: string, patch: Partial<CrewInput>, operatorId?: string): StaffResult {
  const current = (state.crew ?? []).find((c) => c.id === id);
  if (!current) return { state, error: "This staff member no longer exists." };
  const merged: CrewInput = {
    name: patch.name ?? current.name,
    role: patch.role ?? current.role,
    territoryId: patch.territoryId ?? current.territoryId,
    venueId: patch.venueId ?? current.venueId,
    status: patch.status ?? current.status,
    assignment: patch.assignment ?? current.assignment,
    phone: patch.phone !== undefined ? patch.phone : current.phone,
    email: patch.email !== undefined ? patch.email : current.email,
    emergencyContact: patch.emergencyContact !== undefined ? patch.emergencyContact : current.emergencyContact,
    skills: patch.skills ?? current.skills,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
  };
  const error = validateCrew(state, merged, id);
  if (error) return { state, error };

  const active = activeSessionsFor(state, id);
  if (merged.status === "off" && active.length > 0) {
    return { state, error: `${current.name} is staffed on ${active.length} upcoming session${active.length === 1 ? "" : "s"}. Remove them from those sessions before marking them off.` };
  }
  if (merged.territoryId !== current.territoryId && active.length > 0) {
    return { state, error: `${current.name} is staffed on sessions in their current territory. Remove them from those sessions before moving territory.` };
  }
  if (merged.role !== current.role) {
    for (const { session, slots } of active) {
      const bad = slots.find((slot) => STAFF_SLOTS[slot].roles && !STAFF_SLOTS[slot].roles!.includes(merged.role));
      if (bad) return { state, error: `${current.name} is ${STAFF_SLOTS[bad].label.toLowerCase()} on session ${session.id}; that slot needs a different role. Reassign it first.` };
    }
  }

  const updated: CrewMember = {
    ...current,
    name: merged.name.trim(),
    role: merged.role,
    territoryId: merged.territoryId,
    venueId: merged.venueId,
    status: merged.status ?? current.status,
    assignment: clean(merged.assignment) ?? current.assignment,
    phone: clean(merged.phone),
    email: clean(merged.email),
    emergencyContact: clean(merged.emergencyContact),
    skills: (merged.skills ?? []).map((s) => s.trim()).filter(Boolean),
    notes: clean(merged.notes),
    updatedAt: new Date().toISOString(),
  };
  const norm = (x: unknown) => (x === undefined || x === null || x === "" || (Array.isArray(x) && x.length === 0) ? null : typeof x === "string" ? x.trim() : x);
  const changed = (Object.keys(patch) as Array<keyof CrewInput>).filter((k) => JSON.stringify(norm(patch[k])) !== JSON.stringify(norm((current as unknown as Record<string, unknown>)[k])));
  if (changed.length === 0) return { state, error: "Nothing changed." };
  const next = pushAudit(
    { ...state, crew: state.crew.map((c) => (c.id === id ? updated : c)) },
    { action: "Staff Member Updated", description: `${updated.name} (${id}) updated: ${changed.join(", ")}.`, operatorId },
  );
  return { state: next, id };
}

export function assignCrewToSession(
  state: PrototypeState,
  params: { sessionId: string; crewId: string; slot: StaffSlot },
  operatorId?: string,
  now: Date = new Date(),
): StaffResult {
  const slotDef = STAFF_SLOTS[params.slot];
  if (!slotDef) return { state, error: "Choose which role this person will fill on the session." };
  const session = (state.sessions ?? []).find((s) => s.id === params.sessionId);
  if (!session) return { state, error: "This session no longer exists." };
  if (!isActiveSession(session)) return { state, error: `Session ${session.id} is ${session.status}; staffing can no longer change.` };
  const member = (state.crew ?? []).find((c) => c.id === params.crewId);
  if (!member) return { state, error: "This staff member no longer exists." };
  if (member.status === "off") return { state, error: `${member.name} is marked off. Mark them available before assigning them.` };
  if (member.territoryId !== session.territoryId) {
    const t = (state.territories ?? []).find((x) => x.id === session.territoryId);
    return { state, error: `${member.name} works in a different territory than this session (${t?.name ?? session.territoryId}).` };
  }
  if (slotDef.roles && !slotDef.roles.includes(member.role)) {
    return { state, error: `${member.name}'s role cannot be ${slotDef.label.toLowerCase()}.` };
  }
  if (resolveCrewId(state, session[slotDef.field]) === member.id) {
    return { state, error: `${member.name} is already the ${slotDef.label.toLowerCase()} for this session.` };
  }
  const conflicts = crewConflicts(state, member.id, session, now);
  if (conflicts.length > 0) {
    const c = conflicts[0];
    return { state, error: `${member.name} is already staffed on session ${c.id} (${c.date} ${c.startTime}), which overlaps this one.` };
  }

  const previous = resolveCrewId(state, session[slotDef.field]);
  const sessions = state.sessions.map((s) => (s.id === session.id ? { ...s, [slotDef.field]: member.id } : s));
  let next: PrototypeState = { ...state, sessions };
  const template = (state.templates ?? []).find((t) => t.id === session.templateId);
  const label = `${slotDef.label} — ${template?.name ?? `session ${session.id}`} (${session.date} ${session.startTime})`;
  next = {
    ...next,
    crew: next.crew.map((c) => {
      if (c.id === member.id) return { ...c, status: c.status === "checked-in" ? c.status : "assigned", assignment: label, updatedAt: new Date().toISOString() };
      return c;
    }),
  };
  next = releaseIfIdle(next, previous);
  next = pushAudit(next, {
    action: "Staff Assigned",
    description: `${member.name} assigned as ${slotDef.label.toLowerCase()} on session ${session.id}${previous && previous !== member.id ? ` (replacing ${nameOf(state, previous)})` : ""}.`,
    sessionId: session.id,
    operatorId,
  });
  return { state: next, id: member.id };
}

export function unassignCrewFromSession(
  state: PrototypeState,
  params: { sessionId: string; slot: StaffSlot; reason: string },
  operatorId?: string,
): StaffResult {
  const slotDef = STAFF_SLOTS[params.slot];
  if (!slotDef) return { state, error: "Unknown staffing role." };
  const session = (state.sessions ?? []).find((s) => s.id === params.sessionId);
  if (!session) return { state, error: "This session no longer exists." };
  if (!isActiveSession(session)) return { state, error: `Session ${session.id} is ${session.status}; staffing can no longer change.` };
  const current = session[slotDef.field];
  if (!current) return { state, error: `No one is assigned as ${slotDef.label.toLowerCase()} on this session.` };
  const reason = params.reason?.trim() ?? "";
  if (reason.length < 5) return { state, error: "Give a reason for removing this person (at least 5 characters)." };
  const crewId = resolveCrewId(state, current);
  let next: PrototypeState = { ...state, sessions: state.sessions.map((s) => (s.id === session.id ? { ...s, [slotDef.field]: "" } : s)) };
  next = releaseIfIdle(next, crewId);
  next = pushAudit(next, {
    action: "Staff Unassigned",
    description: `${nameOf(state, crewId ?? current)} removed as ${slotDef.label.toLowerCase()} on session ${session.id}. Reason: ${reason}`,
    sessionId: session.id,
    operatorId,
  });
  return { state: next };
}

/* ------------------------------- attendance ------------------------------- */

export type AttendanceAction = "check-in" | "undo-check-in" | "absent";

/**
 * Record a staff member's arrival for their shift.
 * - check-in: an assigned member has arrived.
 * - undo-check-in: reverse a mistaken check-in.
 * - absent: they did not come. They are removed from every upcoming session
 *   slot today (so those sessions show as needing staff) and marked off.
 */
export function recordStaffAttendance(
  state: PrototypeState,
  params: { crewId: string; action: AttendanceAction; reason?: string },
  operatorId?: string,
  now: Date = new Date(),
): StaffResult {
  const member = (state.crew ?? []).find((c) => c.id === params.crewId);
  if (!member) return { state, error: "This staff member no longer exists." };
  const stamp = new Date().toISOString();
  const setStatus = (st: PrototypeState, status: CrewStatus, assignment?: string): PrototypeState => ({
    ...st,
    crew: st.crew.map((c) => (c.id === member.id ? { ...c, status, ...(assignment !== undefined ? { assignment } : {}), updatedAt: stamp } : c)),
  });

  if (params.action === "check-in") {
    if (member.status === "checked-in") return { state, error: `${member.name} is already checked in.` };
    if (member.status === "off") return { state, error: `${member.name} is marked off today.` };
    const sessions = activeSessionsFor(state, member.id);
    if (member.status !== "assigned" && sessions.length === 0) return { state, error: `${member.name} is not assigned to any session. Assign them before checking them in.` };
    const next = pushAudit(setStatus(state, "checked-in"), { action: "Staff Checked In", description: `${member.name} checked in for their shift.`, sessionId: sessions[0]?.session.id, operatorId });
    return { state: next, id: member.id };
  }

  if (params.action === "undo-check-in") {
    if (member.status !== "checked-in") return { state, error: `${member.name} is not checked in.` };
    const next = pushAudit(setStatus(state, activeSessionsFor(state, member.id).length ? "assigned" : "available"), { action: "Staff Check-in Reversed", description: `Check-in for ${member.name} reversed.`, operatorId });
    return { state: next, id: member.id };
  }

  const reason = params.reason?.trim() ?? "";
  if (reason.length < 5) return { state, error: "Give a reason for the absence (at least 5 characters)." };
  const today = sessionDay("Today", now);
  let next: PrototypeState = state;
  const freed: string[] = [];
  for (const { session, slots } of activeSessionsFor(state, member.id)) {
    if (sessionDay(session.date, now) !== today) continue;
    const patch: Partial<ScheduledSession> = {};
    for (const slot of slots) patch[STAFF_SLOTS[slot].field] = "";
    next = { ...next, sessions: next.sessions.map((x) => (x.id === session.id ? { ...x, ...patch } : x)) };
    freed.push(`${session.id} (${slots.map((sl) => STAFF_SLOTS[sl].label.toLowerCase()).join(", ")})`);
  }
  next = setStatus(next, "off", "Absent today");
  next = pushAudit(next, {
    action: "Staff Absent",
    description: `${member.name} marked absent. Reason: ${reason}.${freed.length ? ` Removed from ${freed.join("; ")} — reassign these slots.` : ""}`,
    operatorId,
  });
  return { state: next, id: member.id };
}

/* ------------------------------- helpers ------------------------------- */

function nameOf(state: PrototypeState, crewId: string): string {
  return (state.crew ?? []).find((c) => c.id === crewId)?.name ?? crewId;
}

/** A crew member left with no active session returns to "available" (checked-in and off are kept). */
function releaseIfIdle(state: PrototypeState, crewId: string | undefined): PrototypeState {
  if (!crewId) return state;
  if (activeSessionsFor(state, crewId).length > 0) return state;
  return {
    ...state,
    crew: state.crew.map((c) => (c.id === crewId && c.status === "assigned" ? { ...c, status: "available" as const, assignment: "Not assigned" } : c)),
  };
}

/* ------------------------------- migration ------------------------------- */

const SLOT_FIELDS: SlotField[] = STAFF_SLOT_ORDER.map((s) => STAFF_SLOTS[s].field);

/**
 * Rewrite session staffing slots that still hold console operator ids (`op-*`)
 * to the matching crew member id, matched by name. When no crew member with
 * that name exists, one is created from the operator account so the reference
 * is never lost. Idempotent: slots that already hold crew ids are untouched.
 */
export function mapOperatorStaffToCrew(state: PrototypeState): PrototypeState {
  const operators = state.operators ?? [];
  const sessions = state.sessions ?? [];
  if (!sessions.length || !operators.length) return state;
  const crewIds = new Set((state.crew ?? []).map((c) => c.id));
  const needs = sessions.some((s) => SLOT_FIELDS.some((f) => s[f] && !crewIds.has(s[f]) && operators.some((o) => o.id === s[f])));
  if (!needs) return state;

  let crew = [...(state.crew ?? [])];
  const byName = (name: string) => crew.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  const mapped = new Map<string, string>();

  const toCrew = (opId: string, session: ScheduledSession): string => {
    const cached = mapped.get(opId);
    if (cached) return cached;
    const op = operators.find((o) => o.id === opId)!;
    let member = byName(op.name);
    if (!member) {
      const venue = (state.venues ?? []).find((v) => v.id === session.venueId);
      member = {
        id: nextId("c", crew.map((c) => c.id)),
        name: op.name,
        role: op.role,
        territoryId: venue?.territoryId ?? session.territoryId ?? op.territoryId,
        venueId: session.venueId,
        status: "assigned",
        assignment: "Session staff",
        email: op.email,
        createdAt: new Date().toISOString(),
      };
      crew = [...crew, member];
    }
    mapped.set(opId, member.id);
    return member.id;
  };

  const nextSessions = sessions.map((s) => {
    let changed = false;
    const patch: Partial<ScheduledSession> = {};
    for (const f of SLOT_FIELDS) {
      const ref = s[f];
      if (ref && !crewIds.has(ref) && operators.some((o) => o.id === ref)) {
        patch[f] = toCrew(ref, s);
        changed = true;
      }
    }
    return changed ? { ...s, ...patch } : s;
  });
  return { ...state, sessions: nextSessions, crew };
}
