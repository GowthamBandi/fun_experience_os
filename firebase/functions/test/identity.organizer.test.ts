import { PERMISSIONS } from "../src/access/permissions";
import { decideGovernanceCase, reissueOrganizerActivationCode } from "../src/governance/service";
import { organizerCaseId } from "../src/governance/organizerOnboarding";
import { parseCode, parseOrganizerApplication, parseUpdateProfile } from "../src/identity/model";
import { redeemOrganizerCode, submitOrganizerApplication } from "../src/identity/organizer";
import { myAccess, updateMyProfile } from "../src/identity/profile";
import { admin, dump, expectCode, past, phoneActor, useEmulator } from "./identity-fixtures";

const h = useEmulator("identity-organizer-tests");
const applicant = phoneActor("applicant-0001", "+919876500001");
const stranger = phoneActor("stranger-0001", "+919876500009");

const application = (requestId: string, extra: Record<string, unknown> = {}) =>
  parseOrganizerApplication({
    requestId,
    kind: "business",
    displayName: "Sunrise Treks",
    legalName: "Sunrise Treks Private Limited",
    city: "Hyderabad",
    categories: ["trekking", "outdoors"],
    about: "Weekend treks around the Deccan plateau for small groups.",
    contactEmail: "Hello@SunriseTreks.in",
    ...extra,
  });

async function submitAndApprove(requestId = "apply-req-0001", decideId = "decide-req-0001") {
  await submitOrganizerApplication(application(requestId), applicant);
  const result = await decideGovernanceCase(
    { requestId: decideId, caseId: organizerCaseId(applicant.uid), expectedVersion: 0, outcome: "approved", note: "" },
    admin
  );
  return result as { orgId: string; organizerCode: string; codeExpiresAt: string };
}

const redeem = (code: string, who = applicant) => redeemOrganizerCode(parseCode({ code }), who);

describe("updateMyProfile", () => {
  test("writes public profile (whitelisted keys only), private safety facts and the verified phone", async () => {
    await expect(
      updateMyProfile(parseUpdateProfile({ displayName: "Asha", bio: "Trail runner", birthDate: "1995-04-12", gender: "woman" }), applicant)
    ).resolves.toEqual({ ok: true });
    const f = h.firestore();
    const [pub, safety, user] = await Promise.all([
      f.doc(`publicProfiles/${applicant.uid}`).get(),
      f.doc(`customerSafety/${applicant.uid}`).get(),
      f.doc(`users/${applicant.uid}`).get(),
    ]);
    // Anything else would break the owner's later direct edits under the rules.
    expect(Object.keys(pub.data()!).sort()).toEqual(["bio", "displayName", "updatedAt"]);
    expect(safety.data()).toMatchObject({ birthDate: "1995-04-12", gender: "woman" });
    expect(user.data()).toMatchObject({ phone: applicant.phone });
    expect(JSON.stringify(pub.data())).not.toContain("1995");
  });

  test("rejects under-13s, impossible dates and unknown genders", async () => {
    const thisYear = new Date().getUTCFullYear();
    await expectCode(updateMyProfile(parseUpdateProfile({ displayName: "Kid", birthDate: `${thisYear - 10}-01-01`, gender: "man" }), applicant), "NOT_ELIGIBLE");
    expect(() => parseUpdateProfile({ displayName: "Asha", birthDate: "1995-02-30", gender: "woman" })).toThrow();
    expect(() => parseUpdateProfile({ displayName: "Asha", birthDate: "1995-01-01", gender: "robot" })).toThrow();
    expect(() => parseUpdateProfile({ displayName: "A", birthDate: "1995-01-01", gender: "woman" })).toThrow();
  });
});

describe("organizer application → approval → code redemption", () => {
  test("submission creates the application and a pending organizer-kyc case", async () => {
    const result = await submitOrganizerApplication(application("apply-req-0001"), applicant);
    expect(result).toMatchObject({ caseId: organizerCaseId(applicant.uid), status: "submitted", replayed: false });
    const f = h.firestore();
    const app = (await f.doc(`organizerApplications/${applicant.uid}`).get()).data()!;
    expect(app).toMatchObject({ status: "submitted", phone: applicant.phone, contactEmail: "hello@sunrisetreks.in" });
    const kase = (await f.doc(`governanceCases/${organizerCaseId(applicant.uid)}`).get()).data()!;
    expect(kase).toMatchObject({
      kind: "organizer-kyc", subject: "Sunrise Treks", targetId: applicant.uid, targetCollection: "organizerApplications",
      status: "pending", version: 0, policyVersion: "KYC-2.0",
    });
    expect(["low", "medium", "high"]).toContain(kase.risk);
    // Replay: same result, no second case/audit.
    const again = await submitOrganizerApplication(application("apply-req-0001"), applicant);
    expect(again).toMatchObject({ caseId: organizerCaseId(applicant.uid), replayed: true });
    expect((await f.collection("auditEvents").where("action", "==", "organizer.application-submitted").get()).size).toBe(1);
    // A second submission while under review is refused.
    await expectCode(submitOrganizerApplication(application("apply-req-0002"), applicant), "CONFLICT");
  });

  test("approval creates the organizer, the public projection and a hashed code returned once", async () => {
    const approved = await submitAndApprove();
    expect(approved.organizerCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
    expect(approved.orgId).toBeTruthy();
    expect(Date.parse(approved.codeExpiresAt) - Date.now()).toBeGreaterThan(13 * 24 * 3600 * 1000);
    const f = h.firestore();
    const org = (await f.doc(`organizers/${approved.orgId}`).get()).data()!;
    expect(org).toMatchObject({ status: "active", ownerUid: applicant.uid, name: "Sunrise Treks", city: "Hyderabad", version: 0 });
    const pub = (await f.doc(`publicOrganizers/${approved.orgId}`).get()).data()!;
    expect(pub).toMatchObject({ name: "Sunrise Treks", city: "Hyderabad", verified: true, monogram: "ST", categories: ["trekking", "outdoors"] });
    for (const k of ["commissionBps", "legalName", "ownerUid", "contactEmail", "phone", "kyc"]) expect(pub).not.toHaveProperty(k);
    const act = (await f.doc(`organizerActivations/${applicant.uid}`).get()).data()!;
    expect(act).toMatchObject({ orgId: approved.orgId, status: "issued", attempts: 0 });
    expect(act.codeHash).toMatch(/^[0-9a-f]{64}$/);
    const note = await f.collection("userNotifications").where("recipientUid", "==", applicant.uid).get();
    expect(note.docs.map((d) => d.data().kind)).toContain("organizer-approved");

    // The plaintext code is nowhere in storage — above all not in receipts or audit.
    const everything = await dump(f, ["auditEvents", "commandReceipts", "organizerActivations", "organizers", "publicOrganizers", "governanceCases", "organizerApplications", "userNotifications"]);
    expect(everything).not.toContain(approved.organizerCode);
    const receipt = (await f.doc("commandReceipts/decide-req-0001").get()).data()!;
    expect(receipt.result).toMatchObject({ orgId: approved.orgId, codeAlreadyIssued: true });
    expect(receipt.result).not.toHaveProperty("organizerCode");
  });

  test("replaying decideCase neither re-issues nor leaks the code", async () => {
    const approved = await submitAndApprove();
    const hashBefore = (await h.firestore().doc(`organizerActivations/${applicant.uid}`).get()).data()!.codeHash;
    const replay = (await decideGovernanceCase(
      { requestId: "decide-req-0001", caseId: organizerCaseId(applicant.uid), expectedVersion: 0, outcome: "approved", note: "" },
      admin
    )) as Record<string, unknown>;
    expect(replay).toMatchObject({ replayed: true, orgId: approved.orgId, codeAlreadyIssued: true });
    expect(replay).not.toHaveProperty("organizerCode");
    expect(JSON.stringify(replay)).not.toContain(approved.organizerCode);
    const hashAfter = (await h.firestore().doc(`organizerActivations/${applicant.uid}`).get()).data()!.codeHash;
    expect(hashAfter).toBe(hashBefore);
    expect((await h.firestore().collection("organizers").get()).size).toBe(1);
  });

  test("myAccess shows the pending activation without revealing any code", async () => {
    const approved = await submitAndApprove();
    const access = await myAccess(applicant);
    expect(access.organizer).toMatchObject({ applicationStatus: "approved", activationPending: true, orgId: approved.orgId });
    expect(access.memberships).toEqual([]);
    expect(JSON.stringify(access)).not.toMatch(/codeHash|organizerCode/);
    expect(JSON.stringify(access)).not.toContain(approved.organizerCode);
  });

  test("the applicant redeems once and becomes owner with every permission", async () => {
    const approved = await submitAndApprove();
    await expect(redeem(approved.organizerCode.toLowerCase().replace(/(.{5})/, "$1-"))).resolves.toEqual({ orgId: approved.orgId });
    const f = h.firestore();
    const m = (await f.doc(`memberships/${approved.orgId}__${applicant.uid}`).get()).data()!;
    expect(m).toMatchObject({ role: "owner", status: "active", eventScope: { all: true } });
    expect([...m.permissions].sort()).toEqual([...PERMISSIONS].sort());
    const act = (await f.doc(`organizerActivations/${applicant.uid}`).get()).data()!;
    expect(act.status).toBe("redeemed");
    expect(act).not.toHaveProperty("codeHash");
    const access = await myAccess(applicant);
    expect(access.organizer.activationPending).toBe(false);
    expect(access.memberships).toEqual([expect.objectContaining({ orgId: approved.orgId, orgName: "Sunrise Treks", role: "owner" })]);

    // Reusing the burned code fails and is audited.
    await expectCode(redeem(approved.organizerCode), "INVALID_INPUT");
    expect((await f.collection("auditEvents").where("action", "==", "access.code-failed").get()).size).toBe(1);
    expect((await f.collection("memberships").get()).size).toBe(1);
  });

  test("a valid code typed by someone else grants nothing", async () => {
    const approved = await submitAndApprove();
    await expectCode(redeem(approved.organizerCode, stranger), "INVALID_INPUT");
    const f = h.firestore();
    expect((await f.collection("memberships").get()).size).toBe(0);
    const failures = await f.collection("auditEvents").where("action", "==", "access.code-failed").get();
    expect(failures.docs[0]!.data()).toMatchObject({ actorUid: stranger.uid, reason: "no-activation" });
    // The real applicant can still redeem.
    await expect(redeem(approved.organizerCode)).resolves.toEqual({ orgId: approved.orgId });
  });

  test("invalid and malformed codes fail, are counted on the activation and audited", async () => {
    await submitAndApprove();
    await expectCode(redeem("ABCDEFGHJK"), "INVALID_INPUT");
    await expectCode(redeem("short"), "INVALID_INPUT");
    const f = h.firestore();
    expect((await f.doc(`organizerActivations/${applicant.uid}`).get()).data()!.attempts).toBe(1);
    const failures = await f.collection("auditEvents").where("action", "==", "access.code-failed").get();
    expect(failures.docs.map((d) => d.data().reason).sort()).toEqual(["bad-format", "mismatch"]);
    const blob = JSON.stringify(failures.docs.map((d) => d.data()));
    expect(blob).not.toContain("ABCDEFGHJK");
  });

  test("an expired code is refused", async () => {
    const approved = await submitAndApprove();
    await h.firestore().doc(`organizerActivations/${applicant.uid}`).update({ expiresAt: past() });
    await expectCode(redeem(approved.organizerCode), "PRECONDITION");
    expect((await h.firestore().collection("memberships").get()).size).toBe(0);
    expect((await myAccess(applicant)).organizer.activationPending).toBe(false);
  });

  test("brute force: five attempts per hour, then lockout even for the right code", async () => {
    const approved = await submitAndApprove();
    for (let i = 0; i < 5; i++) await expectCode(redeem(`WRONGCODE${"23456"[i]}`), "INVALID_INPUT");
    await expectCode(redeem(approved.organizerCode), "RATE_LIMITED");
    const f = h.firestore();
    expect((await f.collection("memberships").get()).size).toBe(0);
    const failures = await f.collection("auditEvents").where("action", "==", "access.code-failed").get();
    expect(failures.size).toBe(6);
    expect(failures.docs.filter((d) => d.data().reason === "rate-limited")).toHaveLength(1);
  });

  test("an admin re-issue kills the old code; the new one works; replay does not leak", async () => {
    const approved = await submitAndApprove();
    await h.firestore().doc(`organizerActivations/${applicant.uid}`).update({ expiresAt: past() });
    const reissued = (await reissueOrganizerActivationCode({ requestId: "reissue-req-0001", applicantUid: applicant.uid }, admin)) as unknown as Record<string, string>;
    expect(reissued.organizerCode).not.toBe(approved.organizerCode);
    const replay = (await reissueOrganizerActivationCode({ requestId: "reissue-req-0001", applicantUid: applicant.uid }, admin)) as Record<string, unknown>;
    expect(replay).toMatchObject({ replayed: true, codeAlreadyIssued: true });
    expect(replay).not.toHaveProperty("organizerCode");
    const everything = await dump(h.firestore(), ["auditEvents", "commandReceipts", "organizerActivations"]);
    expect(everything).not.toContain(reissued.organizerCode);

    await expectCode(redeem(approved.organizerCode), "INVALID_INPUT");
    await expect(redeem(reissued.organizerCode!)).resolves.toEqual({ orgId: approved.orgId });
    // After activation a re-issue is refused.
    await expectCode(reissueOrganizerActivationCode({ requestId: "reissue-req-0002", applicantUid: applicant.uid }, admin), "CONFLICT");
  });

  test("changes-requested → resubmission reopens the same case; rejection is final", async () => {
    await submitOrganizerApplication(application("apply-req-0001"), applicant);
    const caseId = organizerCaseId(applicant.uid);
    await decideGovernanceCase({ requestId: "decide-req-0001", caseId, expectedVersion: 0, outcome: "information-requested", note: "Please add a PAN document." }, admin);
    const f = h.firestore();
    expect((await f.doc(`organizerApplications/${applicant.uid}`).get()).data()!.status).toBe("changes-requested");
    const kinds = (await f.collection("userNotifications").get()).docs.map((d) => d.data().kind);
    expect(kinds).toContain("organizer-changes-requested");

    const re = await submitOrganizerApplication(application("apply-req-0002", { about: "Updated: weekend treks with certified guides." }), applicant);
    expect(re).toMatchObject({ resubmitted: true, caseId });
    const kase = (await f.doc(`governanceCases/${caseId}`).get()).data()!;
    expect(kase).toMatchObject({ status: "pending", version: 2 });
    expect((await f.collection("governanceCases").get()).size).toBe(1);

    await decideGovernanceCase({ requestId: "decide-req-0002", caseId, expectedVersion: 2, outcome: "rejected", note: "Identity documents did not match." }, admin);
    expect((await f.doc(`organizerApplications/${applicant.uid}`).get()).data()!.status).toBe("rejected");
    expect((await f.collection("userNotifications").get()).docs.map((d) => d.data().kind)).toContain("organizer-rejected");
    expect((await f.collection("organizers").get()).size).toBe(0);
    expect((await f.collection("organizerActivations").get()).size).toBe(0);
    await expectCode(submitOrganizerApplication(application("apply-req-0003"), applicant), "PRECONDITION");
  });

  test("a requestId reused for a different action is refused", async () => {
    await submitOrganizerApplication(application("shared-req-0001"), applicant);
    await h.firestore().doc(`commandReceipts/pulse__${applicant.uid}__other-req-0001`).set({ action: "identity.staff-invited", actorUid: applicant.uid, result: {} });
    await expectCode(submitOrganizerApplication(application("other-req-0001"), applicant), "CONFLICT");
  });
});
