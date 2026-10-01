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
 *
 * A typed booking reference (`PLS-XXXXXX`, printed on the pass) is the door
 * fallback when a QR won't scan. Steps 1–2 are the same; the reference is
 * looked up among THIS event's tickets only (another event's reference is
 * `invalid`, revealing nothing), and each entry admits the next valid spot of
 * the booking, so a party of three is typed three times.
 */

import type { Transaction } from "firebase-admin/firestore";
import { db, sessionRef, serverNow } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { notFound } from "../platform/errors";
import { consumeRateLimit } from "../platform/rateLimit";
import { requirePermission, actorRole } from "../access/permissions";
import type { EventDoc } from "../bookings/reserveSeat";
import { C, RATE_LIMITS } from "./config";
import { iso, ticketRef } from "./shared";
import { parseBookingReference, parseTicketPayload, verifyTicketSignature, type TicketDoc } from "./tickets";

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
  if (!parsed) {
    const reference = parseBookingReference(input.payload);
    if (!reference) return rejected("invalid", null);
    return scanReference(scannerUid, role, event, input, reference, rejected);
  }

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

async function scanReference(
  scannerUid: string,
  role: string,
  event: EventDoc,
  input: { requestId: string; eventId: string },
  reference: string,
  rejected: (result: ScanResult, ticketId: string | null) => Promise<ScanResponse>
): Promise<ScanResponse> {
  const found = await db()
    .collection(C.tickets)
    .where("eventId", "==", input.eventId)
    .where("reference", "==", reference)
    .limit(20)
    .get();
  if (found.empty) return rejected("invalid", null);

  return db().runTransaction(async (tx: Transaction): Promise<ScanResponse> => {
    const snaps = await Promise.all(found.docs.map((d) => tx.get(d.ref)));
    const tickets = snaps
      .map((x) => x.data() as TicketDoc)
      .filter((t) => t && t.eventId === input.eventId)
      .sort((a, b) => a.spotIndex - b.spotIndex);
    const view = (t: TicketDoc, checkedInAt: string | null) => ({
      ticketId: t.ticketId,
      alias: t.alias,
      spotsLabel: t.spotsLabel,
      checkedInAt,
    });

    // A retry of the same request answers with the spot it admitted.
    const replay = tickets.find((t) => t.status === "used" && t.scanRequestId === input.requestId && t.checkedInBy === scannerUid);
    if (replay) return { result: "checked-in", ticket: view(replay, iso(replay.checkedInAt)) };

    const next = tickets.find((t) => t.status === "valid");
    if (!next) {
      const used = tickets.filter((t) => t.status === "used");
      if (used.length) {
        const last = used.reduce((a, b) => ((b.checkedInAt?.toMillis() ?? 0) > (a.checkedInAt?.toMillis() ?? 0) ? b : a));
        return { result: "already-used", ticket: view(last, iso(last.checkedInAt)) };
      }
      const t = tickets[0];
      if (!t) return { result: "invalid" };
      return { result: t.status === "cancelled" || t.status === "refunded" || t.status === "expired" ? t.status : "invalid", ticket: view(t, null) };
    }
    if (event.status === "cancelled" || event.status === "completed") {
      return { result: event.status === "cancelled" ? "cancelled" : "expired", ticket: view(next, null) };
    }
    const now = serverNow();
    tx.update(ticketRef(next.ticketId), {
      status: "used",
      checkedInAt: now,
      checkedInBy: scannerUid,
      scanRequestId: input.requestId,
      checkInMethod: "reference",
      updatedAt: now,
    });
    writeAudit(tx, {
      action: "ticket.checked-in",
      actorUid: scannerUid,
      actorRole: role,
      resourceType: "ticket",
      resourceId: next.ticketId,
      orgId: next.orgId,
      before: { status: "valid" },
      after: { status: "used", eventId: next.eventId, bookingId: next.bookingId, method: "reference" },
      requestId: input.requestId,
    });
    return { result: "checked-in", ticket: view(next, now.toDate().toISOString()) };
  });
}
