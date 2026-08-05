/**
 * Firestore Security Rules — Baseline Tests
 *
 * These tests prove the deny-all baseline rules work correctly.
 * Run via: firebase emulators:exec --project demo-experience-os --only firestore "npm --prefix firebase/firestore test"
 *
 * All tests must pass with PERMISSION_DENIED for every scenario.
 */

import {
  initializeTestEnvironment,
  assertFails,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { resolve } from "path";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

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

// ─────────────────────────────────────────────
// 1. Signed-out read denied
// ─────────────────────────────────────────────
test("signed-out read is denied", async () => {
  const unauthCtx = testEnv.unauthenticatedContext();
  await assertFails(getDoc(doc(unauthCtx.firestore(), "sessions/test-doc")));
});

// ─────────────────────────────────────────────
// 2. Signed-out write denied
// ─────────────────────────────────────────────
test("signed-out write is denied", async () => {
  const unauthCtx = testEnv.unauthenticatedContext();
  await assertFails(
    setDoc(doc(unauthCtx.firestore(), "sessions/test-doc"), { foo: "bar" })
  );
});

// ─────────────────────────────────────────────
// 3. Signed-in read denied (deny-all baseline)
// ─────────────────────────────────────────────
test("signed-in read is denied (deny-all baseline)", async () => {
  const authCtx = testEnv.authenticatedContext("user-abc");
  await assertFails(getDoc(doc(authCtx.firestore(), "sessions/test-doc")));
});

// ─────────────────────────────────────────────
// 4. Signed-in write denied (deny-all baseline)
// ─────────────────────────────────────────────
test("signed-in write is denied (deny-all baseline)", async () => {
  const authCtx = testEnv.authenticatedContext("user-abc");
  await assertFails(
    setDoc(doc(authCtx.firestore(), "sessions/test-doc"), { foo: "bar" })
  );
});

// ─────────────────────────────────────────────
// 5. Direct auditEvents write denied
// ─────────────────────────────────────────────
test("direct write to auditEvents is denied", async () => {
  const authCtx = testEnv.authenticatedContext("user-abc");
  await assertFails(
    setDoc(doc(authCtx.firestore(), "auditEvents/event-001"), {
      action: "unauthorized-write",
    })
  );
});

// ─────────────────────────────────────────────
// 6. Direct roles write denied
// ─────────────────────────────────────────────
test("direct write to roles is denied", async () => {
  const authCtx = testEnv.authenticatedContext("user-abc");
  await assertFails(
    setDoc(doc(authCtx.firestore(), "roles/admin-role"), {
      level: "superadmin",
    })
  );
});

// ─────────────────────────────────────────────
// 7. Unknown collection access denied
// ─────────────────────────────────────────────
test("access to unknown collection is denied", async () => {
  const authCtx = testEnv.authenticatedContext("user-abc");
  await assertFails(
    getDoc(doc(authCtx.firestore(), "unknownCollection/some-doc"))
  );
});
