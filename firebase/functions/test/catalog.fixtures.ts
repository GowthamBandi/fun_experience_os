/**
 * Shared fixtures for the catalog emulator tests (test/catalog*.test.ts).
 * Seeds Firestore directly through the admin SDK and invokes the real
 * callables through `.run()` so validation, auth mapping and error mapping
 * are all exercised.
 */
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8380";
process.env.GCLOUD_PROJECT = "demo-experience-os";

import { db, Timestamp } from "../src/platform/firestore";
import type { Permission } from "../src/access/permissions";

export const PROJECT = "demo-experience-os";
export const ORG = "org-alpha";
export const OTHER_ORG = "org-beta";

export const U = {
  owner: "owner-0001",
  manager: "manager-0001",
  leadA: "lead-a-0001",
  viewer: "viewer-0001",
  checkin: "checkin-0001",
  revoked: "revoked-0001",
  customer: "customer-0001",
  customer2: "customer-0002",
  otherOwner: "other-owner-0001",
};

export const ALL_PERMS: Permission[] = [
  "experiences.view", "experiences.edit", "experiences.submit",
  "events.view", "events.edit", "events.submit", "events.publish", "events.operate", "events.cancel",
  "attendees.view", "tickets.scan", "reviews.view", "reviews.respond", "refunds.view", "refunds.request",
];

let seq = 0;
export const rid = (tag = "r") => `${tag}-${Date.now().toString(36)}-${(seq++).toString(36)}`.replace(/[^A-Za-z0-9_-]/g, "");

export const phoneCtx = (uid: string) => ({ auth: { uid, token: { phone_number: "+919876543210" } } });
export const adminCtx = (uid = "admin-0001") => ({ auth: { uid, token: { email_verified: true, roleId: "super-admin", email: "a@x.io" } } });

type Runnable = { run: (data: unknown, ctx: unknown) => unknown };
export const call = async (fn: unknown, data: unknown, ctx: unknown) =>
  (await (fn as Runnable).run(data, ctx)) as Record<string, any>;

/** Resolves the DomainError code carried by a rejected callable. */
export async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { details?: { code?: string }; code?: string };
    return err.details?.code ?? String(err.code);
  }
  return "RESOLVED";
}
export async function messageOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  return "RESOLVED";
}

export async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const res = await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!res.ok) throw new Error(`clear failed ${res.status}`);
}

export async function member(orgId: string, uid: string, m: { role?: "owner" | "staff"; status?: string; permissions?: Permission[]; scope?: "all" | string[] }) {
  const scope = m.scope ?? "all";
  await db().doc(`memberships/${orgId}__${uid}`).set({
    orgId, uid,
    role: m.role ?? "staff",
    status: m.status ?? "active",
    permissions: m.permissions ?? [],
    eventScope: scope === "all" ? { all: true, eventIds: [] } : { all: false, eventIds: scope },
    version: 1,
  });
}

export async function seedOrg(orgId = ORG, owner = U.owner, opts: { status?: string; agreementBps?: number | null } = {}) {
  await db().doc(`organizers/${orgId}`).set({ status: opts.status ?? "active", displayName: `${orgId} Events`, version: 1 });
  await db().doc(`publicOrganizers/${orgId}`).set({ displayName: `${orgId} Events` });
  await member(orgId, owner, { role: "owner" });
  if (opts.agreementBps !== null) {
    await db().doc(`commercialAgreements/ca-${orgId}`).set({ orgId, status: "approved", commissionBps: opts.agreementBps ?? 1200, updatedAt: Timestamp.now() });
  }
}

export async function seedStandardTeam(eventScopeA: string[]) {
  await member(ORG, U.manager, { permissions: ALL_PERMS, scope: "all" });
  await member(ORG, U.leadA, {
    permissions: ["events.view", "events.edit", "events.submit", "events.publish", "events.operate", "events.cancel"],
    scope: eventScopeA,
  });
  await member(ORG, U.viewer, { permissions: ["events.view", "experiences.view"], scope: "all" });
  await member(ORG, U.checkin, { permissions: ["events.view", "tickets.scan", "attendees.view"], scope: "all" });
  await member(ORG, U.revoked, { permissions: ALL_PERMS, scope: "all", status: "revoked" });
}

export const experienceInput = (over: Record<string, unknown> = {}) => ({
  requestId: rid("exp"),
  orgId: ORG,
  title: "Sunday 5-a-side Football",
  tagline: "Friendly games under lights",
  category: "sports",
  activity: "Football",
  description: "A relaxed but competitive five-a-side football session for all levels.",
  highlights: ["Floodlit turf", "Bibs provided"],
  format: "5-a-side",
  genderRule: "open",
  ageMin: 16,
  idRequired: false,
  rules: ["No studs"],
  bring: ["Water"],
  safety: { level: "medium", measures: ["First-aid kit on site"] },
  cancellationPolicy: "moderate",
  config: { teamSize: 5, skillLevel: "all-levels" },
  ...over,
});

const H = 3600_000;
export const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();

export const eventInput = (experienceId: string, over: Record<string, unknown> = {}) => ({
  requestId: rid("evt"),
  orgId: ORG,
  experienceId,
  venue: { name: "Turf Arena", area: "Jubilee Hills", city: "Hyderabad", address: "Road 36, Jubilee Hills" },
  startsAt: isoIn(72 * H),
  durationMinutes: 90,
  capacity: { max: 20, min: 6 },
  priceMinor: 49_900,
  currency: "INR",
  primaryUid: U.owner,
  staffUids: [],
  ...over,
});

export { db, Timestamp, H };
