/**
 * The documents and rule versions shipped with this release. The app's legal
 * pages (exprerience_os legal_documents.dart → Firebase Hosting) and the
 * backend version constants are the source; tests/unit/policies.test.ts keeps
 * this list in step with the backend.
 */
export const LEGAL_SITE = process.env.NEXT_PUBLIC_LEGAL_SITE ?? "https://experience-os-staging.web.app";

export interface InForce {
  id: string;
  title: string;
  version: string;
  audience: string;
  summary: string;
  /** Public page on the project's own Firebase Hosting, when there is one. */
  path?: string;
  /** Backend constant this version must equal (file, name). */
  source?: [string, string];
}

export const POLICIES_IN_FORCE: InForce[] = [
  { id: "terms", title: "Terms of Service", version: "In app", audience: "Everyone", summary: "Using PULSE, bookings, tickets, behaviour, the organizer's responsibility, liability.", path: "/terms" },
  { id: "privacy", title: "Privacy Policy", version: "In app", audience: "Everyone", summary: "What PULSE collects, who sees what, retention, rights and deletion.", path: "/privacy" },
  { id: "refunds", title: "Cancellation & Refund Policy", version: "In app", audience: "Customers", summary: "Each organizer sets whether customers can cancel, a cut-off and up to 4 refund tiers (or picks Flexible, Moderate, Strict or No cancellations); each booking keeps the rules it was made under; host and PULSE cancellations refund 100%.", path: "/refunds" },
  { id: "organizer-agreement", title: "Organizer Event Agreement", version: "ORG-EVENT-1.0", audience: "Organizers", summary: "Accepted on every submission: full responsibility, safety, permits, honest listing, refunds and claims, indemnity.", path: "/organizer-agreement", source: ["catalog/agreement.ts", "ORGANIZER_AGREEMENT_VERSION"] },
  { id: "child-safety", title: "Child Safety Standards", version: "In app", audience: "Everyone", summary: "Zero tolerance for CSAE/CSAM, how to report, what PULSE does.", path: "/child-safety" },
  { id: "kyc", title: "Organizer verification", version: "KYC-2.0", audience: "Ops", summary: "Identity and PAN (GST for businesses) before a host is approved.", source: ["governance/organizerOnboarding.ts", "KYC_POLICY_VERSION"] },
  { id: "experience", title: "Experience review", version: "EXPERIENCE-1.0", audience: "Ops", summary: "What an experience must say and how its risk is rated before approval.", source: ["catalog/experiences.ts", "EXPERIENCE_POLICY_VERSION"] },
  { id: "event", title: "Event review", version: "EVENT-1.0", audience: "Ops", summary: "Date, venue, capacity and responsible person checks before an event goes on sale.", source: ["catalog/events.ts", "EVENT_POLICY_VERSION"] },
  { id: "trip", title: "Trip review", version: "TRIP-1.0", audience: "Ops", summary: "Itinerary, rooms, pickups and safety checks before a trip goes on sale.", source: ["trips/drafts.ts", "TRIP_POLICY_VERSION"] },
];
