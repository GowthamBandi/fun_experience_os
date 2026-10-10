#!/usr/bin/env node
/**
 * Static guard: every known production Firestore query has the composite
 * index it needs in firebase/firestore/firestore.indexes.json.
 *
 *   node firebase/scripts/check-indexes.mjs            (npm run check:indexes)
 *   node firebase/scripts/check-indexes.mjs --table    also prints the query table
 *   PULSE_DIR=/path/to/pulse node firebase/scripts/check-indexes.mjs
 *
 * Why static: the Firestore emulator does NOT enforce indexes, so a query that
 * would fail in production with FAILED_PRECONDITION ("The query requires an
 * index") passes every emulator test. This script is the real guard.
 *
 * It does three things:
 *  1. QUERIES (below) is the declared inventory of every query in the backend
 *     (firebase/functions/src, firebase/scripts), the PULSE Flutter app
 *     (lib/src/data/firebase) and the operations console (apps/operations-web/lib),
 *     with source references. Each entry that needs a composite index must be
 *     served by an index in firestore.indexes.json, or the check fails.
 *  2. It scans those sources for query chains (`.collection(X).where(...)...`)
 *     and fails when it finds a multi-field query that is not declared here,
 *     so a new query cannot ship without an index decision.
 *  3. It checks each declared source reference still exists (drift warning).
 *
 * No dependencies: plain Node >= 18.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INDEX_FILE = join(ROOT, "firebase/firestore/firestore.indexes.json");
const PULSE_DIR = resolve(process.env.PULSE_DIR ?? join(ROOT, "..", "exprerience_os"));
const SHOW_TABLE = process.argv.includes("--table");

/* ------------------------------------------------------------------ table */

/**
 * eq:     equality / `in` filters (any order in the index prefix)
 * range:  the single inequality field (<, <=, >, >=, !=, not-in), if any
 * order:  explicit orderBy clauses, in order: [field, "asc" | "desc"]
 * area:   backend | pulse | console | script
 * src:    [file relative to its repo, a snippet that must still appear there]
 * note:   why no composite is needed, when that is the case
 */
const Q = (id, area, collection, eq, range, order, src, note) => ({ id, area, collection, eq, range, order, src, note, scope: "COLLECTION" });

export const QUERIES = [
  // ---------------------------------------------------------------- backend
  Q("B01", "backend", "experiences", ["previousVersionId"], null, [], ["firebase/functions/src/catalog/experiences.ts", `where("previousVersionId", "=="`]),
  Q("B02", "backend", "bookings", ["eventId", "status(in)"], null, [], ["firebase/functions/src/catalog/events.ts", `"payment-orphaned"]`]),
  Q("B03", "backend", "commercialAgreements", ["orgId", "status"], null, [], ["firebase/functions/src/catalog/events.ts", `commercialAgreements).where("orgId"`]),
  Q("B04", "backend", "commercialAgreements", ["orgId", "status"], null, [], ["firebase/functions/src/commerce/agreements.ts", `commercialAgreements).where("orgId"`]),
  Q("B05", "backend", "tickets", ["eventId", "customerUid", "status"], null, [], ["firebase/functions/src/catalog/reviews.ts", `.where("customerUid", "==", uid)`]),
  Q("B06", "backend", "users", ["phone"], null, [], ["firebase/functions/src/identity/staff.ts", `users).where("phone"`]),
  Q("B07", "backend", "staffInvites", ["orgId", "phone", "status"], null, [], ["firebase/functions/src/identity/staff.ts", `.where("phone", "==", command.phone)`]),
  Q("B08", "backend", "memberships", ["orgId"], null, [], ["firebase/functions/src/identity/staff.ts", `memberships).where("orgId"`]),
  Q("B09", "backend", "staffInvites", ["orgId", "status"], null, [], ["firebase/functions/src/identity/staff.ts", `staffInvites).where("orgId", "==", command.orgId).where("status"`]),
  Q("B10", "backend", "staffInvites", ["phone", "status"], null, [], ["firebase/functions/src/identity/staff.ts", `staffInvites).where("phone", "==", actor.phone)`]),
  Q("B10b", "backend", "staffInvites", ["codeHash"], null, [], ["firebase/functions/src/identity/staff.ts", `where("codeHash", "==", attemptedHash)`],
    "redeemStaffCode: a lapsed (retention-expired) invite still answers 'expired'; single-field lookup by the peppered hash (automatic index)."),
  Q("B12b", "backend", "users", ["pushTokens"], null, [], ["firebase/functions/src/identity/push.ts", `where("pushTokens", "array-contains", token)`],
    "registerPushToken removes a re-registered device from other accounts: array-contains on the automatic single-field array index."),
  Q("B11", "backend", "events", ["orgId", "responsibility.primaryUid", "status(in)"], null, [], ["firebase/functions/src/identity/staff.ts", `"responsibility.primaryUid"`]),
  Q("B12", "backend", "memberships", ["uid"], null, [], ["firebase/functions/src/identity/profile.ts", `memberships).where("uid"`]),
  Q("B13", "backend", "staffInvites", ["phone", "status"], null, [], ["firebase/functions/src/identity/profile.ts", `staffInvites).where("phone"`]),
  Q("B14", "backend", "bookings", ["eventId", "status(in)"], null, [], ["firebase/functions/src/commerce/refunds.ts", `.where("status", "in", ["held", "confirmed"])`]),
  Q("B15", "backend", "payments", ["providerOrderId"], null, [], ["firebase/functions/src/commerce/payments.ts", `where("providerOrderId"`]),
  Q("B16", "backend", "refunds", ["status"], null, [], ["firebase/functions/src/commerce/refundCore.ts", `where("status", "==", "approved")`]),
  Q("B17", "backend", "bookings", ["status"], "holdExpiresAt", [], ["firebase/functions/src/commerce/holds.ts", `where("holdExpiresAt", "<="`]),
  Q("B18", "backend", "events", ["status(in)"], "startsAt", [], ["firebase/functions/src/commerce/reminders.ts", `where("startsAt", ">"`]),
  Q("B19", "backend", "bookings", ["eventId", "status"], null, [], ["firebase/functions/src/commerce/reminders.ts", `.where("status", "==", "confirmed")`]),
  Q("B20", "backend", "ledgerEntries", ["orgId", "account", "settlementId"], null, [], ["firebase/functions/src/commerce/settlements.ts", `where("settlementId", "==", null)`]),
  Q("B21", "backend", "refunds", ["providerRefundId"], null, [], ["firebase/functions/src/commerce/webhook.ts", `where("providerRefundId"`]),
  Q("B22", "backend", "tickets", ["eventId"], null, [], ["firebase/functions/src/commerce/checkin.ts", `tickets).where("eventId"`]),
  Q("B23", "backend", "bookings", ["eventId"], null, [], ["firebase/functions/src/commerce/checkin.ts", `bookings).where("eventId"`]),
  Q("B24", "backend", "tickets", ["eventId", "reference"], null, [], ["firebase/functions/src/commerce/scan.ts", `.where("reference", "==", reference)`]),
  // platform/retention.ts (scheduled clean-up). R01/R02 run on a collection
  // passed in as a variable, which the chain scanner can't resolve.
  Q("R01", "backend", "staffInvites", ["status"], "expiresAt", [], ["firebase/functions/src/platform/retention.ts", `.where("expiresAt", "<", opts.cutoff)`]),
  Q("R02", "backend", "organizerActivations", ["status"], "expiresAt", [], ["firebase/functions/src/platform/retention.ts", `.where("status", "==", opts.liveStatus)`],
    "same expireCodes() chain as R01, called with collection: COLLECTIONS.organizerActivations."),
  Q("R03", "backend", "organizerApplications", ["status"], "decidedAt", [["decidedAt", "asc"]], ["firebase/functions/src/platform/retention.ts", `.where("decidedAt", "<", cutoff)`],
    "KYC purge; also orderBy(FieldPath.documentId()) + startAfter(decidedAt, id) from the jobState cursor, which every composite index carries implicitly (__name__ ASC)."),
  Q("R04", "backend", "rateLimits", [], "expiresAt", [], ["firebase/functions/src/platform/retention.ts", `rateLimits).where("expiresAt", "<"`]),
  Q("R05", "backend", "commandReceipts", [], "createdAt", [], ["firebase/functions/src/platform/retention.ts", `commandReceipts).where("createdAt", "<"`]),
  Q("R06", "backend", "commandReceipts", [], "at", [], ["firebase/functions/src/platform/retention.ts", `commandReceipts).where("at", "<"`]),
  Q("R07", "backend", "userNotifications", ["read"], "createdAt", [], ["firebase/functions/src/platform/retention.ts", `where("read", "==", true)`]),
  Q("R08", "backend", "userNotifications", [], "createdAt", [], ["firebase/functions/src/platform/retention.ts", `userNotifications).where("createdAt", "<"`]),
  Q("S01", "script", "users", ["roleId"], null, [], ["firebase/scripts/bootstrap-platform-owner.mjs", `where("roleId"`]),

  // ------------------------------------------------------------ PULSE app
  Q("P01", "pulse", "events", ["status"], "startsAt", [["startsAt", "asc"]], ["lib/src/data/firebase/firebase_repositories.dart", `.orderBy('startsAt')`]),
  Q("P01b", "pulse", "events", ["status", "venue.cityKey"], "startsAt", [["startsAt", "asc"]], ["lib/src/data/firebase/firebase_repositories.dart", `where('venue.cityKey'`],
    "Explore for the person's city (location or chosen): published, upcoming, in venue.cityKey."),
  Q("P02", "pulse", "experiences", ["__name__(in)", "status"], null, [], ["lib/src/data/firebase/firebase_repositories.dart", `FieldPath.documentId, whereIn`],
    "documentId-in + one equality is served by the automatic single-field index on status (its entries are already ordered by __name__)."),
  Q("P03", "pulse", "bookings", ["customerUid"], null, [["createdAt", "desc"]], ["lib/src/data/firebase/firebase_repositories.dart", `.collection('bookings')`]),
  Q("P04", "pulse", "tickets", ["customerUid"], null, [], ["lib/src/data/firebase/firebase_repositories.dart", `.collection('tickets')`]),
  Q("P05", "pulse", "refunds", ["customerUid"], null, [], ["lib/src/data/firebase/firebase_repositories.dart", `.collection('refunds')`]),
  Q("P06", "pulse", "userNotifications", ["recipientUid"], null, [["createdAt", "desc"]], ["lib/src/data/firebase/firebase_repositories.dart", `.where('recipientUid'`]),
  Q("P07", "pulse", "publicOrganizers", [], null, [], ["lib/src/data/firebase/firebase_repositories.dart", `collection('publicOrganizers').limit(200)`]),
  Q("P08", "pulse", "experiences", ["orgId"], null, [], ["lib/src/data/firebase/firebase_host_workspace_repository.dart", `.where('orgId', isEqualTo: orgId);`]),
  Q("P09", "pulse", "experiences", ["orgId", "status"], null, [], ["lib/src/data/firebase/firebase_host_workspace_repository.dart", `q = q.where('status', isEqualTo: 'approved')`]),
  Q("P10", "pulse", "events", ["orgId"], null, [], ["lib/src/data/firebase/firebase_host_workspace_repository.dart", `.collection('events')`]),
  Q("P11", "pulse", "ledgerEntries", ["orgId"], null, [], ["lib/src/data/firebase/firebase_host_workspace_repository.dart", `.collection('ledgerEntries')`]),
  Q("P12", "pulse", "settlements", ["orgId"], null, [], ["lib/src/data/firebase/firebase_host_workspace_repository.dart", `.collection('settlements')`]),

  // ------------------------------------------------------ operations console
  Q("W01", "console", "auditEvents", [], null, [["at", "desc"]], ["apps/operations-web/lib/governance-query.ts", `auditEvents: { path: "auditEvents", order: NEWEST("at") }`]),
  Q("W02", "console", "refunds", [], null, [["createdAt", "desc"]], ["apps/operations-web/lib/governance-query.ts", `refunds: { path: "refunds", order: NEWEST("createdAt") }`]),
  Q("W03", "console", "settlements", [], null, [["createdAt", "desc"]], ["apps/operations-web/lib/governance-query.ts", `settlements: { path: "settlements", order: NEWEST("createdAt") }`]),
  Q("W04", "console", "(any GovernanceCollection)", [], null, [], ["apps/operations-web/lib/governance-api.ts", `limit(QUERY_LIMIT + 1)`],
    "limit-only listing (+1 probe) of the console collections without a reliable timestamp (LIST_SPECS in lib/governance-query.ts)."),
  Q("W05", "console", "users", ["scope"], null, [], ["apps/operations-web/lib/governance-query.ts", `operators: { path: "users", equals: { field: "scope", value: "platform" } }`]),
  Q("W06", "console", "auditEvents", [], null, [["at", "desc"]], ["apps/operations-web/lib/governance-api.ts", `orderBy("at", "desc"), startAfter(cursor)`],
    "paged audit history (startAfter cursor) on the single-field index."),
  Q("W07", "console", "users", ["phone"], null, [], ["apps/operations-web/lib/search.ts", `where("phone", "==", value)`], "⌘K phone search, limit 5."),
  Q("W08", "console", "bookings", ["reference"], null, [], ["apps/operations-web/lib/search.ts", `where("reference", "==", value)`], "⌘K booking-reference search, limit 5."),
  Q("W09", "console", "publicOrganizers", [], null, [["name", "asc"]], ["apps/operations-web/lib/search.ts", `orderBy("name"), startAt(p)`], "⌘K name prefix (startAt/endAt) on the single-field index."),
  Q("W10", "console", "events", [], null, [["title", "asc"]], ["apps/operations-web/lib/search.ts", `orderBy("title"), startAt(p)`], "⌘K title prefix (startAt/endAt) on the single-field index."),
  Q("W11", "console", "reviews", [], null, [["updatedAt", "desc"]], ["apps/operations-web/lib/governance-query.ts", `reviews: { path: "reviews", order: NEWEST("updatedAt") }`], "Reviews moderation feed: newest 250 on the single-field index."),
  // Capped live lists (subscribeGovernanceCollection), newest first on one timestamp: single-field index only.
  Q("W12", "console", "governanceCases", [], null, [["createdAt", "desc"]], ["apps/operations-web/lib/governance-query.ts", `governanceCases: { path: "governanceCases", order: NEWEST("createdAt") }`]),
  Q("W13", "console", "organizers", [], null, [["createdAt", "desc"]], ["apps/operations-web/lib/governance-query.ts", `organizers: { path: "organizers", order: NEWEST("createdAt") }`]),
  Q("W14", "console", "arenas", [], null, [["createdAt", "desc"]], ["apps/operations-web/lib/governance-query.ts", `arenas: { path: "arenas", order: NEWEST("createdAt") }`]),
  Q("W15", "console", "commercialAgreements", [], null, [["createdAt", "desc"]], ["apps/operations-web/lib/governance-query.ts", `commercialAgreements: { path: "commercialAgreements", order: NEWEST("createdAt") }`]),
  Q("W16", "console", "riskAlerts", [], null, [["createdAt", "desc"]], ["apps/operations-web/lib/governance-query.ts", `riskAlerts: { path: "riskAlerts", order: NEWEST("createdAt") }`]),
  Q("W17", "console", "policyVersions", [], null, [["createdAt", "desc"]], ["apps/operations-web/lib/governance-query.ts", `policyVersions: { path: "policyVersions", order: NEWEST("createdAt") }`]),
  Q("W18", "console", "organizerApplications", [], null, [["createdAt", "desc"]], ["apps/operations-web/lib/governance-query.ts", `organizerApplications: { path: "organizerApplications", order: NEWEST("createdAt") }`]),
  Q("W19", "console", "legalHolds", [], null, [["updatedAt", "desc"]], ["apps/operations-web/lib/governance-query.ts", `legalHolds: { path: "legalHolds", order: NEWEST("updatedAt") }`]),
  Q("W20", "console", "jobRuns", [], null, [["updatedAt", "desc"]], ["apps/operations-web/lib/governance-query.ts", `jobRuns: { path: "jobRuns", order: NEWEST("updatedAt") }`]),
  // Open-item reads (OPEN_SPECS): the Approvals inbox, the rail badges and Needs-you. status in [...] + createdAt asc (longest-waiting first), limit 251.
  Q("W21", "console", "governanceCases", ["status(in)"], null, [["createdAt", "asc"]], ["apps/operations-web/lib/governance-api.ts", `where("status", "in", [...spec.statusIn])`], "Open cases (pending, under-review, information-requested), longest-waiting first."),
  Q("W22", "console", "riskAlerts", ["status(in)"], null, [["createdAt", "asc"]], ["apps/operations-web/lib/governance-api.ts", `where("status", "in", [...spec.statusIn])`], "Open risk alerts (OPEN_RISK_STATUS_LIST), longest-waiting first."),
  Q("W23", "console", "refunds", ["status(in)"], null, [["createdAt", "asc"]], ["apps/operations-web/lib/governance-api.ts", `where("status", "in", [...spec.statusIn])`], "Refunds under review, longest-waiting first."),
  Q("W24", "console", "settlements", ["status(in)"], null, [["createdAt", "asc"]], ["apps/operations-web/lib/governance-api.ts", `where("status", "in", [...spec.statusIn])`], "Settlements pending approval, approved or held, longest-waiting first."),
  Q("M03", "console", "users", ["scope"], "createdAt", [], ["apps/operations-web/lib/metrics.ts", `where: [["scope", "==", "platform"]]`], "Dashboard new customers: operators created in range are subtracted from users created in range (createdAt alone is single-field)."),
  Q("M04", "console", "tickets", ["status"], "checkedInAt", [], ["apps/operations-web/lib/metrics.ts", `where: [["status", "==", "used"]]`], "Dashboard check-ins: status == used in a checkedInAt range."),
  Q("M05", "console", "ledgerEntries", ["account", "kind", "direction"], "createdAt", [], ["apps/operations-web/lib/metrics.ts", `["direction", "==", "credit"]`], "Dashboard money metrics (gross, refunds, commission): ledger account + kind + direction equality, per createdAt range; one composite serves all."),
  Q("M06", "console", "tickets", [], "issuedAt", [], ["apps/operations-web/lib/metrics.ts", `dateField: "issuedAt"`], "Dashboard tickets issued: issuedAt range only, single-field index."),
  Q("M07", "console", "organizers", ["status"], null, [], ["apps/operations-web/lib/metrics.ts", `collection: "organizers"`], "Dashboard active organizers: single equality, no date."),
  Q("M08", "console", "events", [], "endsAt", [["endsAt", "asc"]], ["apps/operations-web/lib/use-live-events.ts", `where("endsAt", ">="`], "Live now + rail badge: endsAt >= now (30-min anchor), soonest-ending first, limit 101 (+1 probe); live/soon split client-side; single-field index."),
  Q("M09", "console", "events", [], "startsAt", [["startsAt", "desc"]], ["apps/operations-web/lib/use-live-events.ts", `eventsStartingBetween(`], "Top cities (components/overview/TopCities.tsx): startsAt in the dashboard range, newest first, limit 251; single-field index."),
  Q("M10", "console", "ledgerEntries", ["orgId", "account", "kind", "direction"], null, [], ["apps/operations-web/lib/metrics.ts", `out.push(["orgId", "==", scope.orgId])`], "Organizer 360 gross and refunds: a ledger money metric scoped to one org, all time (no createdAt range)."),
  Q("M11", "console", "publicOrganizers", [], null, [], ["apps/operations-web/lib/organizers-firestore.ts", `query(col("publicOrganizers"))`], "Organizers grid display fields, limit 251."),
  Q("M12", "console", "events", ["orgId"], null, [["startsAt", "desc"]], ["apps/operations-web/lib/organizers-firestore.ts", `orderBy("startsAt", "desc")`], "Organizer 360 Events tab, newest first, limit 251."),
  Q("M13", "console", "experiences", ["orgId"], null, [["updatedAt", "desc"]], ["apps/operations-web/lib/organizers-firestore.ts", `col("experiences"), where("orgId"`], "Organizer 360 Experiences tab."),
  Q("M14", "console", "reviews", ["orgId", "status"], null, [["updatedAt", "desc"]], ["apps/operations-web/lib/organizers-firestore.ts", `where("status", "==", "published")`], "Organizer 360 average rating: published reviews, newest first, limit 251."),
  Q("M15", "console", "commercialAgreements", ["orgId"], null, [["createdAt", "desc"]], ["apps/operations-web/lib/organizers-firestore.ts", `col("commercialAgreements")`], "Organizer 360 Money tab: terms in force and history."),
  Q("M16", "console", "eventCommercials", ["orgId"], null, [["publishedAt", "desc"]], ["apps/operations-web/lib/organizers-firestore.ts", `orderBy("publishedAt", "desc")`], "Organizer 360 Money tab: commission snapshot per published event."),
  Q("M17", "console", "settlements", ["orgId"], null, [["createdAt", "desc"]], ["apps/operations-web/lib/organizers-firestore.ts", `col("settlements")`], "Organizer 360 Money tab: settlements, newest first."),
  Q("M18", "console", "memberships", ["orgId"], null, [], ["apps/operations-web/lib/organizers-firestore.ts", `col("memberships"), where("orgId", "==", orgId)`], "Organizer 360 Team tab; single equality."),
  Q("M19", "console", "auditEvents", ["orgId"], null, [["at", "desc"]], ["apps/operations-web/lib/organizers-firestore.ts", `col("auditEvents"), where("orgId"`], "Organizer 360 Timeline: events that carry the org, limit 101."),
  Q("M20", "console", "auditEvents", ["resourceId"], null, [["at", "desc"]], ["apps/operations-web/lib/organizers-firestore.ts", `where("resourceId", "==", orgId)`], "Organizer 360 Timeline: events on the organizer record (governance status changes carry no orgId), limit 101."),
  Q("M21", "console", "events", ["orgId"], null, [], ["apps/operations-web/lib/organizers-firestore.ts", `getCountFromServer(query(col("events"), where("orgId"`], "Organizer 360 events count: count aggregation on one equality."),
  Q("M22", "console", "events", ["status(in)"], null, [["startsAt", "asc"]], ["apps/operations-web/lib/events-firestore.ts", `where("status", "in", [...OPEN_STATUSES]), orderBy("startsAt", "asc")`], "Events table Upcoming / Live (and stale Past rows): open statuses, soonest first, limit 251."),
  Q("M23", "console", "events", ["status(in)"], null, [["startsAt", "desc"]], ["apps/operations-web/lib/events-firestore.ts", `where("status", "in", [...statuses]), orderBy("startsAt", "desc")`], "Events table Past (completed), Drafts & review and Cancelled tabs, newest first, limit 251."),
  Q("M24", "console", "events", ["experienceId"], null, [["startsAt", "desc"]], ["apps/operations-web/lib/events-firestore.ts", `where("experienceId", "==", experienceId)`], "Events table filtered to one experience (/events?experience=), newest first, limit 251."),
  Q("M25", "console", "events", ["status(in)"], null, [], ["apps/operations-web/lib/events-firestore.ts", `getCountFromServer(query(col("events"), where("status", "in"`], "Events tab counts: count aggregations on one in-filter."),
  Q("M26", "console", "bookings", ["eventId"], null, [["createdAt", "desc"]], ["apps/operations-web/lib/events-firestore.ts", `col("bookings"), where("eventId"`], "Event 360 Bookings tab, newest first, limit 251."),
  Q("M27", "console", "reviews", ["eventId", "status(in)"], null, [["updatedAt", "desc"]], ["apps/operations-web/lib/events-firestore.ts", `where("status", "in", ["published", "hidden"])`], "Event 360 Reviews tab (existing reviews eventId + status + updatedAt index)."),
  Q("M28", "console", "auditEvents", ["resourceId"], null, [["at", "desc"]], ["apps/operations-web/lib/events-firestore.ts", `where("resourceId", "==", eventId)`], "Event 360 Timeline: audit events on the event record, limit 101."),
  Q("M29", "console", "tickets", ["eventId", "status(in)"], null, [], ["apps/operations-web/lib/events-firestore.ts", `col("tickets"), where("eventId", "==", eventId), where("status", "in"`], "Event 360 check-ins: count of used vs valid + used tickets for one event."),
  Q("M30", "console", "ledgerEntries", ["eventId", "account", "kind", "direction"], null, [], ["apps/operations-web/lib/metrics.ts", `out.push(["eventId", "==", scope.eventId])`], "Event 360 gross, commission and refunds: a ledger money metric scoped to one event, all time."),
  Q("M31", "console", "users", [], null, [["createdAt", "desc"]], ["apps/operations-web/lib/customers-firestore.ts", `query(col("users"), orderBy("createdAt", "desc"))`], "Customers: newest users, limit 61; operators (scope platform) dropped client-side because customer docs carry no scope and != skips docs missing the field. Single-field index."),
  Q("M32", "console", "bookings", ["customerUid"], null, [["createdAt", "desc"]], ["apps/operations-web/lib/customers-firestore.ts", `col("bookings"), where("customerUid"`], "Customer 360 Bookings tab, newest first, limit 251 (same index as P03)."),
  Q("M33", "console", "payments", ["customerUid"], null, [["createdAt", "desc"]], ["apps/operations-web/lib/customers-firestore.ts", `col("payments"), where("customerUid"`], "Customer 360 Payments tab, newest first, limit 251."),
  Q("M34", "console", "refunds", ["customerUid"], null, [["createdAt", "desc"]], ["apps/operations-web/lib/customers-firestore.ts", `col("refunds"), where("customerUid"`], "Customer 360 Refunds tab, newest first, limit 251."),
  Q("M35", "console", "reviews", ["authorUid"], null, [["updatedAt", "desc"]], ["apps/operations-web/lib/customers-firestore.ts", `where("authorUid", "==", uid)`], "Customer 360 Reviews tab: reviews the customer wrote, newest first, limit 251."),
  Q("M36", "console", "legalHolds", ["subjectId"], null, [], ["apps/operations-web/lib/customers-firestore.ts", `where("subjectId", "==", uid)`], "Customer 360 Legal holds tab; single equality."),
  Q("M37", "console", "users", ["phone"], null, [], ["apps/operations-web/lib/customers-firestore.ts", `where("phone", "==", lookup.value)`], "Customers search by phone, limit 5."),
  Q("M38", "console", "bookings", ["reference"], null, [], ["apps/operations-web/lib/customers-firestore.ts", `where("reference", "==", lookup.value)`], "Customers search by booking reference, limit 5."),
  Q("M39", "console", "bookings", ["customerUid"], null, [], ["apps/operations-web/lib/metrics.ts", `customerBookings: { collection: "bookings"`], "Customer 360 bookings count: count aggregation on one equality."),
  Q("M40", "console", "payments", ["customerUid", "status(in)"], null, [], ["apps/operations-web/lib/metrics.ts", `customerSpent: {`], "Customer 360 spent: sum of amountMinor over captured, refunded and partially-refunded payments (ledger lines carry no customerUid)."),
  Q("M41", "console", "refunds", ["customerUid", "status"], null, [], ["apps/operations-web/lib/metrics.ts", `customerRefunded: {`], "Customer 360 refunds: sum of completed refunds."),
  Q("M42", "console", "reviews", ["authorUid"], null, [], ["apps/operations-web/lib/metrics.ts", `customerReviews: { collection: "reviews"`], "Customer 360 reviews count: count aggregation on one equality."),
];

/* --------------------------------------------------------------- matching */

const bare = (f) => f.replace(/\(.*\)$/, "");
const DIR = { asc: "ASCENDING", desc: "DESCENDING" };

/**
 * The composite index a query needs, or null when single-field indexes do.
 * Per the platform policy every multi-field query gets a composite (index
 * merging for pure-equality queries works but has unpredictable latency),
 * except a documentId filter, which every index carries implicitly.
 */
export function requiredIndex(q) {
  const eq = q.eq.map(bare).filter((f) => f !== "__name__");
  const tail = [];
  if (q.range) tail.push([q.range, q.order.find(([f]) => f === q.range)?.[1] ?? "asc"]);
  for (const [f, d] of q.order) if (f !== q.range && !eq.includes(f)) tail.push([f, d]);
  const distinct = new Set([...eq, ...tail.map(([f]) => f)]);
  if (distinct.size < 2) return null;
  return { collectionGroup: q.collection, queryScope: q.scope, eq, tail: tail.map(([f, d]) => ({ fieldPath: f, order: DIR[d] })) };
}

/** Does [index] (from firestore.indexes.json) serve [need]? */
export function serves(index, need) {
  if (index.collectionGroup !== need.collectionGroup) return false;
  if ((index.queryScope ?? "COLLECTION") !== need.queryScope) return false;
  const fields = index.fields.filter((f) => f.fieldPath !== "__name__");
  if (fields.length !== need.eq.length + need.tail.length) return false;
  const prefix = new Set(fields.slice(0, need.eq.length).map((f) => (f.order ? f.fieldPath : null)));
  if (!need.eq.every((f) => prefix.has(f))) return false;
  return need.tail.every((t, i) => {
    const f = fields[need.eq.length + i];
    return f.fieldPath === t.fieldPath && f.order === t.order;
  });
}

const fmtNeed = (n) =>
  `${n.collectionGroup} (${[...n.eq.map((f) => `${f} ASC`), ...n.tail.map((t) => `${t.fieldPath} ${t.order === "ASCENDING" ? "ASC" : "DESC"}`)].join(", ")})`;

/* ------------------------------------------------------------ discovery */

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e)) && !/\.(test|spec)\./.test(name) && !name.endsWith("_test.dart")) out.push(p);
  }
  return out;
}

const COLLECTION_ARG = /(?:\.collection|\bcol|collectionGroup)\(\s*(?:(?:COLLECTIONS|C)\.(\w+)|["'`](\w+)["'`])\s*\)/g;
const TS_WHERE = /\.where\(\s*(?:["'`]([\w.]+)["'`]|FieldPath\.documentId\(\))\s*,\s*["'`]([^"'`]+)["'`]/g;
const DART_WHERE = /\.where\(\s*(?:['"]([\w.]+)['"]|FieldPath\.documentId)\s*,\s*(\w+)\s*:/g;
const ORDER = /\.orderBy\(\s*["'`]([\w.]+)["'`](?:\s*,\s*(?:["'`](desc|asc)["'`]|descending:\s*(true|false)))?/g;
const RANGE_OPS = new Set(["<", "<=", ">", ">=", "!=", "not-in", "isLessThan", "isLessThanOrEqualTo", "isGreaterThan", "isGreaterThanOrEqualTo", "isNotEqualTo", "whereNotIn"]);
const IN_OPS = new Set(["in", "array-contains-any", "whereIn", "arrayContainsAny"]);

/** Finds `.collection(X)…where/orderBy…` chains; one statement each. */
function discover(file, dart) {
  const text = readFileSync(file, "utf8");
  const found = [];
  const covered = [];
  for (const m of text.matchAll(COLLECTION_ARG)) {
    const collection = m[1] ?? m[2];
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    // The chain ends at the statement end or the terminal read.
    const endRe = dart ? /;|\.get\(|\.snapshots\(/ : /;|\.get\(|\.count\(|\.onSnapshot\(|\.stream\(/;
    const stop = rest.search(endRe);
    const chain = rest.slice(0, stop < 0 ? rest.length : stop);
    covered.push([start, start + chain.length]);
    if (/\.doc\(/.test(chain.split(/\.where\(|\.orderBy\(/)[0])) continue; // a document read
    const eq = [];
    let range = null;
    for (const w of chain.matchAll(dart ? DART_WHERE : TS_WHERE)) {
      const field = w[1] ?? "__name__";
      const op = w[2];
      if (RANGE_OPS.has(op)) range = field;
      else eq.push(IN_OPS.has(op) ? `${field}(in)` : field);
    }
    const order = [...chain.matchAll(ORDER)].map((o) => [o[1], o[2] === "desc" || o[3] === "true" ? "desc" : "asc"]);
    if (!eq.length && !range && !order.length) continue;
    const line = text.slice(0, m.index).split("\n").length;
    found.push({ collection, eq: [...new Set(eq)], range, order, file, line });
  }
  // `.where("f"…` outside any resolved chain: a query on a collection held in
  // a variable. These must be declared by hand (matched by file + field).
  const unresolved = [];
  for (const w of text.matchAll(dart ? /\.where\(\s*['"]([\w.]+)['"]\s*,/g : /\.where\(\s*["'`]([\w.]+)["'`]\s*,/g)) {
    if (covered.some(([a, b]) => w.index >= a && w.index < b)) continue;
    unresolved.push({ field: w[1], file, line: text.slice(0, w.index).split("\n").length });
  }
  return { found, unresolved };
}

const sig = (q) => {
  const eq = [...new Set(q.eq.map(bare))].sort().join(",");
  const r = q.range ?? "";
  const eqSet = new Set(q.eq.map(bare));
  const o = q.order.filter(([f]) => !eqSet.has(f)).map((x) => x.join(" ")).join(",");
  return `${q.collection}|${eq}|${r}|${o}`;
};

/* ------------------------------------------------------------------- run */

const errors = [];
const warnings = [];

let indexes;
try {
  const json = JSON.parse(readFileSync(INDEX_FILE, "utf8"));
  indexes = json.indexes ?? [];
  if (!Array.isArray(json.fieldOverrides ?? [])) errors.push("fieldOverrides must be an array");
} catch (e) {
  console.error(`✗ cannot read ${relative(ROOT, INDEX_FILE)}: ${e.message}`);
  process.exit(1);
}

// Duplicate index definitions make `firebase deploy` fail.
const seen = new Set();
for (const ix of indexes) {
  const k = JSON.stringify([ix.collectionGroup, ix.queryScope, ix.fields]);
  if (seen.has(k)) errors.push(`duplicate index: ${ix.collectionGroup} ${ix.fields.map((f) => f.fieldPath).join(",")}`);
  seen.add(k);
}

// 1. Every declared query has its composite.
const used = new Set();
const rows = [];
for (const q of QUERIES) {
  const need = requiredIndex(q);
  let status = "single-field";
  if (need) {
    const hit = indexes.findIndex((ix) => serves(ix, need));
    if (hit < 0) {
      status = "MISSING";
      errors.push(`${q.id} ${q.src[0]}: needs composite ${fmtNeed(need)}`);
    } else {
      status = `composite #${hit}`;
      used.add(hit);
    }
    if (q.scope === "COLLECTION_GROUP") warnings.push(`${q.id}: collection-group queries also need a fieldOverride`);
  }
  rows.push({ ...q, need, status });
}

// 3. Source references still exist (only for repos present on disk).
for (const q of QUERIES) {
  const base = q.area === "pulse" ? PULSE_DIR : ROOT;
  const file = join(base, q.src[0]);
  if (!existsSync(file)) {
    if (q.area !== "pulse") errors.push(`${q.id}: source file missing: ${q.src[0]}`);
    continue;
  }
  if (!readFileSync(file, "utf8").includes(q.src[1])) warnings.push(`${q.id}: snippet no longer found in ${q.src[0]} (${q.src[1]}); re-check the table`);
}

// 2. Undeclared multi-field queries in the sources.
const declared = new Set(QUERIES.map(sig));
const sources = [
  ...walk(join(ROOT, "firebase/functions/src"), [".ts"]).map((f) => [f, false, ROOT]),
  // Emulator-only scripts (seed/reset) never run against production, and the emulator doesn't enforce indexes.
  ...walk(join(ROOT, "firebase/scripts"), [".mjs", ".ts", ".js"]).filter((f) => !f.endsWith("check-indexes.mjs") && !/(seed|reset)-emulator\.ts$/.test(f)).map((f) => [f, false, ROOT]),
  ...walk(join(ROOT, "apps/operations-web/lib"), [".ts", ".tsx"]).map((f) => [f, false, ROOT]),
  ...walk(join(PULSE_DIR, "lib/src/data"), [".dart"]).map((f) => [f, true, PULSE_DIR]),
];
if (!existsSync(join(PULSE_DIR, "lib/src/data"))) warnings.push(`PULSE app not found at ${PULSE_DIR} (set PULSE_DIR); its queries were checked from the table only`);
let discovered = 0;
for (const [file, dart, base] of sources) {
  const { found, unresolved } = discover(file, dart);
  for (const u of unresolved) {
    const rel = relative(base, file).replaceAll("\\", "/");
    const text = readFileSync(file, "utf8");
    const near = (q) => {
      const at = text.indexOf(q.src[1]);
      return at >= 0 && Math.abs(text.slice(0, at).split("\n").length - u.line) <= 15;
    };
    const ok = QUERIES.some((q) => q.src[0] === rel && [...q.eq.map(bare), q.range].includes(u.field) && near(q));
    if (!ok) errors.push(`query on an unresolved (variable) collection at ${rel}:${u.line} filters "${u.field}": declare it in QUERIES`);
  }
  for (const d of found) {
    discovered++;
    if (declared.has(sig(d))) continue;
    const need = requiredIndex({ ...d, scope: "COLLECTION" });
    const where = `${relative(base, file)}:${d.line}`;
    const desc = `${d.collection} eq[${d.eq.join(",")}]${d.range ? ` range[${d.range}]` : ""}${d.order.length ? ` order[${d.order.map((o) => o.join(" ")).join(",")}]` : ""}`;
    if (need) errors.push(`undeclared multi-field query at ${where}: ${desc} → add it to QUERIES (needs ${fmtNeed(need)})`);
    else warnings.push(`undeclared single-field query at ${where}: ${desc} (add it to QUERIES)`);
  }
}
// Modular web SDK `where(` in the console (the chain scanner reads only `.where`).
for (const [file] of sources.filter(([f]) => f.includes("operations-web"))) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/[^.\w]where\(\s*["'`]([\w.]+)["'`]/g)) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    const ok = QUERIES.some((q) => q.area === "console" && q.src[0] === rel && (q.eq.map(bare).includes(m[1]) || q.range === m[1]));
    if (!ok) errors.push(`${rel}:${text.slice(0, m.index).split("\n").length} modular where("${m[1]}") is not declared in QUERIES`);
  }
  // Modular multi-constraint queries need a declared entry too (where + orderBy on different fields).
  const relFile = relative(ROOT, file).replaceAll("\\", "/");
  if (/query\([^;]*where\([^;]*orderBy\(/s.test(text) && !QUERIES.some((q) => q.area === "console" && q.src[0] === relFile && (q.eq.length || q.range) && q.order.length)) {
    warnings.push(`${relative(ROOT, file)}: a query() combines where() and orderBy(); check it needs no composite`);
  }
}

// Informational: indexes no known query uses (kept; harmless).
const unused = indexes.map((ix, i) => [ix, i]).filter(([, i]) => !used.has(i));

if (SHOW_TABLE) {
  console.log("id   area     collection            eq / in                                   range           orderBy              index");
  for (const r of rows) {
    console.log(
      [r.id.padEnd(4), r.area.padEnd(8), r.collection.padEnd(21), r.eq.join(", ").padEnd(41), (r.range ?? "").padEnd(15), r.order.map((o) => o.join(" ")).join(", ").padEnd(20), r.status].join(" ")
    );
  }
  console.log("");
}

for (const w of warnings) console.warn(`! ${w}`);
if (unused.length) {
  console.log(`i ${unused.length} index(es) not used by any known query (kept, harmless):`);
  for (const [ix, i] of unused) console.log(`    #${i} ${ix.collectionGroup} (${ix.fields.map((f) => `${f.fieldPath} ${f.order === "DESCENDING" ? "DESC" : "ASC"}`).join(", ")})`);
}
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n${errors.length} index problem(s). Fix firebase/firestore/firestore.indexes.json or the QUERIES table in ${relative(ROOT, fileURLToPath(import.meta.url))}.`);
  process.exit(1);
}
console.log(
  `✓ ${QUERIES.length} declared queries (${rows.filter((r) => r.need).length} need composites) all served; ${discovered} query chains scanned; ${indexes.length} indexes.`
);
