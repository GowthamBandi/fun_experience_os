/**
 * Support requests and problem reports (customers and organizers).
 *
 * `supportRequests/{id}` holds one conversation: the opening message, every
 * reply (customer ↔ PULSE operations) and its status. The person who opened
 * it reads it (rules); only these commands write it.
 * - submitSupportRequest: opens one. A safety report also raises a risk
 *   alert so it lands in the console's Risk queue.
 * - addSupportMessage: the opener replies on their own open request.
 * - respondSupportRequest (console): ops reply and/or change the status;
 *   the opener gets a notification that leads back to the conversation.
 */

import { FieldValue } from "firebase-admin/firestore";
import { writeAudit } from "../platform/audit";
import { db, serverNow, Timestamp } from "../platform/firestore";
import { DomainError, notFound, precondition } from "../platform/errors";
import { notify } from "../platform/notify";
import { consumeRateLimit } from "../platform/rateLimit";
import { raiseRiskAlert } from "../commerce/shared";

export const SUPPORT_COLLECTION = "supportRequests";

export const SUPPORT_KINDS = ["help", "report"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

/** Who is asking: a customer, or an organizer about their workspace. */
export const SUPPORT_AUDIENCES = ["customer", "organizer"] as const;
export type SupportAudience = (typeof SUPPORT_AUDIENCES)[number];

export const SUPPORT_TOPICS = [
  // help
  "booking", "payment", "refund", "account", "trip", "hosting", "payouts", "verification", "other",
  // report
  "safety", "harassment", "no-show-host", "misleading-listing", "venue", "spam",
] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

/** Reports about a person's safety go straight to the risk queue as high severity. */
const SAFETY_TOPICS: SupportTopic[] = ["safety", "harassment"];

export const SUPPORT_CONTEXT_TYPES = ["none", "booking", "event", "trip-booking", "trip", "listing", "organizer"] as const;
export type SupportContextType = (typeof SUPPORT_CONTEXT_TYPES)[number];

export const SUPPORT_STATUSES = ["open", "waiting-on-customer", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export interface SupportMessage {
  from: "customer" | "pulse";
  body: string;
  at: Timestamp;
  /** Ops uid for "pulse" messages (never shown to the customer). */
  by?: string;
  /** The automatic acknowledgement sent on arrival. */
  auto?: boolean;
}

export interface SupportRequestDoc {
  id: string;
  uid: string;
  audience: SupportAudience;
  orgId: string | null;
  kind: SupportKind;
  topic: SupportTopic;
  subject: string;
  context: { type: SupportContextType; id: string | null };
  status: SupportStatus;
  priority: "normal" | "high";
  messages: SupportMessage[];
  lastFrom: "customer" | "pulse";
  /** Consumer Protection (E-Commerce) Rules 2020: acknowledged within 48 h
   *  (automatically, on arrival) and resolved within one month. */
  acknowledgedAt: Timestamp;
  resolveBy: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Resolve within one month of the complaint. */
export const RESOLVE_WITHIN_DAYS = 30;

export function acknowledgement(ref: string, kind: SupportKind): string {
  return kind === "report"
    ? `We've received your report (reference ${ref}). PULSE's trust & safety team reviews it and replies within 48 hours; we resolve every complaint within one month. If anyone is in danger, call 112.`
    : `We've received your message (reference ${ref}). We reply within 48 hours and resolve every request within one month.`;
}

const MAX_MESSAGES = 60;
const ID_RE = /^[A-Za-z0-9_-]{4,128}$/;

function text(v: unknown, field: string, min: number, max: number, label: string): string {
  const s = typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "";
  if (s.length < min || s.length > max) {
    throw new DomainError("INVALID_INPUT", `${label} must be ${min}–${max} characters.`, { detail: { field } });
  }
  return s;
}

export interface SubmitSupportInput {
  requestId: string;
  audience: SupportAudience;
  orgId: string | null;
  kind: SupportKind;
  topic: SupportTopic;
  message: string;
  context: { type: SupportContextType; id: string | null };
}

export function parseSubmitSupport(data: unknown): SubmitSupportInput {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const requestId = typeof d.requestId === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(d.requestId) ? d.requestId : "";
  if (!requestId) throw new DomainError("INVALID_INPUT", "requestId is required.");
  const audience = SUPPORT_AUDIENCES.includes(d.audience as SupportAudience) ? (d.audience as SupportAudience) : "customer";
  const kind = d.kind;
  if (!SUPPORT_KINDS.includes(kind as SupportKind)) throw new DomainError("INVALID_INPUT", "Choose help or report.");
  if (!SUPPORT_TOPICS.includes(d.topic as SupportTopic)) throw new DomainError("INVALID_INPUT", "Choose what this is about.");
  const message = text(d.message, "message", 10, 2000, "Your message");
  const c = (d.context && typeof d.context === "object" ? d.context : {}) as Record<string, unknown>;
  const type = SUPPORT_CONTEXT_TYPES.includes(c.type as SupportContextType) ? (c.type as SupportContextType) : "none";
  const id = type === "none" ? null : typeof c.id === "string" && ID_RE.test(c.id) ? c.id : null;
  if (type !== "none" && !id) throw new DomainError("INVALID_INPUT", "The linked booking couldn't be identified.");
  const orgId = audience === "organizer" ? (typeof d.orgId === "string" && ID_RE.test(d.orgId) ? d.orgId : null) : null;
  if (audience === "organizer" && !orgId) throw new DomainError("INVALID_INPUT", "Open your organizer workspace first.");
  return { requestId, audience, orgId, kind: kind as SupportKind, topic: d.topic as SupportTopic, message, context: { type, id } };
}

const TOPIC_LABEL: Record<SupportTopic, string> = {
  booking: "Booking", payment: "Payment", refund: "Refund", account: "Account", trip: "Trip", hosting: "Hosting",
  payouts: "Payouts", verification: "Verification", other: "Other", safety: "Safety concern", harassment: "Harassment",
  "no-show-host": "Host didn't show", "misleading-listing": "Misleading listing", venue: "Venue problem", spam: "Spam or scam",
};

/** Checks the linked record belongs to the caller (so a report can't point at someone else's booking). */
async function assertContext(uid: string, input: SubmitSupportInput): Promise<void> {
  const { type, id } = input.context;
  if (type === "none" || !id) return;
  const own = async (collection: string, field: string) => {
    const snap = await db().collection(collection).doc(id).get();
    if (!snap.exists || snap.data()?.[field] !== uid) throw notFound("We couldn't find that booking.");
  };
  if (type === "booking") return own("bookings", "customerUid");
  if (type === "trip-booking") return own("tripBookings", "customerUid");
  if (type === "listing" || type === "organizer") {
    if (!input.orgId) throw notFound("Open your organizer workspace first.");
    const m = await db().collection("memberships").doc(`${input.orgId}__${uid}`).get();
    if (!m.exists || m.data()?.status !== "active") throw new DomainError("NOT_PERMITTED", "You're not part of this organizer.");
  }
  // event / trip: public listings, nothing to own.
}

export async function submitSupportRequest(uid: string, input: SubmitSupportInput): Promise<{ id: string; status: SupportStatus; replayed: boolean }> {
  await consumeRateLimit({
    bucket: `support-${uid}`,
    limit: 10,
    windowSeconds: 24 * 60 * 60,
    message: "You've sent a lot of requests today. We'll answer the ones you've sent; try again tomorrow.",
  });
  await assertContext(uid, input);
  const receipt = db().collection("commandReceipts").doc(`support_${uid}_${input.requestId}`);
  const ref = db().collection(SUPPORT_COLLECTION).doc();
  return db().runTransaction(async (tx) => {
    const r = await tx.get(receipt);
    if (r.exists) return { ...(r.data()!.result as { id: string; status: SupportStatus }), replayed: true };
    const now = serverNow();
    const high = input.kind === "report" && SAFETY_TOPICS.includes(input.topic);
    const doc: SupportRequestDoc = {
      id: ref.id,
      uid,
      audience: input.audience,
      orgId: input.orgId,
      kind: input.kind,
      topic: input.topic,
      subject: TOPIC_LABEL[input.topic],
      context: input.context,
      status: "open",
      priority: high ? "high" : "normal",
      messages: [
        { from: "customer", body: input.message, at: now },
        { from: "pulse", body: acknowledgement(`SR-${ref.id.slice(0, 6).toUpperCase()}`, input.kind), at: now, auto: true },
      ],
      lastFrom: "customer",
      acknowledgedAt: now,
      resolveBy: Timestamp.fromMillis(now.toMillis() + RESOLVE_WITHIN_DAYS * 24 * 3600 * 1000),
      createdAt: now,
      updatedAt: now,
    };
    tx.set(ref, doc);
    if (input.kind === "report") {
      raiseRiskAlert(tx, `support_${ref.id}`, {
        kind: "user-report",
        severity: high ? "high" : "medium",
        orgId: input.orgId,
        summary: `${TOPIC_LABEL[input.topic]} reported${input.context.type !== "none" ? ` (${input.context.type} ${input.context.id})` : ""}`,
        detail: { supportRequestId: ref.id, topic: input.topic, context: input.context },
      });
    }
    writeAudit(tx, {
      action: input.kind === "report" ? "support.report-submitted" : "support.request-submitted",
      actorUid: uid,
      actorRole: input.audience === "organizer" ? `org:${input.orgId}:member` : "customer",
      resourceType: "supportRequest",
      resourceId: ref.id,
      orgId: input.orgId,
      after: { kind: input.kind, topic: input.topic, context: input.context, priority: doc.priority },
      requestId: input.requestId,
    });
    const result = { id: ref.id, status: "open" as SupportStatus };
    tx.set(receipt, { command: "submitSupportRequest", actorUid: uid, requestId: input.requestId, result, at: now });
    return { ...result, replayed: false };
  });
}

/** The opener adds a message to their own request (reopens a waiting one). */
export async function addSupportMessage(uid: string, input: { id: string; message: string }): Promise<{ id: string; status: SupportStatus }> {
  const body = text(input.message, "message", 1, 2000, "Your message");
  const ref = db().collection(SUPPORT_COLLECTION).doc(input.id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const s = snap.data() as SupportRequestDoc | undefined;
    if (!s || s.uid !== uid) throw notFound("We couldn't find that request.");
    if (s.status === "resolved") throw precondition("This request is closed.", "Start a new request if you still need help.");
    if (s.messages.length >= MAX_MESSAGES) throw precondition("This conversation is full.", "Start a new request.");
    const now = serverNow();
    tx.update(ref, {
      messages: FieldValue.arrayUnion({ from: "customer", body, at: now }),
      lastFrom: "customer",
      status: "open",
      updatedAt: now,
    });
    return { id: input.id, status: "open" as SupportStatus };
  });
}

/** Console: reply and/or set the status. The opener is notified of a reply or a resolution. */
export async function respondSupportRequest(
  admin: { uid: string; roleId: string },
  input: { requestId: string; id: string; message: string | null; status: SupportStatus }
): Promise<{ id: string; status: SupportStatus }> {
  const body = input.message === null ? null : text(input.message, "message", 1, 4000, "The reply");
  const ref = db().collection(SUPPORT_COLLECTION).doc(input.id);
  const receipt = db().collection("commandReceipts").doc(`supportReply_${admin.uid}_${input.requestId}`);
  return db().runTransaction(async (tx) => {
    const r = await tx.get(receipt);
    if (r.exists) return r.data()!.result as { id: string; status: SupportStatus };
    const snap = await tx.get(ref);
    const s = snap.data() as SupportRequestDoc | undefined;
    if (!s) throw notFound("This request no longer exists.");
    if (!body && input.status === s.status) throw new DomainError("INVALID_INPUT", "Write a reply or change the status.");
    const now = serverNow();
    const patch: Record<string, unknown> = { status: input.status, updatedAt: now };
    if (body) {
      patch.messages = FieldValue.arrayUnion({ from: "pulse", body, at: now, by: admin.uid });
      patch.lastFrom = "pulse";
    }
    tx.update(ref, patch);
    writeAudit(tx, {
      action: body ? "support.replied" : "support.status-changed",
      actorUid: admin.uid,
      actorRole: `platform:${admin.roleId}`,
      resourceType: "supportRequest",
      resourceId: input.id,
      orgId: s.orgId,
      before: { status: s.status },
      after: { status: input.status, replied: !!body },
      requestId: input.requestId,
      source: "operations-console",
    });
    if (body || input.status === "resolved") {
      notify(tx, {
        recipientUid: s.uid,
        kind: "support-reply",
        title: body ? `PULSE replied: ${s.subject}` : `Resolved: ${s.subject}`,
        body: body ? body.slice(0, 160) : "We've marked your request as resolved. Reply if you still need help.",
        dedupeKey: `${input.id}-${now.toMillis()}`,
        link: { type: "support-request", id: input.id },
      });
    }
    const result = { id: input.id, status: input.status };
    tx.set(receipt, { command: "respondSupportRequest", actorUid: admin.uid, requestId: input.requestId, result, at: now });
    return result;
  });
}
