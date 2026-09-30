/**
 * Signed admission tickets (ADR-0005 "Tickets and QR").
 *
 * QR payload: `PX1.<ticketId>.<sig>` where
 *   sig = base64url(HMAC-SHA256(TICKET_SIGNING_KEY, "PX1|ticketId|eventId|bookingId")).slice(0, 22)
 * (22 base64url chars = 132 bits). The payload carries no personal data.
 */

import type { Transaction } from "firebase-admin/firestore";
import { db, serverNow, Timestamp } from "../platform/firestore";
import { SECRET_NAMES, base64url, hmac, safeEqual, secret } from "../platform/security";
import { C } from "./config";

export const TICKET_PREFIX = "PX1";
const PAYLOAD_RE = /^PX1\.([A-Za-z0-9]{20})\.([A-Za-z0-9_-]{22})$/;

export type TicketStatus = "valid" | "used" | "cancelled" | "refunded" | "expired";

export interface TicketDoc {
  ticketId: string;
  bookingId: string;
  eventId: string;
  orgId: string;
  customerUid: string;
  alias: string;
  spotIndex: number;
  spots: number;
  spotsLabel: string;
  status: TicketStatus;
  issuedAt: Timestamp;
  checkedInAt: Timestamp | null;
  checkedInBy: string | null;
  scanRequestId: string | null;
}

export function ticketSignature(ticketId: string, eventId: string, bookingId: string): string {
  const mac = hmac(secret(SECRET_NAMES.ticketKey), `${TICKET_PREFIX}|${ticketId}|${eventId}|${bookingId}`);
  return base64url(mac).slice(0, 22);
}

export function ticketPayload(ticketId: string, eventId: string, bookingId: string): string {
  return `${TICKET_PREFIX}.${ticketId}.${ticketSignature(ticketId, eventId, bookingId)}`;
}

/** Syntactic parse only; the signature is checked by `verifyTicketSignature`. */
export function parseTicketPayload(payload: unknown): { ticketId: string; sig: string } | null {
  if (typeof payload !== "string") return null;
  const m = PAYLOAD_RE.exec(payload.trim());
  return m ? { ticketId: m[1]!, sig: m[2]! } : null;
}

export function verifyTicketSignature(sig: string, ticketId: string, eventId: string, bookingId: string): boolean {
  return safeEqual(ticketSignature(ticketId, eventId, bookingId), sig);
}

/**
 * Issues one ticket per spot inside the caller's transaction, with the QR
 * payload in `ticketSecrets/{ticketId}` (readable only by the holder).
 */
export function issueTickets(
  tx: Transaction,
  b: { bookingId: string; eventId: string; orgId: string; customerUid: string; alias: string; spots: number }
): string[] {
  const now = serverNow();
  const ids: string[] = [];
  for (let i = 0; i < b.spots; i++) {
    const ref = db().collection(C.tickets).doc();
    const doc: TicketDoc = {
      ticketId: ref.id,
      bookingId: b.bookingId,
      eventId: b.eventId,
      orgId: b.orgId,
      customerUid: b.customerUid,
      alias: b.alias,
      spotIndex: i + 1,
      spots: b.spots,
      spotsLabel: b.spots === 1 ? "1 spot" : `Spot ${i + 1} of ${b.spots}`,
      status: "valid",
      issuedAt: now,
      checkedInAt: null,
      checkedInBy: null,
      scanRequestId: null,
    };
    tx.create(ref, doc);
    tx.create(db().collection(C.ticketSecrets).doc(ref.id), {
      ticketId: ref.id,
      customerUid: b.customerUid,
      eventId: b.eventId,
      bookingId: b.bookingId,
      payload: ticketPayload(ref.id, b.eventId, b.bookingId),
      issuedAt: now,
    });
    ids.push(ref.id);
  }
  return ids;
}
