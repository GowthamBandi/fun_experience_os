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

test("auditors can read audit events but not governance cases", async () => {
  await seed("auditEvents/audit-001", { action: "governance.case-decided" });
  await seed("governanceCases/case-001");
  const firestore = testEnv.authenticatedContext("auditor", claims("auditor")).firestore();
  await assertSucceeds(getDoc(doc(firestore, "auditEvents/audit-001")));
  await assertFails(getDoc(doc(firestore, "governanceCases/case-001")));
});

test("command receipts and unknown collections remain private", async () => {
  await seed("commandReceipts/request-001", { result: {} });
  await seed("secrets/secret-001", { value: "no" });
  const firestore = testEnv.authenticatedContext("admin", claims("super-admin")).firestore();
  await assertFails(getDoc(doc(firestore, "commandReceipts/request-001")));
  await assertFails(getDoc(doc(firestore, "secrets/secret-001")));
});
