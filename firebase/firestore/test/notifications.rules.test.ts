/**
 * Notification center + account controls under firestore.rules
 * (docs/NOTIFICATION_CENTER_CONTRACT.md §1–3): announcements, sends,
 * templates, receipts and the private status half are admin-read-only; the
 * person reads their own accountStatus (even while blocked) and nothing else;
 * a blocked token (`acct: "blocked"`) loses its other reads. No client writes.
 * Per-test ids; the database is never cleared.
 */
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { resolve } from "path";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc } from "firebase/firestore";

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
let u = { me: "", other: "", ann: "", note: "", tpl: "" };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), ...emulatorHost("FIRESTORE_EMULATOR_HOST") },
  });
});
afterAll(async () => env.cleanup());

const phoneUser = (uid: string, claims: Record<string, unknown> = {}) =>
  env.authenticatedContext(uid, { phone_number: "+919800000000", ...claims }).firestore();
const admin = () => env.authenticatedContext("admin-nc", { email_verified: true, roleId: "super-admin" }).firestore();
const auditor = () => env.authenticatedContext("auditor-nc", { email_verified: true, roleId: "auditor" }).firestore();

async function seed(path: string, value: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), path), value));
}

beforeEach(async () => {
  n += 1;
  const s = `${Date.now().toString(36)}${n}`;
  u = { me: `me-${s}`, other: `other-${s}`, ann: `ann-${s}`, note: `n-${s}`, tpl: `tpl-${s}` };
  await seed(`accountStatus/${u.me}`, { status: "paused", messageToUser: "Please contact support.", until: null });
  await seed(`accountStatus/${u.other}`, { status: "blocked", messageToUser: null, until: null });
  await seed(`accountStatusPrivate/${u.me}`, { reason: "Chargeback pattern under review", history: [] });
  await seed(`announcements/${u.ann}`, { title: "Welcome", status: "live", audience: { type: "all" } });
  await seed(`announcements/${u.ann}/daily/2026-11-24`, { shown: 1 });
  await seed(`announcementReceipts/${u.ann}__${u.me}`, { uid: u.me, announcementId: u.ann });
  await seed(`adminNotifications/${u.note}`, { title: "Hi", status: "sent" });
  await seed(`notificationTemplates/${u.tpl}`, { name: "Weekend", kind: "notification", payload: {} });
  await seed(`publicOrganizers/org-${u.me}`, { name: "Org", status: "paused", statusMessage: "KYC re-check" });
});

describe("accountStatus", () => {
  test("the person reads their own status; never someone else's; never writes it", async () => {
    await assertSucceeds(getDoc(doc(phoneUser(u.me), `accountStatus/${u.me}`)));
    await assertFails(getDoc(doc(phoneUser(u.me), `accountStatus/${u.other}`)));
    await assertFails(getDocs(collection(phoneUser(u.me), "accountStatus")));
    await assertFails(setDoc(doc(phoneUser(u.me), `accountStatus/${u.me}`), { status: "active" }));
    await assertFails(updateDoc(doc(phoneUser(u.me), `accountStatus/${u.me}`), { status: "active" }));
    await assertFails(deleteDoc(doc(phoneUser(u.me), `accountStatus/${u.me}`)));
  });

  test("a blocked person can still read their own status (to see the message), but nothing else", async () => {
    const blocked = phoneUser(u.other, { acct: "blocked" });
    await assertSucceeds(getDoc(doc(blocked, `accountStatus/${u.other}`)));
    await assertFails(getDoc(doc(blocked, `publicOrganizers/org-${u.me}`)));
    // A paused claim keeps normal reads.
    await assertSucceeds(getDoc(doc(phoneUser(u.me, { acct: "paused" }), `publicOrganizers/org-${u.me}`)));
  });

  test("the reason is private: admins only; auditors and the person can't read it", async () => {
    await assertFails(getDoc(doc(phoneUser(u.me), `accountStatusPrivate/${u.me}`)));
    await assertFails(getDoc(doc(auditor(), `accountStatusPrivate/${u.me}`)));
    await assertSucceeds(getDoc(doc(admin(), `accountStatusPrivate/${u.me}`)));
    await assertSucceeds(getDoc(doc(admin(), `accountStatus/${u.me}`)));
    await assertSucceeds(getDocs(query(collection(admin(), "accountStatus"))));
    await assertFails(setDoc(doc(admin(), `accountStatusPrivate/${u.me}`), { reason: "x" }));
    await assertFails(setDoc(doc(admin(), `accountStatus/${u.me}`), { status: "active" }));
  });
});

describe("announcements, sends, templates, receipts", () => {
  const ADMIN_ONLY = () => [`announcements/${u.ann}`, `adminNotifications/${u.note}`, `notificationTemplates/${u.tpl}`, `announcementReceipts/${u.ann}__${u.me}`];

  test("admins read them; customers, organizers and auditors don't — not even their own receipt", async () => {
    for (const path of ADMIN_ONLY()) {
      await assertSucceeds(getDoc(doc(admin(), path)));
      await assertFails(getDoc(doc(phoneUser(u.me), path)));
      await assertFails(getDoc(doc(auditor(), path)));
    }
    for (const name of ["announcements", "adminNotifications", "notificationTemplates", "announcementReceipts"]) {
      await assertSucceeds(getDocs(collection(admin(), name)));
      await assertFails(getDocs(collection(phoneUser(u.me), name)));
    }
  });

  test("nobody writes them from a client, admins included", async () => {
    for (const path of ADMIN_ONLY()) {
      await assertFails(setDoc(doc(admin(), path), { title: "x" }));
      await assertFails(updateDoc(doc(admin(), path), { title: "y" }));
      await assertFails(deleteDoc(doc(admin(), path)));
      await assertFails(setDoc(doc(phoneUser(u.me), path), { title: "x" }));
    }
    await assertFails(setDoc(doc(phoneUser(u.me), `announcementReceipts/${u.ann}__${u.me}`), { uid: u.me, clickedAt: 1 }));
    await assertFails(setDoc(doc(admin(), "announcements/new-one"), { title: "x" }));
  });

  test("per-day counters are server-only", async () => {
    await assertFails(getDoc(doc(admin(), `announcements/${u.ann}/daily/2026-11-24`)));
    await assertFails(getDoc(doc(phoneUser(u.me), `announcements/${u.ann}/daily/2026-11-24`)));
  });

  test("publicOrganizers.status / statusMessage are readable by signed-in people", async () => {
    const snap = await assertSucceeds(getDoc(doc(phoneUser(u.me), `publicOrganizers/org-${u.me}`)));
    expect(snap.data()).toMatchObject({ status: "paused", statusMessage: "KYC re-check" });
  });
});
