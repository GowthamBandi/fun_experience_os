/**
 * Event-day operations on the server: teams, safety checks, incidents and the
 * wrap-up step (previously kept only on the organizer's phone).
 *
 * `eventDays/{eventId}` is the shared state, readable by the organizer's team
 * (firestore.rules) so every staff phone sees the same thing. One command,
 * saveEventDay, applies one operation:
 * - teams:   a drawn split {ticketId → team index}; refused once locked.
 * - lock:    freezes the split.
 * - reveal:  writes each attendee's team onto their booking (`team`, e.g.
 *            "Team B") and notifies them, so it shows on their pass.
 * - safety:  ticks or unticks one safety check.
 * - incident: appends an incident; medium/high also raise a risk alert for
 *            PULSE trust & safety.
 * - wrapUp:  remembers the wrap-up step (the server phase stays "live").
 */

import { FieldValue } from "firebase-admin/firestore";
import { docId, int, obj, oneOf, requestId } from "../platform/callable";
import { DomainError, precondition } from "../platform/errors";
import { COLLECTIONS, db } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { notify } from "../platform/notify";
import { requirePermission, actorRole } from "../access/permissions";
import { raiseRiskAlert } from "../commerce/shared";
import { notFoundHere, runCommand } from "./common";

export const EVENT_DAY_COLLECTION = "eventDays";
export const SAFETY_CHECKS = ["firstAid", "briefing", "exits", "contacts"] as const;
export const INCIDENT_SEVERITIES = ["low", "medium", "high"] as const;
const TEAM_NAMES = ["A", "B", "C", "D", "E", "F"];
const MAX_INCIDENTS = 100;
const RUNNABLE = ["published", "booking-closed", "live"];

export const teamName = (i: number) => `Team ${TEAM_NAMES[i % TEAM_NAMES.length]}`;

type Op =
  | { op: "teams"; teamCount: number; teams: Record<string, number> }
  | { op: "lock" }
  | { op: "reveal" }
  | { op: "safety"; check: (typeof SAFETY_CHECKS)[number]; done: boolean }
  | { op: "incident"; id: string; note: string; severity: (typeof INCIDENT_SEVERITIES)[number] }
  | { op: "wrapUp"; value: boolean };

function parseOp(d: Record<string, unknown>): Op {
  const op = oneOf(d.op, "op", ["teams", "lock", "reveal", "safety", "incident", "wrapUp"] as const);
  switch (op) {
    case "teams": {
      const teamCount = int(d.teamCount, "Team count", 2, 6);
      const raw = d.teams && typeof d.teams === "object" ? (d.teams as Record<string, unknown>) : {};
      const entries = Object.entries(raw);
      if (entries.length > 2000) throw new DomainError("INVALID_INPUT", "Too many participants.");
      const teams: Record<string, number> = {};
      for (const [k, v] of entries) {
        if (!/^[A-Za-z0-9_-]{4,128}$/.test(k)) throw new DomainError("INVALID_INPUT", "A participant couldn't be identified.");
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= teamCount) throw new DomainError("INVALID_INPUT", "A team number is out of range.");
        teams[k] = v;
      }
      return { op, teamCount, teams };
    }
    case "safety":
      return { op, check: oneOf(d.check, "check", SAFETY_CHECKS), done: d.done === true };
    case "incident": {
      const note = typeof d.note === "string" ? d.note.trim() : "";
      if (note.length < 5 || note.length > 1000) throw new DomainError("INVALID_INPUT", "Describe what happened (5–1000 characters).");
      const id = docId(d.id, "id");
      return { op, id, note, severity: oneOf(d.severity, "severity", INCIDENT_SEVERITIES) };
    }
    case "wrapUp":
      return { op, value: d.value === true };
    default:
      return { op };
  }
}

export async function saveEventDayCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const eventId = docId(d.eventId, "eventId");
  const op = parseOp(d);
  const dayRef = db().collection(EVENT_DAY_COLLECTION).doc(eventId);
  return runCommand("catalog.event-day-saved", uid, rid, async (tx, now) => {
    const m = await requirePermission(uid, orgId, "events.operate", { tx, eventId });
    const evSnap = await tx.get(db().collection(COLLECTIONS.events).doc(eventId));
    const ev = evSnap.data();
    if (!ev || ev.orgId !== orgId) throw notFoundHere("event");
    if (!RUNNABLE.includes(String(ev.status))) {
      throw precondition("Event-day tools are only open while the event is on sale or live.", undefined, { status: ev.status });
    }
    const daySnap = await tx.get(dayRef);
    const day = daySnap.data() ?? {};
    const base = { orgId, eventId, updatedAt: now, updatedBy: uid };

    // Reads for reveal happen before any write (transaction rule).
    let revealTargets: Array<{ bookingId: string; customerUid: string; team: number }> = [];
    if (op.op === "reveal") {
      if (!day.teamsLocked) throw precondition("Lock teams first.");
      const teams = (day.teams ?? {}) as Record<string, number>;
      const ticketIds = Object.keys(teams);
      const tickets = ticketIds.length
        ? await tx.getAll(...ticketIds.map((t) => db().collection(COLLECTIONS.tickets).doc(t)))
        : [];
      const seen = new Set<string>();
      for (const t of tickets) {
        const td = t.data();
        if (!td || td.eventId !== eventId || typeof td.bookingId !== "string") continue;
        if (seen.has(td.bookingId)) continue; // one booking, several tickets: first ticket's team
        seen.add(td.bookingId);
        revealTargets.push({ bookingId: td.bookingId, customerUid: String(td.customerUid ?? ""), team: teams[t.id]! });
      }
    }

    switch (op.op) {
      case "teams":
        if (day.teamsLocked) throw precondition("Teams are locked.");
        tx.set(dayRef, { ...base, teamCount: op.teamCount, teams: op.teams, teamsRevealed: false }, { merge: true });
        break;
      case "lock":
        if (!day.teams || Object.keys(day.teams).length === 0) throw precondition("Draw teams first.");
        tx.set(dayRef, { ...base, teamsLocked: true }, { merge: true });
        break;
      case "reveal":
        tx.set(dayRef, { ...base, teamsRevealed: true, revealedAt: now }, { merge: true });
        for (const r of revealTargets) {
          const name = teamName(r.team);
          tx.update(db().collection(COLLECTIONS.bookings).doc(r.bookingId), { team: name, updatedAt: now });
          if (r.customerUid) {
            notify(tx, {
              recipientUid: r.customerUid,
              kind: "event-changed",
              title: `You're in ${name}`,
              body: `Teams are out for ${String(ev.title ?? "your experience")}. Your pass shows your team.`,
              dedupeKey: `${eventId}-team`,
              link: { type: "booking", id: r.bookingId },
            });
          }
        }
        break;
      case "safety":
        tx.set(dayRef, { ...base, safetyChecks: op.done ? FieldValue.arrayUnion(op.check) : FieldValue.arrayRemove(op.check) }, { merge: true });
        break;
      case "incident": {
        const list = Array.isArray(day.incidents) ? day.incidents : [];
        if (list.length >= MAX_INCIDENTS) throw precondition("This event has the maximum number of incidents logged.");
        if (list.some((i: { id?: string }) => i.id === op.id)) break; // replayed from another phone
        tx.set(dayRef, { ...base, incidents: FieldValue.arrayUnion({ id: op.id, note: op.note, severity: op.severity, at: now, by: uid }) }, { merge: true });
        if (op.severity !== "low") {
          raiseRiskAlert(tx, `incident_${eventId}_${op.id}`, {
            kind: "event-incident",
            severity: op.severity,
            orgId,
            summary: `${op.severity === "high" ? "High" : "Medium"} incident at ${String(ev.title ?? eventId)}`,
            detail: { eventId, incidentId: op.id, note: op.note },
          });
        }
        break;
      }
      case "wrapUp":
        tx.set(dayRef, { ...base, wrapUp: op.value }, { merge: true });
        break;
    }
    writeAudit(tx, {
      action: `catalog.event-day-${op.op}`, actorUid: uid, actorRole: actorRole(m), resourceType: "event", resourceId: eventId, orgId,
      after: op.op === "incident" ? { severity: op.severity } : op.op === "safety" ? { check: op.check, done: op.done } : op.op === "teams" ? { teamCount: op.teamCount, participants: Object.keys(op.teams).length } : { op: op.op },
      requestId: rid,
    });
    return { eventId, op: op.op, revealed: revealTargets.length };
  }, { authorize: (tx) => requirePermission(uid, orgId, "events.operate", { tx, eventId }) });
}
