"use client";

import { collection, doc, limit, onSnapshot, orderBy, query, type DocumentData, type QueryConstraint } from "firebase/firestore";
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
  buildEntityStatusPayload,
  buildModerateReviewPayload,
  buildReissueOrganizerCodePayload,
  newRequestId,
  type CaseOutcome,
  type EntityStatus,
  type EntityType,
  type SettlementAction,
} from "./console/actions";
import {
  adaptEvent,
  adaptGeneric,
  adaptOrganizerApplication,
  adaptRefund,
  adaptReview,
  adaptSettlement,
  type DisplayRecord,
} from "./console/records";

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
  | "refunds"
  | "settlements"
  | "experiences"
  | "organizerApplications"
  | "reviews";

export type LiveGovernanceRecord = DisplayRecord;

export const QUERY_LIMIT = 250;

const ADAPTERS: Partial<Record<GovernanceCollection, (id: string, data: DocumentData) => DisplayRecord>> = {
  refunds: adaptRefund,
  settlements: adaptSettlement,
  reviews: adaptReview,
  events: adaptEvent,
  organizerApplications: adaptOrganizerApplication,
};

/** Newest-first ordering where the collection has a reliable timestamp field. */
const ORDERING: Partial<Record<GovernanceCollection, QueryConstraint>> = {
  auditEvents: orderBy("at", "desc"),
  refunds: orderBy("createdAt", "desc"),
  settlements: orderBy("createdAt", "desc"),
};

export function adaptRecord(name: GovernanceCollection, id: string, data: DocumentData): DisplayRecord {
  return (ADAPTERS[name] ?? adaptGeneric)(id, data);
}

export function subscribeGovernanceCollection(
  name: GovernanceCollection,
  observer: (records: LiveGovernanceRecord[], truncated: boolean) => void,
  onError: (message: string) => void,
) {
  const ordering = ORDERING[name];
  const constraints = ordering ? [ordering, limit(QUERY_LIMIT)] : [limit(QUERY_LIMIT)];
  const source = query(collection(getFirebaseClient().firestore, name), ...constraints);
  return onSnapshot(
    source,
    (snapshot) => observer(snapshot.docs.map((d) => adaptRecord(name, d.id, d.data())), snapshot.size >= QUERY_LIMIT),
    (error) => onError(error.message),
  );
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
