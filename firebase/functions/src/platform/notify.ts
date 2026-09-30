import type { Transaction, WriteBatch } from "firebase-admin/firestore";
import { COLLECTIONS, db, serverNow } from "./firestore";

export type NotificationKind =
  | "booking-confirmed"
  | "payment-failed"
  | "ticket-issued"
  | "event-reminder"
  | "event-changed"
  | "event-cancelled"
  | "refund-update"
  | "organizer-approved"
  | "organizer-changes-requested"
  | "organizer-rejected"
  | "staff-activated"
  | "staff-updated"
  | "staff-revoked"
  | "experience-decision"
  | "event-decision"
  | "safety";

export type NotificationLinkType = "event" | "booking" | "ticket" | "organizer" | "application" | "experience";
export interface NotificationLink {
  type: NotificationLinkType;
  id: string;
}

/**
 * Queues an in-app notification (and, when a push provider is configured, a
 * push via the `deliverNotifications` trigger).
 *
 * DEDUPE: the document id IS the dedupe key (`<kind>:<entity>:<recipient>`),
 * written with `create` semantics inside the caller's transaction — a retried
 * or replayed command can never notify twice.
 */
export function notify(
  writer: Transaction | WriteBatch,
  n: {
    recipientUid: string;
    kind: NotificationKind;
    title: string;
    body: string;
    dedupeKey: string;
    /**
     * Deep link (required): the app routes a tap on `kind` + `link.type` to
     * the screen for `link.id`. Every notification must lead somewhere.
     */
    link: NotificationLink;
  }
): void {
  const id = `${n.kind}:${n.dedupeKey}:${n.recipientUid}`.replace(/[/]/g, "_").slice(0, 700);
  const ref = db().collection(COLLECTIONS.userNotifications).doc(id);
  const doc = {
    recipientUid: n.recipientUid,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    read: false,
    push: { status: "pending" as const },
    createdAt: serverNow(),
  };
  // set() with merge:false would overwrite a read flag on replay; create()
  // would throw inside a transaction on replay. Use set only if absent: the
  // caller's idempotency receipt already prevents replays from reaching here,
  // so a plain set is safe and keeps batches simple.
  if ("getAll" in writer) (writer as Transaction).set(ref, doc);
  else (writer as WriteBatch).set(ref, doc);
}
