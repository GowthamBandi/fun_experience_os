import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { decideGovernanceCase, changeMarketplaceEntityStatus, submitGovernanceIntake } from "../src/governance/service";
import { ENTITY_TRANSITIONS, parseDecisionCommand, parseEntityStatusCommand, parseIntakeCommand, type GovernanceEntityType } from "../src/governance/model";
import { DomainError } from "../src/platform/errors";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-experience-os";

let app: App;
let firestore: Firestore;
const actor = { uid: "admin-001", roleId: "super-admin", email: "admin@example.com", displayName: "Meera Krishnan" };
const otherActor = { uid: "admin-002", roleId: "platform-owner", email: "owner@example.com", displayName: "Aditya Rao" };

const COLLECTIONS = [
  "governanceCases", "organizers", "arenas", "events", "riskAlerts", "settlementControls", "commercialAgreements",
  "policyVersions", "refundCases", "auditEvents", "commandReceipts",
];

beforeAll(() => {
  app = initializeApp({ projectId: "demo-experience-os" }, "governance-tests");
  firestore = getFirestore(app);
});
afterAll(async () => deleteApp(app));
beforeEach(async () => {
  for (const name of COLLECTIONS) {
    const docs = await firestore.collection(name).get();
    const batch = firestore.batch();
    docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
});

async function caught(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    return error as DomainError;
  }
  throw new Error("Expected the command to fail.");
}

async function seedOrganizerCase() {
  await firestore.collection("organizers").doc("organizer-001").set({ name: "Sridhar Events", status: "under-review", version: 0 });
  await firestore.collection("governanceCases").doc("governance-001").set({
    subject: "Sridhar Events", kind: "organizer-kyc", targetId: "organizer-001", status: "pending", version: 0, policyVersion: "KYC-2.0",
  });
}

async function seedSettlementCase(organizerName = "Neon Nights") {
  await firestore.doc("settlementControls/settlement-001").set({ name: `${organizerName} settlement`, organizerName, status: "pending", version: 0 });
  await firestore.doc("governanceCases/case-settle-001").set({
    subject: `${organizerName} payout`, kind: "settlement-release", targetId: "settlement-001", status: "pending", version: 0,
  });
}

const approve = (requestId: string, caseId = "governance-001", expectedVersion = 0) =>
  ({ requestId, caseId, expectedVersion, outcome: "approved" as const, note: "All verification checks passed." });

describe("decideCase", () => {
  test("an approval atomically updates the case, target, receipt and audit", async () => {
    await seedOrganizerCase();
    const result = await decideGovernanceCase(approve("request-0001"), actor);
    expect(result).toMatchObject({ status: "approved", version: 1, targetId: "organizer-001", targetStatus: "active", replayed: false });
    const [governanceCase, organizer, audits, receipt] = await Promise.all([
      firestore.doc("governanceCases/governance-001").get(), firestore.doc("organizers/organizer-001").get(),
      firestore.collection("auditEvents").get(), firestore.doc("commandReceipts/request-0001").get(),
    ]);
    expect(governanceCase.data()?.status).toBe("approved");
    expect(governanceCase.data()?.decision).toMatchObject({ actorUid: actor.uid, actorName: "Meera Krishnan", actorRoleId: "super-admin" });
    expect(organizer.data()).toMatchObject({ status: "active", statusReason: "All verification checks passed.", version: 1 });
    expect(audits.size).toBe(1);
    expect(audits.docs[0].data()).toMatchObject({
      action: "governance.case-decided",
      subject: "Organizer KYC approved — Sridhar Events",
      summary: "All verification checks passed.",
      entityType: "governanceCase",
      entityId: "governance-001",
      before: { status: "pending" },
      after: { status: "approved" },
      actorUid: actor.uid,
      actorName: "Meera Krishnan",
      actorRoleId: "super-admin",
      policyVersion: "KYC-2.0",
      schemaVersion: 1,
    });
    expect(receipt.data()).toMatchObject({ requestId: "request-0001", command: "decideCase", actorUid: actor.uid });
    expect(Object.keys(receipt.data()!).sort()).toEqual(["actorUid", "command", "createdAt", "expiresAt", "requestId", "result"]);
  });

  test("repeating a request ID is idempotent", async () => {
    await seedOrganizerCase();
    const first = await decideGovernanceCase(approve("request-0002"), actor);
    const second = await decideGovernanceCase(approve("request-0002"), actor);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect((await firestore.collection("auditEvents").get()).size).toBe(1);
  });

  test("a request ID replayed by a different actor or for a different case is a conflict", async () => {
    await seedOrganizerCase();
    await firestore.doc("governanceCases/governance-002").set({ kind: "organizer-kyc", targetId: "organizer-001", status: "pending", version: 0 });
    await decideGovernanceCase(approve("request-0007"), actor);
    expect((await caught(decideGovernanceCase(approve("request-0007"), otherActor))).code).toBe("CONFLICT");
    expect((await caught(decideGovernanceCase(approve("request-0007", "governance-002"), actor))).code).toBe("CONFLICT");
    expect((await firestore.doc("governanceCases/governance-002").get()).data()?.status).toBe("pending");
  });

  test("stale reviewers cannot overwrite a newer decision", async () => {
    await seedOrganizerCase();
    await firestore.doc("governanceCases/governance-001").update({ version: 2 });
    const error = await caught(decideGovernanceCase(approve("request-0003"), actor));
    expect(error.code).toBe("CONFLICT");
    expect(error.operatorMessage).toBe("Someone else changed this case. Reopen it to see the latest version.");
  });

  test("a finalized case cannot be decided twice with a new request ID", async () => {
    await seedOrganizerCase();
    await decideGovernanceCase({ requestId: "request-0005", caseId: "governance-001", expectedVersion: 0, outcome: "rejected", note: "Beneficiary identity did not match." }, actor);
    const error = await caught(decideGovernanceCase(approve("request-0006", "governance-001", 1), actor));
    expect(error.code).toBe("CONFLICT");
    expect(error.operatorMessage).toBe("This case is already rejected and cannot be decided again.");
    expect((await firestore.doc("organizers/organizer-001").get()).data()?.status).toBe("rejected");
  });

  test("a missing case is CASE_NOT_FOUND (not a booking error)", async () => {
    const error = await caught(decideGovernanceCase(approve("request-0008", "governance-404"), actor));
    expect(error.code).toBe("CASE_NOT_FOUND");
    expect(error.httpsCode).toBe("not-found");
    expect(error.operatorMessage).toBe("This case no longer exists.");
  });

  test("a case whose linked record is missing fails and changes nothing", async () => {
    await firestore.doc("governanceCases/governance-001").set({ kind: "organizer-kyc", targetId: "organizer-gone", status: "pending", version: 0 });
    const error = await caught(decideGovernanceCase(approve("request-0009"), actor));
    expect(error.code).toBe("TARGET_NOT_FOUND");
    expect(error.httpsCode).toBe("failed-precondition");
    expect((await firestore.doc("governanceCases/governance-001").get()).data()?.status).toBe("pending");
    expect((await firestore.collection("auditEvents").get()).size).toBe(0);
    expect((await firestore.doc("commandReceipts/request-0009").get()).exists).toBe(false);
  });

  test("a case with no linked record id fails", async () => {
    await firestore.doc("governanceCases/governance-001").set({ kind: "organizer-kyc", status: "pending", version: 0 });
    expect((await caught(decideGovernanceCase(approve("request-0010"), actor))).code).toBe("TARGET_NOT_FOUND");
  });

  test("a settlement release is blocked while the organizer has an open fraud alert", async () => {
    await seedSettlementCase("Neon Nights");
    await firestore.doc("riskAlerts/risk-neon-001").set({ name: "Neon device cluster", organizerName: "Neon Nights", status: "under-review", version: 0 });
    const error = await caught(decideGovernanceCase(approve("request-0011", "case-settle-001"), actor));
    expect(error.code).toBe("SETTLEMENT_BLOCKED");
    expect(error.operatorMessage).toBe("Neon Nights has an open fraud alert, so this settlement can't be released.");
    expect((await firestore.doc("settlementControls/settlement-001").get()).data()?.status).toBe("pending");

    // Other outcomes remain possible while the alert is open.
    const info = await decideGovernanceCase({ requestId: "request-0012", caseId: "case-settle-001", expectedVersion: 0, outcome: "information-requested", note: "Waiting for the fraud review outcome." }, actor);
    expect(info.status).toBe("information-requested");
  });

  test("a settlement release is allowed once the fraud alert is resolved, and ignores other organizers' alerts", async () => {
    await seedSettlementCase("VibeLive Entertainment");
    await firestore.doc("riskAlerts/risk-vibe-001").set({ organizerName: "VibeLive Entertainment", status: "resolved", version: 1 });
    await firestore.doc("riskAlerts/risk-other-01").set({ organizerName: "StarBeat Live", status: "under-review", version: 0 });
    const result = await decideGovernanceCase(approve("request-0013", "case-settle-001"), actor);
    expect(result).toMatchObject({ status: "approved", targetStatus: "approved-for-release" });
    expect((await firestore.doc("settlementControls/settlement-001").get()).data()?.status).toBe("approved-for-release");
  });

  test("validation messages match the console", () => {
    expect(() => parseDecisionCommand({ requestId: "request-0100", caseId: "governance-001", expectedVersion: 0, outcome: "rejected", note: "short" }))
      .toThrow("Add a reason of at least 10 characters.");
    expect(() => parseDecisionCommand({ requestId: "request-0100", caseId: "governance-001", expectedVersion: 0, outcome: "approved", note: "x".repeat(2001) }))
      .toThrow("The decision note is too long (2,000 characters maximum).");
    expect(parseDecisionCommand({ requestId: "request-0100", caseId: "governance-001", expectedVersion: 0, outcome: "approved" }).note).toBe("");
  });
});

describe("setMarketplaceEntityStatus", () => {
  test("pausing an organizer requires a reason and creates an audit event", async () => {
    await firestore.doc("organizers/organizer-002").set({ name: "VibeLive Entertainment", status: "active", version: 3 });
    const result = await changeMarketplaceEntityStatus({ requestId: "request-0004", entityType: "organizer", entityId: "organizer-002", expectedVersion: 3, status: "paused", reason: "Compliance documents expired." }, actor);
    expect(result).toMatchObject({ status: "paused", version: 4 });
    expect((await firestore.doc("organizers/organizer-002").get()).data()).toMatchObject({ status: "paused", statusReason: "Compliance documents expired." });
    const audits = await firestore.collection("auditEvents").get();
    expect(audits.size).toBe(1);
    expect(audits.docs[0].data()).toMatchObject({
      action: "governance.entity-status-changed", subject: "VibeLive Entertainment → paused", summary: "Compliance documents expired.",
      entityType: "organizer", entityId: "organizer-002", before: { status: "active" }, after: { status: "paused" },
      actorName: "Meera Krishnan", schemaVersion: 1,
    });
    expect(() => parseEntityStatusCommand({ requestId: "request-0101", entityType: "organizer", entityId: "organizer-002", expectedVersion: 3, status: "paused", reason: "short" }))
      .toThrow("Add a reason of at least 10 characters.");
  });

  test.each([
    ["organizer", "blocked", "active", "A organizer that is blocked cannot be set to active."],
    ["event", "active", "under-review", "A event that is active cannot be set to under review."],
    ["risk-alert", "resolved", "blocked", "A risk alert that is resolved cannot be set to blocked."],
    ["arena", "approved", "active", "A arena that is approved cannot be set to active."],
  ])("a %s that is %s cannot move to %s", async (entityType, from, to, message) => {
    const collection = { organizer: "organizers", arena: "arenas", event: "events", "risk-alert": "riskAlerts" }[entityType]!;
    await firestore.doc(`${collection}/record-0001`).set({ status: from, version: 0 });
    const error = await caught(changeMarketplaceEntityStatus({ requestId: "request-0020", entityType: entityType as GovernanceEntityType, entityId: "record-0001", expectedVersion: 0, status: to as "active", reason: "Testing the transition table." }, actor));
    expect(error.code).toBe("INVALID_TRANSITION");
    expect(error.operatorMessage).toBe(message);
    expect((await firestore.doc(`${collection}/record-0001`).get()).data()?.status).toBe(from);
  });

  test("setting the current status again is refused", async () => {
    await firestore.doc("organizers/organizer-003").set({ status: "paused", version: 0 });
    const error = await caught(changeMarketplaceEntityStatus({ requestId: "request-0021", entityType: "organizer", entityId: "organizer-003", expectedVersion: 0, status: "paused", reason: "Pausing an already paused organizer." }, actor));
    expect(error.code).toBe("INVALID_TRANSITION");
    expect(error.operatorMessage).toBe("This record is already paused.");
  });

  test("every allowed transition in the table succeeds", async () => {
    let n = 0;
    for (const [entityType, table] of Object.entries(ENTITY_TRANSITIONS)) {
      const collection = { organizer: "organizers", arena: "arenas", event: "events", "risk-alert": "riskAlerts" }[entityType]!;
      for (const [from, targets] of Object.entries(table)) {
        for (const to of targets) {
          n++;
          const id = `record-${String(n).padStart(4, "0")}`;
          await firestore.doc(`${collection}/${id}`).set({ status: from, version: 0 });
          const result = await changeMarketplaceEntityStatus({ requestId: `request-t${String(n).padStart(4, "0")}`, entityType: entityType as GovernanceEntityType, entityId: id, expectedVersion: 0, status: to, reason: "Walking the transition table." }, actor);
          expect(result.status).toBe(to);
        }
      }
    }
    expect(n).toBeGreaterThan(30);
  });

  test("a missing record is RECORD_NOT_FOUND", async () => {
    const error = await caught(changeMarketplaceEntityStatus({ requestId: "request-0022", entityType: "arena", entityId: "arena-missing", expectedVersion: 0, status: "paused", reason: "Pausing a record that is gone." }, actor));
    expect(error.code).toBe("RECORD_NOT_FOUND");
    expect(error.operatorMessage).toBe("This record no longer exists.");
  });

  test("a request ID reused by a different actor is a conflict", async () => {
    await firestore.doc("organizers/organizer-004").set({ status: "active", version: 0 });
    const command = { requestId: "request-0023", entityType: "organizer" as const, entityId: "organizer-004", expectedVersion: 0, status: "paused" as const, reason: "Compliance documents expired." };
    await changeMarketplaceEntityStatus(command, actor);
    expect((await caught(changeMarketplaceEntityStatus(command, otherActor))).code).toBe("CONFLICT");
    expect((await changeMarketplaceEntityStatus(command, actor)).replayed).toBe(true);
  });
});

describe("submitGovernanceIntake", () => {
  test("an organizer application creates the record, a pending KYC case and an audit event", async () => {
    const command = parseIntakeCommand({
      requestId: "intake-0001", kind: "organizer", name: "  Lakeside Live  ", location: "Visakhapatnam", contactEmail: "ops@lakeside.live",
      summary: "New organizer application", risk: "low",
    });
    const result = await submitGovernanceIntake(command, actor);
    expect(result).toMatchObject({ collection: "organizers", kind: "organizer", name: "Lakeside Live", replayed: false });
    expect(result.id).toMatch(/^organizer-/);
    expect(result.caseId).toMatch(/^case-/);

    const entity = (await firestore.doc(`organizers/${result.id}`).get()).data()!;
    expect(entity).toMatchObject({ name: "Lakeside Live", status: "under-review", summary: "New organizer application", submittedBy: "Meera Krishnan", location: "Visakhapatnam", contactEmail: "ops@lakeside.live", version: 0 });
    const kase = (await firestore.doc(`governanceCases/${result.caseId}`).get()).data()!;
    expect(kase).toMatchObject({ subject: "Lakeside Live", kind: "organizer-kyc", targetId: result.id, status: "pending", location: "Visakhapatnam", policyVersion: "KYC-2.0", risk: "low", version: 0 });
    expect(typeof kase.submittedAt).toBe("string");
    const audits = await firestore.collection("auditEvents").get();
    expect(audits.size).toBe(1);
    expect(audits.docs[0].data()).toMatchObject({ action: "governance.intake-recorded", subject: "Organizer KYC recorded — Lakeside Live", entityType: "organizer", entityId: result.id, actorName: "Meera Krishnan", schemaVersion: 1 });

    // The recorded case can be decided straight away.
    const decided = await decideGovernanceCase(approve("request-0030", result.caseId!), actor);
    expect(decided.targetStatus).toBe("active");
  });

  test("intake is idempotent by request ID", async () => {
    const command = parseIntakeCommand({ requestId: "intake-0002", kind: "arena", name: "Beach Road Arena", capacity: 4200, risk: "medium" });
    const first = await submitGovernanceIntake(command, actor);
    const second = await submitGovernanceIntake(command, actor);
    expect(second).toMatchObject({ id: first.id, caseId: first.caseId, replayed: true });
    expect((await firestore.collection("arenas").get()).size).toBe(1);
    expect((await firestore.collection("governanceCases").get()).size).toBe(1);
    expect((await firestore.collection("auditEvents").get()).size).toBe(1);
    expect((await firestore.doc(`arenas/${first.id}`).get()).data()?.displayValue).toBe("4,200 capacity");
    expect((await caught(submitGovernanceIntake(command, otherActor))).code).toBe("CONFLICT");
  });

  test("commission and event intakes store money in minor units; policies open no case", async () => {
    const commission = await submitGovernanceIntake(parseIntakeCommand({ requestId: "intake-0003", kind: "commission", name: "Lakeside terms", organizerName: "Lakeside Live", commissionPercent: 9.5, effectiveFrom: "1 Dec 2026" }), actor);
    expect((await firestore.doc(`commercialAgreements/${commission.id}`).get()).data()).toMatchObject({ status: "pending", commissionBps: 950, organizerName: "Lakeside Live", effectiveFrom: "1 Dec 2026" });
    expect((await firestore.doc(`governanceCases/${commission.caseId}`).get()).data()).toMatchObject({ kind: "commission-proposal", displayValue: "9.5% proposed", policyVersion: "COMM-1.3" });

    const event = await submitGovernanceIntake(parseIntakeCommand({ requestId: "intake-0004", kind: "event", name: "Lakeside Sundowner", projectedGmv: 1250000.5 }), actor);
    expect((await firestore.doc(`events/${event.id}`).get()).data()).toMatchObject({ projectedGmvMinor: 125000050, currency: "INR" });

    const policy = await submitGovernanceIntake(parseIntakeCommand({ requestId: "intake-0005", kind: "policy", name: "Refund policy v4.2" }), actor);
    expect(policy.caseId).toBeNull();
    expect((await firestore.doc(`policyVersions/${policy.id}`).get()).data()).toMatchObject({ status: "published", summary: "Policy version" });
    const audit = (await firestore.collection("auditEvents").where("entityId", "==", policy.id).get()).docs[0].data();
    expect(audit.subject).toBe("Policy recorded — Refund policy v4.2");
  });

  test("intake validation matches the console", () => {
    const base = { requestId: "intake-0100", kind: "organizer" };
    expect(() => parseIntakeCommand({ ...base, name: "ab" })).toThrow("Enter a name of at least 3 characters.");
    expect(() => parseIntakeCommand({ ...base, name: "Valid name", contactEmail: "not-an-email" })).toThrow("Enter a valid contact email.");
    expect(() => parseIntakeCommand({ ...base, name: "Valid name", commissionPercent: 51 })).toThrow("Commission must be between 0% and 50%.");
    expect(() => parseIntakeCommand({ ...base, kind: "franchise", name: "Valid name" })).toThrow();
    expect(() => parseIntakeCommand({ ...base, requestId: "short", name: "Valid name" })).toThrow();
  });
});
