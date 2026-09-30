/**
 * Identity / organizer / staff access under firestore.rules (ADR-0003, ADR-0004).
 * Runs against the emulator given by FIRESTORE_EMULATOR_HOST. Documents use
 * per-test ids and the database is never cleared, so this file can run in
 * parallel with the storage rules suite.
 */
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { resolve } from "path";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";

const PROJECT_ID = "demo-experience-os";
const RULES_PATH = resolve(__dirname, "../firestore.rules");

function emulatorHost(variable: string): { host: string; port: number } {
  const value = process.env[variable];
  if (!value) throw new Error(`${variable} is not set: run under \`firebase emulators:exec\`.`);
  const i = value.lastIndexOf(":");
  return { host: value.slice(0, i), port: Number(value.slice(i + 1)) };
}

let env: RulesTestEnvironment;
let n = 0;
let ORG = "";
const ids = () => {
  n += 1;
  const s = `${Date.now().toString(36)}${n}`;
  return { org: `org-${s}`, owner: `owner-${s}`, mgr: `mgr-${s}`, scopedMgr: `smgr-${s}`, staff: `staff-${s}`, cust: `cust-${s}`, other: `other-${s}` };
};
let u = ids();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), ...emulatorHost("FIRESTORE_EMULATOR_HOST") },
  });
});
afterAll(async () => env.cleanup());

/** Exactly what Firebase phone auth issues: no custom claims at all. */
const phoneUser = (uid: string) => env.authenticatedContext(uid, { phone_number: "+919800000000" }).firestore();

async function seed(path: string, value: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), path), value));
}

const member = (orgId: string, uid: string, permissions: string[], all = true, extra: Record<string, unknown> = {}) =>
  seed(`memberships/${orgId}__${uid}`, {
    orgId, uid, role: "staff", status: "active", permissions, eventScope: { all, eventIds: all ? [] : ["event-a"] }, version: 0, ...extra,
  });

beforeEach(async () => {
  u = ids();
  ORG = u.org;
  await seed(`organizers/${ORG}`, { name: "Sunrise Treks", status: "active", commissionBps: 1000, ownerUid: u.owner });
  await member(ORG, u.owner, [], true, { role: "owner" });
  await member(ORG, u.mgr, ["staff.manage", "events.view"]);
  await member(ORG, u.scopedMgr, ["staff.manage", "events.view"], false);
  await member(ORG, u.staff, ["events.view", "attendees.view", "tickets.scan"]);
  await seed(`staffInvites/inv-${ORG}`, { orgId: ORG, phone: "+919876543210", codeHash: "x".repeat(64), status: "pending" });
  await seed(`organizerActivations/${u.cust}`, { orgId: ORG, codeHash: "y".repeat(64), status: "issued" });
  await seed(`customerSafety/${u.other}`, { birthDate: "1990-01-01", gender: "woman" });
  await seed(`customerSafety/${u.cust}`, { birthDate: "1995-01-01", gender: "man" });
  await seed(`events/draft-${ORG}`, { orgId: ORG, status: "draft" });
  await seed(`bookings/bk-${ORG}`, { orgId: ORG, eventId: `draft-${ORG}`, customerUid: u.other, status: "confirmed" });
});

describe("a customer", () => {
  test("cannot read other people's memberships, invites, activations, safety data or private organizer docs", async () => {
    const db = phoneUser(u.cust);
    await assertFails(getDoc(doc(db, `memberships/${ORG}__${u.staff}`)));
    await assertFails(getDocs(query(collection(db, "memberships"), where("orgId", "==", ORG))));
    await assertFails(getDoc(doc(db, `staffInvites/inv-${ORG}`)));
    await assertFails(getDocs(query(collection(db, "staffInvites"), where("orgId", "==", ORG))));
    await assertFails(getDoc(doc(db, `organizerActivations/${u.cust}`))); // not even their own hash
    await assertFails(getDoc(doc(db, `customerSafety/${u.other}`)));
    await assertFails(getDoc(doc(db, `organizers/${ORG}`)));
    await assertFails(getDoc(doc(db, `events/draft-${ORG}`)));
    await assertFails(getDoc(doc(db, `bookings/bk-${ORG}`)));
  });

  test("can read their own safety data and their own memberships", async () => {
    await assertSucceeds(getDoc(doc(phoneUser(u.cust), `customerSafety/${u.cust}`)));
    const staffDb = phoneUser(u.staff);
    await assertSucceeds(getDoc(doc(staffDb, `memberships/${ORG}__${u.staff}`)));
    await assertSucceeds(getDocs(query(collection(staffDb, "memberships"), where("uid", "==", u.staff))));
  });

  test("cannot write identity documents directly", async () => {
    const db = phoneUser(u.cust);
    await assertFails(setDoc(doc(db, `memberships/${ORG}__${u.cust}`), { orgId: ORG, uid: u.cust, role: "owner", status: "active" }));
    await assertFails(setDoc(doc(db, `customerSafety/${u.cust}`), { birthDate: "2000-01-01" }));
    await assertFails(setDoc(doc(db, `organizerApplications/${u.cust}`), { status: "approved" }));
    await assertFails(setDoc(doc(db, `staffInvites/forged`), { orgId: ORG, phone: "+919800000000" }));
  });
});

describe("staff.manage", () => {
  test("with the all-events scope can read the org's memberships", async () => {
    const db = phoneUser(u.mgr);
    await assertSucceeds(getDoc(doc(db, `memberships/${ORG}__${u.staff}`)));
    await assertSucceeds(getDocs(query(collection(db, "memberships"), where("orgId", "==", ORG))));
    // …but never the invite docs (with their code hashes).
    await assertFails(getDoc(doc(db, `staffInvites/inv-${ORG}`)));
  });

  test("without it, or with only an event scope, memberships of others stay private", async () => {
    for (const uid of [u.staff, u.scopedMgr]) {
      const db = phoneUser(uid);
      await assertFails(getDoc(doc(db, `memberships/${ORG}__${u.mgr}`)));
      await assertFails(getDocs(query(collection(db, "memberships"), where("orgId", "==", ORG))));
    }
  });

  test("a manager of another org has no read on this org", async () => {
    await member("org-elsewhere", u.other, ["staff.manage", "events.view", "attendees.view"]);
    const db = phoneUser(u.other);
    await assertFails(getDoc(doc(db, `memberships/${ORG}__${u.staff}`)));
    await assertFails(getDoc(doc(db, `events/draft-${ORG}`)));
  });
});

test("revocation removes read access on org events and bookings immediately", async () => {
  const db = phoneUser(u.staff);
  await assertSucceeds(getDoc(doc(db, `events/draft-${ORG}`)));
  await assertSucceeds(getDoc(doc(db, `bookings/bk-${ORG}`)));
  await assertSucceeds(getDoc(doc(db, `organizers/${ORG}`)));
  await env.withSecurityRulesDisabled(async (ctx) =>
    updateDoc(doc(ctx.firestore(), `memberships/${ORG}__${u.staff}`), { status: "revoked" })
  );
  // Same signed-in session, no token refresh.
  await assertFails(getDoc(doc(db, `events/draft-${ORG}`)));
  await assertFails(getDoc(doc(db, `bookings/bk-${ORG}`)));
  await assertFails(getDoc(doc(db, `organizers/${ORG}`)));
});

describe("publicProfiles", () => {
  const write = (uid: string, data: Record<string, unknown>, as = uid) =>
    setDoc(doc(phoneUser(as), `publicProfiles/${uid}`), { updatedAt: serverTimestamp(), ...data });

  test("the owner may write the whitelisted, validated fields", async () => {
    await assertSucceeds(write(u.cust, { displayName: "Asha", bio: "Trail runner", avatarSeed: "seed-1" }));
    await assertSucceeds(getDoc(doc(phoneUser(u.other), `publicProfiles/${u.cust}`)));
  });

  test("bad keys, bad lengths, forged timestamps and other people's profiles are rejected", async () => {
    await assertFails(write(u.cust, { displayName: "Asha", phone: "+919800000000" }));
    await assertFails(write(u.cust, { displayName: "Asha", birthDate: "1990-01-01" }));
    await assertFails(write(u.cust, { displayName: "Asha", verified: true }));
    await assertFails(write(u.cust, { displayName: "A" }));
    await assertFails(write(u.cust, { displayName: "x".repeat(31) }));
    await assertFails(write(u.cust, { displayName: 42 }));
    await assertFails(write(u.cust, { displayName: "Asha", bio: "b".repeat(161) }));
    await assertFails(setDoc(doc(phoneUser(u.cust), `publicProfiles/${u.cust}`), { displayName: "Asha", updatedAt: new Date(0) }));
    await assertFails(write(u.other, { displayName: "Hijack" }, u.cust));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `publicProfiles/${u.cust}`)));
  });
});

describe("userNotifications", () => {
  beforeEach(async () => {
    await seed(`userNotifications/n-${ORG}`, { recipientUid: u.cust, kind: "staff-activated", title: "Hi", body: "Hello", read: false });
  });

  test("the recipient may only flip the read flag", async () => {
    const db = phoneUser(u.cust);
    await assertSucceeds(getDoc(doc(db, `userNotifications/n-${ORG}`)));
    await assertSucceeds(updateDoc(doc(db, `userNotifications/n-${ORG}`), { read: true }));
    await assertFails(updateDoc(doc(db, `userNotifications/n-${ORG}`), { title: "Forged" }));
    await assertFails(updateDoc(doc(db, `userNotifications/n-${ORG}`), { read: "yes" }));
    await assertFails(updateDoc(doc(db, `userNotifications/n-${ORG}`), { read: false, recipientUid: u.other }));
    await assertFails(setDoc(doc(db, `userNotifications/new-${ORG}`), { recipientUid: u.cust, read: false }));
  });

  test("nobody else can read or update it", async () => {
    const db = phoneUser(u.other);
    await assertFails(getDoc(doc(db, `userNotifications/n-${ORG}`)));
    await assertFails(updateDoc(doc(db, `userNotifications/n-${ORG}`), { read: true }));
  });
});

test("a suspended account (disabled claim) loses even its own data", async () => {
  await seed(`customerSafety/${u.staff}`, { birthDate: "1995-01-01", gender: "man" });
  const db = env.authenticatedContext(u.staff, { phone_number: "+919800000000", disabled: true }).firestore();
  await assertFails(getDoc(doc(db, `customerSafety/${u.staff}`)));
  await assertFails(getDoc(doc(db, `memberships/${ORG}__${u.staff}`)));
  await assertFails(getDoc(doc(db, `events/draft-${ORG}`)));
});
