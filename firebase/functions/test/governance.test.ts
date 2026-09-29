import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { decideGovernanceCase, changeMarketplaceEntityStatus } from "../src/governance/service";
import { DomainError } from "../src/platform/errors";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-experience-os";

let app: App;
let firestore: Firestore;
const actor = { uid: "admin-001", roleId: "super-admin", email: "admin@example.com" };

beforeAll(() => {
  app = initializeApp({ projectId: "demo-experience-os" }, "governance-tests");
  firestore = getFirestore(app);
});
afterAll(async () => deleteApp(app));
beforeEach(async () => {
  for (const name of ["governanceCases", "organizers", "arenas", "events", "riskAlerts", "auditEvents", "commandReceipts"]) {
    const docs = await firestore.collection(name).get();
    const batch = firestore.batch();
    docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
});

async function seedOrganizerCase() {
  await firestore.collection("organizers").doc("organizer-001").set({ status: "under-review", version: 0 });
  await firestore.collection("governanceCases").doc("governance-001").set({
    kind: "organizer-kyc", targetId: "organizer-001", status: "pending", version: 0, policyVersion: "KYC-2.0",
  });
}

test("an approval atomically updates the case, target, receipt and audit", async () => {
  await seedOrganizerCase();
  const result = await decideGovernanceCase({ requestId: "request-0001", caseId: "governance-001", expectedVersion: 0, outcome: "approved", note: "All verification checks passed." }, actor);
  expect(result).toMatchObject({ status: "approved", version: 1, replayed: false });
  const [governanceCase, organizer, audits, receipt] = await Promise.all([
    firestore.doc("governanceCases/governance-001").get(), firestore.doc("organizers/organizer-001").get(),
    firestore.collection("auditEvents").get(), firestore.doc("commandReceipts/request-0001").get(),
  ]);
  expect(governanceCase.data()?.status).toBe("approved");
  expect(organizer.data()?.status).toBe("active");
  expect(audits.size).toBe(1);
  expect(audits.docs[0].data()).toMatchObject({ actorUid: actor.uid, action: "governance.case-decided", policyVersion: "KYC-2.0" });
  expect(receipt.exists).toBe(true);
});

test("repeating a request ID is idempotent", async () => {
  await seedOrganizerCase();
  const command = { requestId: "request-0002", caseId: "governance-001", expectedVersion: 0, outcome: "approved" as const, note: "All verification checks passed." };
  const first = await decideGovernanceCase(command, actor);
  const second = await decideGovernanceCase(command, actor);
  expect(first.replayed).toBe(false);
  expect(second.replayed).toBe(true);
  expect((await firestore.collection("auditEvents").get()).size).toBe(1);
});

test("stale reviewers cannot overwrite a newer decision", async () => {
  await seedOrganizerCase();
  await firestore.doc("governanceCases/governance-001").update({ version: 2 });
  await expect(decideGovernanceCase({ requestId: "request-0003", caseId: "governance-001", expectedVersion: 0, outcome: "approved", note: "Checks passed." }, actor))
    .rejects.toMatchObject({ code: "CONFLICT" });
});

test("pausing an organizer requires a reason and creates an audit event", async () => {
  await firestore.doc("organizers/organizer-002").set({ status: "active", version: 3 });
  const result = await changeMarketplaceEntityStatus({ requestId: "request-0004", entityType: "organizer", entityId: "organizer-002", expectedVersion: 3, status: "paused", reason: "Compliance documents expired." }, actor);
  expect(result).toMatchObject({ status: "paused", version: 4 });
  expect((await firestore.doc("organizers/organizer-002").get()).data()?.status).toBe("paused");
  expect((await firestore.collection("auditEvents").get()).size).toBe(1);
});

test("a finalized case cannot be decided twice with a new request ID", async () => {
  await seedOrganizerCase();
  await decideGovernanceCase({ requestId: "request-0005", caseId: "governance-001", expectedVersion: 0, outcome: "rejected", note: "Beneficiary identity did not match." }, actor);
  let caught: DomainError | undefined;
  try {
    await decideGovernanceCase({ requestId: "request-0006", caseId: "governance-001", expectedVersion: 1, outcome: "approved", note: "Attempted reversal." }, actor);
  } catch (error) { caught = error as DomainError; }
  expect(caught?.code).toBe("CONFLICT");
});
