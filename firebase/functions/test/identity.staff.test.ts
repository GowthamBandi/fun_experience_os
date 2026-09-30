import { Timestamp } from "firebase-admin/firestore";
import { assertCanGrant, ROLE_TEMPLATES, type Permission } from "../src/access/permissions";
import {
  parseCode,
  parseInviteStaff,
  parseReissueStaffCode,
  parseRevokeStaff,
  parseUpdateStaff,
} from "../src/identity/model";
import { myAccess } from "../src/identity/profile";
import { inviteStaff, listStaff, redeemStaffCode, reissueStaffCode, revokeStaff, updateStaff } from "../src/identity/staff";
import { dump, expectCode, past, phoneActor, seedMember, seedOrg, seedUser, useEmulator } from "./identity-fixtures";

const h = useEmulator("identity-staff-tests");

const ORG = "org-sunrise";
const OTHER_ORG = "org-moonlit";
const owner = phoneActor("owner-0001", "+919800000001");
const manager = phoneActor("manager-0001", "+919800000002");
const checker = phoneActor("checker-0001", "+919800000003");
const newbie = phoneActor("newbie-0001", "+919876543210");
const imposter = phoneActor("imposter-0001", "+919811111111");
const customer = phoneActor("customer-0001", "+919822222222");

const CHECK_IN = ROLE_TEMPLATES["check-in"]!;
const MANAGER_PERMS: Permission[] = ["staff.manage", "events.view", "attendees.view", "tickets.scan", "experiences.view"];

let seq = 0;
const rid = (p = "req") => `${p}-${String(++seq).padStart(6, "0")}`;

const invite = (who: typeof owner, input: Record<string, unknown> = {}, requestId = rid("invite")) =>
  inviteStaff(
    parseInviteStaff({ requestId, orgId: ORG, phone: "98765 43210", title: "Gate crew", permissions: CHECK_IN, eventScope: "all", ...input }),
    who
  ) as Promise<{ inviteId: string; code: string; expiresAt: string; replayed: boolean }>;
const redeem = (code: string, who = newbie) => redeemStaffCode(parseCode({ code }), who);

beforeEach(async () => {
  const f = h.firestore();
  await seedOrg(f, ORG, owner.uid);
  await seedOrg(f, OTHER_ORG, "other-owner-01", "Moonlit Walks");
  await seedMember(f, ORG, manager.uid, { permissions: MANAGER_PERMS, eventScope: { all: true, eventIds: [] }, title: "Manager" });
  await seedMember(f, ORG, checker.uid, { permissions: CHECK_IN, eventScope: { all: true, eventIds: [] }, title: "Check-in" });
  for (const a of [owner, manager, checker, newbie, imposter, customer]) await seedUser(f, a.uid, a.phone, a.uid);
  await f.doc("events/event-ours-01").set({ orgId: ORG, status: "draft" });
  await f.doc("events/event-ours-02").set({ orgId: ORG, status: "draft" });
  await f.doc("events/event-theirs-1").set({ orgId: OTHER_ORG, status: "draft" });
});

describe("inviteStaff", () => {
  test("owner invites: code returned once, only the hash stored, phone normalised", async () => {
    const res = await invite(owner);
    expect(res.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
    const f = h.firestore();
    const inv = (await f.doc(`staffInvites/${res.inviteId}`).get()).data()!;
    expect(inv).toMatchObject({ orgId: ORG, phone: "+919876543210", status: "pending", permissions: CHECK_IN, eventScope: { all: true } });
    expect(inv.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(inv.expiresAt.toMillis() - Date.now()).toBeGreaterThan(6 * 24 * 3600 * 1000);
    const stored = await dump(f, ["staffInvites", "auditEvents", "commandReceipts", "userNotifications"]);
    expect(stored).not.toContain(res.code);
    // The audit trail carries a masked phone, never the raw number.
    const audit = (await f.collection("auditEvents").where("action", "==", "staff.invited").get()).docs[0]!.data();
    expect(JSON.stringify(audit)).not.toContain("9876543210");
  });

  test("a replayed requestId returns the same invite, creates one invite, and never repeats the code", async () => {
    const first = await invite(owner, {}, "invite-replay-01");
    const second = (await invite(owner, {}, "invite-replay-01")) as Record<string, unknown>;
    expect(second).toMatchObject({ inviteId: first.inviteId, expiresAt: first.expiresAt, replayed: true, codeAlreadyIssued: true });
    expect(second).not.toHaveProperty("code");
    expect((await h.firestore().collection("staffInvites").get()).size).toBe(1);
    expect((await h.firestore().collection("auditEvents").where("action", "==", "staff.invited").get()).size).toBe(1);
  });

  test("a customer with no membership is denied", async () => {
    await expectCode(invite(customer), "NOT_PERMITTED");
  });

  test("staff without staff.manage are denied", async () => {
    await expectCode(invite(checker), "NOT_PERMITTED");
  });

  test("a manager cannot grant staff.manage or anything they don't hold", async () => {
    await expectCode(invite(manager, { permissions: ["staff.manage", "events.view"] }), "NOT_PERMITTED");
    await expectCode(invite(manager, { permissions: ["earnings.view"] }), "NOT_PERMITTED");
    await expectCode(invite(manager, { permissions: ["events.cancel"] }), "NOT_PERMITTED");
    await expect(invite(manager, { permissions: ["tickets.scan", "events.view"] })).resolves.toHaveProperty("code");
  });

  test("a scoped granter cannot assign events outside their scope, and nobody can assign another org's events", async () => {
    // staff.manage is org-wide, so a scoped holder is refused outright.
    await seedMember(h.firestore(), ORG, manager.uid, { permissions: MANAGER_PERMS, eventScope: { all: false, eventIds: ["event-ours-01"] } });
    await expectCode(invite(manager, { eventScope: ["event-ours-02"] }), "NOT_PERMITTED");
    // The grant rule itself, for a scoped granter:
    expect(() =>
      assertCanGrant(
        { orgId: ORG, uid: "x", role: "staff", status: "active", permissions: CHECK_IN, eventScope: { all: false, eventIds: ["event-ours-01"] }, version: 0 },
        ["tickets.scan"],
        { all: false, eventIds: ["event-ours-02"] }
      )
    ).toThrow(/assign events/);
    await expectCode(invite(owner, { eventScope: ["event-theirs-1"] }), "INVALID_INPUT");
    await expectCode(invite(owner, { eventScope: ["event-missing"] }), "INVALID_INPUT");
  });

  test("org-wide permissions require the all-events scope", () => {
    expect(() => parseInviteStaff({ requestId: rid(), orgId: ORG, phone: "9876543210", title: "Ops", permissions: ["experiences.edit"], eventScope: ["event-ours-01"] })).toThrow();
  });

  test("nobody can invite themselves; an active member can't be invited twice into the same org", async () => {
    await expectCode(invite(owner, { phone: owner.phone }), "INVALID_INPUT");
    await expectCode(invite(owner, { phone: checker.phone }), "CONFLICT");
    const first = await invite(owner);
    expect(first.code).toBeDefined();
    await expectCode(invite(owner), "CONFLICT"); // pending invite already exists
  });

  test("a revoked manager is denied immediately", async () => {
    await revokeStaff(parseRevokeStaff({ requestId: rid(), orgId: ORG, uid: manager.uid, reason: "Left the company" }), owner);
    await expectCode(invite(manager, { permissions: ["tickets.scan"] }), "NOT_PERMITTED");
    await expectCode(listStaff({ orgId: ORG }, manager), "NOT_PERMITTED");
  });
});

describe("redeemStaffCode", () => {
  test("the invited phone redeems once: membership active with exactly the grant", async () => {
    const res = await invite(owner, { permissions: CHECK_IN, eventScope: ["event-ours-01"] });
    await expect(redeem(res.code)).resolves.toEqual({ orgId: ORG });
    const f = h.firestore();
    const m = (await f.doc(`memberships/${ORG}__${newbie.uid}`).get()).data()!;
    expect(m).toMatchObject({ role: "staff", status: "active", permissions: CHECK_IN, eventScope: { all: false, eventIds: ["event-ours-01"] } });
    const inv = (await f.doc(`staffInvites/${res.inviteId}`).get()).data()!;
    expect(inv).toMatchObject({ status: "redeemed", redeemedBy: newbie.uid });
    expect(inv).not.toHaveProperty("codeHash");
    const kinds = (await f.collection("userNotifications").where("recipientUid", "==", newbie.uid).get()).docs.map((d) => d.data().kind);
    expect(kinds).toEqual(["staff-activated"]);
    // Reused code: burned.
    await expectCode(redeem(res.code), "INVALID_INPUT");
  });

  test("a different phone with the right code gets nothing", async () => {
    const res = await invite(owner);
    await expectCode(redeem(res.code, imposter), "INVALID_INPUT");
    const f = h.firestore();
    expect((await f.doc(`memberships/${ORG}__${imposter.uid}`).get()).exists).toBe(false);
    expect((await f.doc(`staffInvites/${res.inviteId}`).get()).data()!.status).toBe("pending");
    const failed = await f.collection("auditEvents").where("action", "==", "access.code-failed").get();
    expect(failed.docs[0]!.data()).toMatchObject({ actorUid: imposter.uid, reason: "no-invite" });
    await expect(redeem(res.code)).resolves.toEqual({ orgId: ORG });
  });

  test("invalid code fails, is counted on the invite and audited", async () => {
    const res = await invite(owner);
    await expectCode(redeem("ZZZZZZZZ"), "INVALID_INPUT");
    const f = h.firestore();
    expect((await f.doc(`staffInvites/${res.inviteId}`).get()).data()!.attempts).toBe(1);
    expect((await f.collection("auditEvents").where("action", "==", "access.code-failed").get()).size).toBe(1);
  });

  test("an expired invite code is refused", async () => {
    const res = await invite(owner);
    await h.firestore().doc(`staffInvites/${res.inviteId}`).update({ expiresAt: past() });
    await expectCode(redeem(res.code), "PRECONDITION");
    expect((await h.firestore().doc(`memberships/${ORG}__${newbie.uid}`).get()).exists).toBe(false);
  });

  test("brute force: locked out after five attempts, even with the right code", async () => {
    const res = await invite(owner);
    for (let i = 0; i < 5; i++) await expectCode(redeem(`WRNGCD${"2345"[i % 4]}${i}`.slice(0, 8)), "INVALID_INPUT");
    await expectCode(redeem(res.code), "RATE_LIMITED");
    expect((await h.firestore().collection("auditEvents").where("action", "==", "access.code-failed").get()).size).toBe(6);
    expect((await h.firestore().doc(`memberships/${ORG}__${newbie.uid}`).get()).exists).toBe(false);
  });

  test("an invite absorbing too many guesses locks and needs a re-issue", async () => {
    const res = await invite(owner);
    await h.firestore().doc(`staffInvites/${res.inviteId}`).update({ attempts: 9 });
    await expectCode(redeem("ZZZZZZZZ"), "INVALID_INPUT");
    expect((await h.firestore().doc(`staffInvites/${res.inviteId}`).get()).data()!.status).toBe("locked");
    await expectCode(redeem(res.code), "INVALID_INPUT");
    const re = await reissueStaffCode(parseReissueStaffCode({ requestId: rid(), orgId: ORG, inviteId: res.inviteId }), owner);
    await expect(redeem(re.code as string)).resolves.toEqual({ orgId: ORG });
  });

  test("myAccess lists the pending invite by organizer name only", async () => {
    const res = await invite(owner);
    const access = await myAccess(newbie);
    expect(access.pendingStaffInvites).toEqual([{ inviteId: res.inviteId, orgName: "Sunrise Treks", expiresAt: res.expiresAt }]);
    expect(JSON.stringify(access)).not.toContain(res.code);
    expect((await myAccess(imposter)).pendingStaffInvites).toEqual([]);
  });

  test("one person may be staff of several organizers", async () => {
    await seedMember(h.firestore(), OTHER_ORG, newbie.uid, { permissions: CHECK_IN, eventScope: { all: true, eventIds: [] } });
    const res = await invite(owner);
    await expect(redeem(res.code)).resolves.toEqual({ orgId: ORG });
    expect((await myAccess(newbie)).memberships.map((m) => m.orgId).sort()).toEqual([ORG, OTHER_ORG].sort());
  });
});

describe("listStaff / updateStaff / reissueStaffCode", () => {
  test("listStaff masks phones and never returns hashes", async () => {
    await invite(owner);
    const list = await listStaff({ orgId: ORG }, manager);
    expect(list.invites).toEqual([expect.objectContaining({ phoneMasked: "+91 •••••• 3210", status: "pending", title: "Gate crew" })]);
    expect(list.members.map((m) => m.uid).sort()).toEqual([checker.uid, manager.uid, owner.uid].sort());
    const json = JSON.stringify(list);
    expect(json).not.toMatch(/codeHash|9876543210/);
    await expectCode(listStaff({ orgId: ORG }, checker), "NOT_PERMITTED");
    await expectCode(listStaff({ orgId: ORG }, customer), "NOT_PERMITTED");
  });

  test("updateStaff: owner can edit; managers can't touch owners, themselves, or grant beyond their own", async () => {
    const upd = (who: typeof owner, input: Record<string, unknown>) =>
      updateStaff(parseUpdateStaff({ requestId: rid("upd"), orgId: ORG, ...input }), who);
    await expectCode(upd(manager, { uid: owner.uid, title: "Nope" }), "NOT_PERMITTED");
    await expectCode(upd(manager, { uid: manager.uid, permissions: [...MANAGER_PERMS, "earnings.view"] }), "NOT_PERMITTED");
    await expectCode(upd(manager, { uid: checker.uid, permissions: [...CHECK_IN, "events.cancel"] }), "NOT_PERMITTED");
    await expectCode(upd(manager, { uid: checker.uid, permissions: [...CHECK_IN, "staff.manage"] }), "NOT_PERMITTED");
    await expectCode(upd(checker, { uid: checker.uid, permissions: [...CHECK_IN, "staff.manage"] }), "NOT_PERMITTED");
    const ok = await upd(owner, { uid: checker.uid, permissions: ["tickets.scan"], eventScope: ["event-ours-02"] });
    expect(ok).toMatchObject({ permissions: ["tickets.scan"], eventScope: { all: false, eventIds: ["event-ours-02"] }, version: 1 });
    const kinds = (await h.firestore().collection("userNotifications").where("recipientUid", "==", checker.uid).get()).docs.map((d) => d.data().kind);
    expect(kinds).toEqual(["staff-updated"]);
  });

  test("reissueStaffCode kills the old code and never stores the new one", async () => {
    const res = await invite(owner);
    const re = await reissueStaffCode(parseReissueStaffCode({ requestId: "reissue-staff-01", orgId: ORG, inviteId: res.inviteId }), owner);
    const replay = (await reissueStaffCode(parseReissueStaffCode({ requestId: "reissue-staff-01", orgId: ORG, inviteId: res.inviteId }), owner)) as Record<string, unknown>;
    expect(replay).toMatchObject({ replayed: true, codeAlreadyIssued: true });
    expect(replay).not.toHaveProperty("code");
    expect(await dump(h.firestore(), ["staffInvites", "auditEvents", "commandReceipts"])).not.toContain(re.code as string);
    await expectCode(redeem(res.code), "INVALID_INPUT");
    await expect(redeem(re.code as string)).resolves.toEqual({ orgId: ORG });
    await expectCode(reissueStaffCode(parseReissueStaffCode({ requestId: rid(), orgId: ORG, inviteId: res.inviteId }), checker), "NOT_PERMITTED");
  });
});

describe("revokeStaff", () => {
  test("revocation is immediate, audited and notified; the owner can't be revoked", async () => {
    await expectCode(revokeStaff(parseRevokeStaff({ requestId: rid(), orgId: ORG, uid: owner.uid, reason: "Takeover attempt" }), manager), "NOT_PERMITTED");
    const res = await revokeStaff(parseRevokeStaff({ requestId: rid(), orgId: ORG, uid: checker.uid, reason: "Season ended" }), manager);
    expect(res).toMatchObject({ uid: checker.uid, status: "revoked" });
    const f = h.firestore();
    expect((await f.doc(`memberships/${ORG}__${checker.uid}`).get()).data()).toMatchObject({ status: "revoked", revokeReason: "Season ended" });
    expect((await f.collection("auditEvents").where("action", "==", "staff.revoked").get()).size).toBe(1);
    const kinds = (await f.collection("userNotifications").where("recipientUid", "==", checker.uid).get()).docs.map((d) => d.data().kind);
    expect(kinds).toEqual(["staff-revoked"]);
    expect((await myAccess(checker)).memberships).toEqual([]);
  });

  test("refused while the member is the primary responsible person of a published event", async () => {
    const f = h.firestore();
    await f.doc("events/event-ours-01").set({ orgId: ORG, status: "published", responsibility: { primaryUid: checker.uid } });
    await expectCode(revokeStaff(parseRevokeStaff({ requestId: rid(), orgId: ORG, uid: checker.uid, reason: "Season ended" }), owner), "PRECONDITION");
    expect((await f.doc(`memberships/${ORG}__${checker.uid}`).get()).data()!.status).toBe("active");
    for (const status of ["booking-closed", "live"]) {
      await f.doc("events/event-ours-01").update({ status });
      await expectCode(revokeStaff(parseRevokeStaff({ requestId: rid(), orgId: ORG, uid: checker.uid, reason: "Season ended" }), owner), "PRECONDITION");
    }
    await f.doc("events/event-ours-01").update({ status: "completed" });
    await expect(revokeStaff(parseRevokeStaff({ requestId: rid(), orgId: ORG, uid: checker.uid, reason: "Season ended" }), owner)).resolves.toMatchObject({ status: "revoked" });
  });

  test("cancelling an invite kills its code", async () => {
    const res = await invite(owner);
    await revokeStaff(parseRevokeStaff({ requestId: rid(), orgId: ORG, inviteId: res.inviteId, reason: "Wrong number" }), owner);
    expect((await h.firestore().doc(`staffInvites/${res.inviteId}`).get()).data()!.status).toBe("cancelled");
    await expectCode(redeem(res.code), "INVALID_INPUT");
  });

  test("a revoked member re-invited comes back with only the new grant", async () => {
    const first = await invite(owner, { permissions: ["events.view", "attendees.view", "tickets.scan", "events.operate"] });
    await redeem(first.code);
    await revokeStaff(parseRevokeStaff({ requestId: rid(), orgId: ORG, uid: newbie.uid, reason: "Season ended" }), owner);
    const second = await invite(owner, { permissions: ["tickets.scan"], eventScope: ["event-ours-02"] });
    expect(second.inviteId).not.toBe(first.inviteId);
    await redeem(second.code);
    const m = (await h.firestore().doc(`memberships/${ORG}__${newbie.uid}`).get()).data()!;
    expect(m).toMatchObject({ status: "active", permissions: ["tickets.scan"], eventScope: { all: false, eventIds: ["event-ours-02"] }, version: 2 });
    expect(m).not.toHaveProperty("revokeReason");
  });

  test("replayed revoke returns the same result without a second audit", async () => {
    const cmd = parseRevokeStaff({ requestId: "revoke-replay-1", orgId: ORG, uid: checker.uid, reason: "Season ended" });
    const a = await revokeStaff(cmd, owner);
    const b = await revokeStaff(cmd, owner);
    expect(b).toMatchObject({ ...a, replayed: true });
    expect((await h.firestore().collection("auditEvents").where("action", "==", "staff.revoked").get()).size).toBe(1);
  });
});

test("timestamps come back as ISO strings", async () => {
  const res = await invite(owner);
  expect(typeof res.expiresAt).toBe("string");
  expect(Timestamp.fromDate(new Date(res.expiresAt as string)).toMillis()).toBeGreaterThan(Date.now());
});
