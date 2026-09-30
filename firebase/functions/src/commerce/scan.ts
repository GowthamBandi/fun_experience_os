/**
 * Door check-in (ADR-0005 "Tickets and QR").
 *
 * Order of checks:
 *  1. rate limit per scanner;
 *  2. the scanner holds `tickets.scan` for THIS event (fresh membership read,
 *     so revocation is immediate) — otherwise NOT_PERMITTED;
 *  3. the QR signature — a forged/altered payload is `invalid` and writes
 *     nothing but an audit record;
 *  4. the ticket belongs to the scanned event — otherwise `wrong-event`;
 *  5. a transaction moves `valid → used` exactly once. A replay of the same
 *     scanRequestId returns the same `checked-in`; any other second scan is
 *     `already-used` with the first check-in time.
 */

import { db, sessionRef, serverNow } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { notFound } from "../platform/errors";
import { consumeRateLimit } from "../platform/rateLimit";
import { requirePermission, actorRole } from "../access/permissions";
import type { EventDoc } from "../bookings/reserveSeat";
import { RATE_LIMITS } from "./config";
import { iso, ticketRef } from "./shared";
import { parseTicketPayload, verifyTicketSignature, type TicketDoc } from "./tickets";

export type ScanResult = "checked-in" | "already-used" | "cancelled" | "refunded" | "expired" | "wrong-event" | "invalid";

export interface ScanResponse {
  result: ScanResult;
  ticket?: { ticketId: string; alias: string; spotsLabel: string; checkedInAt: string | null };
}

export async function scanTicket(
  scannerUid: string,
  input: { requestId: string; eventId: string; payload: string }
): Promise<ScanResponse> {
  await consumeRateLimit({
    bucket: `scan_${scannerUid}`,
    ...RATE_LIMITS.scan,
    message: "Scanning too fast. Wait a moment and scan again.",
  });

  const eSnap = await sessionRef(input.eventId).get();
  if (!eSnap.exists) throw notFound("We couldn't find that event.");
  const event = eSnap.data() as EventDoc;
  const membership = await requirePermission(scannerUid, event.orgId ?? "", "tickets.scan", { eventId: input.eventId });
  const role = actorRole(membership);

  const rejected = async (result: ScanResult, ticketId: string | null) => {
    const batch = db().batch();
    writeAudit(batch, {
      action: "ticket.scan-rejected",
      actorUid: scannerUid,
      actorRole: role,
      resourceType: "ticket",
      resourceId: ticketId ?? "unknown",
      orgId: event.orgId ?? null,
      after: { result, eventId: input.eventId },
      requestId: input.requestId,
    });
    await batch.commit();
    return { result } as ScanResponse;
  };

  const parsed = parseTicketPayload(input.payload);
  if (!parsed) return rejected("invalid", null);

  const tSnap = await ticketRef(parsed.ticketId).get();
  if (!tSnap.exists) return rejected("invalid", null);
  const t0 = tSnap.data() as TicketDoc;
  if (!verifyTicketSignature(parsed.sig, t0.ticketId, t0.eventId, t0.bookingId)) {
    return rejected("invalid", null);
  }
  if (t0.eventId !== input.eventId) return rejected("wrong-event", t0.ticketId);

  return db().runTransaction(async (tx): Promise<ScanResponse> => {
    const snap = await tx.get(ticketRef(t0.ticketId));
    const t = snap.data() as TicketDoc;
    const view = (checkedInAt: string | null) => ({
      ticketId: t.ticketId,
      alias: t.alias,
      spotsLabel: t.spotsLabel,
      checkedInAt,
    });
    switch (t.status) {
      case "used":
        if (t.scanRequestId === input.requestId && t.checkedInBy === scannerUid) {
          return { result: "checked-in", ticket: view(iso(t.checkedInAt)) };
        }
        return { result: "already-used", ticket: view(iso(t.checkedInAt)) };
      case "cancelled":
      case "refunded":
      case "expired":
        return { result: t.status, ticket: view(null) };
      case "valid": {
        if (event.status === "cancelled" || event.status === "completed") {
          return { result: event.status === "cancelled" ? "cancelled" : "expired", ticket: view(null) };
        }
        const now = serverNow();
        tx.update(ticketRef(t.ticketId), {
          status: "used",
          checkedInAt: now,
          checkedInBy: scannerUid,
          scanRequestId: input.requestId,
          updatedAt: now,
        });
        writeAudit(tx, {
          action: "ticket.checked-in",
          actorUid: scannerUid,
          actorRole: role,
          resourceType: "ticket",
          resourceId: t.ticketId,
          orgId: t.orgId,
          before: { status: "valid" },
          after: { status: "used", eventId: t.eventId, bookingId: t.bookingId },
          requestId: input.requestId,
        });
        return { result: "checked-in", ticket: view(now.toDate().toISOString()) };
      }
      default:
        return { result: "invalid" };
    }
  });
}
