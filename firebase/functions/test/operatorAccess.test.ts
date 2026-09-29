/**
 * setOperatorAccess end to end (Auth + Firestore + Functions emulators).
 */
import { adminAuth, adminDb, call, createOperator, resetEmulators, type TestOperator } from "./support/emulators";
import { parseOperatorAccess } from "../src/auth/operatorAccess";

jest.setTimeout(60_000);

let owner: TestOperator;

beforeEach(async () => {
  await resetEmulators();
  owner = await createOperator("uid-owner-0001", "platform-owner", { name: "Aditya Rao" });
});

const access = (overrides: Record<string, unknown> = {}) => ({
  requestId: `access-${Math.random().toString(36).slice(2, 12)}`,
  uid: "uid-operator-01",
  roleId: "ops-manager",
  status: "active",
  reason: "Joining the Hyderabad operations team.",
  scope: "territory",
  territoryIds: ["hvd-central"],
  ...overrides,
});

test("only a platform owner can change access", async () => {
  const admin = await createOperator("uid-super-admin", "super-admin");
  await createOperator("uid-operator-01", "support");
  expect(await call("setOperatorAccess", access(), admin.token)).toMatchObject({ ok: false, status: "PERMISSION_DENIED" });
  expect(await call("setOperatorAccess", access())).toMatchObject({ ok: false, status: "UNAUTHENTICATED" });
});

test("sets role, scope and territory claims, the user record and an audit event", async () => {
  await createOperator("uid-operator-01", "support", { name: "Ravi Teja" });
  const out = await call("setOperatorAccess", access(), owner.token);
  expect(out).toMatchObject({ ok: true, result: { uid: "uid-operator-01", roleId: "ops-manager", status: "active", scope: "territory", territoryIds: ["hvd-central"], replayed: false } });

  const user = await adminAuth().getUser("uid-operator-01");
  expect(user.customClaims).toMatchObject({ roleId: "ops-manager", scope: "territory", franchiseId: null, territoryIds: ["hvd-central"], disabled: false });
  expect((await adminDb().doc("users/uid-operator-01").get()).data()).toMatchObject({ roleId: "ops-manager", scope: "territory", territoryIds: ["hvd-central"], status: "active", updatedBy: owner.uid });
  const audit = (await adminDb().collection("auditEvents").get()).docs[0].data();
  expect(audit).toMatchObject({
    action: "access.operator-updated", entityType: "user", entityId: "uid-operator-01", actorUid: owner.uid, actorName: "Aditya Rao",
    actorRoleId: "platform-owner", summary: "Joining the Hyderabad operations team.", schemaVersion: 1,
    before: { roleId: "support" }, after: { roleId: "ops-manager", scope: "territory" },
  });
});

test("is idempotent by request ID and a replay by another owner is a conflict", async () => {
  await createOperator("uid-operator-01", "support");
  const other = await createOperator("uid-owner-0002", "platform-owner");
  const command = access();
  const first = await call("setOperatorAccess", command, owner.token);
  const second = await call("setOperatorAccess", command, owner.token);
  expect(first).toMatchObject({ ok: true, result: { replayed: false } });
  expect(second).toMatchObject({ ok: true, result: { replayed: true } });
  expect((await adminDb().collection("auditEvents").get()).size).toBe(1);
  const receipt = (await adminDb().doc(`commandReceipts/${command.requestId}`).get()).data()!;
  expect(Object.keys(receipt).sort()).toEqual(["actorUid", "command", "createdAt", "expiresAt", "requestId", "result"]);
  expect(await call("setOperatorAccess", command, other.token)).toMatchObject({ ok: false, status: "ABORTED", code: "CONFLICT" });
});

test("suspending an operator disables the Firebase Auth account and revokes sessions", async () => {
  await createOperator("uid-operator-01", "support");
  const out = await call("setOperatorAccess", access({ status: "suspended" }), owner.token);
  expect(out.ok).toBe(true);
  const user = await adminAuth().getUser("uid-operator-01");
  expect(user.disabled).toBe(true);
  expect(user.customClaims?.disabled).toBe(true);
  expect(user.tokensValidAfterTime).toBeDefined();

  const restored = await call("setOperatorAccess", access({ status: "active" }), owner.token);
  expect(restored.ok).toBe(true);
  expect((await adminAuth().getUser("uid-operator-01")).disabled).toBe(false);
});

test("an unknown user is USER_NOT_FOUND, not an internal error", async () => {
  expect(await call("setOperatorAccess", access({ uid: "uid-nobody-001" }), owner.token))
    .toMatchObject({ ok: false, status: "NOT_FOUND", code: "USER_NOT_FOUND", message: "No sign-in account exists for this user ID." });
});

test("the last active platform owner cannot be demoted, suspended or disabled", async () => {
  const other = await createOperator("uid-owner-0002", "platform-owner");
  // Two owners: demoting the other one is fine.
  expect((await call("setOperatorAccess", access({ uid: other.uid, roleId: "super-admin", scope: "platform" }), owner.token)).ok).toBe(true);
  // Now `owner` is the last one. Self-suspension is refused outright...
  expect(await call("setOperatorAccess", access({ uid: owner.uid, roleId: "platform-owner", status: "suspended", scope: "platform" }), owner.token))
    .toMatchObject({ ok: false, status: "INVALID_ARGUMENT" });
  // ...and self-demotion hits the last-owner rule.
  expect(await call("setOperatorAccess", access({ uid: owner.uid, roleId: "super-admin", scope: "platform" }), owner.token))
    .toMatchObject({ ok: false, status: "FAILED_PRECONDITION", code: "LAST_OWNER" });
  expect((await adminAuth().getUser(owner.uid)).customClaims?.roleId).toBe("platform-owner");
});

test("the actor must hold a current, unrevoked token", async () => {
  await createOperator("uid-operator-01", "support");
  await adminAuth().setCustomUserClaims(owner.uid, { roleId: "super-admin", disabled: false });
  expect(await call("setOperatorAccess", access(), owner.token)).toMatchObject({ ok: false, status: "UNAUTHENTICATED" });
});

test("scope validation", () => {
  expect(() => parseOperatorAccess(access({ roleId: "super-admin", scope: "territory" }))).toThrow("This role always has platform-wide scope.");
  expect(() => parseOperatorAccess(access({ territoryIds: [] }))).toThrow("Choose at least one territory for this operator.");
  expect(() => parseOperatorAccess(access({ scope: "franchise", territoryIds: [] }))).toThrow("Choose the franchise this operator works in.");
  expect(() => parseOperatorAccess(access({ roleId: "janitor" }))).toThrow("The requested role is not supported.");
  expect(() => parseOperatorAccess(access({ requestId: undefined }))).toThrow("This request is missing its reference. Please try again.");
  expect(parseOperatorAccess(access({ roleId: "auditor", scope: undefined, territoryIds: ["x"] }))).toMatchObject({ scope: "platform", territoryIds: [], franchiseId: null });
});
