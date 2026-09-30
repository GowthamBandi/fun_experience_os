/**
 * Shared fixtures for the identity suites. Services are exercised directly
 * against the Firestore emulator (house style, see governance.test.ts).
 */
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { PERMISSIONS, type EventScope, type Permission } from "../src/access/permissions";
import type { PhoneActor } from "../src/identity/common";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST is not set: run these tests under `firebase emulators:exec`.");
}
process.env.GCLOUD_PROJECT = "demo-experience-os";

export const admin = { uid: "admin-0001", roleId: "super-admin", email: "admin@example.com" };

export function phoneActor(uid: string, phone: string): PhoneActor {
  return { uid, phone, platformRole: null };
}

const COLLECTIONS_TO_CLEAR = [
  "users", "publicProfiles", "customerSafety", "organizerApplications", "organizers", "publicOrganizers",
  "organizerActivations", "memberships", "staffInvites", "events", "experiences", "governanceCases",
  "auditEvents", "commandReceipts", "rateLimits", "userNotifications",
];

export interface Harness {
  firestore: () => Firestore;
  clear: () => Promise<void>;
}

export function useEmulator(name: string): Harness {
  let app: App;
  let firestore: Firestore;
  beforeAll(() => {
    app = initializeApp({ projectId: "demo-experience-os" }, name);
    firestore = getFirestore(app);
    // Same setting production gets from platform/firestore.ts db().
    firestore.settings({ ignoreUndefinedProperties: true });
  });
  afterAll(async () => deleteApp(app));
  const clear = async () => {
    for (const c of COLLECTIONS_TO_CLEAR) {
      const docs = await firestore.collection(c).get();
      for (let i = 0; i < docs.size; i += 400) {
        const batch = firestore.batch();
        docs.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
  };
  beforeEach(clear);
  return { firestore: () => firestore, clear };
}

export async function seedOrg(firestore: Firestore, orgId: string, ownerUid: string, name = "Sunrise Treks") {
  const now = Timestamp.now();
  await firestore.doc(`organizers/${orgId}`).set({ orgId, ownerUid, name, status: "active", version: 0, createdAt: now });
  await seedMember(firestore, orgId, ownerUid, { role: "owner", permissions: [...PERMISSIONS], eventScope: { all: true, eventIds: [] } });
}

export async function seedMember(
  firestore: Firestore,
  orgId: string,
  uid: string,
  opts: { role?: "owner" | "staff"; permissions: Permission[]; eventScope: EventScope; status?: "active" | "revoked"; title?: string }
) {
  await firestore.doc(`memberships/${orgId}__${uid}`).set({
    orgId,
    uid,
    role: opts.role ?? "staff",
    status: opts.status ?? "active",
    permissions: opts.permissions,
    eventScope: opts.eventScope,
    title: opts.title ?? "Staff",
    version: 0,
  });
}

export async function seedUser(firestore: Firestore, uid: string, phone: string, displayName = "Test Person") {
  await firestore.doc(`users/${uid}`).set({ uid, phone });
  await firestore.doc(`publicProfiles/${uid}`).set({ displayName });
}

/** Every stored document of [collections], serialised, for leak checks. */
export async function dump(firestore: Firestore, collections: string[]): Promise<string> {
  const parts: string[] = [];
  for (const c of collections) {
    const snap = await firestore.collection(c).get();
    snap.forEach((d) => parts.push(`${c}/${d.id} ${JSON.stringify(d.data())}`));
  }
  return parts.join("\n");
}

export async function expectCode<T>(promise: Promise<T>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

export const past = () => Timestamp.fromMillis(Date.now() - 60_000);
