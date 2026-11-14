/**
 * Launch gates (2026-11-14): organizer payout accounts and KYC documents.
 *
 * Payouts: only the owner sets them; the full number is never stored in the
 * readable doc, the audit trail or the receipt; ops verify by hand; a
 * settlement can only be paid to a verified account; only a platform owner
 * can reveal the full details, and that is audited.
 *
 * KYC: an upload is recorded only for the caller's own Storage folder, with
 * an allowed type and size; an organizer-kyc case can't be approved until the
 * required documents are on record.
 */
import { call, callCode, callErr, phoneCtx, adminCtx, uniq, rid, db, Timestamp, commerce } from "./commerce-helpers";
import * as identity from "../src/identity";
import { decideCase } from "../src/governance/callables";
import { decryptDetails, encryptDetails, maskUpi } from "../src/commerce/payoutAccounts";
import { setKycStorageStatForTests } from "../src/identity/kycDocuments";

async function seedOwner(orgId: string, owner: string, staff?: string) {
  await db().doc(`organizers/${orgId}`).set({ status: "active", displayName: "Trail Co", ownerUid: owner, version: 1 });
  await db().doc(`memberships/${orgId}__${owner}`).set({
    orgId, uid: owner, role: "owner", status: "active", permissions: [], eventScope: { all: true, eventIds: [] }, version: 1,
  });
  if (staff) {
    await db().doc(`memberships/${orgId}__${staff}`).set({
      orgId, uid: staff, role: "staff", status: "active", permissions: ["payments.view"], eventScope: { all: true, eventIds: [] }, version: 1,
    });
  }
}

const bank = (orgId: string, over: Record<string, unknown> = {}) => ({
  requestId: rid(), orgId, method: "bank", holderName: "Ravi Kumar", accountNumber: "1234 5678 9012", ifsc: "hdfc0001234", ...over,
});

describe("payout accounts", () => {
  test("the owner adds a bank account: masked, pending, encrypted; nothing readable holds the full number", async () => {
    const orgId = uniq("org-pay");
    const owner = uniq("owner");
    await seedOwner(orgId, owner);
    const r = await call<{ status: string; masked: string }>(commerce.setPayoutAccount, bank(orgId), phoneCtx(owner));
    expect(r).toMatchObject({ status: "pending-verification", masked: "•••• 9012" });

    const acct = (await db().doc(`payoutAccounts/${orgId}`).get()).data()!;
    expect(acct).toMatchObject({ method: "bank", holderName: "Ravi Kumar", ifsc: "HDFC0001234", status: "pending-verification", version: 0 });
    const secret = (await db().doc(`payoutSecrets/${orgId}`).get()).data()!;
    expect(decryptDetails(orgId, secret as never)).toEqual({ accountNumber: "123456789012" });

    // Neither the projection, the encrypted doc, the audit trail nor the receipt holds the number in clear.
    const audits = await db().collection("auditEvents").where("resourceId", "==", orgId).get();
    const receipts = await db().collection("commandReceipts").where("actorUid", "==", owner).get();
    const everything = JSON.stringify([acct, secret, audits.docs.map((d) => d.data()), receipts.docs.map((d) => d.data())]);
    expect(everything).not.toContain("123456789012");
    expect(audits.docs.map((d) => d.data().action)).toContain("payout.account-submitted");
  });

  test("UPI: validated and masked", async () => {
    const orgId = uniq("org-pay");
    const owner = uniq("owner");
    await seedOwner(orgId, owner);
    const r = await call<{ masked: string }>(commerce.setPayoutAccount, { requestId: rid(), orgId, method: "upi", holderName: "Ravi Kumar", upiId: " Ravi.K@OKHDFCBANK " }, phoneCtx(owner));
    expect(r.masked).toBe("ra•••@okhdfcbank");
    expect(maskUpi("ab@ybl")).toBe("ab•••@ybl");
    expect((await callErr(commerce.setPayoutAccount, { requestId: rid(), orgId, method: "upi", holderName: "Ravi Kumar", upiId: "not-a-upi" }, phoneCtx(owner))).message).toMatch(/UPI ID/);
  });

  test("bad input is refused naming the field; staff and strangers can't set it", async () => {
    const orgId = uniq("org-pay");
    const owner = uniq("owner");
    const staff = uniq("staff");
    await seedOwner(orgId, owner, staff);
    expect((await callErr(commerce.setPayoutAccount, bank(orgId, { ifsc: "HDFC123" }), phoneCtx(owner))).message).toMatch(/IFSC/);
    expect((await callErr(commerce.setPayoutAccount, bank(orgId, { accountNumber: "12ab" }), phoneCtx(owner))).message).toMatch(/account number/);
    expect((await callErr(commerce.setPayoutAccount, bank(orgId, { holderName: "R" }), phoneCtx(owner))).message).toMatch(/holder/);
    expect(await callCode(commerce.setPayoutAccount, bank(orgId), phoneCtx(staff))).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.setPayoutAccount, bank(orgId), phoneCtx(uniq("stranger")))).toBe("NOT_PERMITTED");
    expect((await db().doc(`payoutAccounts/${orgId}`).get()).exists).toBe(false);
  });

  test("ops verify on the current version; a change returns it to pending; a rejection needs a reason and tells the owner", async () => {
    const orgId = uniq("org-pay");
    const owner = uniq("owner");
    await seedOwner(orgId, owner);
    await call(commerce.setPayoutAccount, bank(orgId), phoneCtx(owner));
    const decide = (outcome: string, expectedVersion: number, note = "", who = "admin-a") =>
      call<{ status: string }>(commerce.decidePayoutAccount, { requestId: rid(), orgId, expectedVersion, outcome, note }, adminCtx(who));

    expect(await callCode(commerce.decidePayoutAccount, { requestId: rid(), orgId, expectedVersion: 0, outcome: "verified", note: "" }, phoneCtx(owner))).not.toBe("OK");
    expect((await decide("verified", 0, "Matched cancelled cheque")).status).toBe("verified");
    expect(await callCode(commerce.decidePayoutAccount, { requestId: rid(), orgId, expectedVersion: 0, outcome: "verified", note: "" }, adminCtx("admin-a"))).toBe("PRECONDITION");

    // A new account: pending again, version 1; a decision against version 0 conflicts.
    await call(commerce.setPayoutAccount, bank(orgId, { accountNumber: "999988887777" }), phoneCtx(owner));
    expect((await db().doc(`payoutAccounts/${orgId}`).get()).data()).toMatchObject({ status: "pending-verification", version: 1, masked: "•••• 7777" });
    expect(await callCode(commerce.decidePayoutAccount, { requestId: rid(), orgId, expectedVersion: 0, outcome: "verified", note: "" }, adminCtx("admin-a"))).toBe("CONFLICT");
    expect(await callCode(commerce.decidePayoutAccount, { requestId: rid(), orgId, expectedVersion: 1, outcome: "rejected", note: "" }, adminCtx("admin-a"))).toBe("INVALID_INPUT");
    expect((await decide("rejected", 1, "Name doesn't match the PAN")).status).toBe("rejected");

    const notes = await db().collection("userNotifications").where("recipientUid", "==", owner).get();
    const bodies = notes.docs.map((d) => d.data()).filter((n) => n.kind === "payout-account").map((n) => n.body);
    expect(bodies).toEqual(expect.arrayContaining([expect.stringContaining("•••• 9012"), expect.stringContaining("Name doesn't match the PAN")]));
  });

  test("a settlement can only be marked paid to a verified account, and records where it went", async () => {
    const orgId = uniq("org-pay");
    const owner = uniq("owner");
    await seedOwner(orgId, owner);
    const settlementId = `stl_${orgId}_x`;
    await db().doc(`settlements/${settlementId}`).set({
      orgId, status: "approved", netMinor: 10_000, grossMinor: 12_000, approvedBy: "admin-a", updatedAt: Timestamp.now(),
    });
    const markPaid = () => call(commerce.decideSettlement, { requestId: rid(), settlementId, action: "mark-paid", note: "paid", payoutReference: "UTR778899" }, adminCtx("admin-a"));
    expect((await callErr(commerce.decideSettlement, { requestId: rid(), settlementId, action: "mark-paid", note: "paid", payoutReference: "UTR778899" }, adminCtx("admin-a"))).message).toMatch(/no verified payout account/);

    await call(commerce.setPayoutAccount, bank(orgId), phoneCtx(owner));
    expect((await callErr(commerce.decideSettlement, { requestId: rid(), settlementId, action: "mark-paid", note: "paid", payoutReference: "UTR778899" }, adminCtx("admin-a"))).message).toMatch(/no verified payout account/);
    await call(commerce.decidePayoutAccount, { requestId: rid(), orgId, expectedVersion: 0, outcome: "verified", note: "" }, adminCtx("admin-b"));
    await markPaid();
    expect((await db().doc(`settlements/${settlementId}`).get()).data()).toMatchObject({
      status: "paid", paidTo: { method: "bank", masked: "•••• 9012", holderName: "Ravi Kumar", accountVersion: 0 },
    });
  });

  test("only a platform owner can reveal the full details, with a reason, and it is audited", async () => {
    const orgId = uniq("org-pay");
    const owner = uniq("owner");
    await seedOwner(orgId, owner);
    await call(commerce.setPayoutAccount, bank(orgId), phoneCtx(owner));
    expect(await callCode(commerce.revealPayoutAccount, { orgId, reason: "Paying settlement" }, adminCtx("admin-a"))).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.revealPayoutAccount, { orgId, reason: "x" }, adminCtx("owner-1", "platform-owner"))).toBe("INVALID_INPUT");
    const full = await call<{ accountNumber: string; ifsc: string }>(commerce.revealPayoutAccount, { orgId, reason: "Paying settlement W46" }, adminCtx("owner-1", "platform-owner"));
    expect(full).toMatchObject({ accountNumber: "123456789012", ifsc: "HDFC0001234", upiId: null });
    const audits = await db().collection("auditEvents").where("resourceId", "==", orgId).where("action", "==", "payout.account-revealed").get();
    expect(audits.size).toBe(1);
    expect(audits.docs[0]!.data()).toMatchObject({ actorUid: "owner-1", reason: "Paying settlement W46" });
    expect(JSON.stringify(audits.docs[0]!.data())).not.toContain("123456789012");
  });

  test("a ciphertext is bound to its organizer", () => {
    const box = encryptDetails("org-a", { accountNumber: "111122223333" });
    expect(decryptDetails("org-a", box)).toEqual({ accountNumber: "111122223333" });
    expect(() => decryptDetails("org-b", box)).toThrow();
  });
});

describe("KYC documents", () => {
  const objects = new Map<string, { contentType: string; size: number }>();
  beforeAll(() => setKycStorageStatForTests(async (p) => objects.get(p) ?? null));
  afterAll(() => setKycStorageStatForTests(null));

  const attach = (uid: string, slot: string, path: string) =>
    call<{ slot: string; replayed: boolean }>(identity.attachKycDocument, { requestId: rid(), slot, path }, phoneCtx(uid));

  test("records the caller's own upload; refuses other folders, mismatched slots, missing files, bad types and sizes", async () => {
    const uid = uniq("applicant");
    const path = `kyc/${uid}/pan-a1b2c3d4.pdf`;
    objects.set(path, { contentType: "application/pdf", size: 200_000 });
    expect((await attach(uid, "pan", path)).slot).toBe("pan");
    const rec = (await db().doc(`kycDocuments/${uid}`).get()).data()!;
    expect(rec.documents.pan).toMatchObject({ path, contentType: "application/pdf", size: 200_000 });

    const other = uniq("other");
    expect(await callCode(identity.attachKycDocument, { requestId: rid(), slot: "pan", path }, phoneCtx(other))).toBe("NOT_PERMITTED");
    expect(await callCode(identity.attachKycDocument, { requestId: rid(), slot: "id", path }, phoneCtx(uid))).toBe("NOT_PERMITTED");
    expect(await callCode(identity.attachKycDocument, { requestId: rid(), slot: "id", path: `kyc/${uid}/id-zzzzzzzz.pdf` }, phoneCtx(uid))).toBe("PRECONDITION");
    objects.set(`kyc/${uid}/id-gif00001.png`, { contentType: "image/gif", size: 10 });
    expect(await callCode(identity.attachKycDocument, { requestId: rid(), slot: "id", path: `kyc/${uid}/id-gif00001.png` }, phoneCtx(uid))).toBe("INVALID_INPUT");
    objects.set(`kyc/${uid}/id-huge0001.pdf`, { contentType: "application/pdf", size: 11 * 1024 * 1024 });
    expect(await callCode(identity.attachKycDocument, { requestId: rid(), slot: "id", path: `kyc/${uid}/id-huge0001.pdf` }, phoneCtx(uid))).toBe("INVALID_INPUT");

    // A replacement keeps the old file in the history.
    const next = `kyc/${uid}/pan-e5f6g7h8.jpg`;
    objects.set(next, { contentType: "image/jpeg", size: 90_000 });
    await attach(uid, "pan", next);
    const after = (await db().doc(`kycDocuments/${uid}`).get()).data()!;
    expect(after.documents.pan.path).toBe(next);
    expect(after.history.map((h: { path: string }) => h.path)).toEqual([path]);
  });

  test("an organizer-kyc case is approved only once the required documents are on record", async () => {
    const uid = uniq("applicant");
    await call(identity.submitOrganizerApplication, {
      requestId: rid(), kind: "business", displayName: "Deccan Trails", legalName: "Deccan Trails LLP", city: "Pune",
      categories: ["trekking"], about: "Weekend treks for small groups around Pune.", contactEmail: "hi@deccan.example",
    }, phoneCtx(uid));
    const caseId = `organizer-kyc_${uid}`;
    const approve = () => callErr(decideCase, { requestId: rid(), caseId, expectedVersion: 0, outcome: "approved", note: "" }, adminCtx("admin-a"));

    expect((await approve()).message).toMatch(/Government photo ID, PAN, GST registration/);
    for (const slot of ["id", "pan"]) {
      const p = `kyc/${uid}/${slot}-doc00001.pdf`;
      objects.set(p, { contentType: "application/pdf", size: 5000 });
      await attach(uid, slot, p);
    }
    expect((await approve()).message).toMatch(/GST registration/); // business: GST too
    const gst = `kyc/${uid}/gst-doc00001.pdf`;
    objects.set(gst, { contentType: "application/pdf", size: 5000 });
    await attach(uid, "gst", gst);
    const ok = await call<{ status: string }>(decideCase, { requestId: rid(), caseId, expectedVersion: 0, outcome: "approved", note: "" }, adminCtx("admin-a"));
    expect(ok.status).toBe("approved");
  });
});
