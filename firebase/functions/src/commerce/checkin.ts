/**
 * Manual door check-in and the organizer attendee list (ADR-0005 "Tickets
 * and QR"; docs/API_CONTRACT.md "Commerce").
 *
 * `checkInManually` is the fallback when a guest can't show their QR (dead
 * phone, no signal). It has the same `valid → used` semantics and response
 * shape as `scanTicket`, but:
 *   - the ticket is named by id (the organizer picks it from the attendee
 *     list), so there is no signature to verify — the permission check and
 *     the event binding are the whole gate;
 *   - a reason is mandatory and recorded on the ticket and the audit trail;
 *   - it is idempotent through a command receipt bound to (scanner,
 *     requestId): a replay returns the stored result without writing.
 *
 * `listEventAttendees` is a read model for the event-day screen. It returns
 * aliases and ticket ids only — never the customer's uid, phone, age or
 * gender (ADR-0003 privacy boundary).
 */

import { db, receiptRef, sessionRef, serverNow } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { notFound } from "../platform/errors";
import { consumeRateLimit } from "../platform/rateLimit";
import { requirePermission, actorRole } from "../access/permissions";
import type { BookingDoc, EventDoc } from "../bookings/reserveSeat";
import { C, RATE_LIMITS } from "./config";
import { iso, ticketRef } from "./shared";
import type { ScanResponse } from "./scan";
import type { TicketDoc } from "./tickets";

export type ManualCheckInResponse = ScanResponse;

export async function checkInManually(
  scannerUid: string,
  input: { requestId: string; eventId: string; ticketId: string; reason: string }
): Promise<ManualCheckInResponse> {
  await consumeRateLimit({
    bucket: `scan_${scannerUid}`,
    ...RATE_LIMITS.scan,
    message: "Checking in too fast. Wait a moment and try again.",
  });

  const eSnap = await sessionRef(input.eventId).get();
  if (!eSnap.exists) throw notFound("We couldn't find that event.");
  const event = eSnap.data() as EventDoc;
  // Fresh membership read: revocation applies to the very next request.
  const membership = await requirePermission(scannerUid, event.orgId ?? "", "tickets.scan", { eventId: input.eventId });
  const role = actorRole(membership);
  const receipt = receiptRef(`checkInManually_${scannerUid}_${input.requestId}`);

  return db().runTransaction(async (tx): Promise<ManualCheckInResponse> => {
    const rSnap = await tx.get(receipt);
    if (rSnap.exists) return (rSnap.data() as { result: ManualCheckInResponse }).result;

    const snap = await tx.get(ticketRef(input.ticketId));
    const now = serverNow();
    const finish = (out: ManualCheckInResponse): ManualCheckInResponse => {
      tx.create(receipt, {
        command: "checkInManually",
        actorUid: scannerUid,
        requestId: input.requestId,
        result: out,
        at: now,
      });
      return out;
    };

    // Unknown ticket, or a ticket of another event (possibly another org):
    // both answer `wrong-event` and reveal nothing about the ticket.
    if (!snap.exists || (snap.data() as TicketDoc).eventId !== input.eventId) {
      writeAudit(tx, {
        action: "ticket.scan-rejected",
        actorUid: scannerUid,
        actorRole: role,
        resourceType: "ticket",
        resourceId: input.ticketId,
        orgId: event.orgId ?? null,
        after: { result: "wrong-event", eventId: input.eventId, method: "manual" },
        requestId: input.requestId,
      });
      return finish({ result: "wrong-event" });
    }

    const t = snap.data() as TicketDoc;
    const view = (checkedInAt: string | null) => ({
      ticketId: t.ticketId,
      alias: t.alias,
      spotsLabel: t.spotsLabel,
      checkedInAt,
    });
    switch (t.status) {
      case "used":
        return finish({ result: "already-used", ticket: view(iso(t.checkedInAt)) });
      case "cancelled":
      case "refunded":
      case "expired":
        return finish({ result: t.status, ticket: view(null) });
      case "valid": {
        if (event.status === "cancelled" || event.status === "completed") {
          return finish({ result: event.status === "cancelled" ? "cancelled" : "expired", ticket: view(null) });
        }
        tx.update(ticketRef(t.ticketId), {
          status: "used",
          checkedInAt: now,
          checkedInBy: scannerUid,
          scanRequestId: input.requestId,
          checkInMethod: "manual",
          checkInReason: input.reason,
          updatedAt: now,
        });
        writeAudit(tx, {
          action: "ticket.checked-in-manually",
          actorUid: scannerUid,
          actorRole: role,
          resourceType: "ticket",
          resourceId: t.ticketId,
          orgId: t.orgId,
          before: { status: "valid" },
          after: { status: "used", eventId: t.eventId, bookingId: t.bookingId, method: "manual" },
          reason: input.reason,
          requestId: input.requestId,
        });
        return finish({ result: "checked-in", ticket: view(now.toDate().toISOString()) });
      }
      default:
        return finish({ result: "invalid" });
    }
  });
}

/* ======================================================== listEventAttendees */

export interface AttendeeRow {
  bookingId: string;
  ticketId: string;
  alias: string;
  status: TicketDoc["status"];
  checkedInAt: string | null;
  spotsLabel: string;
  /** When the booking was made (booking createdAt). */
  bookedAt: string | null;
}

/** Booking states whose tickets belong on the door list. */
const LISTED_BOOKINGS: ReadonlySet<BookingDoc["status"]> = new Set<BookingDoc["status"]>([
  "confirmed",
  "completed",
  "cancelled",
]);

export async function listEventAttendees(
  uid: string,
  input: { orgId: string; eventId: string }
): Promise<{ attendees: AttendeeRow[] }> {
  const eSnap = await sessionRef(input.eventId).get();
  const event = eSnap.data() as EventDoc | undefined;
  // Same answer for a missing event and one of another organizer.
  if (!event || event.orgId !== input.orgId) throw notFound("We couldn't find that event.");
  await requirePermission(uid, input.orgId, "attendees.view", { eventId: input.eventId });

  const [tickets, bookings] = await Promise.all([
    db().collection(C.tickets).where("eventId", "==", input.eventId).get(),
    db().collection(C.bookings).where("eventId", "==", input.eventId).get(),
  ]);
  const bookingInfo = new Map<string, { status: BookingDoc["status"]; bookedAt: string | null }>();
  for (const b of bookings.docs) {
    const d = b.data() as BookingDoc;
    if (d.orgId === input.orgId) bookingInfo.set(b.id, { status: d.status, bookedAt: iso(d.createdAt) });
  }

  const attendees: AttendeeRow[] = [];
  for (const doc of tickets.docs) {
    const t = doc.data() as TicketDoc;
    if (t.orgId !== input.orgId) continue;
    const b = bookingInfo.get(t.bookingId);
    if (b && !LISTED_BOOKINGS.has(b.status)) continue;
    // Whitelisted projection: never spread the ticket (it carries customerUid).
    attendees.push({
      bookingId: t.bookingId,
      ticketId: t.ticketId,
      alias: t.alias,
      status: t.status,
      checkedInAt: iso(t.checkedInAt),
      spotsLabel: t.spotsLabel,
      bookedAt: b?.bookedAt ?? iso(t.issuedAt),
    });
  }
  attendees.sort((a, b) => a.alias.localeCompare(b.alias) || a.ticketId.localeCompare(b.ticketId));
  return { attendees };
}
