/**
 * End-to-end callable tests: real Auth-emulator ID tokens against the
 * Functions emulator. Proves the actor, role gate, territory scope, token
 * revocation check and receipt ownership are enforced at the HTTPS boundary.
 */
import { EMPTY_OCCUPANCY } from "../src/domain/capacity";
import { adminAuth, adminDb, call, createOperator, pause, resetEmulators, signIn, type TestOperator } from "./support/emulators";

jest.setTimeout(60_000);

async function seedSession(id: string, territoryId = "hvd-central", capacity = 5) {
  await adminDb().doc(`scheduledSessions/${id}`).set({
    id,
    status: "booking-open",
    territoryId,
    capacity: { maxPhysicalCapacity: capacity, blockedSlots: 0, compSlots: 0, minParticipants: 2, targetParticipants: capacity },
    occupancy: { ...EMPTY_OCCUPANCY },
  });
}

const booking = (requestId: string, sessionId = "s-e2e-hvd") => ({ requestId, sessionId, alias: "Blue Falcon", kind: "sellable" });

beforeEach(async () => {
  await resetEmulators();
  await seedSession("s-e2e-hvd", "hvd-central");
  await seedSession("s-e2e-blr", "blr-east");
});

describe("reserveSeat callable", () => {
  test("signed-out callers are refused", async () => {
    const out = await call("reserveSeat", booking("e2e-req-0001"));
    expect(out).toMatchObject({ ok: false, status: "UNAUTHENTICATED", code: "NOT_AUTHENTICATED" });
  });

  test("a super admin books with the actor resolved from the token", async () => {
    const admin = await createOperator("uid-super-admin", "super-admin", { name: "Meera Krishnan" });
    const out = await call<{ bookingId: string; sessionId: string; status: string; replayed: boolean }>(
      "reserveSeat",
      { ...booking("e2e-req-0002"), actor: { uid: "forged", roleId: "platform-owner" } },
      admin.token
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result).toMatchObject({ sessionId: "s-e2e-hvd", status: "reserved", replayed: false });
    const bookingDoc = (await adminDb().doc(`bookings/${out.result.bookingId}`).get()).data()!;
    expect(bookingDoc.createdBy).toBe("uid-super-admin");
    const audit = (await adminDb().collection("auditEvents").get()).docs[0].data();
    expect(audit).toMatchObject({ action: "booking.seat-reserved", actorUid: "uid-super-admin", actorName: "Meera Krishnan", actorRoleId: "super-admin", schemaVersion: 1 });
  });

  test("roles outside the booking set are refused", async () => {
    for (const roleId of ["finance", "auditor", "marketing"]) {
      const op = await createOperator(`uid-${roleId}-01`, roleId);
      const out = await call("reserveSeat", booking(`e2e-req-${roleId}`), op.token);
      expect(out).toMatchObject({ ok: false, status: "PERMISSION_DENIED", code: "NOT_PERMITTED" });
    }
    expect((await adminDb().collection("bookings").get()).size).toBe(0);
  });

  test("an operations manager books only inside their territories", async () => {
    const ops = await createOperator("uid-ops-manager", "ops-manager", { claims: { scope: "territory", territoryIds: ["hvd-central"] } });
    expect((await call("reserveSeat", booking("e2e-req-0003", "s-e2e-hvd"), ops.token)).ok).toBe(true);
    expect(await call("reserveSeat", booking("e2e-req-0004", "s-e2e-blr"), ops.token)).toMatchObject({ ok: false, status: "PERMISSION_DENIED" });
  });

  test("a receipt replays for its owner and is a conflict for anyone else", async () => {
    const a = await createOperator("uid-coordinator", "coordinator", { claims: { scope: "territory", territoryIds: ["hvd-central"] } });
    const b = await createOperator("uid-super-admin", "super-admin");
    const first = await call<{ bookingId: string; replayed: boolean }>("reserveSeat", booking("e2e-req-0005"), a.token);
    const replay = await call<{ bookingId: string; replayed: boolean }>("reserveSeat", booking("e2e-req-0005"), a.token);
    expect(first.ok && replay.ok && replay.result.bookingId === first.result.bookingId && replay.result.replayed).toBe(true);
    expect(await call("reserveSeat", booking("e2e-req-0005"), b.token)).toMatchObject({ ok: false, status: "ABORTED", code: "CONFLICT" });
    expect(await call("reserveSeat", booking("e2e-req-0005", "s-e2e-blr"), a.token)).toMatchObject({ ok: false, status: "ABORTED", code: "CONFLICT" });
    expect((await adminDb().collection("bookings").get()).size).toBe(1);
  });

  test("validation errors are operator-readable", async () => {
    const admin = await createOperator("uid-super-admin", "super-admin");
    expect(await call("reserveSeat", { ...booking("e2e-req-0006"), alias: "x" }, admin.token))
      .toMatchObject({ ok: false, status: "INVALID_ARGUMENT", message: "Enter a display name between 2 and 40 characters." });
    expect(await call("reserveSeat", booking("e2e-req-0007", "s-missing"), admin.token))
      .toMatchObject({ ok: false, status: "NOT_FOUND", code: "SESSION_NOT_FOUND" });
  });
});

describe("token freshness on privileged commands", () => {
  let admin: TestOperator;
  beforeEach(async () => {
    admin = await createOperator("uid-super-admin", "super-admin");
  });

  test("a token issued before its refresh tokens were revoked is refused", async () => {
    await pause(1100);
    await adminAuth().revokeRefreshTokens(admin.uid);
    expect(await call("reserveSeat", booking("e2e-req-0010"), admin.token)).toMatchObject({ ok: false, status: "UNAUTHENTICATED" });
    const fresh = await signIn(admin.email);
    expect((await call("reserveSeat", booking("e2e-req-0011"), fresh)).ok).toBe(true);
  });

  test("a disabled account is refused even with an unexpired token", async () => {
    await adminAuth().updateUser(admin.uid, { disabled: true });
    expect(await call("decideCase", { requestId: "e2e-req-0012", caseId: "case-missing-01", expectedVersion: 0, outcome: "approved" }, admin.token))
      .toMatchObject({ ok: false, status: "PERMISSION_DENIED" });
  });

  test("a token whose role no longer matches the account's claims is refused", async () => {
    await adminAuth().setCustomUserClaims(admin.uid, { roleId: "support", disabled: false });
    expect(await call("submitGovernanceIntake", { requestId: "e2e-req-0013", kind: "organizer", name: "Lakeside Live" }, admin.token))
      .toMatchObject({ ok: false, status: "UNAUTHENTICATED" });
  });

  test("unverified email addresses are refused", async () => {
    const unverified = await createOperator("uid-unverified", "super-admin", { emailVerified: false });
    expect(await call("reserveSeat", booking("e2e-req-0014"), unverified.token)).toMatchObject({ ok: false, status: "PERMISSION_DENIED" });
  });
});

describe("governance callables", () => {
  test("intake then decision, end to end, with the actor name from the token", async () => {
    const admin = await createOperator("uid-platform-owner", "platform-owner", { name: "Aditya Rao" });
    const intake = await call<{ id: string; caseId: string }>("submitGovernanceIntake", {
      requestId: "intake-e2e-0001", kind: "arena", name: "Beach Road Arena", location: "Visakhapatnam", capacity: 4200, risk: "low",
    }, admin.token);
    expect(intake.ok).toBe(true);
    if (!intake.ok) return;
    const decision = await call("decideCase", { requestId: "decision-e2e-0001", caseId: intake.result.caseId, expectedVersion: 0, outcome: "approved", note: "" }, admin.token);
    expect(decision).toMatchObject({ ok: true, result: { status: "approved", targetStatus: "active" } });
    expect((await adminDb().doc(`arenas/${intake.result.id}`).get()).data()?.status).toBe("active");
    const actors = (await adminDb().collection("auditEvents").get()).docs.map((d) => d.data().actorName);
    expect(actors).toEqual(["Aditya Rao", "Aditya Rao"]);
  });

  test("non-admin roles cannot decide, change status or record intake", async () => {
    const auditor = await createOperator("uid-auditor-01", "auditor");
    expect(await call("decideCase", { requestId: "e2e-req-0020", caseId: "case-000001", expectedVersion: 0, outcome: "approved" }, auditor.token))
      .toMatchObject({ ok: false, status: "PERMISSION_DENIED" });
    expect(await call("setMarketplaceEntityStatus", { requestId: "e2e-req-0021", entityType: "organizer", entityId: "organizer-01", expectedVersion: 0, status: "paused", reason: "Compliance documents expired." }, auditor.token))
      .toMatchObject({ ok: false, status: "PERMISSION_DENIED" });
    expect(await call("submitGovernanceIntake", { requestId: "e2e-req-0022", kind: "organizer", name: "Lakeside Live" }, auditor.token))
      .toMatchObject({ ok: false, status: "PERMISSION_DENIED" });
  });

  test("domain errors keep their code across the wire", async () => {
    const admin = await createOperator("uid-super-admin", "super-admin");
    await adminDb().doc("organizers/organizer-blocked").set({ name: "Blocked Org", status: "blocked", version: 0 });
    expect(await call("decideCase", { requestId: "e2e-req-0030", caseId: "case-missing-01", expectedVersion: 0, outcome: "approved" }, admin.token))
      .toMatchObject({ ok: false, status: "NOT_FOUND", code: "CASE_NOT_FOUND", message: "This case no longer exists." });
    expect(await call("setMarketplaceEntityStatus", { requestId: "e2e-req-0031", entityType: "organizer", entityId: "organizer-blocked", expectedVersion: 0, status: "active", reason: "Trying to skip the review step." }, admin.token))
      .toMatchObject({ ok: false, status: "FAILED_PRECONDITION", code: "INVALID_TRANSITION", message: "A organizer that is blocked cannot be set to active." });
    expect(await call("submitGovernanceIntake", { requestId: "e2e-req-0032", kind: "organizer", name: "ab" }, admin.token))
      .toMatchObject({ ok: false, status: "INVALID_ARGUMENT", message: "Enter a name of at least 3 characters." });
  });
});
