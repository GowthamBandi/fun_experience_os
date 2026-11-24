/**
 * Audiences for announcements and notifications (docs/NOTIFICATION_CENTER_CONTRACT.md §1).
 *
 *   { type: "all" | "customers" | "organizers" | "cities" | "users" | "orgs",
 *     cities?, uids? (≤500), orgIds? (≤100), platforms?, minBuild?, maxBuild?, excludeUids? }
 *
 * "organizers" = active members of any organization; "customers" = everyone
 * else who signed in. Console operators (users.scope == "platform") and
 * blocked accounts are never part of an audience.
 *
 * Two ways an audience is evaluated:
 *  - per viewer (getMyAnnouncements): the phone sends its platform, build and
 *    city, so every filter is exact;
 *  - as a recipient list (sendNotification, announcement pushes, reach
 *    estimates): people come from `users` / `memberships`; platform and build
 *    come from `users/{uid}.appClient` (recorded by getMyAnnouncements) or the
 *    push registration, so with those filters only people whose app reported
 *    them are counted. Cities have no recipient list (the phone keeps the city).
 */
import { FieldPath } from "firebase-admin/firestore";
import { db } from "./firestore";
import { DomainError } from "./errors";
import { docId, int, obj, str } from "./callable";
import { uidList } from "../catalog/common";
import { cityKey } from "../catalog/cityKey";
import { effectiveAccountStatus } from "./accountStatus";

export const AUDIENCE_TYPES = ["all", "customers", "organizers", "cities", "users", "orgs"] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];
export const PLATFORMS = ["android", "ios"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const MAX_AUDIENCE_UIDS = 500;
export const MAX_AUDIENCE_ORGS = 100;
export const MAX_AUDIENCE_EXCLUSIONS = 500;
export const MAX_AUDIENCE_CITIES = 50;
/** Cap on one send's recipients (contract §2). */
export const MAX_RECIPIENTS = 50_000;
export const MAX_BUILD = 1_000_000;

export interface Audience {
  type: AudienceType;
  cities?: string[];
  uids?: string[];
  orgIds?: string[];
  platforms?: Platform[];
  minBuild?: number;
  maxBuild?: number;
  excludeUids?: string[];
}

/**
 * Validates and normalizes an audience. Keys that don't belong to the type
 * are dropped; `platforms` with both (or none) is dropped (= both).
 * `requireTargets`: cities / uids / orgIds must not be empty (publish / send).
 */
export function parseAudience(value: unknown, opts: { requireTargets: boolean }): Audience {
  const a = obj(value ?? { type: "all" });
  if (!(AUDIENCE_TYPES as readonly string[]).includes(String(a.type))) {
    throw new DomainError("INVALID_INPUT", "Choose who this is for.");
  }
  const out: Audience = { type: a.type as AudienceType };
  if (out.type === "cities") {
    if (a.cities !== undefined && a.cities !== null && !Array.isArray(a.cities)) throw new DomainError("INVALID_INPUT", "Cities must be a list.");
    const raw = (a.cities as unknown[] | undefined) ?? [];
    if (raw.length > MAX_AUDIENCE_CITIES) throw new DomainError("INVALID_INPUT", `Choose at most ${MAX_AUDIENCE_CITIES} cities.`);
    const seen = new Set<string>();
    const cities: string[] = [];
    raw.forEach((c, i) => {
      const name = str(c, `City #${i + 1}`, 2, 60).replace(/\s+/g, " ");
      const key = cityKey(name);
      if (!key) throw new DomainError("INVALID_INPUT", `City “${name}” isn't a city name.`);
      if (!seen.has(key)) {
        seen.add(key);
        cities.push(name);
      }
    });
    if (opts.requireTargets && cities.length === 0) throw new DomainError("INVALID_INPUT", "Choose at least one city.");
    out.cities = cities;
  }
  if (out.type === "users") {
    const uids = uidList(a.uids, "People", MAX_AUDIENCE_UIDS);
    if (opts.requireTargets && uids.length === 0) throw new DomainError("INVALID_INPUT", "Choose at least one person.");
    out.uids = uids;
  }
  if (out.type === "orgs") {
    if (a.orgIds !== undefined && a.orgIds !== null && !Array.isArray(a.orgIds)) throw new DomainError("INVALID_INPUT", "Organizations must be a list.");
    const raw = (a.orgIds as unknown[] | undefined) ?? [];
    if (raw.length > MAX_AUDIENCE_ORGS) throw new DomainError("INVALID_INPUT", `Choose at most ${MAX_AUDIENCE_ORGS} organizations.`);
    const orgIds = [...new Set(raw.map((o, i) => docId(o, `Organization #${i + 1}`)))];
    if (opts.requireTargets && orgIds.length === 0) throw new DomainError("INVALID_INPUT", "Choose at least one organization.");
    out.orgIds = orgIds;
  }
  if (a.platforms !== undefined && a.platforms !== null) {
    if (!Array.isArray(a.platforms)) throw new DomainError("INVALID_INPUT", "Platforms must be a list.");
    const ps = [...new Set(a.platforms.map(String))];
    if (ps.some((p) => !(PLATFORMS as readonly string[]).includes(p))) throw new DomainError("INVALID_INPUT", "Platforms can be android and ios.");
    if (ps.length === 1) out.platforms = ps as Platform[];
  }
  if (a.minBuild !== undefined && a.minBuild !== null) out.minBuild = int(a.minBuild, "Minimum build", 0, MAX_BUILD);
  if (a.maxBuild !== undefined && a.maxBuild !== null) out.maxBuild = int(a.maxBuild, "Maximum build", 0, MAX_BUILD);
  if (out.minBuild !== undefined && out.maxBuild !== undefined && out.minBuild > out.maxBuild) {
    throw new DomainError("INVALID_INPUT", "The minimum build can't be above the maximum build.");
  }
  const exclude = uidList(a.excludeUids, "Excluded people", MAX_AUDIENCE_EXCLUSIONS);
  if (exclude.length) out.excludeUids = exclude;
  return out;
}

/** Platform or build filters (they need per-person app details). */
export const hasDeviceFilters = (a: Audience) => !!a.platforms?.length || a.minBuild !== undefined || a.maxBuild !== undefined;
export const hasExclusions = (a: Audience) => !!a.excludeUids?.length;
/** Audiences that count toward the shared 3-a-day broad-push quota (contract §2). */
export const isLimitedAudience = (a: Audience) => a.type === "all" || a.type === "customers" || a.type === "cities";
/** FCM topics for a city audience: city_<key> (same key as broadcast.ts / the app). */
export const cityTopics = (a: Audience) => [...new Set((a.cities ?? []).map((c) => `city_${cityKey(c).replace(/ /g, "-")}`))];

/* ------------------------------------------------------------ per viewer */

export interface Viewer {
  uid: string;
  platform: Platform;
  build: number;
  /** cityKey of the city the phone sent, if any. */
  cityKey: string | null;
  /** The viewer's active organization memberships. */
  activeOrgIds: string[];
}

export const audienceNeedsMemberships = (a: Audience) => a.type === "customers" || a.type === "organizers" || a.type === "orgs";

/** Exact match for one person opening the app (every filter is known). */
export function matchesViewer(a: Audience, v: Viewer): boolean {
  if (a.excludeUids?.includes(v.uid)) return false;
  if (a.platforms?.length && !a.platforms.includes(v.platform)) return false;
  if (a.minBuild !== undefined && v.build < a.minBuild) return false;
  if (a.maxBuild !== undefined && v.build > a.maxBuild) return false;
  switch (a.type) {
    case "all":
      return true;
    case "customers":
      return v.activeOrgIds.length === 0;
    case "organizers":
      return v.activeOrgIds.length > 0;
    case "cities":
      return !!v.cityKey && (a.cities ?? []).some((c) => cityKey(c) === v.cityKey);
    case "users":
      return (a.uids ?? []).includes(v.uid);
    case "orgs":
      return v.activeOrgIds.some((o) => (a.orgIds ?? []).includes(o));
  }
}

/** Whether [uid] is one of the people an audience is for, by who they are
 *  (people, organizations, customers/organizers, exclusions). Device and
 *  city filters aren't known here and don't exclude anyone. */
export function includesPerson(a: Audience, uid: string, activeOrgIds: string[]): boolean {
  if (a.excludeUids?.includes(uid)) return false;
  switch (a.type) {
    case "all":
    case "cities":
      return true;
    case "customers":
      return activeOrgIds.length === 0;
    case "organizers":
      return activeOrgIds.length > 0;
    case "users":
      return (a.uids ?? []).includes(uid);
    case "orgs":
      return activeOrgIds.some((o) => (a.orgIds ?? []).includes(o));
  }
}

/* -------------------------------------------------------- recipient lists */

interface PersonInfo {
  operator: boolean;
  platform: string | null;
  build: number | null;
}

function infoOf(data: Record<string, unknown> | undefined): PersonInfo {
  const client = (data?.appClient ?? null) as { platform?: unknown; build?: unknown } | null;
  const platform = typeof client?.platform === "string" ? client.platform : typeof data?.pushPlatform === "string" ? (data.pushPlatform as string) : null;
  const build = typeof client?.build === "number" ? client.build : null;
  return { operator: data?.scope === "platform", platform, build };
}

/** Platform/build filters against what PULSE knows about the person's app (unknown = no match). */
function passesDeviceFilters(a: Audience, p: PersonInfo): boolean {
  if (a.platforms?.length && (!p.platform || !a.platforms.includes(p.platform as Platform))) return false;
  if (a.minBuild !== undefined && (p.build === null || p.build < a.minBuild)) return false;
  if (a.maxBuild !== undefined && (p.build === null || p.build > a.maxBuild)) return false;
  return true;
}

/** Every person with an active organization membership. */
export async function activeOrganizerUids(): Promise<Set<string>> {
  const snap = await db().collection("memberships").where("status", "==", "active").select("uid").get();
  return new Set(snap.docs.map((d) => String(d.get("uid") ?? "")).filter(Boolean));
}

/** Blocked accounts whose block hasn't ended. */
export async function blockedUids(): Promise<Set<string>> {
  const snap = await db().collection("accountStatus").where("status", "==", "blocked").get();
  const now = Date.now();
  return new Set(snap.docs.filter((d) => effectiveAccountStatus(d.data(), now).status === "blocked").map((d) => d.id));
}

async function membersOfOrgs(orgIds: string[]): Promise<string[]> {
  const out = new Set<string>();
  for (let i = 0; i < orgIds.length; i += 30) {
    const snap = await db().collection("memberships").where("orgId", "in", orgIds.slice(i, i + 30)).get();
    for (const d of snap.docs) if (d.get("status") === "active" && typeof d.get("uid") === "string") out.add(d.get("uid") as string);
  }
  return [...out];
}

/** users/{uid} app details for [uids] (missing docs → undefined). */
async function peopleInfo(uids: string[]): Promise<Map<string, PersonInfo | undefined>> {
  const out = new Map<string, PersonInfo | undefined>();
  for (let i = 0; i < uids.length; i += 300) {
    const refs = uids.slice(i, i + 300).map((u) => db().collection("users").doc(u));
    if (!refs.length) continue;
    const snaps = await db().getAll(...refs, { fieldMask: ["scope", "appClient", "pushPlatform"] });
    for (const s of snaps) out.set(s.id, s.exists ? infoOf(s.data()) : undefined);
  }
  return out;
}

export interface Recipients {
  uids: string[];
  organizers: number;
  customers: number;
  /** More than `cap` people matched; `uids` holds the first `cap`. */
  truncated: boolean;
}

/**
 * The people an audience reaches, for inbox items and per-person pushes.
 * Cities have no list (the phone keeps the city) and resolve to nobody.
 */
export async function resolveRecipients(a: Audience, cap = MAX_RECIPIENTS): Promise<Recipients> {
  if (a.type === "cities") return { uids: [], organizers: 0, customers: 0, truncated: false };
  const [blocked, organizers] = await Promise.all([blockedUids(), activeOrganizerUids()]);
  const exclude = new Set(a.excludeUids ?? []);
  const device = hasDeviceFilters(a);
  const out: string[] = [];
  let truncated = false;
  const keep = (uid: string) => !exclude.has(uid) && !blocked.has(uid);

  if (a.type === "all" || a.type === "customers") {
    let last: string | null = null;
    scan: for (;;) {
      let q = db().collection("users").orderBy(FieldPath.documentId()).select("scope", "appClient", "pushPlatform").limit(1000);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      for (const d of snap.docs) {
        const info = infoOf(d.data());
        if (info.operator || !keep(d.id)) continue;
        if (a.type === "customers" && organizers.has(d.id)) continue;
        if (device && !passesDeviceFilters(a, info)) continue;
        if (out.length >= cap) {
          truncated = true;
          break scan;
        }
        out.push(d.id);
      }
      if (snap.size < 1000) break;
      last = snap.docs[snap.docs.length - 1]!.id;
    }
  } else {
    const candidates =
      a.type === "users" ? (a.uids ?? []) : a.type === "orgs" ? await membersOfOrgs(a.orgIds ?? []) : [...organizers];
    const kept = candidates.filter(keep);
    const info = await peopleInfo(kept);
    for (const uid of kept) {
      const p = info.get(uid);
      if (p?.operator) continue;
      // A chosen person without a users doc still gets an inbox item; device filters need the doc.
      if (device && (!p || !passesDeviceFilters(a, p))) continue;
      if (out.length >= cap) {
        truncated = true;
        break;
      }
      out.push(uid);
    }
  }
  const org = out.filter((u) => organizers.has(u)).length;
  return { uids: out, organizers: org, customers: out.length - org, truncated };
}

/* -------------------------------------------------------------- estimates */

export interface AudiencePreview {
  estimate: number;
  exact: boolean;
  breakdown: { customers: number; organizers: number };
  sample: Array<{ uid: string; displayName: string | null }>;
  note: string | null;
}

async function displayNames(uids: string[]): Promise<Array<{ uid: string; displayName: string | null }>> {
  if (!uids.length) return [];
  const snaps = await db().getAll(...uids.map((u) => db().collection("publicProfiles").doc(u)));
  return snaps.map((s) => ({ uid: s.id, displayName: typeof s.data()?.displayName === "string" ? (s.data()!.displayName as string) : null }));
}

/** First few non-operator people (doc-id order) for an aggregate estimate's sample. */
async function samplePeople(skip: Set<string>, n: number): Promise<string[]> {
  const snap = await db().collection("users").orderBy(FieldPath.documentId()).select("scope").limit(200).get();
  return snap.docs.filter((d) => d.get("scope") !== "platform" && !skip.has(d.id)).slice(0, n).map((d) => d.id);
}

/** Everyone PULSE could reach: users minus operators minus blocked (count aggregations). */
async function everyoneCount(blocked: Set<string>): Promise<number> {
  const [total, operators] = await Promise.all([
    db().collection("users").count().get(),
    db().collection("users").where("scope", "==", "platform").count().get(),
  ]);
  return Math.max(0, total.data().count - operators.data().count - blocked.size);
}

export const CITY_NOTE = "PULSE doesn't store where people are: the phone decides the city, so this counts everyone — the most it can reach.";
export const DEVICE_NOTE = "Counts only people whose app has told PULSE its platform and build (it does when the app opens). Announcements also reach others whose phone matches.";

/** previewAudience: how many people an audience reaches, with a split and a sample. */
export async function estimateAudience(a: Audience): Promise<AudiencePreview> {
  const device = hasDeviceFilters(a);
  if (a.type === "cities" || ((a.type === "all" || a.type === "customers") && !device && !hasExclusions(a))) {
    const [blocked, organizerSet] = await Promise.all([blockedUids(), activeOrganizerUids()]);
    const everyone = await everyoneCount(blocked);
    const organizers = Math.min(everyone, [...organizerSet].filter((u) => !blocked.has(u)).length);
    const customers = Math.max(0, everyone - organizers);
    const estimate = a.type === "customers" ? customers : everyone;
    const skip = new Set([...blocked, ...(a.type === "customers" ? organizerSet : [])]);
    return {
      estimate,
      exact: a.type !== "cities",
      breakdown: a.type === "customers" ? { customers, organizers: 0 } : { customers, organizers },
      sample: await displayNames(await samplePeople(skip, 10)),
      note: a.type === "cities" ? CITY_NOTE : null,
    };
  }
  const r = await resolveRecipients(a);
  return {
    estimate: r.uids.length,
    exact: !device && !r.truncated,
    breakdown: { customers: r.customers, organizers: r.organizers },
    sample: await displayNames(r.uids.slice(0, 10)),
    note: device ? DEVICE_NOTE : r.truncated ? `More than ${MAX_RECIPIENTS.toLocaleString("en-IN")} people match; a send reaches the first ${MAX_RECIPIENTS.toLocaleString("en-IN")}.` : null,
  };
}
