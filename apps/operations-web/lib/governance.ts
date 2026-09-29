export type GovernanceRisk = "low" | "medium" | "high";

export type DecisionKind =
  | "Organizer KYC"
  | "Arena verification"
  | "Event approval"
  | "Commission proposal"
  | "Fraud alert"
  | "Refund exception"
  | "Settlement release";

export interface GovernanceDecision {
  id: string;
  kind: DecisionKind;
  subject: string;
  location: string;
  submittedAt: string;
  sla: string;
  overdue: boolean;
  risk: GovernanceRisk;
  contextLabel: string;
  contextValue: string;
  evidenceComplete: number;
  evidenceTotal: number;
  summary: string;
  checks: Array<{ label: string; status: "passed" | "pending" | "flagged" }>;
}

export const governanceDecisions: GovernanceDecision[] = [
  {
    id: "ORG-2026-1178",
    kind: "Organizer KYC",
    subject: "Sridhar Events",
    location: "Rajahmundry, Andhra Pradesh",
    submittedAt: "28 Sep 2026",
    sla: "16h",
    overdue: true,
    risk: "medium",
    contextLabel: "Est. 90-day GMV",
    contextValue: "₹12,50,000",
    evidenceComplete: 3,
    evidenceTotal: 5,
    summary: "New organizer requesting marketplace access for sports and cultural events in Rajahmundry.",
    checks: [
      { label: "PAN and GST match", status: "passed" },
      { label: "Bank beneficiary match", status: "passed" },
      { label: "Director verification", status: "pending" },
      { label: "Registered-address proof", status: "pending" },
    ],
  },
  {
    id: "ARENA-2026-0432",
    kind: "Arena verification",
    subject: "Godavari Indoor Stadium",
    location: "Rajahmundry, Andhra Pradesh",
    submittedAt: "27 Sep 2026",
    sla: "1d 4h",
    overdue: true,
    risk: "medium",
    contextLabel: "Declared capacity",
    contextValue: "8,000 guests",
    evidenceComplete: 4,
    evidenceTotal: 6,
    summary: "Arena submitted by Sridhar Events. Fire NOC and crowd-management plan require verification.",
    checks: [
      { label: "Ownership / lease proof", status: "passed" },
      { label: "Geo-location verified", status: "passed" },
      { label: "Fire NOC", status: "pending" },
      { label: "Capacity certificate", status: "flagged" },
    ],
  },
  {
    id: "EVT-2026-5510",
    kind: "Event approval",
    subject: "Godavari Music Festival 2026",
    location: "Godavari Indoor Stadium · Rajahmundry",
    submittedAt: "28 Sep 2026",
    sla: "14h",
    overdue: true,
    risk: "low",
    contextLabel: "Projected GMV",
    contextValue: "₹28,00,000",
    evidenceComplete: 5,
    evidenceTotal: 6,
    summary: "Public event proposal awaiting pricing, refund policy and venue-readiness approval.",
    checks: [
      { label: "Approved arena", status: "pending" },
      { label: "Pricing within policy", status: "passed" },
      { label: "Cancellation terms", status: "passed" },
      { label: "Event insurance", status: "passed" },
    ],
  },
  {
    id: "NEG-2026-0091",
    kind: "Commission proposal",
    subject: "VibeLive Entertainment",
    location: "Hyderabad, Telangana",
    submittedAt: "26 Sep 2026",
    sla: "3d 2h",
    overdue: true,
    risk: "medium",
    contextLabel: "Proposed vs standard",
    contextValue: "8% vs 12%",
    evidenceComplete: 4,
    evidenceTotal: 5,
    summary: "Organizer requests a reduced commission based on projected monthly GMV of ₹40,00,000.",
    checks: [
      { label: "Volume threshold", status: "passed" },
      { label: "Refund rate under 2%", status: "passed" },
      { label: "Finance margin review", status: "pending" },
      { label: "Legal addendum", status: "pending" },
    ],
  },
  {
    id: "SETT-2026-7750",
    kind: "Fraud alert",
    subject: "Neon Nights",
    location: "Rajahmundry, Andhra Pradesh",
    submittedAt: "28 Sep 2026",
    sla: "20h",
    overdue: true,
    risk: "high",
    contextLabel: "Settlement held",
    contextValue: "₹3,24,800",
    evidenceComplete: 5,
    evidenceTotal: 7,
    summary: "Settlement paused after a refund spike, repeated device fingerprints and payout-account changes.",
    checks: [
      { label: "Settlement hold active", status: "passed" },
      { label: "Device cluster review", status: "flagged" },
      { label: "Customer complaints", status: "flagged" },
      { label: "Organizer response", status: "pending" },
    ],
  },
];

export const governanceMetrics = [
  { label: "Money at risk", value: "₹18,72,600", detail: "Fraud, disputes and pending approvals", trend: "12%", tone: "danger" },
  { label: "Settlements due", value: "₹27,36,450", detail: "24 organizers · next 7 days", trend: "18% cleared", tone: "ok" },
  { label: "Refunds pending", value: "₹4,93,200", detail: "18 requests · avg. age 1.8 days", trend: "5%", tone: "warn" },
  { label: "Platform trust", value: "98.7%", detail: "Valid organizers · compliant events", trend: "Healthy", tone: "ok" },
] as const;

export const governanceActivity = [
  { time: "17:28", action: "Fraud rule triggered", subject: "Neon Nights", status: "Flagged" },
  { time: "14:11", action: "Arena verified", subject: "Riverfront Grounds · Vijayawada", status: "Approved" },
  { time: "11:03", action: "Commission updated", subject: "StarBeat Live · 12% → 10%", status: "Approved" },
  { time: "09:42", action: "KYC documents received", subject: "Sridhar Events", status: "Under review" },
];

export const governancePolicies = [
  { date: "26 Sep", title: "Arena safety checklist", detail: "Fire safety and crowd management requirements revised." },
  { date: "22 Sep", title: "Organizer KYC v2.0", detail: "PAN, GST and payout-account verification are mandatory." },
  { date: "18 Sep", title: "Cancellation refund policy", detail: "Customer timelines clarified for organizer cancellations." },
];
