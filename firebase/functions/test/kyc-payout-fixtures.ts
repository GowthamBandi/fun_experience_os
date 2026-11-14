/**
 * Fixtures for the two launch gates added on 2026-11-14:
 * - an organizer-kyc case is approved only with the required documents on
 *   record (kycDocuments/{uid});
 * - a settlement is marked paid only to a verified payout account.
 * Tests that exercise other behaviour seed both as already satisfied.
 */
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../src/platform/firestore";

const getFirestore = () => db();

export async function seedKycDocuments(uid: string): Promise<void> {
  const at = Timestamp.now();
  const entry = (slot: string) => ({ path: `kyc/${uid}/${slot}-fixture01.pdf`, contentType: "application/pdf", size: 1024, uploadedAt: at });
  await getFirestore().doc(`kycDocuments/${uid}`).set({
    uid, documents: { id: entry("id"), pan: entry("pan"), gst: entry("gst") }, history: [], updatedAt: at,
  });
}

/** Seeds the applicant's documents when [caseId] is an organizer-kyc case. */
export async function seedKycForCase(caseId: string): Promise<void> {
  const c = (await getFirestore().doc(`governanceCases/${caseId}`).get()).data();
  if (c?.kind === "organizer-kyc" && typeof c.targetId === "string") await seedKycDocuments(c.targetId);
}

export async function seedVerifiedPayout(orgId: string): Promise<void> {
  const at = Timestamp.now();
  await getFirestore().doc(`payoutAccounts/${orgId}`).set({
    orgId, method: "bank", holderName: "Fixture Holder", masked: "•••• 6789", ifsc: "HDFC0001234", status: "verified", note: null,
    submittedBy: "fixture", submittedAt: at, decidedBy: "admin-fixture", decidedAt: at, version: 0, updatedAt: at,
  });
}

/** Seeds a verified payout account for the organizer a settlement belongs to. */
export async function seedPayoutForSettlement(settlementId: string | null): Promise<void> {
  if (!settlementId) return;
  const s = (await getFirestore().doc(`settlements/${settlementId}`).get()).data();
  if (typeof s?.orgId === "string") await seedVerifiedPayout(s.orgId);
}
