/**
 * Catalog read-path rules (ADR-0003): experiences, events, reviews.
 * Clients never write catalog state; reads are authorized live from
 * `memberships` (WHAT × WHERE).
 */
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { resolve } from "path";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from "firebase/firestore";

const PROJECT_ID = "demo-experience-os";
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8380").split(":");
const ORG = "org-alpha";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8"), host: HOST, port: Number(PORT) },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const m = (uid: string, v: Record<string, unknown>) => setDoc(doc(db, `memberships/${ORG}__${uid}`), { orgId: ORG, uid, version: 1, ...v });
    await m("owner", { role: "owner", status: "active", permissions: [], eventScope: { all: true, eventIds: [] } });
    await m("staffA", { role: "staff", status: "active", permissions: ["events.view", "experiences.view"], eventScope: { all: false, eventIds: ["event-A"] } });
    await m("allviewer", { role: "staff", status: "active", permissions: ["events.view", "experiences.view"], eventScope: { all: true, eventIds: [] } });
    await m("scanonly", { role: "staff", status: "active", permissions: ["tickets.scan"], eventScope: { all: true, eventIds: [] } });
    await m("revoked", { role: "staff", status: "revoked", permissions: ["events.view", "experiences.view"], eventScope: { all: true, eventIds: [] } });
    await setDoc(doc(db, "experiences/exp-approved"), { orgId: ORG, status: "approved", title: "Football" });
    await setDoc(doc(db, "experiences/exp-draft"), { orgId: ORG, status: "draft", title: "Draft" });
    await setDoc(doc(db, "events/event-pub"), { orgId: ORG, status: "published", title: "Pub" });
    await setDoc(doc(db, "events/event-A"), { orgId: ORG, status: "draft", title: "A" });
    await setDoc(doc(db, "events/event-B"), { orgId: ORG, status: "draft", title: "B" });
    await setDoc(doc(db, "reviews/event-pub__author"), { orgId: ORG, eventId: "event-pub", authorUid: "author", status: "published", rating: 5 });
    await setDoc(doc(db, "reviews/event-pub__hider"), { orgId: ORG, eventId: "event-pub", authorUid: "hider", status: "hidden", rating: 1 });
  });
});

// Claims mirror a real token plus explicit defaults; the regression test
// below uses a realistic token with no custom claims at all.
const as = (uid: string, claims: Record<string, unknown> = { phone_number: "+919876543210", disabled: false }) => env.authenticatedContext(uid, claims).firestore();
const admin = () => env.authenticatedContext("admin", { email_verified: true, roleId: "super-admin", disabled: false }).firestore();

test("any signed-in user reads published events and approved experiences", async () => {
  const db = as("customer");
  await assertSucceeds(getDoc(doc(db, "events/event-pub")));
  await assertSucceeds(getDoc(doc(db, "experiences/exp-approved")));
  await assertSucceeds(getDocs(query(collection(db, "events"), where("status", "==", "published"))));
  await assertSucceeds(getDocs(query(collection(db, "experiences"), where("status", "==", "approved"))));
});

test("customers cannot read drafts or list unfiltered", async () => {
  const db = as("customer");
  await assertFails(getDoc(doc(db, "events/event-A")));
  await assertFails(getDoc(doc(db, "experiences/exp-draft")));
  await assertFails(getDocs(collection(db, "events")));
});

test("draft experiences: owner and org-wide experiences.view members only", async () => {
  await assertSucceeds(getDoc(doc(as("owner"), "experiences/exp-draft")));
  await assertSucceeds(getDoc(doc(as("allviewer"), "experiences/exp-draft")));
  await assertFails(getDoc(doc(as("staffA"), "experiences/exp-draft"))); // scoped staff aren't org-wide
  await assertFails(getDoc(doc(as("scanonly"), "experiences/exp-draft")));
  await assertFails(getDoc(doc(as("revoked"), "experiences/exp-draft")));
});

test("draft events: scoped staff read event A but not event B; revoked and wrong-permission denied", async () => {
  await assertSucceeds(getDoc(doc(as("staffA"), "events/event-A")));
  await assertFails(getDoc(doc(as("staffA"), "events/event-B")));
  await assertSucceeds(getDoc(doc(as("owner"), "events/event-B")));
  await assertSucceeds(getDoc(doc(as("allviewer"), "events/event-B")));
  await assertFails(getDoc(doc(as("scanonly"), "events/event-B")));
  await assertFails(getDoc(doc(as("revoked"), "events/event-A")));
});

test("admins read everything in the catalog", async () => {
  await assertSucceeds(getDoc(doc(admin(), "events/event-B")));
  await assertSucceeds(getDoc(doc(admin(), "experiences/exp-draft")));
  await assertSucceeds(getDoc(doc(admin(), "reviews/event-pub__hider")));
});

test("reviews are private to their author and admins (participants stay anonymous)", async () => {
  await assertFails(getDoc(doc(as("customer"), "reviews/event-pub__author")));
  await assertFails(getDocs(query(collection(as("customer"), "reviews"), where("status", "==", "published"))));
  await assertSucceeds(getDoc(doc(as("author"), "reviews/event-pub__author")));
  await assertFails(getDoc(doc(as("customer"), "reviews/event-pub__hider")));
  await assertFails(getDoc(doc(as("owner"), "reviews/event-pub__author"))); // organizers see aggregates only
  await assertFails(getDoc(doc(as("owner"), "reviews/event-pub__hider")));
  await assertSucceeds(getDoc(doc(as("hider"), "reviews/event-pub__hider")));
  await assertFails(getDocs(collection(as("customer"), "reviews")));
});

test("no client writes to catalog collections — not owners, not admins", async () => {
  for (const db of [as("owner"), as("customer"), admin()]) {
    await assertFails(setDoc(doc(db, "experiences/exp-new"), { orgId: ORG, status: "approved" }));
    await assertFails(updateDoc(doc(db, "experiences/exp-draft"), { status: "approved" }));
    await assertFails(setDoc(doc(db, "events/event-new"), { orgId: ORG, status: "published" }));
    await assertFails(updateDoc(doc(db, "events/event-A"), { status: "published", commissionBps: 0 }));
    await assertFails(deleteDoc(doc(db, "events/event-pub")));
    await assertFails(setDoc(doc(db, "reviews/event-pub__customer"), { authorUid: "customer", status: "published", rating: 5 }));
    await assertFails(updateDoc(doc(db, "reviews/event-pub__author"), { status: "hidden" }));
    await assertFails(setDoc(doc(db, "governanceCases/case-x"), { kind: "event-approval", status: "approved" }));
    await assertFails(setDoc(doc(db, "commercialAgreements/ca-x"), { orgId: ORG, status: "approved", commissionBps: 0 }));
  }
  // author can't edit their own review directly either
  await assertFails(updateDoc(doc(as("author"), "reviews/event-pub__author"), { rating: 1 }));
});

test("signed-out users can't read drafts or hidden reviews", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "events/event-A")));
  await assertFails(getDoc(doc(db, "reviews/event-pub__hider")));
  await assertFails(getDoc(doc(db, "reviews/event-pub__author")));
  await assertFails(getDoc(doc(db, "experiences/exp-draft")));
});

// REGRESSION (fixed 2026-09-30): a real phone-auth ID token carries no
// custom claims; rules must read claims with defaults, never error.
test("realistic phone token (no custom claims): org owner can read their draft event", async () => {
  const db = env.authenticatedContext("owner", { phone_number: "+919876543210" }).firestore();
  await assertSucceeds(getDoc(doc(db, "events/event-B")));
});
