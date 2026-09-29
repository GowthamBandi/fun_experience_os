import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Refusing to seed without both Firestore and Auth emulator hosts.");
}
const projectId = "demo-experience-os";
const app = initializeApp({ projectId });
const auth = getAuth(app);
const firestore = getFirestore(app);
const email = "admin@experience.local";
const password = "Local-Admin-Only-2026!";
let user;
try { user = await auth.getUserByEmail(email); }
catch { user = await auth.createUser({ email, password, emailVerified: true, displayName: "Aditya Rao" }); }
await auth.setCustomUserClaims(user.uid, { roleId: "platform-owner", disabled: false });

const now = Timestamp.now();
const batch = firestore.batch();
const put = (collection, id, data) => batch.set(firestore.collection(collection).doc(id), { ...data, version: data.version ?? 0, createdAt: now, updatedAt: now });
put("users", user.uid, { uid: user.uid, displayName: "Aditya Rao", email, roleId: "platform-owner", scope: "platform", status: "active", territoryIds: [] });
put("organizers", "organizer-sridhar", { name: "Sridhar Events", subject: "Sridhar Events", status: "under-review", location: "Rajahmundry, Andhra Pradesh", commissionBps: 1000, summary: "KYC verification in progress" });
put("arenas", "arena-godavari", { name: "Godavari Indoor Stadium", status: "under-review", location: "Rajahmundry, Andhra Pradesh", displayValue: "8,000 capacity", summary: "Fire NOC pending" });
put("events", "event-godavari-2026", { name: "Godavari Music Festival 2026", organizerName: "Sridhar Events", status: "under-review", location: "Rajahmundry", projectedGmvMinor: 280000000, currency: "INR", summary: "Arena approval dependency" });
put("riskAlerts", "risk-neon-cluster", { name: "Neon Nights device cluster", status: "on-hold", location: "Rajahmundry", exposureMinor: 32480000, currency: "INR", summary: "Repeated fingerprints and payout changes" });
put("refundCases", "refund-midnight", { name: "Midnight Pulse cancellation", status: "pending", amountMinor: 11820000, currency: "INR", summary: "42 full-refund authorizations; execution disconnected" });
put("settlementControls", "settlement-neon", { name: "Neon Nights settlement", status: "held", amountMinor: 32480000, currency: "INR", summary: "Release blocked by active fraud review" });
put("commercialAgreements", "commercial-sridhar-v1", { name: "Sridhar Events terms", status: "pending", commissionBps: 1000, summary: "New-organizer commercial terms" });
put("policyVersions", "policy-kyc-2", { name: "Organizer KYC v2.0", status: "published", effectiveFrom: "1 Oct 2026", summary: "PAN, GST, director and beneficiary verification" });
put("customers", "customer-cohort-rjy", { name: "Rajahmundry active customers", status: "active", displayValue: "1,842 customers", summary: "Aggregated operational cohort; no sensitive identity data" });
put("governanceCases", "case-organizer-sridhar", { subject: "Sridhar Events", kind: "organizer-kyc", targetId: "organizer-sridhar", status: "pending", location: "Rajahmundry", displayValue: "10% proposed", summary: "New organizer marketplace-access request", policyVersion: "KYC-2.0", risk: "medium" });
put("governanceCases", "case-arena-godavari", { subject: "Godavari Indoor Stadium", kind: "arena-verification", targetId: "arena-godavari", status: "under-review", location: "Rajahmundry", displayValue: "8,000 capacity", summary: "Fire NOC and capacity evidence require review", policyVersion: "ARENA-3.2", risk: "medium" });
put("governanceCases", "case-event-godavari", { subject: "Godavari Music Festival 2026", kind: "event-approval", targetId: "event-godavari-2026", status: "pending", location: "Rajahmundry", projectedGmvMinor: 280000000, currency: "INR", summary: "Event terms and arena readiness review", policyVersion: "EVENT-4.1", risk: "low" });
await batch.commit();
console.log(`Seeded governance emulator. Sign in with ${email} / ${password}`);
