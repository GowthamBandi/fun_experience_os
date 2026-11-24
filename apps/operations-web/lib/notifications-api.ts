"use client";

/**
 * Notification center + account controls: callables (asia-south1) and the
 * admin Firestore reads behind the console pages. Server contract:
 * docs/NOTIFICATION_CENTER_CONTRACT.md §1–3 and §5. Queries are declared in
 * firebase/scripts/check-indexes.mjs (entries N01–N05).
 */

import { collection, doc, endAt, getDoc, getDocs, limit, onSnapshot, orderBy, query, startAt, where, type DocumentData, type Query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebaseClient } from "./firebase/client";
import type { AccountStatus } from "./accounts";
import { readAccountHits, readPreview, type AccountHit, type AnnouncementAction, type AnnouncementStatus, type Audience, type AudiencePreview, type TemplateKind } from "./notifications";

const regional = () => getFirebaseClient().regionalFunctions;
const col = (name: string) => collection(getFirebaseClient().firestore, name);

async function call<T>(name: string, payload: object): Promise<T> {
  const fn = httpsCallable<object, T>(regional(), name);
  return (await fn(payload)).data;
}

/* -------------------------------------------------------------- callables */

/** saveAnnouncement: creates a draft (no id) or edits one (draft/scheduled/paused; live within the live-edit fields). */
export async function saveAnnouncement(payload: object) {
  return call<{ id: string; status: AnnouncementStatus }>("saveAnnouncement", payload);
}

/** setAnnouncementStatus: publish / pause / resume / end / archive / duplicate (duplicate returns the new draft's id). */
export async function setAnnouncementStatus(input: { requestId: string; id: string; action: AnnouncementAction; reason: string }) {
  return call<{ id: string; status: AnnouncementStatus }>("setAnnouncementStatus", input);
}

export async function previewAudience(audience: Audience): Promise<AudiencePreview> {
  return readPreview(await call<unknown>("previewAudience", { audience }));
}

export interface AnnouncementStatsResult {
  id: string;
  status: AnnouncementStatus;
  stats: Record<string, unknown>;
  ctr: number | null;
  series: unknown[];
}

export async function getAnnouncementStats(id: string) {
  return call<AnnouncementStatsResult>("getAnnouncementStats", { id });
}

export async function searchAccounts(q: string): Promise<AccountHit[]> {
  return readAccountHits(await call<unknown>("searchAccounts", { query: q }));
}

export async function sendNotification(payload: object) {
  return call<{ id: string; status: "sent" | "scheduled"; recipients: number | null }>("sendNotification", payload);
}

export async function cancelScheduledNotification(input: { requestId: string; id: string; reason: string }) {
  return call<{ id: string; status: string }>("cancelScheduledNotification", input);
}

export async function saveTemplate(input: { requestId: string; id?: string; name: string; kind: TemplateKind; payload: Record<string, unknown> }) {
  return call<{ id: string }>("saveTemplate", input);
}

export async function deleteTemplate(input: { requestId: string; id: string; reason: string }) {
  return call<{ id: string; deleted: true }>("deleteTemplate", input);
}

export interface SetAccountStatusResult {
  uid: string;
  status: AccountStatus;
  until: string | null;
  /** false when the Auth sign-in lock couldn't be applied (retry). */
  authSynced?: boolean;
}

export async function setAccountStatus(payload: object) {
  return call<SetAccountStatusResult>("setAccountStatus", payload);
}

/* ------------------------------------------------------------------ reads */

export type Rows = Array<{ id: string; raw: Record<string, unknown> }>;

function subscribe(source: Query<DocumentData>, max: number, observer: (rows: Rows, truncated: boolean) => void, onError: (message: string) => void) {
  return onSnapshot(
    source,
    (snap) => observer(snap.docs.slice(0, max).map((d) => ({ id: d.id, raw: { ...d.data() } })), snap.size > max),
    (error) => onError(error.message),
  );
}

/** N02: newest-edited announcements (single-field index on updatedAt). */
export const announcementsQuery = (max: number) => query(col("announcements"), orderBy("updatedAt", "desc"), limit(max + 1));

/** N03: send history, newest first (single-field index on createdAt). */
export const adminNotificationsQuery = (max: number) => query(col("adminNotifications"), orderBy("createdAt", "desc"), limit(max + 1));

/** N04: templates, newest-edited first. */
export const templatesQuery = (max: number) => query(col("notificationTemplates"), orderBy("updatedAt", "desc"), limit(max + 1));

export function subscribeAnnouncements(observer: (rows: Rows, truncated: boolean) => void, onError: (message: string) => void, max = 300) {
  return subscribe(announcementsQuery(max), max, observer, onError);
}

export function subscribeAdminNotifications(observer: (rows: Rows, truncated: boolean) => void, onError: (message: string) => void, max = 100) {
  return subscribe(adminNotificationsQuery(max), max, observer, onError);
}

export function subscribeTemplates(observer: (rows: Rows, truncated: boolean) => void, onError: (message: string) => void, max = 200) {
  return subscribe(templatesQuery(max), max, observer, onError);
}

/** N06: the latest broad pushes (broadcasts: sendBroadcast + limited sends share the 3-a-day quota). */
export const recentBroadcastsQuery = () => query(col("broadcasts"), orderBy("createdAt", "desc"), limit(10));

export function subscribeRecentBroadcasts(observer: (rows: Rows) => void, onError: (message: string) => void) {
  return onSnapshot(
    recentBroadcastsQuery(),
    (snap) => observer(snap.docs.map((d) => ({ id: d.id, raw: { ...d.data() } }))),
    (error) => onError(error.message),
  );
}

/** N01: audit events on one person (resourceId == uid), newest first — the existing (resourceId, at desc) composite. */
export const personAuditQuery = (uid: string) => query(col("auditEvents"), where("resourceId", "==", uid), orderBy("at", "desc"));

/** publicOrganizers.name per org id (null when missing) — fills chips of a saved audience. */
export async function fetchOrgNames(ids: string[]): Promise<Record<string, string | null>> {
  const snaps = await Promise.all(ids.map((id) => getDoc(doc(getFirebaseClient().firestore, "publicOrganizers", id)).catch(() => null)));
  return Object.fromEntries(ids.map((id, i) => [id, typeof snaps[i]?.data()?.name === "string" ? (snaps[i]!.data()!.name as string) : null]));
}

/** N05: organizers by name prefix for the audience picker (single-field index on name; case variants). */
export async function searchOrganizations(text: string): Promise<Array<{ orgId: string; name: string; city: string | null }>> {
  const raw = text.trim();
  if (raw.length < 2) return [];
  const lower = raw.toLowerCase();
  const variants = Array.from(new Set([raw, lower.charAt(0).toUpperCase() + lower.slice(1), lower.replace(/(^|\s)(\S)/g, (_, s: string, c: string) => s + c.toUpperCase())]));
  const reads = variants.map((p) => getDocs(query(col("publicOrganizers"), orderBy("name"), startAt(p), endAt(p + ""), limit(8))));
  const settled = await Promise.allSettled(reads);
  const seen = new Set<string>();
  const out: Array<{ orgId: string; name: string; city: string | null }> = [];
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const d of r.value.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const data = d.data();
      out.push({ orgId: d.id, name: typeof data.name === "string" ? data.name : d.id, city: typeof data.city === "string" ? data.city : null });
    }
  }
  if (out.length === 0 && settled.every((r) => r.status === "rejected")) throw (settled[0] as PromiseRejectedResult).reason;
  return out.slice(0, 12);
}
