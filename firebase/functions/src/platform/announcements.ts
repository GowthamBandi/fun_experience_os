/**
 * In-app announcements (docs/NOTIFICATION_CENTER_CONTRACT.md §1 and §5):
 * popups, banners and inbox items PULSE shows when people open the app.
 *
 *   announcements/{id}                    server-written; admins read (console)
 *   announcements/{id}/daily/{YYYY-MM-DD} per-IST-day counters (server-only)
 *   announcementReceipts/{id}__{uid}      what one person did (server-only)
 *
 * Console (capability announcements.manage, audited): saveAnnouncement,
 * setAnnouncementStatus, previewAudience, getAnnouncementStats.
 * App (any signed-in person, rate-limited): getMyAnnouncements,
 * recordAnnouncementEvent.
 */
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { callable, docId, int, obj, oneOf, optStr, str } from "./callable";
import { requireCapability, type VerifiedActor } from "./auth";
import { requireUser } from "./actors";
import { db, serverNow, Timestamp } from "./firestore";
import { DomainError, precondition } from "./errors";
import { writeAudit } from "./audit";
import { consumeRateLimit } from "./rateLimit";
import { isEmulator } from "./security";
import { istDate } from "./jobs";
import { logWarn } from "./log";
import { bool, parseInstant, runCommand } from "../catalog/common";
import { cityKey } from "../catalog/cityKey";
import { NOTIFICATION_LINK_TYPES, type NotificationLink } from "./notify";
import {
  audienceNeedsMemberships, cityTopics, estimateAudience, hasDeviceFilters, hasExclusions, includesPerson, isLimitedAudience, matchesViewer,
  parseAudience, PLATFORMS, resolveRecipients, MAX_BUILD, type Audience, type Platform,
} from "./audience";
import { assertBroadcastQuota, broadcastsInLastDay, BROADCASTS_PER_DAY } from "./broadcast";
import { sendPushToUids, sendTopicPush, sendTopicsPush, type PushContent } from "./pushSend";

export const ANNOUNCEMENTS = "announcements";
export const ANNOUNCEMENT_RECEIPTS = "announcementReceipts";

export const FORMATS = ["modal", "fullscreen", "sheet", "banner", "inbox"] as const;
export const TONES = ["info", "success", "warning", "critical", "promo"] as const;
export const FREQUENCIES = ["once", "daily", "every-open"] as const;
export const ANNOUNCEMENT_STATUSES = ["draft", "scheduled", "live", "paused", "ended", "archived"] as const;
export const ANNOUNCEMENT_ACTIONS = ["publish", "pause", "resume", "end", "archive", "duplicate"] as const;
export const ANNOUNCEMENT_EVENTS = ["shown", "clicked", "dismissed", "acked"] as const;
/** What a live announcement may still change (contract §1). */
export const LIVE_EDITABLE = ["title", "body", "imageUrl", "primaryCta", "secondaryCta", "startsAt", "endsAt"] as const;

export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];
export type AnnouncementEvent = (typeof ANNOUNCEMENT_EVENTS)[number];

export const ANNOUNCEMENT_LIMITS = {
  /** getMyAnnouncements: app start, sign-in and foreground (at most every 60 s). */
  fetch: { limit: 240, windowSeconds: 60 * 60 },
  /** recordAnnouncementEvent. */
  record: { limit: 600, windowSeconds: 60 * 60 },
} as const;
/** How often getMyAnnouncements refreshes users/{uid}.appClient. */
export const APP_CLIENT_REFRESH_MS = 6 * 3_600_000;

export const announcementRef = (id: string) => db().collection(ANNOUNCEMENTS).doc(id);
export const receiptId = (announcementId: string, uid: string) => `${announcementId}__${uid}`;
const receiptRef = (announcementId: string, uid: string) => db().collection(ANNOUNCEMENT_RECEIPTS).doc(receiptId(announcementId, uid));
const dailyRef = (announcementId: string, day: string) => announcementRef(announcementId).collection("daily").doc(day);

const ZERO_STATS = { targeted: 0, shown: 0, clicked: 0, dismissed: 0, acked: 0, viewers: 0 };

/* ------------------------------------------------------------ validation */

export interface Cta {
  label: string;
  link?: NotificationLink;
  url?: string;
}

/** https only; the emulator also accepts its own storage/http host. */
export function parseWebUrl(value: unknown, name: string, opts: { allowEmulatorHttp?: boolean } = {}): string | null {
  if (value === undefined || value === null || value === "") return null;
  const s = str(value, name, 8, 2000);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new DomainError("INVALID_INPUT", `${name} must be a web address starting with https://.`);
  }
  const emulatorHttp = opts.allowEmulatorHttp && isEmulator() && u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  if ((u.protocol !== "https:" || !u.hostname) && !emulatorHttp) {
    throw new DomainError("INVALID_INPUT", `${name} must be a web address starting with https://.`);
  }
  return s;
}

export const parseImageUrl = (value: unknown, name = "Image") => parseWebUrl(value, name, { allowEmulatorHttp: true });

export function parseLink(value: unknown, name: string): NotificationLink | null {
  if (value === undefined || value === null) return null;
  const l = obj(value);
  const type = oneOf(l.type, `${name} screen`, NOTIFICATION_LINK_TYPES);
  return { type, id: docId(l.id, `${name} id`) };
}

export function parseCta(value: unknown, name: string): Cta | null {
  if (value === undefined || value === null) return null;
  const c = obj(value);
  const label = str(c.label, `${name} label`, 1, 40);
  const link = parseLink(c.link, name);
  const url = parseWebUrl(c.url, `${name} web page`);
  if (link && url) throw new DomainError("INVALID_INPUT", `${name} can open a screen or a web page, not both.`);
  return { label, ...(link ? { link } : {}), ...(url ? { url } : {}) };
}

export interface AnnouncementFields {
  title: string;
  body: string;
  format: (typeof FORMATS)[number];
  tone: (typeof TONES)[number];
  imageUrl: string | null;
  primaryCta: Cta | null;
  secondaryCta: Cta | null;
  dismissible: boolean;
  requireAck: boolean;
  frequency: (typeof FREQUENCIES)[number];
  priority: number;
  audience: Audience;
  startsAt: Timestamp | null;
  endsAt: Timestamp | null;
  sendPush: boolean;
}

const optBool = (v: unknown, name: string, dflt: boolean) => (v === undefined || v === null ? dflt : bool(v, name));
const optInstant = (v: unknown, name: string) => (v === undefined || v === null || v === "" ? null : v instanceof Timestamp ? v : parseInstant(v, name));

/** Every editable field of an announcement, validated (defaults for the optional ones). */
export function parseAnnouncementFields(value: unknown): AnnouncementFields {
  const d = obj(value);
  const primaryCta = parseCta(d.primaryCta, "The main button");
  const secondaryCta = parseCta(d.secondaryCta, "The second button");
  if (secondaryCta && !primaryCta) throw new DomainError("INVALID_INPUT", "Add the main button before a second one.");
  return {
    title: str(d.title, "Title", 3, 80),
    body: d.body === undefined || d.body === null ? "" : str(d.body, "Message", 0, 600),
    format: d.format === undefined ? "modal" : oneOf(d.format, "Format", FORMATS),
    tone: d.tone === undefined ? "info" : oneOf(d.tone, "Tone", TONES),
    imageUrl: parseImageUrl(d.imageUrl),
    primaryCta,
    secondaryCta,
    dismissible: optBool(d.dismissible, "Closable", true),
    requireAck: optBool(d.requireAck, "Require acknowledgement", false),
    frequency: d.frequency === undefined ? "once" : oneOf(d.frequency, "Frequency", FREQUENCIES),
    priority: d.priority === undefined || d.priority === null ? 50 : int(d.priority, "Priority", 0, 100),
    audience: parseAudience(d.audience, { requireTargets: false }),
    startsAt: optInstant(d.startsAt, "Start"),
    endsAt: optInstant(d.endsAt, "End"),
    sendPush: optBool(d.sendPush, "Also send a push", false),
  };
}

/** Popups and banners need a way out: a close button, "I understand", or a button. */
export const canClose = (f: Pick<AnnouncementFields, "format" | "dismissible" | "requireAck" | "primaryCta" | "secondaryCta">) =>
  f.format === "inbox" || f.dismissible || f.requireAck || !!f.primaryCta || !!f.secondaryCta;

/** The checks publish (and edits of a published one) add on top of field validation. */
export function assertPublishable(f: AnnouncementFields, nowMs: number): void {
  parseAudience(f.audience, { requireTargets: true });
  if (!canClose(f)) {
    throw new DomainError("INVALID_INPUT", "People couldn't close this. Make it closable, require “I understand”, or add a button.");
  }
  const start = Math.max(f.startsAt?.toMillis() ?? nowMs, nowMs);
  if (f.endsAt && f.endsAt.toMillis() <= start + 60_000) {
    throw new DomainError("INVALID_INPUT", "The end time must be after the start time (and in the future).");
  }
  if (f.sendPush && f.audience.type === "cities" && (hasDeviceFilters(f.audience) || hasExclusions(f.audience))) {
    throw new DomainError("INVALID_INPUT", "A city push can't be limited by platform, build or exclusions. Turn off the push or remove the filters.");
  }
}

/** Stable JSON (sorted keys) so a Firestore read-back compares equal to the parsed input. */
function stable(v: unknown): string {
  if (v instanceof Timestamp) return JSON.stringify(v.toMillis());
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

const fieldsDoc = (f: AnnouncementFields) => ({ ...f });

/** The stored document's fields, re-validated (older or hand-edited docs fail loudly, not silently). */
export const storedFields = (data: DocumentData) => parseAnnouncementFields(data);

/* ---------------------------------------------------------------- pushes */

function pushContent(id: string, f: Pick<AnnouncementFields, "title" | "body" | "imageUrl">): PushContent {
  return {
    title: f.title.slice(0, 65),
    body: (f.body || "Open PULSE to see it.").slice(0, 240),
    imageUrl: f.imageUrl,
    data: { kind: "announcement", announcementId: id, route: "explore" },
  };
}

/**
 * The push for an announcement with `sendPush` (no inbox item; the
 * announcement itself is what people see in the app). Topic for everyone /
 * cities, the chosen people's devices otherwise. Returns the push status.
 */
export async function sendAnnouncementPush(id: string, f: AnnouncementFields, actorUid: string): Promise<string> {
  const limited = isLimitedAudience(f.audience);
  // Publish refuses up front when the quota is used up; here (scheduled go-live) it is recorded.
  if (limited && (await broadcastsInLastDay()) >= BROADCASTS_PER_DAY) return "skipped-daily-limit";
  const content = pushContent(id, f);
  let status: string;
  let topic: string | null = null;
  if (f.audience.type === "all" && !hasDeviceFilters(f.audience) && !hasExclusions(f.audience)) {
    topic = "all";
    status = await sendTopicPush("all", content);
  } else if (f.audience.type === "cities") {
    const topics = cityTopics(f.audience);
    topic = topics.join(",");
    status = await sendTopicsPush(topics, content);
  } else {
    const r = await resolveRecipients(f.audience);
    status = (await sendPushToUids(r.uids, content)).status;
  }
  if (limited) {
    await db().collection("broadcasts").add({
      audience: f.audience.type, city: f.audience.type === "cities" ? (f.audience.cities ?? []).join(", ") : null, topic,
      title: content.title, body: content.body, status, source: "announcement", announcementId: id,
      createdAt: serverNow(), createdBy: actorUid,
    });
  }
  return status;
}

/* ------------------------------------------------------------- console */

function adminRole(admin: VerifiedActor) {
  return `platform:${admin.roleId}`;
}

function changedKeys(before: AnnouncementFields, after: AnnouncementFields): string[] {
  return (Object.keys(after) as Array<keyof AnnouncementFields>).filter((k) => stable(before[k]) !== stable(after[k]));
}

const auditView = (f: Partial<AnnouncementFields>, keys: string[]) =>
  Object.fromEntries(keys.map((k) => {
    const v = (f as Record<string, unknown>)[k];
    return [k, v instanceof Timestamp ? v.toDate().toISOString() : v ?? null];
  }));

/** saveAnnouncement: create a draft, or edit a draft/scheduled/paused one (live: text, buttons and window only). */
export async function saveAnnouncementCommand(admin: VerifiedActor, data: unknown) {
  const d = obj(data);
  const rid = requestIdOf(d);
  const id = d.id === undefined || d.id === null ? null : docId(d.id, "id");
  const fields = parseAnnouncementFields(d);
  return runCommand("announcement.save", admin.uid, rid, async (tx, now) => {
    if (!id) {
      const ref = db().collection(ANNOUNCEMENTS).doc();
      tx.create(ref, {
        ...fieldsDoc(fields), status: "draft", stats: ZERO_STATS, statusReason: null, pushStatus: null, pushSentAt: null,
        createdAt: now, createdBy: admin.uid, updatedAt: now, updatedBy: admin.uid, publishedAt: null, publishedBy: null, version: 1,
      });
      writeAudit(tx, {
        action: "announcement.created", actorUid: admin.uid, actorRole: adminRole(admin), resourceType: "announcement", resourceId: ref.id,
        after: { title: fields.title, format: fields.format, audience: fields.audience.type }, requestId: rid, source: "operations-console",
      });
      return { id: ref.id, status: "draft" as AnnouncementStatus };
    }
    const ref = announcementRef(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "This announcement doesn't exist.", { nextStep: "Go back to the library and refresh." });
    const cur = snap.data()!;
    const status = String(cur.status) as AnnouncementStatus;
    if (status === "ended" || status === "archived") {
      throw precondition(`This announcement has ${status === "ended" ? "ended" : "been archived"}, so it can't be edited.`, "Duplicate it to make a new one.");
    }
    const before = storedFields(cur);
    const changed = changedKeys(before, fields);
    let next = status;
    if (status === "live") {
      const locked = changed.filter((k) => !(LIVE_EDITABLE as readonly string[]).includes(k));
      if (locked.length) {
        throw precondition("A live announcement can only change its text, buttons, image and dates.", "Pause it first to change the format, audience or other settings.", { locked });
      }
    }
    if (status !== "draft") {
      assertPublishable(fields, now.toMillis());
      if (status === "live" && fields.startsAt && fields.startsAt.toMillis() > now.toMillis()) next = "scheduled";
      if (status === "scheduled" && (fields.startsAt?.toMillis() ?? 0) <= now.toMillis()) next = "live";
    }
    tx.update(ref, { ...fieldsDoc(fields), status: next, updatedAt: now, updatedBy: admin.uid, version: FieldValue.increment(1) });
    writeAudit(tx, {
      action: "announcement.edited", actorUid: admin.uid, actorRole: adminRole(admin), resourceType: "announcement", resourceId: id,
      before: { status, ...auditView(before, changed) }, after: { status: next, ...auditView(fields, changed) },
      requestId: rid, source: "operations-console",
    });
    return { id, status: next };
  });
}

function requestIdOf(d: Record<string, unknown>): string {
  const s = str(d.requestId, "requestId", 8, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new DomainError("INVALID_INPUT", "requestId is not valid.");
  return s;
}

const ALLOWED_FROM: Record<(typeof ANNOUNCEMENT_ACTIONS)[number], readonly AnnouncementStatus[]> = {
  publish: ["draft"],
  pause: ["live", "scheduled"],
  resume: ["paused"],
  end: ["live", "scheduled", "paused"],
  archive: ["draft", "scheduled", "live", "paused", "ended"],
  duplicate: ANNOUNCEMENT_STATUSES,
};

/** setAnnouncementStatus: publish / pause / resume / end / archive / duplicate, each audited with a reason. */
export async function setAnnouncementStatusCommand(admin: VerifiedActor, data: unknown) {
  const d = obj(data);
  const rid = requestIdOf(d);
  const id = docId(d.id, "id");
  const action = oneOf(d.action, "action", ANNOUNCEMENT_ACTIONS);
  const reason = str(d.reason, "Reason", 3, 500);

  // Publish does its reads (validation, reach, push quota) before the transaction.
  let targeted = 0;
  let prepublished: AnnouncementFields | null = null;
  if (action === "publish") {
    const snap = await announcementRef(id).get();
    if (snap.exists && snap.data()!.status === "draft") {
      prepublished = storedFields(snap.data()!);
      const now = serverNow().toMillis();
      assertPublishable(prepublished, now);
      targeted = (await estimateAudience(prepublished.audience)).estimate;
      const goesLive = (prepublished.startsAt?.toMillis() ?? 0) <= now;
      if (prepublished.sendPush && goesLive && isLimitedAudience(prepublished.audience)) {
        await assertBroadcastQuota(`At most ${BROADCASTS_PER_DAY} pushes to everyone, customers or cities a day. Turn off “also send a push”, or publish it tomorrow.`);
      }
    }
  }

  const result = await runCommand(`announcement.${action}`, admin.uid, rid, async (tx, now) => {
    const ref = announcementRef(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "This announcement doesn't exist.", { nextStep: "Go back to the library and refresh." });
    const cur = snap.data()!;
    const status = String(cur.status) as AnnouncementStatus;
    if (!ALLOWED_FROM[action].includes(status)) {
      throw precondition(`You can't ${action} an announcement that is ${status}.`, "Refresh to see its current status.", { status, action });
    }
    const nowMs = now.toMillis();
    const audit = (after: Record<string, unknown>, resourceId = id, extra: Record<string, unknown> = {}) =>
      writeAudit(tx, {
        action: `announcement.${action}`, actorUid: admin.uid, actorRole: adminRole(admin), resourceType: "announcement", resourceId,
        before: { status }, after: { ...after, ...extra }, reason, requestId: rid, source: "operations-console",
      });

    if (action === "duplicate") {
      const f = storedFields(cur);
      const copy = db().collection(ANNOUNCEMENTS).doc();
      tx.create(copy, {
        ...fieldsDoc({ ...f, startsAt: null, endsAt: null }), status: "draft", stats: ZERO_STATS, statusReason: null, pushStatus: null, pushSentAt: null,
        duplicatedFrom: id, createdAt: now, createdBy: admin.uid, updatedAt: now, updatedBy: admin.uid, publishedAt: null, publishedBy: null, version: 1,
      });
      audit({ status: "draft", copiedFrom: id }, copy.id);
      return { id: copy.id, status: "draft" as AnnouncementStatus };
    }

    const f = storedFields(cur);
    let next: AnnouncementStatus = status;
    const update: Record<string, unknown> = { statusReason: reason, updatedAt: now, updatedBy: admin.uid, version: FieldValue.increment(1) };
    if (action === "publish") {
      assertPublishable(f, nowMs);
      const start = Math.max(f.startsAt?.toMillis() ?? nowMs, nowMs);
      next = start > nowMs ? "scheduled" : "live";
      Object.assign(update, {
        startsAt: Timestamp.fromMillis(start), publishedAt: now, publishedBy: admin.uid, "stats.targeted": targeted,
        pushStatus: f.sendPush ? "pending" : null,
      });
    } else if (action === "pause") {
      next = "paused";
    } else if (action === "resume") {
      if (f.endsAt && f.endsAt.toMillis() <= nowMs) throw precondition("Its end time has passed.", "Edit the end time first, then resume it.");
      next = (f.startsAt?.toMillis() ?? 0) > nowMs ? "scheduled" : "live";
    } else if (action === "end") {
      next = "ended";
      if (!f.endsAt || f.endsAt.toMillis() > nowMs) update.endsAt = now;
      update.endedAt = now;
    } else if (action === "archive") {
      next = "archived";
      update.archivedAt = now;
    }
    update.status = next;
    tx.update(ref, update);
    audit({ status: next, ...(action === "publish" ? { targeted, startsAt: new Date(Math.max(f.startsAt?.toMillis() ?? nowMs, nowMs)).toISOString(), sendPush: f.sendPush } : {}) });
    return { id, status: next };
  });

  // The push goes out once, when the announcement is (or becomes) live.
  if (!result.replayed && (action === "publish" || action === "resume") && result.status === "live") {
    await pushIfDue(id, admin.uid);
  }
  return result;
}

/** Sends the announcement's push if it has one and it hasn't gone out yet. */
export async function pushIfDue(id: string, actorUid: string): Promise<string | null> {
  const snap = await announcementRef(id).get();
  const data = snap.data();
  if (!data || data.status !== "live" || data.sendPush !== true || data.pushSentAt) return null;
  let status: string;
  try {
    status = await sendAnnouncementPush(id, storedFields(data), actorUid);
  } catch (e) {
    status = `failed:${String((e as Error)?.message ?? e).slice(0, 60)}`;
    logWarn({ event: "announcement.push-failed", announcementId: id, error: status });
  }
  await announcementRef(id).update({ pushStatus: status, pushSentAt: serverNow() });
  return status;
}

/** previewAudience: reach estimate, split and sample for the composer. */
export async function previewAudienceQuery(data: unknown) {
  const d = obj(data);
  return estimateAudience(parseAudience(d.audience, { requireTargets: false }));
}

/** getAnnouncementStats: counters plus 30 IST days of shown / clicked / dismissed / acked. */
export async function announcementStatsQuery(data: unknown) {
  const id = docId(obj(data).id, "id");
  const snap = await announcementRef(id).get();
  if (!snap.exists) throw new DomainError("NOT_FOUND", "This announcement doesn't exist.");
  const a = snap.data()!;
  const stats = { ...ZERO_STATS, ...((a.stats ?? {}) as Record<string, number>) };
  const nowMs = serverNow().toMillis();
  const days = Array.from({ length: 30 }, (_, i) => istDate(new Date(nowMs - (29 - i) * 86_400_000)));
  const daily = await db().getAll(...days.map((day) => dailyRef(id, day)));
  const series = days.map((day, i) => {
    const x = daily[i]!.data() ?? {};
    return { day, shown: Number(x.shown ?? 0), clicked: Number(x.clicked ?? 0), dismissed: Number(x.dismissed ?? 0), acked: Number(x.acked ?? 0) };
  });
  return { id, status: String(a.status), stats, ctr: stats.viewers > 0 ? Math.round((stats.clicked / stats.viewers) * 10_000) / 10_000 : null, series };
}

/* ------------------------------------------------------------------ app */

const iso = (t: unknown) => (t instanceof Timestamp ? t.toDate().toISOString() : null);
const ctaOut = (c: unknown) => {
  if (!c || typeof c !== "object") return null;
  const x = c as Record<string, unknown>;
  if (typeof x.label !== "string") return null;
  return { label: x.label, ...(x.link && typeof x.link === "object" ? { link: x.link } : {}), ...(typeof x.url === "string" && x.url ? { url: x.url } : {}) };
};

/** Has this person finished with the announcement, by its frequency? */
export function finishedFor(frequency: string, receipt: DocumentData | undefined, today: string): boolean {
  if (!receipt) return false;
  if (frequency === "once") return !!(receipt.clickedAt || receipt.dismissedAt || receipt.ackedAt);
  if (frequency === "daily") return receipt.lastShownDay === today;
  return false;
}

/** The live announcements in their window (status live or scheduled; delivery checks the window itself). */
async function inWindow(nowMs: number) {
  const snap = await db().collection("announcements").where("status", "in", ["live", "scheduled"]).limit(200).get();
  return snap.docs.filter((d) => {
    const s = d.get("startsAt");
    const e = d.get("endsAt");
    return s instanceof Timestamp && s.toMillis() <= nowMs && (!(e instanceof Timestamp) || e.toMillis() > nowMs);
  });
}

/** getMyAnnouncements: what this person should see now, highest priority first. */
export async function myAnnouncements(uid: string, data: unknown) {
  const d = obj(data);
  const platform = oneOf(d.platform, "platform", PLATFORMS) as Platform;
  const build = int(d.build, "build", 0, MAX_BUILD);
  const city = optStr(d.city, "city", 80);
  await consumeRateLimit({ bucket: `announce_${uid}`, ...ANNOUNCEMENT_LIMITS.fetch, message: "Checking for announcements too often. Try again later." });
  const now = serverNow();
  const nowMs = now.toMillis();
  const today = istDate(now.toDate());

  const [docs, userSnap] = await Promise.all([inWindow(nowMs), db().collection("users").doc(uid).get()]);
  // Remember the app's platform/build for push targeting (at most every 6 h, or when it changes).
  const client = userSnap.get("appClient") as { platform?: unknown; build?: unknown; at?: unknown } | undefined;
  if (!client || client.platform !== platform || client.build !== build || !(client.at instanceof Timestamp) || nowMs - client.at.toMillis() > APP_CLIENT_REFRESH_MS) {
    await db().collection("users").doc(uid).set({ appClient: { platform, build, at: now } }, { merge: true });
  }
  if (docs.length === 0) return { items: [] };

  const parsed = docs.flatMap((doc) => {
    try {
      return [{ doc, audience: parseAudience(doc.get("audience"), { requireTargets: false }) }];
    } catch {
      logWarn({ event: "announcement.bad-audience", announcementId: doc.id });
      return [];
    }
  });
  let activeOrgIds: string[] = [];
  if (parsed.some((p) => audienceNeedsMemberships(p.audience))) {
    const m = await db().collection("memberships").where("uid", "==", uid).get();
    activeOrgIds = m.docs.filter((x) => x.get("status") === "active").map((x) => String(x.get("orgId")));
  }
  const viewer = { uid, platform, build, cityKey: city ? cityKey(city) || null : null, activeOrgIds };
  const matching = parsed.filter((p) => matchesViewer(p.audience, viewer));
  if (matching.length === 0) return { items: [] };
  const receipts = await db().getAll(...matching.map((p) => receiptRef(p.doc.id, uid)));
  const items = matching
    .filter((p, i) => !finishedFor(String(p.doc.get("frequency") ?? "once"), receipts[i]!.data(), today))
    .map(({ doc }) => {
      const a = doc.data();
      return {
        sortAt: (a.startsAt as Timestamp).toMillis(),
        item: {
          id: doc.id, title: a.title, body: a.body ?? "", format: a.format, tone: a.tone, imageUrl: a.imageUrl ?? null,
          primaryCta: ctaOut(a.primaryCta), secondaryCta: ctaOut(a.secondaryCta), dismissible: a.dismissible !== false,
          requireAck: a.requireAck === true, frequency: a.frequency ?? "once", priority: Number(a.priority ?? 0), endsAt: iso(a.endsAt),
        },
      };
    })
    .sort((x, y) => y.item.priority - x.item.priority || y.sortAt - x.sortAt)
    .map((x) => x.item);
  return { items };
}

/**
 * recordAnnouncementEvent: idempotent per (announcement, person, event) and,
 * for "shown", per IST day. The receipt is the idempotency record; counters are
 * blind increments after it (no read of the hot announcement document).
 */
export async function recordEvent(uid: string, data: unknown) {
  const d = obj(data);
  const announcementId = docId(d.announcementId, "announcementId");
  const event = oneOf(d.event, "event", ANNOUNCEMENT_EVENTS) as AnnouncementEvent;
  await consumeRateLimit({ bucket: `announceevt_${uid}`, ...ANNOUNCEMENT_LIMITS.record });
  const snap = await announcementRef(announcementId).get();
  if (!snap.exists || snap.get("status") === "draft") throw new DomainError("NOT_FOUND", "This announcement isn't available.");
  // Count only people the announcement is for, and only while it is on:
  // anyone else's taps (or a stale screen after it ended) change nothing.
  const status = String(snap.get("status"));
  const startsMs = (snap.get("startsAt") as Timestamp | undefined)?.toMillis() ?? 0;
  const endsMs = (snap.get("endsAt") as Timestamp | undefined)?.toMillis() ?? Number.POSITIVE_INFINITY;
  const nowMs = serverNow().toMillis();
  const on = (status === "live" || status === "scheduled") && startsMs <= nowMs && nowMs < endsMs;
  if (!on) return { ok: true as const };
  let audience: Audience;
  try {
    audience = parseAudience(snap.get("audience"), { requireTargets: false });
  } catch {
    return { ok: true as const };
  }
  let orgs: string[] = [];
  if (audienceNeedsMemberships(audience)) {
    const m = await db().collection("memberships").where("uid", "==", uid).get();
    orgs = m.docs.filter((x) => x.get("status") === "active").map((x) => String(x.get("orgId")));
  }
  if (!includesPerson(audience, uid, orgs)) return { ok: true as const };
  const ref = receiptRef(announcementId, uid);
  const counted = await db().runTransaction(async (tx) => {
    const r = (await tx.get(ref)).data();
    const now = serverNow();
    const day = istDate(now.toDate());
    const base = { announcementId, uid, updatedAt: now };
    if (event === "shown") {
      if (r?.lastShownDay === day) return null;
      tx.set(ref, { ...base, lastShownDay: day, lastShownAt: now, shownCount: FieldValue.increment(1), ...(r?.firstShownAt ? {} : { firstShownAt: now }) }, { merge: true });
      return { day, firstView: !r?.firstShownAt };
    }
    const field = `${event}At`;
    if (r?.[field]) return null;
    tx.set(ref, { ...base, [field]: now }, { merge: true });
    return { day, firstView: false };
  });
  if (counted) {
    const batch = db().batch();
    batch.update(announcementRef(announcementId), {
      [`stats.${event}`]: FieldValue.increment(1),
      ...(counted.firstView ? { "stats.viewers": FieldValue.increment(1) } : {}),
    });
    batch.set(dailyRef(announcementId, counted.day), { day: counted.day, [event]: FieldValue.increment(1) }, { merge: true });
    await batch.commit();
  }
  return { ok: true as const };
}

/* ------------------------------------------------------------ scheduler */

/**
 * Status housekeeping (runNotificationJobs, every 5 min): scheduled → live at
 * startsAt (sending its push), live/scheduled → ended after endsAt. Delivery
 * never depends on this: getMyAnnouncements checks the window itself.
 */
export async function advanceAnnouncementWindows(): Promise<{ wentLive: number; ended: number; pushes: number }> {
  const snap = await db().collection("announcements").where("status", "in", ["live", "scheduled"]).limit(500).get();
  const nowMs = serverNow().toMillis();
  let wentLive = 0;
  let ended = 0;
  let pushes = 0;
  for (const doc of snap.docs) {
    const s = doc.get("startsAt");
    const e = doc.get("endsAt");
    const status = doc.get("status");
    const shouldEnd = e instanceof Timestamp && e.toMillis() <= nowMs;
    const shouldGoLive = !shouldEnd && status === "scheduled" && s instanceof Timestamp && s.toMillis() <= nowMs;
    if (!shouldEnd && !shouldGoLive) {
      if (status === "live" && doc.get("sendPush") === true && !doc.get("pushSentAt")) {
        if (await pushIfDue(doc.id, "system")) pushes++;
      }
      continue;
    }
    const next = shouldEnd ? "ended" : "live";
    const changed = await db().runTransaction(async (tx) => {
      const cur = await tx.get(doc.ref);
      if (cur.get("status") !== status) return false;
      const now = serverNow();
      tx.update(doc.ref, { status: next, updatedAt: now, ...(shouldEnd ? { endedAt: now } : {}), version: FieldValue.increment(1) });
      writeAudit(tx, {
        action: shouldEnd ? "announcement.ended-automatically" : "announcement.went-live", actorUid: "system", actorRole: "system",
        resourceType: "announcement", resourceId: doc.id, before: { status }, after: { status: next },
        reason: shouldEnd ? "End time reached." : "Start time reached.", source: "scheduler",
      });
      return true;
    });
    if (!changed) continue;
    if (shouldEnd) ended++;
    else {
      wentLive++;
      if (await pushIfDue(doc.id, "system")) pushes++;
    }
  }
  return { wentLive, ended, pushes };
}

/* ------------------------------------------------------------ callables */

export const saveAnnouncement = callable(async (data, context) =>
  saveAnnouncementCommand(requireCapability(context, "announcements.manage"), data));

export const setAnnouncementStatus = callable(async (data, context) =>
  setAnnouncementStatusCommand(requireCapability(context, "announcements.manage"), data), { timeoutSeconds: 300 });

export const previewAudience = callable(async (data, context) => {
  requireCapability(context, "announcements.manage");
  return previewAudienceQuery(data);
}, { timeoutSeconds: 120 });

export const getAnnouncementStats = callable(async (data, context) => {
  requireCapability(context, "announcements.manage");
  return announcementStatsQuery(data);
});

export const getMyAnnouncements = callable(async (data, context) => myAnnouncements(requireUser(context).uid, data));

export const recordAnnouncementEvent = callable(async (data, context) => recordEvent(requireUser(context).uid, data));
