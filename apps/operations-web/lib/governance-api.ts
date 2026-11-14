"use client";

import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, startAfter, where, type DocumentData, type QueryConstraint, type QueryDocumentSnapshot } from "firebase/firestore";
import { httpsCallable, type Functions } from "firebase/functions";
import { getFirebaseClient } from "./firebase/client";
import {
  buildAdminCancelEventPayload,
  buildBuildSettlementPayload,
  buildDecideCasePayload,
  buildDecideRefundPayload,
  buildDecideSettlementPayload,
  buildProposeAgreementPayload,
  buildDecideAgreementPayload,
  buildLegalHoldPayload,
  buildEntityStatusPayload,
  buildModerateReviewPayload,
  buildReissueOrganizerCodePayload,
  buildSetOperatorAccessPayload,
  buildReviewTripPayload,
  newRequestId,
  type CaseOutcome,
  type EntityStatus,
  type EntityType,
  type SettlementAction,
  type TripOutcome,
} from "./console/actions";
import {
  adaptAudit,
  adaptEvent,
  adaptGeneric,
  adaptOperator, adaptJobRun, adaptLegalHold,
  adaptOrganizerApplication,
  adaptRefund,
  adaptReview,
  adaptSettlement,
  type DisplayRecord,
} from "./console/records";
import type { ListOrder } from "./format";
import { QUERY_LIMIT, capRows, listOrder, listSpec, type ListScope, type ListSpec } from "./governance-query";

export { QUERY_LIMIT } from "./governance-query";

/**
 * Collections the console reads (admin reads are allowed by
 * firebase/firestore/firestore.rules for every entry here).
 */
export type GovernanceCollection =
  | "governanceCases"
  | "organizers"
  | "arenas"
  | "events"
  | "commercialAgreements"
  | "riskAlerts"
  | "refundCases"
  | "settlementControls"
  | "policyVersions"
  | "auditEvents"
  | "customers"
  | "users"
  /** users where scope == "platform" (console operator accounts; excludes PULSE customers). */
  | "operators"
  | "refunds"
  | "settlements"
  | "experiences"
  | "organizerApplications"
  | "reviews"
  /** Retention legal holds (admins + auditors read; setLegalHold writes). */
  | "legalHolds"
  /** One summary doc per scheduled job per day (platform/jobs.ts). */
  | "jobRuns";

export type LiveGovernanceRecord = DisplayRecord;

const ADAPTERS: Partial<Record<GovernanceCollection, (id: string, data: DocumentData) => DisplayRecord>> = {
  refunds: adaptRefund,
  settlements: adaptSettlement,
  reviews: adaptReview,
  events: adaptEvent,
  organizerApplications: adaptOrganizerApplication,
  auditEvents: adaptAudit,
  operators: adaptOperator,
  jobRuns: adaptJobRun,
  legalHolds: adaptLegalHold,
};

/** The spec (lib/governance-query.ts) as query constraints, with the +1 probe. */
function constraintsFor(spec: ListSpec): QueryConstraint[] {
  const out: QueryConstraint[] = [];
  if (spec.equals) out.push(where(spec.equals.field, "==", spec.equals.value));
  if (spec.statusIn) out.push(where("status", "in", [...spec.statusIn]));
  if (spec.order) out.push(orderBy(spec.order.field, spec.order.direction));
  out.push(limit(QUERY_LIMIT + 1));
  return out;
}

export function adaptRecord(name: GovernanceCollection, id: string, data: DocumentData): DisplayRecord {
  return (ADAPTERS[name] ?? adaptGeneric)(id, data);
}

/** How a capped read of `name` is ordered (drives the "newest N" / "N longest-waiting" / "first N" copy). */
export function listOrderOf(name: GovernanceCollection, scope: ListScope = "all"): ListOrder {
  return listOrder(listSpec(name, scope));
}

export function subscribeGovernanceCollection(
  name: GovernanceCollection,
  observer: (records: LiveGovernanceRecord[], truncated: boolean, cursor: PageCursor | null) => void,
  onError: (message: string) => void,
  scope: ListScope = "all",
) {
  const spec = listSpec(name, scope);
  const source = query(collection(getFirebaseClient().firestore, spec.path), ...constraintsFor(spec));
  return onSnapshot(
    source,
    (snapshot) => {
      // The cursor is the last shown doc, never the probe, so "Load older" starts right after it.
      const { rows, truncated } = capRows(snapshot.docs);
      observer(rows.map((d) => adaptRecord(name, d.id, d.data())), truncated, rows.length ? rows[rows.length - 1]! : null);
    },
    (error) => onError(error.message),
  );
}

export type PageCursor = QueryDocumentSnapshot<DocumentData>;

/**
 * tripDrafts with one status (admins list/get them per firestore.rules). Equality only, so the
 * automatic single-field index on `status` serves it — no composite index. lib/trips.ts orders
 * the rows in memory (longest-waiting first for the review queue).
 */
export function subscribeTripDrafts(
  status: string,
  observer: (rows: Array<{ id: string; raw: Record<string, unknown> }>, truncated: boolean) => void,
  onError: (message: string) => void,
) {
  const source = query(collection(getFirebaseClient().firestore, "tripDrafts"), where("status", "==", status), limit(QUERY_LIMIT + 1));
  return onSnapshot(
    source,
    (snapshot) => {
      const { rows, truncated } = capRows(snapshot.docs);
      observer(rows.map((d) => ({ id: d.id, raw: { ...d.data() } })), truncated);
    },
    (error) => onError(error.message),
  );
}

/**
 * One older page of the audit trail (newest first), after `cursor`.
 * Uses only the automatic single-field index on `at` — no composite index.
 */
export async function fetchOlderAuditEvents(cursor: PageCursor, pageSize = QUERY_LIMIT) {
  const snapshot = await getDocs(query(collection(getFirebaseClient().firestore, "auditEvents"), orderBy("at", "desc"), startAfter(cursor), limit(pageSize + 1)));
  const { rows, truncated } = capRows(snapshot.docs, pageSize);
  return {
    records: rows.map((d) => adaptRecord("auditEvents", d.id, d.data())),
    cursor: rows.length ? rows[rows.length - 1]! : null,
    hasMore: truncated,
  };
}

/** Live view of a single document (e.g. a governance case's target). */
export function subscribeDocument(
  collectionName: string,
  id: string,
  observer: (data: Record<string, unknown> | null) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    doc(getFirebaseClient().firestore, collectionName, id),
    (snapshot) => observer(snapshot.exists() ? { ...snapshot.data() } : null),
    (error) => onError(error.message),
  );
}

async function call<T>(functions: Functions, name: string, payload: object): Promise<T> {
  const callable = httpsCallable<object, T>(functions, name);
  const result = await callable(payload);
  return result.data;
}

const legacy = () => getFirebaseClient().functions;
const regional = () => getFirebaseClient().regionalFunctions;

/* -------------------------------------------- governance (us-central1) */

export interface DecideCaseResult {
  caseId: string;
  status: CaseOutcome;
  version: number;
  replayed?: boolean;
  /** organizer-kyc approval only: returned ONCE, never persisted client-side. */
  organizerCode?: string;
  orgId?: string;
  codeExpiresAt?: string | null;
  /** Present on a replayed approval: the code was issued by the first call and can't be shown again. */
  codeAlreadyIssued?: boolean;
}

export async function decideCase(input: { requestId?: string; caseId: string; expectedVersion: number; outcome: CaseOutcome; note: string }) {
  const payload = buildDecideCasePayload({ ...input, requestId: input.requestId ?? newRequestId("decision") });
  return call<DecideCaseResult>(legacy(), "decideCase", payload);
}

export async function setEntityStatus(input: { requestId?: string; entityType: EntityType; entityId: string; expectedVersion: number; status: EntityStatus; reason: string }) {
  const payload = buildEntityStatusPayload({ ...input, requestId: input.requestId ?? newRequestId("status") });
  return call<{ entityId: string; status: EntityStatus; version: number; replayed?: boolean }>(legacy(), "setMarketplaceEntityStatus", payload);
}

export interface ReissueOrganizerCodeResult {
  applicantUid: string;
  orgId: string;
  organizerCode?: string;
  codeExpiresAt?: string | null;
  replayed?: boolean;
  codeAlreadyIssued?: boolean;
}

export async function reissueOrganizerCode(input: { requestId: string; applicantUid: string; reason: string }) {
  return call<ReissueOrganizerCodeResult>(legacy(), "reissueOrganizerCode", buildReissueOrganizerCodePayload(input));
}

/* ------------------------------------------ commerce/catalog (asia-south1) */

export interface DecideRefundResult {
  refundId: string;
  status: "approved" | "rejected" | "processing" | "completed" | "failed" | "under-review" | "awaiting-second-approval";
}

export async function decideRefund(input: { requestId: string; refundId: string; decision: "approve" | "reject"; note: string }) {
  return call<DecideRefundResult>(regional(), "decideRefund", buildDecideRefundPayload(input));
}

export interface BuildSettlementResult {
  settlementId: string | null;
  status: string;
  netMinor: number;
  entryCount: number;
}

export async function buildSettlement(input: { requestId: string; orgId: string; periodEndDate: string }) {
  return call<BuildSettlementResult>(regional(), "buildSettlement", buildBuildSettlementPayload(input));
}

export async function decideSettlement(input: { requestId: string; settlementId: string; action: SettlementAction; note: string; payoutReference?: string }) {
  return call<{ settlementId: string; status: string }>(regional(), "decideSettlement", buildDecideSettlementPayload(input));
}

export async function adminCancelEvent(input: { requestId: string; eventId: string; reason: string }) {
  return call<Record<string, unknown>>(regional(), "adminCancelEvent", buildAdminCancelEventPayload(input));
}

export async function moderateReview(input: { requestId: string; reviewId: string; status: "published" | "hidden"; reason: string }) {
  return call<{ reviewId: string; status: "published" | "hidden" }>(regional(), "moderateReview", buildModerateReviewPayload(input));
}

export async function proposeCommercialAgreement(input: { requestId: string; orgId: string; commissionPercent: string; payoutCadence: string; note: string }) {
  return call<{ agreementId: string; status: string }>(regional(), "proposeCommercialAgreement", buildProposeAgreementPayload(input));
}

export async function decideCommercialAgreement(input: { requestId: string; agreementId: string; action: "approve" | "reject"; note: string }) {
  return call<{ agreementId: string; status: string; supersededId: string | null }>(regional(), "decideCommercialAgreement", buildDecideAgreementPayload(input));
}

/* ------------------------------------------------ operator access (us-central1) */

export async function setOperatorAccess(input: { uid: string; roleId: string; status: string; reason: string; actorUid?: string | null }) {
  return call<{ uid: string; roleId: string; status: string }>(legacy(), "setOperatorAccess", buildSetOperatorAccessPayload(input));
}

export interface SetLegalHoldResult { holdId: string; status: "active" | "released"; version: number }

/** setLegalHold (asia-south1, admins). Blocks retention deletion for the subject while active. */
export async function setLegalHold(input: { requestId: string; subjectId: string; action: "place" | "release"; reason: string; reference?: string }) {
  return call<SetLegalHoldResult>(regional(), "setLegalHold", buildLegalHoldPayload(input));
}

/* ---------------------------------------------------- trip review (asia-south1) */

export interface ReviewTripResult {
  hostTripId: string;
  status: string;
  tripId: string | null;
  version: number;
  replayed?: boolean;
}

/** reviewTrip (asia-south1, admins): approve, request changes or reject a submitted host trip. */
export async function reviewTrip(input: { requestId: string; hostTripId: string; expectedVersion: number; outcome: TripOutcome; note: string }) {
  return call<ReviewTripResult>(regional(), "reviewTrip", buildReviewTripPayload(input));
}

/* ------------------------------------------ payout accounts (asia-south1) */

export async function decidePayoutAccount(input: { requestId: string; orgId: string; expectedVersion: number; outcome: "verified" | "rejected"; note: string }) {
  return call<{ orgId: string; status: string }>(regional(), "decidePayoutAccount", input);
}

export interface RevealedPayoutAccount {
  orgId: string;
  method: "bank" | "upi";
  holderName: string;
  ifsc: string | null;
  accountNumber: string | null;
  upiId: string | null;
}

/** Platform owner only; every call is audited server-side. Never cache the result. */
export async function revealPayoutAccount(input: { orgId: string; reason: string }) {
  return call<RevealedPayoutAccount>(regional(), "revealPayoutAccount", input);
}

/** A short-lived download link for a KYC document (admins may read kyc/** under storage.rules). */
export async function kycDocumentUrl(path: string): Promise<string> {
  const { getDownloadURL, ref } = await import("firebase/storage");
  return getDownloadURL(ref(getFirebaseClient().storage, path));
}

/* ------------------------------------------------ support (asia-south1) */

export type SupportStatus = "open" | "waiting-on-customer" | "resolved";

export async function respondSupportRequest(input: { requestId: string; id: string; message: string | null; status: SupportStatus }) {
  return call<{ id: string; status: SupportStatus }>(regional(), "respondSupportRequest", input);
}

/** Live list of support requests, most recently active first (admins read all under firestore.rules). */
export function subscribeSupportRequests(
  observer: (rows: Array<{ id: string; raw: Record<string, unknown> }>, truncated: boolean) => void,
  onError: (message: string) => void,
  max = 300,
) {
  return onSnapshot(
    query(collection(getFirebaseClient().firestore, "supportRequests"), orderBy("updatedAt", "desc"), limit(max + 1)),
    (snap) => {
      const rows = snap.docs.slice(0, max).map((d) => ({ id: d.id, raw: { ...d.data() } }));
      observer(rows, snap.size > max);
    },
    (error) => onError(error.message),
  );
}
