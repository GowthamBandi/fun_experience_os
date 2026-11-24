/**
 * Account controls (docs/NOTIFICATION_CENTER_CONTRACT.md §3 / §5):
 * setAccountStatus pause / block / re-activate, the shared enforcement
 * (customer actions refused while paused with details.code ACCOUNT_PAUSED,
 * every callable refused while blocked with ACCOUNT_BLOCKED, Auth disabled),
 * `until` expiry, searchAccounts, and organization status messages through
 * setMarketplaceEntityStatus. Runs on the spare emulator ports
 * (firebase.verify.json: Firestore + Auth emulators) — it clears Firestore.
 */
import { getAuth } from "firebase-admin/auth";
import {
  call, callCode, callErr, phoneCtx, adminCtx, uniq, rid, db, Timestamp, commerce, world, reserve, seedCustomer,
} from "./commerce-helpers";
import { clearFirestore } from "./catalog.fixtures";
import { app } from "../src/platform/firestore";
import { setAccountStatus, searchAccounts, expireStatuses, maskPhone } from "../src/platform/accountControls";
import { effectiveAccountStatus, istUntilLabel } from "../src/platform/accountStatus";
import { getMyAnnouncements } from "../src/platform/announcements";
import { setMarketplaceEntityStatus } from "../src/governance/callables";
import * as catalog from "../src/catalog";
import * as trips from "../src/trips";
import * as support from "../src/support";
import * as identity from "../src/identity";
import { expireAccountStatusesOnce } from "../src/platform/notificationJobs";

const ADMIN = adminCtx("admin-ac-0001");
const H = 3_600_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const auth = () => getAuth(app());

async function personWithAuth(o: { phone?: string; name?: string } = {}) {
  const uid = uniq("acct");
  await auth().createUser({ uid });
  await db().doc(`users/${uid}`).set({ uid, phone: o.phone ?? null, createdAt: Timestamp.now() });
  await db().doc(`publicProfiles/${uid}`).set({ displayName: o.name ?? `Member ${uid.slice(-4)}` });
  return uid;
}
const setStatus = (uid: string, status: string, over: Record<string, unknown> = {}, ctx: unknown = ADMIN) =>
  call<{ uid: string; status: string; until: string | null; authSynced: boolean; replayed: boolean }>(setAccountStatus, {
    requestId: rid(), uid, status, reason: "Repeated chargebacks under review", ...over,
  }, ctx);
async function details(p: Promise<unknown>): Promise<Record<string, any>> {
  try {
    await p;
  } catch (e) {
    return ((e as { details?: Record<string, unknown> }).details ?? {}) as Record<string, any>;
  }
  throw new Error("expected a refusal");
}

beforeAll(() => {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Run under `firebase emulators:exec --config firebase.verify.json` (needs the Auth emulator; clears Firestore).");
});
beforeEach(async () => {
  await clearFirestore();
});

describe("setAccountStatus: validation and permissions", () => {
  test("admins with accounts.moderate only; reason 10+; until only for pause/block, in the future, ≤ 2 years; never yourself or an operator", async () => {
    const uid = await personWithAuth();
    expect(await callCode(setAccountStatus, { requestId: rid(), uid, status: "paused", reason: "Long enough reason" }, phoneCtx(uniq("c")))).toBe("NOT_PERMITTED");
    expect(await callCode(setAccountStatus, { requestId: rid(), uid, status: "paused", reason: "Long enough reason" }, adminCtx("aud-1", "auditor"))).toBe("NOT_PERMITTED");
    const bad = (over: Record<string, unknown>) => callErr(setAccountStatus, { requestId: rid(), uid, status: "paused", reason: "Long enough reason", ...over }, ADMIN);
    expect((await bad({ reason: "short" })).message).toMatch(/10–2000/);
    expect((await bad({ status: "frozen" })).code).toBe("INVALID_INPUT");
    expect((await bad({ messageToUser: "x".repeat(501) })).code).toBe("INVALID_INPUT");
    expect((await bad({ until: iso(-H) })).message).toMatch(/future/);
    expect((await bad({ until: iso(3 * 365 * 24 * H) })).message).toMatch(/2 years/);
    expect((await bad({ status: "active", until: iso(H) })).message).toMatch(/only applies/);
    expect((await callErr(setAccountStatus, { requestId: rid(), uid: "admin-ac-0001", status: "paused", reason: "Long enough reason" }, ADMIN)).message).toMatch(/your own/);
    await db().doc("users/operator-0001").set({ scope: "platform", roleId: "super-admin" });
    expect((await callErr(setAccountStatus, { requestId: rid(), uid: "operator-0001", status: "blocked", reason: "Long enough reason" }, ADMIN)).message).toMatch(/operator account/);
    expect((await setStatus(uid, "paused", {}, adminCtx("owner-1", "platform-owner"))).status).toBe("paused");
  });
});

describe("paused", () => {
  test("writes the person-readable doc (no reason), the private reason + history, the audit, an inbox item and the acct claim", async () => {
    const uid = await personWithAuth();
    const until = iso(48 * H);
    const r = await setStatus(uid, "paused", { messageToUser: "Please talk to support about your recent bookings.", until });
    expect(r).toMatchObject({ uid, status: "paused", until: new Date(until).toISOString(), authSynced: true, replayed: false });
    const pub = (await db().doc(`accountStatus/${uid}`).get()).data()!;
    expect(pub).toMatchObject({ status: "paused", messageToUser: "Please talk to support about your recent bookings.", updatedBy: "admin-ac-0001" });
    expect(pub.reason).toBeUndefined();
    const priv = (await db().doc(`accountStatusPrivate/${uid}`).get()).data()!;
    expect(priv).toMatchObject({ reason: "Repeated chargebacks under review", history: [expect.objectContaining({ status: "paused", reason: "Repeated chargebacks under review", by: "admin-ac-0001" })] });
    const audit = (await db().collection("auditEvents").where("resourceId", "==", uid).get()).docs.map((d) => d.data());
    expect(audit).toEqual([expect.objectContaining({ action: "account.status-changed", before: { status: "active", until: null }, after: expect.objectContaining({ status: "paused" }), reason: "Repeated chargebacks under review", source: "operations-console" })]);
    const inbox = (await db().collection("userNotifications").where("recipientUid", "==", uid).get()).docs.map((d) => d.data());
    expect(inbox).toEqual([expect.objectContaining({ kind: "account-status", title: "Your PULSE account is paused", link: { type: "account", id: uid } })]);
    expect(inbox[0]!.body).toMatch(/until .* IST\. Please talk to support/);
    expect((await auth().getUser(uid)).customClaims).toMatchObject({ acct: "paused" });
    expect((await auth().getUser(uid)).disabled).toBe(false);
  });

  test("every customer action is refused with ACCOUNT_PAUSED (+ message, until, facts); support, reading and undo actions still work", async () => {
    const uid = await personWithAuth();
    await seedCustomer(uid);
    const until = iso(24 * H);
    await setStatus(uid, "paused", { messageToUser: "Contact support to restore booking.", until });
    const ctx = phoneCtx(uid);
    const { eventId } = await world();
    const refused: Array<[string, unknown, unknown]> = [
      ["reserveSeat", commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Asha" }],
      ["createPaymentOrder", commerce.createPaymentOrder, { requestId: rid(), bookingId: "bkg-x-0001" }],
      ["joinEventWaitlist", commerce.joinEventWaitlist, { requestId: rid(), eventId }],
      ["reserveTripSeats", trips.reserveTripSeats, { requestId: rid(), tripId: "trip-0001", departureId: "dep-0001" }],
      ["createTripPaymentOrder", trips.createTripPaymentOrder, { requestId: rid(), bookingId: "tb-x-0001" }],
      ["joinTripWaitlist", trips.joinTripWaitlist, { requestId: rid(), departureId: "dep-0001" }],
      ["submitReview", catalog.submitReview, { requestId: rid(), eventId, rating: 5, comment: "Great" }],
      ["submitTripReview", catalog.submitTripReview, { requestId: rid(), bookingId: "tb-x-0001", rating: 5 }],
      ["setFollow", catalog.setFollow, { orgId: "org-x-0001", follow: true }],
      ["submitOrganizerApplication", identity.submitOrganizerApplication, {}],
    ];
    for (const [name, fn, data] of refused) {
      const d = await details(call(fn, data, ctx));
      expect({ name, code: d.code }).toEqual({ name, code: "ACCOUNT_PAUSED" });
      expect(d.message).toMatch(/^Your account is paused until .* IST\. Contact support to restore booking\.$/);
      expect(d.facts).toEqual({ accountStatus: "paused", until: new Date(until).toISOString() });
      expect(d.nextStep).toMatch(/contact PULSE support/);
    }
    // Same HTTPS status as other permission refusals.
    try {
      await call(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Asha" }, ctx);
    } catch (e) {
      expect((e as { code?: string }).code).toBe("permission-denied");
    }
    // Still allowed.
    expect((await call<{ status: string }>(support.submitSupportRequest, { requestId: rid(), kind: "help", topic: "account", message: "Why is my account paused?" }, ctx)).status).toBe("open");
    expect((await call<{ items: unknown[] }>(getMyAnnouncements, { platform: "android", build: 40 }, ctx)).items).toEqual([]);
    expect(await callCode(catalog.setFollow, { orgId: "org-x-0001", follow: false }, ctx)).toBe("OK");
    expect(await callCode(commerce.leaveEventWaitlist, { requestId: rid(), eventId }, ctx)).not.toMatch(/ACCOUNT_/);
    expect(await callCode(identity.myAccess, {}, ctx)).toBe("OK");
  });

  test("organizer work for their own org is not affected", async () => {
    const uid = await personWithAuth();
    const { orgId } = await world();
    await db().doc(`memberships/${orgId}__${uid}`).set({ orgId, uid, role: "owner", status: "active", permissions: [], eventScope: { all: true, eventIds: [] }, version: 1 });
    await setStatus(uid, "paused");
    expect(await callCode(identity.listStaff, { orgId }, phoneCtx(uid))).toBe("OK");
  });
});

describe("blocked", () => {
  test("Auth disabled + sessions revoked + claim; every callable refuses with ACCOUNT_BLOCKED; no inbox item; holds released, confirmed kept", async () => {
    const uid = await personWithAuth();
    await seedCustomer(uid);
    const { eventId } = await world({ priceMinor: 49_900 });
    const held = await reserve(uid, eventId);
    expect(held.status).toBe("held");
    expect((await db().doc(`events/${eventId}`).get()).get("occupancy.activeReservationHolds")).toBe(1);
    await db().doc("bookings/bkg-confirmed-0001").set({ customerUid: uid, eventId, status: "confirmed", spots: 1 });
    await db().doc("tripDepartures/dep-blk-0001").set({ seatsTaken: 2, roomTaken: { quad: 2 } });
    await db().doc("tripBookings/tb-blk-0001").set({ customerUid: uid, status: "held", departureId: "dep-blk-0001", roomId: "quad", travellers: 2, orgId: "org-x", holdExpiresAt: Timestamp.fromMillis(Date.now() + H) });

    const r = await setStatus(uid, "blocked", { messageToUser: "Your account was suspended after a fraud review." });
    expect(r).toMatchObject({ status: "blocked", authSynced: true });
    const user = await auth().getUser(uid);
    expect(user.disabled).toBe(true);
    expect(user.customClaims).toMatchObject({ acct: "blocked" });
    expect(user.tokensValidAfterTime).toBeDefined();
    expect((await db().collection("userNotifications").where("recipientUid", "==", uid).get()).size).toBe(0);
    expect((await db().doc(`bookings/${held.bookingId}`).get()).get("status")).toBe("expired");
    expect((await db().doc(`events/${eventId}`).get()).get("occupancy.activeReservationHolds")).toBe(0);
    expect((await db().doc("bookings/bkg-confirmed-0001").get()).get("status")).toBe("confirmed");
    expect((await db().doc("tripBookings/tb-blk-0001").get()).get("status")).toBe("expired");
    expect((await db().doc("tripDepartures/dep-blk-0001").get()).get("seatsTaken")).toBe(0);

    // A token minted before the block (no claim): the status doc refuses it.
    const ctx = phoneCtx(uid);
    for (const [fn, data] of [
      [getMyAnnouncements, { platform: "android", build: 40 }],
      [support.submitSupportRequest, { requestId: rid(), kind: "help", topic: "account", message: "Why is my account blocked?" }],
      [identity.myAccess, {}],
      [identity.registerPushToken, { token: "t".repeat(40), platform: "android" }],
      [commerce.confirmPayment, { paymentId: "pay-0001", providerPaymentId: "pay_x1", providerSignature: "a".repeat(64) }],
      [catalog.setFollow, { orgId: "org-x-0001", follow: false }],
    ] as Array<[unknown, unknown]>) {
      const d = await details(call(fn, data, ctx));
      expect(d).toMatchObject({ code: "ACCOUNT_BLOCKED", message: "This account is suspended.", facts: { accountStatus: "blocked" } });
    }
    // A token carrying the claim is refused even with no status doc.
    const stranger = uniq("ghost");
    expect(await callCode(identity.myAccess, {}, { auth: { uid: stranger, token: { phone_number: "+919800000001", acct: "blocked" } } })).toBe("ACCOUNT_BLOCKED");
  });

  test("re-activating re-enables Auth, clears the claim, notifies the person; actions work again", async () => {
    const uid = await personWithAuth();
    await setStatus(uid, "blocked");
    const r = await setStatus(uid, "active", { messageToUser: "Thanks for your patience." });
    expect(r).toMatchObject({ status: "active", until: null, authSynced: true });
    const user = await auth().getUser(uid);
    expect(user.disabled).toBe(false);
    expect(user.customClaims?.acct).toBeUndefined();
    const inbox = (await db().collection("userNotifications").where("recipientUid", "==", uid).get()).docs.map((d) => d.data());
    expect(inbox).toEqual([expect.objectContaining({ kind: "account-status", title: "Your PULSE account is active again", body: "Thanks for your patience." })]);
    expect(await callCode(identity.myAccess, {}, phoneCtx(uid))).toBe("OK");
    expect(((await db().doc(`accountStatusPrivate/${uid}`).get()).get("history") as unknown[]).length).toBe(2);
    // An Auth user disabled for another reason is never re-enabled by PULSE.
    const other = await personWithAuth();
    await auth().updateUser(other, { disabled: true });
    await setStatus(other, "paused");
    await setStatus(other, "active");
    expect((await auth().getUser(other)).disabled).toBe(true);
  });

  test("a person with no Auth user (e.g. deleted) still gets the status doc", async () => {
    const uid = uniq("noauth");
    await db().doc(`users/${uid}`).set({ uid });
    expect(await setStatus(uid, "blocked")).toMatchObject({ status: "blocked", authSynced: true });
    expect((await db().doc(`accountStatus/${uid}`).get()).get("status")).toBe("blocked");
  });
});

describe("until", () => {
  test("a passed `until` reads as active at once; the daily job writes it back and re-enables a block", async () => {
    const paused = await personWithAuth();
    const blocked = await personWithAuth();
    await setStatus(paused, "paused", { until: iso(2 * H) });
    await setStatus(blocked, "blocked", { until: iso(2 * H) });
    expect(await callCode(catalog.setFollow, { orgId: "org-x-0001", follow: true }, phoneCtx(paused))).toBe("ACCOUNT_PAUSED");
    for (const uid of [paused, blocked]) await db().doc(`accountStatus/${uid}`).update({ until: Timestamp.fromMillis(Date.now() - 1000) });
    // Read path: no longer paused/blocked, before the job runs.
    expect(await callCode(catalog.setFollow, { orgId: "org-x-0001", follow: true }, phoneCtx(paused))).not.toMatch(/ACCOUNT_/);
    expect(await callCode(identity.myAccess, {}, phoneCtx(blocked))).toBe("OK");
    const job = await expireAccountStatusesOnce();
    expect(job.steps.expire).toMatchObject({ due: 2, reactivated: 2, authFailed: 0 });
    for (const uid of [paused, blocked]) {
      expect((await db().doc(`accountStatus/${uid}`).get()).data()).toMatchObject({ status: "active", until: null, updatedBy: "system" });
      expect((await auth().getUser(uid)).customClaims?.acct).toBeUndefined();
    }
    expect((await auth().getUser(blocked)).disabled).toBe(false);
    const audits = (await db().collection("auditEvents").where("actorUid", "==", "system").get()).docs.map((d) => d.data());
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({ action: "account.status-changed", after: { status: "active" }, source: "scheduler" });
    expect(await expireStatuses()).toMatchObject({ due: 0, reactivated: 0 });
  });

  test("effectiveAccountStatus and the IST label", () => {
    const past = Timestamp.fromMillis(Date.now() - 1000);
    expect(effectiveAccountStatus({ status: "paused", until: past })).toMatchObject({ status: "active", stored: "paused", expired: true });
    expect(effectiveAccountStatus({ status: "blocked", until: null })).toMatchObject({ status: "blocked", expired: false });
    expect(effectiveAccountStatus(undefined).status).toBe("active");
    expect(istUntilLabel(Timestamp.fromDate(new Date("2026-12-02T12:30:00Z")))).toBe("2 Dec 2026, 6:00 pm IST");
  });
});

describe("searchAccounts", () => {
  test("by phone digits, name prefix (any case) and uid; operators excluded; role, orgs and status included", async () => {
    const asha = await personWithAuth({ phone: "+919876501234", name: "Asha Rao" });
    const ravi = await personWithAuth({ phone: "+919812300000", name: "ravi kumar" });
    await db().doc("organizers/org-sr-0001").set({ name: "Sunrise Treks", status: "active" });
    await db().doc(`memberships/org-sr-0001__${ravi}`).set({ orgId: "org-sr-0001", uid: ravi, status: "active", role: "owner" });
    await db().doc("users/op-0000000000000000001").set({ scope: "platform", phone: "+919876509999" });
    await db().doc("publicProfiles/op-0000000000000000001").set({ displayName: "Asha Operator" });
    await setStatus(asha, "paused", { until: iso(5 * H) });
    const find = async (query: string) => (await call<{ accounts: Array<Record<string, any>> }>(searchAccounts, { query }, ADMIN)).accounts;

    const byPhone = await find("98765");
    expect(byPhone.map((a) => a.uid)).toEqual([asha]);
    expect(byPhone[0]).toMatchObject({ displayName: "Asha Rao", phoneMasked: "+91 ••••• •1234", role: "customer", orgs: [], accountStatus: "paused" });
    expect(typeof byPhone[0]!.accountStatusUntil).toBe("string");
    expect((await find("asha")).map((a) => a.uid)).toEqual([asha]);
    expect((await find("Ravi")).map((a) => a.uid)).toEqual([ravi]);
    expect((await find("ravi"))[0]).toMatchObject({ role: "organizer", orgs: [{ orgId: "org-sr-0001", name: "Sunrise Treks" }], accountStatus: "active", accountStatusUntil: null });
    await db().doc("users/uid-abcdefghijklmnopqrstuv").set({ uid: "uid-abcdefghijklmnopqrstuv" });
    await db().doc("publicProfiles/uid-abcdefghijklmnopqrstuv").set({ displayName: "Zed" });
    expect((await find("uid-abcdefghijklmnopqrstuv")).map((a) => a.uid)).toEqual(["uid-abcdefghijklmnopqrstuv"]);
    expect(await find("zzz-nobody")).toEqual([]);
    expect(await callCode(searchAccounts, { query: "a" }, ADMIN)).toBe("INVALID_INPUT");
    expect(await callCode(searchAccounts, { query: "asha" }, phoneCtx(uniq("c")))).toBe("NOT_PERMITTED");
    expect(maskPhone("+919876501234")).toBe("+91 ••••• •1234");
  });
});

describe("organization status (setMarketplaceEntityStatus)", () => {
  test("the team gets an organization-status inbox item with the message; organizers + publicOrganizers show it", async () => {
    const ORG = uniq("orgst");
    await db().doc(`organizers/${ORG}`).set({ name: "Sunrise Treks", status: "active", version: 0 });
    await db().doc(`publicOrganizers/${ORG}`).set({ name: "Sunrise Treks", handle: "sunrise" });
    for (const [uid, status] of [["owner-st-0001", "active"], ["staff-st-0001", "active"], ["gone-st-0001", "revoked"]]) {
      await db().doc(`memberships/${ORG}__${uid}`).set({ orgId: ORG, uid, status, role: uid.startsWith("owner") ? "owner" : "staff" });
    }
    const change = (status: string, version: number, messageToOrganizer?: string) =>
      call(setMarketplaceEntityStatus, { requestId: rid().replace(/_/g, "-"), entityType: "organizer", entityId: ORG, expectedVersion: version, status, reason: "KYC re-verification pending", ...(messageToOrganizer !== undefined ? { messageToOrganizer } : {}) }, ADMIN);
    await change("paused", 0, "Please upload a fresh PAN card in Account → Verification.");
    expect((await db().doc(`organizers/${ORG}`).get()).data()).toMatchObject({ status: "paused", statusMessage: "Please upload a fresh PAN card in Account → Verification." });
    expect((await db().doc(`publicOrganizers/${ORG}`).get()).data()).toMatchObject({ status: "paused", statusMessage: "Please upload a fresh PAN card in Account → Verification.", handle: "sunrise" });
    const inbox = await db().collection("userNotifications").where("kind", "==", "organization-status").get();
    expect(inbox.docs.map((d) => d.get("recipientUid")).sort()).toEqual(["owner-st-0001", "staff-st-0001"]);
    expect(inbox.docs[0]!.data()).toMatchObject({ title: "Sunrise Treks is paused by PULSE", body: "Please upload a fresh PAN card in Account → Verification.", link: { type: "organizer", id: ORG } });
    const audit = (await db().collection("auditEvents").where("resourceId", "==", ORG).get()).docs[0]!.data();
    expect(audit.after).toMatchObject({ status: "paused", messageToOrganizer: "Please upload a fresh PAN card in Account → Verification." });

    await change("active", 1);
    expect((await db().doc(`publicOrganizers/${ORG}`).get()).data()).toMatchObject({ status: "active", statusMessage: null });
    const back = (await db().collection("userNotifications").where("kind", "==", "organization-status").get()).docs.map((d) => d.data()).filter((d) => d.title.includes("active again"));
    expect(back).toHaveLength(2);
    expect(back[0]!.body).toBe("You can host and submit new listings again.");
    expect(await callCode(setMarketplaceEntityStatus, { requestId: rid().replace(/_/g, "-"), entityType: "organizer", entityId: ORG, expectedVersion: 2, status: "blocked", reason: "KYC re-verification failed", messageToOrganizer: "x".repeat(501) }, ADMIN)).toBe("INVALID_INPUT");
  });

  test("an organizer without a public profile is still paused (nothing created)", async () => {
    const ORG = uniq("orgnp");
    await db().doc(`organizers/${ORG}`).set({ name: "No Public", status: "active", version: 0 });
    await call(setMarketplaceEntityStatus, { requestId: rid().replace(/_/g, "-"), entityType: "organizer", entityId: ORG, expectedVersion: 0, status: "blocked", reason: "Fraud review outcome" }, ADMIN);
    expect((await db().doc(`organizers/${ORG}`).get()).get("status")).toBe("blocked");
    expect((await db().doc(`publicOrganizers/${ORG}`).get()).exists).toBe(false);
  });
});
