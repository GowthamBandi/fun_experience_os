import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { resolve } from "path";
import { doc, getDoc, getDocs, collection, setDoc } from "firebase/firestore";

const PROJECT_ID = "demo-experience-os";
const RULES_PATH = resolve(__dirname, "../firestore.rules");

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

const claims = (roleId: string, extra: Record<string, unknown> = {}) => ({ roleId, email_verified: true, disabled: false, ...extra });

async function seed(path: string, value: Record<string, unknown> = { status: "pending" }) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), path), value));
}

test("signed-out users cannot read governance data", async () => {
  await seed("governanceCases/case-001");
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "governanceCases/case-001")));
});

test("unverified, disabled and ordinary users cannot read governance data", async () => {
  await seed("governanceCases/case-001");
  const contexts = [
    testEnv.authenticatedContext("u1", { roleId: "super-admin", email_verified: false }),
    testEnv.authenticatedContext("u2", claims("super-admin", { disabled: true })),
    testEnv.authenticatedContext("u3", claims("organizer")),
  ];
  for (const ctx of contexts) await assertFails(getDoc(doc(ctx.firestore(), "governanceCases/case-001")));
});

test.each(["platform-owner", "super-admin"])("%s can read and list governance data", async (roleId) => {
  await seed("governanceCases/case-001");
  const firestore = testEnv.authenticatedContext(`uid-${roleId}`, claims(roleId)).firestore();
  await assertSucceeds(getDoc(doc(firestore, "governanceCases/case-001")));
  await assertSucceeds(getDocs(collection(firestore, "governanceCases")));
});

test("admins cannot bypass callable validation with direct writes", async () => {
  const firestore = testEnv.authenticatedContext("admin", claims("super-admin")).firestore();
  await assertFails(setDoc(doc(firestore, "governanceCases/case-001"), { status: "approved" }));
  await assertFails(setDoc(doc(firestore, "organizers/org-001"), { status: "active" }));
  await assertFails(setDoc(doc(firestore, "auditEvents/audit-001"), { actorUid: "forged" }));
});

test("a user can read only their own enabled profile", async () => {
  await seed("users/user-001", { displayName: "Admin" });
  const own = testEnv.authenticatedContext("user-001", claims("organizer")).firestore();
  const other = testEnv.authenticatedContext("user-002", claims("organizer")).firestore();
  await assertSucceeds(getDoc(doc(own, "users/user-001")));
  await assertFails(getDoc(doc(other, "users/user-001")));
  await assertFails(getDocs(collection(own, "users")));
});

test("auditors can get and list audit events, governance and operations data", async () => {
  await seed("auditEvents/audit-001", { action: "governance.case-decided" });
  await seed("governanceCases/case-001");
  await seed("organizers/organizer-001");
  await seed("bookings/booking-001", { status: "payment-pending" });
  await seed("scheduledSessions/session-001", { status: "booking-open" });
  const firestore = testEnv.authenticatedContext("auditor", claims("auditor")).firestore();
  await assertSucceeds(getDoc(doc(firestore, "auditEvents/audit-001")));
  await assertSucceeds(getDocs(collection(firestore, "auditEvents")));
  for (const name of ["governanceCases", "organizers", "bookings", "scheduledSessions"]) {
    await assertSucceeds(getDocs(collection(firestore, name)));
  }
  await assertSucceeds(getDoc(doc(firestore, "governanceCases/case-001")));
});

test("auditors cannot read money, customers, operator profiles or the workspace", async () => {
  await seed("payments/payment-001", { amountMinor: 1000 });
  await seed("refunds/refund-001", { amountMinor: 1000 });
  await seed("customers/cohort-001");
  await seed("users/user-001", { displayName: "Admin" });
  await seed("workspaces/main/slices/bookings", { version: 1 });
  const firestore = testEnv.authenticatedContext("auditor", claims("auditor")).firestore();
  await assertFails(getDoc(doc(firestore, "payments/payment-001")));
  await assertFails(getDocs(collection(firestore, "refunds")));
  await assertFails(getDocs(collection(firestore, "customers")));
  await assertFails(getDocs(collection(firestore, "users")));
  await assertFails(getDoc(doc(firestore, "workspaces/main/slices/bookings")));
});

test("auditors cannot write anything", async () => {
  const firestore = testEnv.authenticatedContext("auditor", claims("auditor")).firestore();
  await assertFails(setDoc(doc(firestore, "auditEvents/audit-002"), { actorUid: "auditor" }));
  await assertFails(setDoc(doc(firestore, "bookings/booking-002"), { status: "confirmed" }));
});

test.each(["platform-owner", "super-admin"])("%s can get and list bookings, customers and sessions", async (roleId) => {
  await seed("bookings/booking-001", { status: "payment-pending" });
  await seed("customers/cohort-001");
  await seed("scheduledSessions/session-001", { status: "booking-open" });
  const firestore = testEnv.authenticatedContext(`uid-${roleId}`, claims(roleId)).firestore();
  await assertSucceeds(getDoc(doc(firestore, "bookings/booking-001")));
  await assertSucceeds(getDoc(doc(firestore, "customers/cohort-001")));
  await assertSucceeds(getDoc(doc(firestore, "scheduledSessions/session-001")));
  for (const name of ["bookings", "customers", "scheduledSessions", "auditEvents", "users"]) {
    await assertSucceeds(getDocs(collection(firestore, name)));
  }
});

test("payments and refunds are readable by admins only", async () => {
  await seed("payments/payment-001", { amountMinor: 1000 });
  await seed("refunds/refund-001", { amountMinor: 1000 });
  const admin = testEnv.authenticatedContext("admin", claims("super-admin")).firestore();
  await assertSucceeds(getDoc(doc(admin, "payments/payment-001")));
  await assertSucceeds(getDocs(collection(admin, "refunds")));
  for (const roleId of ["finance", "ops-manager", "support", "organizer"]) {
    const other = testEnv.authenticatedContext(`uid-${roleId}`, claims(roleId)).firestore();
    await assertFails(getDoc(doc(other, "payments/payment-001")));
    await assertFails(getDocs(collection(other, "refunds")));
  }
  await assertFails(setDoc(doc(admin, "payments/payment-002"), { status: "confirmed" }));
});

test("operations roles without territory-scoped rules cannot read bookings directly", async () => {
  await seed("bookings/booking-001", { status: "payment-pending", territoryId: "hvd-central" });
  const firestore = testEnv.authenticatedContext("ops", claims("ops-manager", { scope: "territory", territoryIds: ["hvd-central"] })).firestore();
  await assertFails(getDoc(doc(firestore, "bookings/booking-001")));
});

test("admins whose token has no disabled claim can still read", async () => {
  await seed("governanceCases/case-001");
  const firestore = testEnv.authenticatedContext("admin", { roleId: "super-admin", email_verified: true }).firestore();
  await assertSucceeds(getDoc(doc(firestore, "governanceCases/case-001")));
});

test("admins can get and list the shared console workspace; nobody can write it", async () => {
  await seed("workspaces/main", { updatedBy: "server" });
  await seed("workspaces/main/slices/bookings", { version: 3, chunkCount: 1 });
  await seed("workspaces/main/chunks/bookings__0", { json: "[]" });
  for (const roleId of ["platform-owner", "super-admin"]) {
    const firestore = testEnv.authenticatedContext(`uid-${roleId}`, claims(roleId)).firestore();
    await assertSucceeds(getDoc(doc(firestore, "workspaces/main")));
    await assertSucceeds(getDocs(collection(firestore, "workspaces")));
    await assertSucceeds(getDoc(doc(firestore, "workspaces/main/slices/bookings")));
    await assertSucceeds(getDocs(collection(firestore, "workspaces/main/slices")));
    await assertSucceeds(getDoc(doc(firestore, "workspaces/main/chunks/bookings__0")));
    await assertSucceeds(getDocs(collection(firestore, "workspaces/main/chunks")));
    await assertFails(setDoc(doc(firestore, "workspaces/main/slices/bookings"), { version: 99 }));
    await assertFails(setDoc(doc(firestore, "workspaces/main/chunks/bookings__0"), { json: "[1]" }));
    await assertFails(setDoc(doc(firestore, "workspaces/main"), { updatedBy: "client" }));
  }
  const denied = [
    testEnv.unauthenticatedContext(),
    testEnv.authenticatedContext("ops", claims("ops-manager")),
    testEnv.authenticatedContext("disabled", claims("super-admin", { disabled: true })),
    testEnv.authenticatedContext("unverified", { roleId: "super-admin", email_verified: false }),
  ];
  for (const ctx of denied) {
    const firestore = ctx.firestore();
    await assertFails(getDoc(doc(firestore, "workspaces/main/slices/bookings")));
    await assertFails(getDocs(collection(firestore, "workspaces/main/chunks")));
  }
});

test("command receipts and unknown collections remain private", async () => {
  await seed("commandReceipts/request-001", { result: {} });
  await seed("secrets/secret-001", { value: "no" });
  const firestore = testEnv.authenticatedContext("admin", claims("super-admin")).firestore();
  await assertFails(getDoc(doc(firestore, "commandReceipts/request-001")));
  await assertFails(getDoc(doc(firestore, "secrets/secret-001")));
});
