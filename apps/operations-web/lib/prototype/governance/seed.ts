import type { GovernanceCollectionName, GovernanceDoc } from "../entities";

const T0 = "2026-09-24T09:30:00.000Z";

function doc(collection: GovernanceCollectionName, id: string, data: Record<string, unknown>, at = T0): GovernanceDoc {
  return { collection, id, version: 0, data, createdAt: at, updatedAt: at };
}

/** Marketplace governance sample data. Mirrors firebase/functions/scripts/seed-governance-emulator.mjs. */
export const SEED_GOVERNANCE: GovernanceDoc[] = [
  /* organizers */
  doc("organizers", "organizer-sridhar", { name: "Sridhar Events", status: "under-review", location: "Rajahmundry, Andhra Pradesh", commissionBps: 1000, contactEmail: "ops@sridharevents.in", summary: "KYC verification in progress", pan: "AAXPS1234K", gst: "37AAXPS1234K1Z5" }),
  doc("organizers", "organizer-vibelive", { name: "VibeLive Entertainment", status: "active", location: "Hyderabad, Telangana", commissionBps: 1200, contactEmail: "partners@vibelive.in", summary: "Verified organizer · 38 events delivered" }),
  doc("organizers", "organizer-starbeat", { name: "StarBeat Live", status: "active", location: "Vijayawada, Andhra Pradesh", commissionBps: 1000, contactEmail: "hello@starbeat.live", summary: "Verified organizer · reduced commission approved" }),
  doc("organizers", "organizer-neon", { name: "Neon Nights", status: "paused", location: "Rajahmundry, Andhra Pradesh", commissionBps: 1200, contactEmail: "team@neonnights.co", summary: "Paused pending fraud investigation", statusReason: "Refund spike and payout-account change under review" }),
  doc("organizers", "organizer-courtside", { name: "Courtside Collective", status: "active", location: "Bengaluru, Karnataka", commissionBps: 1100, contactEmail: "run@courtside.club", summary: "Sports leagues and weekend tournaments" }),

  /* arenas */
  doc("arenas", "arena-godavari", { name: "Godavari Indoor Stadium", organizerName: "Sridhar Events", status: "under-review", location: "Rajahmundry, Andhra Pradesh", displayValue: "8,000 capacity", summary: "Fire NOC pending" }),
  doc("arenas", "arena-riverfront", { name: "Riverfront Grounds", organizerName: "StarBeat Live", status: "active", location: "Vijayawada, Andhra Pradesh", displayValue: "5,500 capacity", summary: "Verified · reinspection due Mar 2027" }),
  doc("arenas", "arena-hitech", { name: "HITEC Arena Hall 3", organizerName: "VibeLive Entertainment", status: "active", location: "Hyderabad, Telangana", displayValue: "2,200 capacity", summary: "Verified · insurance valid to Jun 2027" }),
  doc("arenas", "arena-koramangala", { name: "Koramangala Sports Hub", organizerName: "Courtside Collective", status: "paused", location: "Bengaluru, Karnataka", displayValue: "600 capacity", summary: "Bookings paused after layout change", statusReason: "Reinspection required after court layout change" }),

  /* events */
  doc("events", "event-godavari-2026", { name: "Godavari Music Festival 2026", organizerName: "Sridhar Events", status: "under-review", location: "Rajahmundry", projectedGmvMinor: 280000000, currency: "INR", summary: "Arena approval dependency" }),
  doc("events", "event-hyd-comedy", { name: "Hyderabad Comedy Night", organizerName: "VibeLive Entertainment", status: "active", location: "Hyderabad", projectedGmvMinor: 46000000, currency: "INR", summary: "Published · 71% sold" }),
  doc("events", "event-vja-marathon", { name: "Vijayawada City Run", organizerName: "StarBeat Live", status: "active", location: "Vijayawada", projectedGmvMinor: 92000000, currency: "INR", summary: "Published · registrations open" }),
  doc("events", "event-neon-rave", { name: "Neon Rave Saturday", organizerName: "Neon Nights", status: "paused", location: "Rajahmundry", projectedGmvMinor: 32480000, currency: "INR", summary: "Ticket sales paused during fraud review" }),

  /* commercial agreements */
  doc("commercialAgreements", "commercial-sridhar-v1", { name: "Sridhar Events terms", organizerName: "Sridhar Events", status: "pending", commissionBps: 1000, summary: "New-organizer commercial terms", effectiveFrom: "1 Oct 2026" }),
  doc("commercialAgreements", "commercial-vibelive-v3", { name: "VibeLive Entertainment terms v3", organizerName: "VibeLive Entertainment", status: "pending", commissionBps: 800, summary: "Reduced commission requested (standard 12%)", effectiveFrom: "1 Nov 2026" }),
  doc("commercialAgreements", "commercial-starbeat-v2", { name: "StarBeat Live terms v2", organizerName: "StarBeat Live", status: "approved", commissionBps: 1000, summary: "12% → 10% approved on volume", effectiveFrom: "1 Sep 2026" }),

  /* risk alerts */
  doc("riskAlerts", "risk-neon-cluster", { name: "Neon Nights device cluster", organizerName: "Neon Nights", status: "under-review", location: "Rajahmundry", exposureMinor: 32480000, currency: "INR", summary: "Repeated fingerprints and payout changes" }),
  doc("riskAlerts", "risk-vja-chargebacks", { name: "Chargeback spike · City Run", organizerName: "StarBeat Live", status: "under-review", location: "Vijayawada", exposureMinor: 1840000, currency: "INR", summary: "6 chargebacks in 24 hours" }),

  /* refund cases */
  doc("refundCases", "refund-midnight", { name: "Midnight Pulse cancellation", organizerName: "Neon Nights", status: "pending", amountMinor: 11820000, currency: "INR", summary: "42 full-refund authorizations awaiting approval" }),
  doc("refundCases", "refund-comedy-partial", { name: "Comedy Night seat downgrade", organizerName: "VibeLive Entertainment", status: "approved", amountMinor: 640000, currency: "INR", summary: "Partial refunds for 16 customers" }),

  /* settlements */
  doc("settlementControls", "settlement-neon", { name: "Neon Nights settlement", organizerName: "Neon Nights", status: "held", amountMinor: 32480000, currency: "INR", summary: "Release blocked by active fraud review" }),
  doc("settlementControls", "settlement-vibelive-w39", { name: "VibeLive week 39 payout", organizerName: "VibeLive Entertainment", status: "pending", amountMinor: 128450000, currency: "INR", summary: "Reconciled · awaiting release approval" }),
  doc("settlementControls", "settlement-starbeat-w38", { name: "StarBeat week 38 payout", organizerName: "StarBeat Live", status: "approved-for-release", amountMinor: 64210000, currency: "INR", summary: "Released to bank on 25 Sep" }),

  /* policies */
  doc("policyVersions", "policy-kyc-2", { name: "Organizer KYC v2.0", status: "published", effectiveFrom: "1 Oct 2026", summary: "PAN, GST, director and beneficiary verification" }),
  doc("policyVersions", "policy-arena-3-2", { name: "Arena safety checklist v3.2", status: "published", effectiveFrom: "26 Sep 2026", summary: "Fire safety and crowd-management requirements" }),
  doc("policyVersions", "policy-refund-4-1", { name: "Cancellation refund policy v4.1", status: "published", effectiveFrom: "18 Sep 2026", summary: "Customer timelines for organizer cancellations" }),

  /* customers (aggregated cohorts only — no identity data) */
  doc("customers", "customer-cohort-rjy", { name: "Rajahmundry active customers", status: "active", displayValue: "1,842 customers", summary: "Aggregated cohort; no sensitive identity data" }),
  doc("customers", "customer-cohort-hyd", { name: "Hyderabad active customers", status: "active", displayValue: "6,315 customers", summary: "Repeat rate 41% · complaint rate 0.6%" }),
  doc("customers", "customer-cohort-vja", { name: "Vijayawada active customers", status: "active", displayValue: "2,108 customers", summary: "Chargeback watch after City Run spike" }),

  /* decision queue */
  doc("governanceCases", "case-organizer-sridhar", { subject: "Sridhar Events", kind: "organizer-kyc", targetId: "organizer-sridhar", status: "pending", location: "Rajahmundry", displayValue: "10% proposed", summary: "New organizer marketplace-access request", policyVersion: "KYC-2.0", risk: "medium", submittedAt: "2026-09-28T06:10:00.000Z", checks: [{ label: "PAN and GST match", status: "passed" }, { label: "Bank beneficiary match", status: "passed" }, { label: "Director verification", status: "pending" }, { label: "Registered-address proof", status: "pending" }] }),
  doc("governanceCases", "case-arena-godavari", { subject: "Godavari Indoor Stadium", kind: "arena-verification", targetId: "arena-godavari", status: "under-review", location: "Rajahmundry", displayValue: "8,000 capacity", summary: "Fire NOC and capacity evidence require review", policyVersion: "ARENA-3.2", risk: "medium", submittedAt: "2026-09-27T10:40:00.000Z", checks: [{ label: "Ownership / lease proof", status: "passed" }, { label: "Geo-location verified", status: "passed" }, { label: "Fire NOC", status: "pending" }, { label: "Capacity certificate", status: "flagged" }] }),
  doc("governanceCases", "case-event-godavari", { subject: "Godavari Music Festival 2026", kind: "event-approval", targetId: "event-godavari-2026", status: "pending", location: "Rajahmundry", projectedGmvMinor: 280000000, currency: "INR", summary: "Event terms and arena readiness review", policyVersion: "EVENT-4.1", risk: "low", submittedAt: "2026-09-28T08:00:00.000Z", checks: [{ label: "Approved arena", status: "pending" }, { label: "Pricing within policy", status: "passed" }, { label: "Cancellation terms", status: "passed" }, { label: "Event insurance", status: "passed" }] }),
  doc("governanceCases", "case-commission-vibelive", { subject: "VibeLive Entertainment", kind: "commission-proposal", targetId: "commercial-vibelive-v3", status: "pending", location: "Hyderabad", displayValue: "8% vs 12% standard", summary: "Reduced commission on projected ₹40L monthly GMV", policyVersion: "COMM-1.3", risk: "medium", submittedAt: "2026-09-26T12:00:00.000Z", checks: [{ label: "Volume threshold", status: "passed" }, { label: "Refund rate under 2%", status: "passed" }, { label: "Finance margin review", status: "pending" }] }),
  doc("governanceCases", "case-fraud-neon", { subject: "Neon Nights", kind: "fraud-alert", targetId: "risk-neon-cluster", status: "under-review", location: "Rajahmundry", exposureMinor: 32480000, currency: "INR", summary: "Refund spike, repeated device fingerprints and payout-account change", policyVersion: "RISK-2.0", risk: "high", submittedAt: "2026-09-28T11:20:00.000Z", checks: [{ label: "Settlement hold active", status: "passed" }, { label: "Device cluster review", status: "flagged" }, { label: "Organizer response", status: "pending" }] }),
  doc("governanceCases", "case-refund-midnight", { subject: "Midnight Pulse cancellation", kind: "refund-exception", targetId: "refund-midnight", status: "pending", location: "Rajahmundry", amountMinor: 11820000, currency: "INR", summary: "Bulk refund for organizer-cancelled event", policyVersion: "REFUND-4.1", risk: "medium", submittedAt: "2026-09-29T04:00:00.000Z", checks: [{ label: "Cancellation confirmed", status: "passed" }, { label: "Funds available", status: "pending" }] }),
  doc("governanceCases", "case-settlement-vibelive", { subject: "VibeLive week 39 payout", kind: "settlement-release", targetId: "settlement-vibelive-w39", status: "pending", location: "Hyderabad", amountMinor: 128450000, currency: "INR", summary: "Reconciled settlement awaiting release", policyVersion: "SETTLE-1.2", risk: "low", submittedAt: "2026-09-29T05:30:00.000Z", checks: [{ label: "Reconciliation matched", status: "passed" }, { label: "No open fraud alerts", status: "passed" }] }),

  /* audit trail */
  doc("auditEvents", "audit-seed-1", { action: "governance.entity-status-changed", subject: "Neon Nights paused", summary: "Refund spike and payout-account change under review", actorName: "Meera Krishnan", actorRoleId: "super-admin", entityType: "organizer", entityId: "organizer-neon", at: "2026-09-28T11:24:00.000Z" }, "2026-09-28T11:24:00.000Z"),
  doc("auditEvents", "audit-seed-2", { action: "governance.case-decided", subject: "Riverfront Grounds approved", summary: "All arena evidence verified", actorName: "Aditya Rao", actorRoleId: "platform-owner", entityType: "arena", entityId: "arena-riverfront", at: "2026-09-27T08:41:00.000Z" }, "2026-09-27T08:41:00.000Z"),
  doc("auditEvents", "audit-seed-3", { action: "governance.case-decided", subject: "StarBeat Live commission 12% → 10% approved", summary: "Volume threshold met; finance margin review passed", actorName: "Ishaan Gupta", actorRoleId: "finance", entityType: "commercial", entityId: "commercial-starbeat-v2", at: "2026-09-25T05:33:00.000Z" }, "2026-09-25T05:33:00.000Z"),
];
