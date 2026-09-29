"use client";

import { collection, limit, onSnapshot, query, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebaseClient } from "./firebase/client";

export type GovernanceCollection = "governanceCases" | "organizers" | "arenas" | "events" | "commercialAgreements" | "riskAlerts" | "refundCases" | "settlementControls" | "policyVersions" | "auditEvents" | "customers" | "users";

export interface LiveGovernanceRecord {
  id: string;
  primary: string;
  secondary: string;
  status: "Approved" | "Pending" | "Paused" | "Blocked" | "Under review" | "On hold";
  value: string;
  meta: string;
  version: number;
  raw: Record<string, unknown>;
}

function string(data: DocumentData, ...keys: string[]): string {
  for (const key of keys) if (typeof data[key] === "string" && data[key].trim()) return data[key];
  return "—";
}

function displayStatus(value: unknown): LiveGovernanceRecord["status"] {
  switch (String(value)) {
    case "active": case "approved": case "approved-for-release": case "published": case "resolved": return "Approved";
    case "paused": return "Paused";
    case "blocked": case "rejected": case "cancelled": return "Blocked";
    case "held": case "on-hold": return "On hold";
    case "under-review": case "information-requested": return "Under review";
    default: return "Pending";
  }
}

function money(minor: unknown, currency: unknown): string | null {
  if (typeof minor !== "number" || !Number.isFinite(minor)) return null;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: typeof currency === "string" ? currency : "INR", maximumFractionDigits: 0 }).format(minor / 100);
}

function adapt(snapshot: QueryDocumentSnapshot<DocumentData>): LiveGovernanceRecord {
  const data = snapshot.data();
  const amount = money(data.amountMinor ?? data.exposureMinor ?? data.projectedGmvMinor, data.currency);
  const rate = typeof data.commissionBps === "number" ? `${(data.commissionBps / 100).toFixed(2).replace(/\.00$/, "")}% commission` : null;
  const location = string(data, "location", "city", "territoryName");
  const owner = string(data, "organizerName", "subjectType", "category", "action");
  return {
    id: snapshot.id,
    primary: string(data, "subject", "name", "title", "action"),
    secondary: owner === "—" ? string(data, "kind", "type", "description") : owner,
    status: displayStatus(data.status ?? data.outcome),
    value: amount ?? rate ?? string(data, "displayValue", "value", "effectiveFrom"),
    meta: [location, string(data, "summary", "statusReason", "policyVersion")].filter((item) => item !== "—").join(" · ") || "No additional context",
    version: Number.isSafeInteger(data.version) ? data.version : 0,
    raw: { ...data },
  };
}

export function subscribeGovernanceCollection(
  name: GovernanceCollection,
  observer: (records: LiveGovernanceRecord[]) => void,
  onError: (message: string) => void,
) {
  const source = query(collection(getFirebaseClient().firestore, name), limit(250));
  return onSnapshot(source, (snapshot) => observer(snapshot.docs.map(adapt)), (error) => onError(error.message));
}

function requestId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function decideCase(caseId: string, expectedVersion: number, outcome: "approved" | "rejected" | "information-requested", note: string) {
  const callable = httpsCallable(getFirebaseClient().functions, "decideCase");
  return callable({ requestId: requestId("decision"), caseId, expectedVersion, outcome, note });
}

export async function setEntityStatus(entityType: "organizer" | "arena" | "event" | "risk-alert", entityId: string, expectedVersion: number, status: "active" | "paused" | "blocked" | "under-review" | "resolved", reason: string) {
  const callable = httpsCallable(getFirebaseClient().functions, "setMarketplaceEntityStatus");
  return callable({ requestId: requestId("status"), entityType, entityId, expectedVersion, status, reason });
}
