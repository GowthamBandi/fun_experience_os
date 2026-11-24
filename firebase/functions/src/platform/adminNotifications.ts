/**
 * Notifications from PULSE to chosen people (docs/NOTIFICATION_CENTER_CONTRACT.md §2 / §5):
 * an inbox item (`userNotifications`, kind "admin-message") for every
 * recipient plus a push — the `all` topic for everyone (no filters), city
 * topics for cities, otherwise each person's devices through the existing
 * `deliverNotifications` trigger. History in `adminNotifications/{id}`.
 *
 * Quotas: all / customers / cities share sendBroadcast's 3-a-day (a
 * `broadcasts` doc per send); users / orgs sends are rate-limited 60/hour per
 * admin. Scheduled sends go out from runNotificationJobs (every 5 min).
 * Templates (`notificationTemplates`) are saved and deleted here too.
 */
import type { DocumentData } from "firebase-admin/firestore";
import { callable, docId, obj, oneOf, str } from "./callable";
import { requireCapability, type VerifiedActor } from "./auth";
import { db, serverNow, Timestamp } from "./firestore";
import { DomainError, precondition } from "./errors";
import { writeAudit } from "./audit";
import { consumeRateLimit } from "./rateLimit";
import { logWarn } from "./log";
import { parseInstant, runCommand } from "../catalog/common";
import type { NotificationLink } from "./notify";
import {
  cityTopics, estimateAudience, hasDeviceFilters, hasExclusions, isLimitedAudience, parseAudience, resolveRecipients, type Audience,
} from "./audience";
import { parseImageUrl, parseLink, parseWebUrl } from "./announcements";
import { assertBroadcastQuota, broadcastsInLastDay, BROADCASTS_PER_DAY } from "./broadcast";
import { sendTopicPush, sendTopicsPush } from "./pushSend";

export const ADMIN_NOTIFICATIONS = "adminNotifications";
export const NOTIFICATION_TEMPLATES = "notificationTemplates";
export const STYLES = ["standard", "rich"] as const;
/** Targeted (users / orgs) sends per admin per hour. */
export const TARGETED_SENDS = { limit: 60, windowSeconds: 60 * 60 };
export const SCHEDULE_MIN_MS = 2 * 60_000;
export const SCHEDULE_MAX_MS = 60 * 86_400_000;
export const TEMPLATE_PAYLOAD_MAX_BYTES = 20_000;

const notificationRef = (id: string) => db().collection(ADMIN_NOTIFICATIONS).doc(id);

function requestIdOf(d: Record<string, unknown>): string {
  const s = str(d.requestId, "requestId", 8, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new DomainError("INVALID_INPUT", "requestId is not valid.");
  return s;
}

export interface NotificationInput {
  audience: Audience;
  title: string;
  body: string;
  imageUrl: string | null;
  link: NotificationLink | null;
  url: string | null;
  style: (typeof STYLES)[number];
  scheduleAt: Timestamp | null;
  reason: string;
}

export function parseNotification(data: unknown, nowMs: number): NotificationInput & { requestId: string } {
  const d = obj(data);
  const audience = parseAudience(d.audience, { requireTargets: true });
  if (audience.type === "cities" && (hasDeviceFilters(audience) || hasExclusions(audience))) {
    throw new DomainError("INVALID_INPUT", "A city send goes to the city's push topic, so it can't be limited by platform, build or exclusions.", {
      nextStep: "Remove the filters, or target everyone or specific people instead.",
    });
  }
  const link = parseLink(d.link, "Link");
  const url = parseWebUrl(d.url, "Web page");
  if (link && url) throw new DomainError("INVALID_INPUT", "A notification opens a screen or a web page, not both.");
  let scheduleAt: Timestamp | null = null;
  if (d.scheduleAt !== undefined && d.scheduleAt !== null && d.scheduleAt !== "") {
    scheduleAt = parseInstant(d.scheduleAt, "Send time");
    const ahead = scheduleAt.toMillis() - nowMs;
    if (ahead < SCHEDULE_MIN_MS) throw new DomainError("INVALID_INPUT", "Schedule it at least 2 minutes ahead, or send it now.");
    if (ahead > SCHEDULE_MAX_MS) throw new DomainError("INVALID_INPUT", "Schedule it at most 60 days ahead.");
  }
  return {
    requestId: requestIdOf(d),
    audience,
    title: str(d.title, "Title", 3, 65),
    body: str(d.body, "Message", 5, 240),
    imageUrl: parseImageUrl(d.imageUrl),
    link,
    url,
    style: d.style === undefined || d.style === null ? "standard" : oneOf(d.style, "Style", STYLES),
    scheduleAt,
    reason: str(d.reason, "Reason", 3, 500),
  };
}

/** One send's push route: the `all` topic only when nothing narrows "everyone". */
export const pushModeOf = (a: Audience): "topic" | "per-user" =>
  a.type === "cities" || (a.type === "all" && !hasDeviceFilters(a) && !hasExclusions(a)) ? "topic" : "per-user";

/**
 * Writes the inbox items and sends the push for one notification. Inbox ids
 * are deterministic (`admin-message:{id}:{uid}`) and created, never
 * overwritten, so a retried delivery can't duplicate or un-read an item.
 */
export async function deliverAdminNotification(id: string, n: DocumentData): Promise<{ recipients: number | null; pushStatus: string; truncated: boolean }> {
  const audience = parseAudience(n.audience, { requireTargets: true });
  const mode = pushModeOf(audience);
  const recipients = audience.type === "cities" ? null : await resolveRecipients(audience);
  const now = serverNow();
  if (recipients && recipients.uids.length) {
    const writer = db().bulkWriter();
    writer.onWriteError((err) => {
      if (err.code === 6) return false; // ALREADY_EXISTS: delivered by an earlier attempt
      return err.failedAttempts < 5;
    });
    for (const uid of recipients.uids) {
      const ref = db().collection("userNotifications").doc(`admin-message:${id}:${uid}`);
      writer.create(ref, {
        recipientUid: uid, kind: "admin-message", title: n.title, body: n.body,
        link: n.link ?? null, url: n.url ?? null, imageUrl: n.imageUrl ?? null, style: n.style ?? "standard",
        notificationId: id, read: false,
        // "topic": the push already went to the `all` topic; the per-item trigger skips it.
        push: { status: mode === "topic" ? "topic" : "pending" },
        createdAt: now,
      }).catch(() => undefined);
    }
    await writer.close();
  }
  let pushStatus = mode === "per-user" ? (recipients && recipients.uids.length ? "per-user" : "no-recipients") : "pending";
  if (mode === "topic") {
    const content = {
      title: String(n.title), body: String(n.body), imageUrl: n.style === "rich" ? (n.imageUrl as string | null) : null,
      data: {
        kind: "admin-message", notificationId: id, route: "explore",
        ...(n.link?.type ? { linkType: String(n.link.type), linkId: String(n.link.id) } : {}),
        ...(typeof n.url === "string" && n.url ? { url: n.url } : {}),
      },
    };
    pushStatus = audience.type === "cities" ? await sendTopicsPush(cityTopics(audience), content) : await sendTopicPush("all", content);
  }
  return { recipients: recipients ? recipients.uids.length : null, pushStatus, truncated: !!recipients?.truncated };
}

/** The shared-quota record for a broad send (counts toward sendBroadcast's 3 a day). */
async function recordBroadcast(id: string, n: DocumentData, status: string, actorUid: string) {
  const a = n.audience as Audience;
  await db().collection("broadcasts").add({
    audience: a.type, city: a.type === "cities" ? (a.cities ?? []).join(", ") : null,
    topic: a.type === "cities" ? cityTopics(a).join(",") : a.type === "all" ? "all" : null,
    title: n.title, body: n.body, status, source: "notification", notificationId: id, createdAt: serverNow(), createdBy: actorUid,
  });
}

function notificationDoc(input: NotificationInput, admin: VerifiedActor, now: Timestamp) {
  return {
    audience: input.audience, title: input.title, body: input.body, imageUrl: input.imageUrl, link: input.link, url: input.url,
    style: input.style, reason: input.reason, limited: isLimitedAudience(input.audience), pushMode: pushModeOf(input.audience),
    scheduleAt: input.scheduleAt, recipients: null as number | null, pushStatus: null as string | null, failure: null as string | null,
    createdAt: now, createdBy: admin.uid, sentAt: null, cancelledAt: null, cancelledBy: null, cancelReason: null,
  };
}

/** sendNotification: send now, or schedule (contract §2). */
export async function sendNotificationCommand(admin: VerifiedActor, data: unknown) {
  const now = serverNow();
  const input = parseNotification(data, now.toMillis());
  const limited = isLimitedAudience(input.audience);
  // The id binds the requestId to the admin: a replay returns the first outcome.
  const id = `n_${admin.uid.slice(0, 40)}_${input.requestId}`.slice(0, 150);
  const ref = notificationRef(id);
  const existing = await ref.get();
  if (existing.exists) {
    const e = existing.data()!;
    return { id, status: e.status === "scheduled" ? "scheduled" : e.status, recipients: e.recipients ?? null, replayed: true };
  }
  if (!limited) {
    await consumeRateLimit({
      bucket: `adminnotify_${admin.uid}`, ...TARGETED_SENDS,
      message: "That's a lot of notifications this hour. Please wait a while before sending more.",
    });
  }
  const audit = (action: string, after: Record<string, unknown>) => ({
    action, actorUid: admin.uid, actorRole: `platform:${admin.roleId}`, resourceType: "adminNotification", resourceId: id,
    after: { audience: input.audience.type, title: input.title, ...after }, reason: input.reason, requestId: input.requestId,
    source: "operations-console" as const,
  });

  if (input.scheduleAt) {
    const estimate = input.audience.type === "cities" ? null : (await estimateAudience(input.audience)).estimate;
    const batch = db().batch();
    batch.create(ref, { ...notificationDoc(input, admin, now), status: "scheduled", recipients: estimate });
    writeAudit(batch, audit("notification.scheduled", { scheduleAt: input.scheduleAt.toDate().toISOString(), estimate }));
    await batch.commit();
    return { id, status: "scheduled" as const, recipients: estimate, replayed: false };
  }

  if (limited) {
    await assertBroadcastQuota(`At most ${BROADCASTS_PER_DAY} sends to everyone, customers or cities a day (shared with broadcasts), so people don't mute PULSE.`);
  }
  try {
    await ref.create({ ...notificationDoc(input, admin, now), status: "sending" });
  } catch {
    const e = (await ref.get()).data() ?? {};
    return { id, status: e.status, recipients: e.recipients ?? null, replayed: true };
  }
  const docData = (await ref.get()).data()!;
  let outcome;
  try {
    outcome = await deliverAdminNotification(id, docData);
  } catch (e) {
    const failure = String((e as Error)?.message ?? e).slice(0, 200);
    await ref.update({ status: "failed", failure });
    logWarn({ event: "notification.send-failed", notificationId: id, error: failure });
    throw new DomainError("INTERNAL", "The notification couldn't be sent.", { nextStep: "Try again in a moment.", cause: e });
  }
  const batch = db().batch();
  batch.update(ref, { status: "sent", recipients: outcome.recipients, pushStatus: outcome.pushStatus, sentAt: serverNow(), truncated: outcome.truncated });
  writeAudit(batch, audit("notification.sent", { recipients: outcome.recipients, pushStatus: outcome.pushStatus }));
  await batch.commit();
  if (limited) await recordBroadcast(id, docData, outcome.pushStatus, admin.uid);
  return { id, status: "sent" as const, recipients: outcome.recipients, replayed: false };
}

/** cancelScheduledNotification: only while it's still scheduled. */
export async function cancelScheduledNotificationCommand(admin: VerifiedActor, data: unknown) {
  const d = obj(data);
  const rid = requestIdOf(d);
  const id = str(d.id, "id", 4, 150);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new DomainError("INVALID_INPUT", "id is not valid.");
  const reason = str(d.reason, "Reason", 3, 500);
  return runCommand("notification.cancel", admin.uid, rid, async (tx, now) => {
    const ref = notificationRef(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "This notification doesn't exist.");
    const status = String(snap.get("status"));
    if (status !== "scheduled") throw precondition(`It's already ${status}, so it can't be cancelled.`, "Refresh the history.");
    tx.update(ref, { status: "cancelled", cancelledAt: now, cancelledBy: admin.uid, cancelReason: reason });
    writeAudit(tx, {
      action: "notification.cancelled", actorUid: admin.uid, actorRole: `platform:${admin.roleId}`, resourceType: "adminNotification", resourceId: id,
      before: { status }, after: { status: "cancelled" }, reason, requestId: rid, source: "operations-console",
    });
    return { id, status: "cancelled" };
  });
}

/** Scheduled sends that are due (runNotificationJobs). Each is claimed (scheduled → sending) before it goes out. */
export async function sendDueNotifications(limit = 20): Promise<{ due: number; sent: number; failed: number }> {
  const now = serverNow();
  const due = await db().collection("adminNotifications").where("status", "==", "scheduled").where("scheduleAt", "<=", now).limit(limit).get();
  let sent = 0;
  let failed = 0;
  for (const doc of due.docs) {
    const claimed = await db().runTransaction(async (tx) => {
      const cur = await tx.get(doc.ref);
      if (cur.get("status") !== "scheduled") return false;
      tx.update(doc.ref, { status: "sending", claimedAt: serverNow() });
      return true;
    });
    if (!claimed) continue;
    const n = doc.data();
    const finish = async (update: Record<string, unknown>, action: string, after: Record<string, unknown>) => {
      const batch = db().batch();
      batch.update(doc.ref, update);
      writeAudit(batch, {
        action, actorUid: "system", actorRole: "system", resourceType: "adminNotification", resourceId: doc.id,
        after: { audience: (n.audience as Audience)?.type ?? null, title: n.title, ...after }, reason: "Scheduled send.", source: "scheduler",
      });
      await batch.commit();
    };
    if (n.limited === true && (await broadcastsInLastDay()) >= BROADCASTS_PER_DAY) {
      await finish({ status: "failed", failure: "daily-limit" }, "notification.failed", { failure: "daily-limit" });
      failed++;
      continue;
    }
    try {
      const outcome = await deliverAdminNotification(doc.id, n);
      await finish({ status: "sent", recipients: outcome.recipients, pushStatus: outcome.pushStatus, sentAt: serverNow(), truncated: outcome.truncated },
        "notification.sent", { recipients: outcome.recipients, pushStatus: outcome.pushStatus });
      if (n.limited === true) await recordBroadcast(doc.id, n, outcome.pushStatus, String(n.createdBy ?? "system"));
      sent++;
    } catch (e) {
      const failure = String((e as Error)?.message ?? e).slice(0, 200);
      await finish({ status: "failed", failure }, "notification.failed", { failure });
      failed++;
    }
  }
  return { due: due.size, sent, failed };
}

/* -------------------------------------------------------------- templates */

export const TEMPLATE_KINDS = ["announcement", "notification"] as const;

/** saveTemplate: create (no id) or replace a reusable announcement / notification. */
export async function saveTemplateCommand(admin: VerifiedActor, data: unknown) {
  const d = obj(data);
  const rid = requestIdOf(d);
  const id = d.id === undefined || d.id === null ? null : docId(d.id, "id");
  const name = str(d.name, "Template name", 3, 60);
  const kind = oneOf(d.kind, "kind", TEMPLATE_KINDS);
  const payload = obj(d.payload);
  const size = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (size > TEMPLATE_PAYLOAD_MAX_BYTES) throw new DomainError("INVALID_INPUT", "This template is too large to save.");
  return runCommand("template.save", admin.uid, rid, async (tx, now) => {
    const ref = id ? db().collection(NOTIFICATION_TEMPLATES).doc(id) : db().collection(NOTIFICATION_TEMPLATES).doc();
    if (id) {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new DomainError("NOT_FOUND", "This template doesn't exist.");
      tx.update(ref, { name, kind, payload, updatedAt: now, updatedBy: admin.uid });
    } else {
      tx.create(ref, { name, kind, payload, createdAt: now, createdBy: admin.uid, updatedAt: now, updatedBy: admin.uid });
    }
    writeAudit(tx, {
      action: id ? "template.updated" : "template.created", actorUid: admin.uid, actorRole: `platform:${admin.roleId}`,
      resourceType: "notificationTemplate", resourceId: ref.id, after: { name, kind }, requestId: rid, source: "operations-console",
    });
    return { id: ref.id };
  });
}

export async function deleteTemplateCommand(admin: VerifiedActor, data: unknown) {
  const d = obj(data);
  const rid = requestIdOf(d);
  const id = docId(d.id, "id");
  const reason = str(d.reason, "Reason", 3, 500);
  return runCommand("template.delete", admin.uid, rid, async (tx) => {
    const ref = db().collection(NOTIFICATION_TEMPLATES).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "This template doesn't exist.");
    tx.delete(ref);
    writeAudit(tx, {
      action: "template.deleted", actorUid: admin.uid, actorRole: `platform:${admin.roleId}`, resourceType: "notificationTemplate", resourceId: id,
      before: { name: snap.get("name"), kind: snap.get("kind") }, reason, requestId: rid, source: "operations-console",
    });
    return { id, deleted: true as const };
  });
}

/* ------------------------------------------------------------- callables */

export const sendNotification = callable(async (data, context) =>
  sendNotificationCommand(requireCapability(context, "announcements.manage"), data), { timeoutSeconds: 540, memory: "512MB" });

export const cancelScheduledNotification = callable(async (data, context) =>
  cancelScheduledNotificationCommand(requireCapability(context, "announcements.manage"), data));

export const saveTemplate = callable(async (data, context) => saveTemplateCommand(requireCapability(context, "announcements.manage"), data));

export const deleteTemplate = callable(async (data, context) => deleteTemplateCommand(requireCapability(context, "announcements.manage"), data));

