"use client";

/**
 * Marketplace governance data access.
 *
 * Firebase modes read Firestore in real time and write through the
 * `decideCase`, `setMarketplaceEntityStatus` and `submitGovernanceIntake`
 * callables. Local workspace mode uses the same record shape from the
 * workspace store (see lib/use-governance.ts). Firebase is imported lazily so
 * local mode never loads the SDK.
 */
import type { GovernanceCollectionName } from "@/lib/prototype/entities";
import type { IntakeInput } from "@/lib/prototype/governance/commands";

export type GovernanceCollection = GovernanceCollectionName;

export type GovernanceStatusLabel = "Approved" | "Pending" | "Paused" | "Blocked" | "Under review" | "On hold" | "Info requested" | "Rejected" | "Resolved";

export interface LiveGovernanceRecord {
  id: string;
  primary: string;
  secondary: string;
  status: GovernanceStatusLabel;
  /** Raw status value as stored. */
  statusValue: string;
  value: string;
  meta: string;
  version: number;
  updatedAt?: string;
  raw: Record<string, unknown>;
}

function str(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "—";
}

export function displayStatus(value: unknown): GovernanceStatusLabel {
  switch (String(value)) {
    case "active":
    case "approved":
    case "approved-for-release":
    case "published":
      return "Approved";
    case "resolved":
      return "Resolved";
    case "paused":
      return "Paused";
    case "blocked":
    case "cancelled":
      return "Blocked";
    case "rejected":
      return "Rejected";
    case "held":
    case "on-hold":
      return "On hold";
    case "information-requested":
      return "Info requested";
    case "under-review":
      return "Under review";
    default:
      return "Pending";
  }
}

export function formatMinor(minor: unknown, currency: unknown): string | null {
  if (typeof minor !== "number" || !Number.isFinite(minor)) return null;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: typeof currency === "string" ? currency : "INR", maximumFractionDigits: 0 }).format(minor / 100);
}

function isoOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

/** Map any governance document to the record shape every governance screen renders. */
export function adaptGovernanceDoc(id: string, data: Record<string, unknown>, version: number, updatedAt?: unknown): LiveGovernanceRecord {
  const amount = formatMinor(data.amountMinor ?? data.exposureMinor ?? data.projectedGmvMinor, data.currency);
  const rate = typeof data.commissionBps === "number" ? `${(data.commissionBps / 100).toFixed(2).replace(/\.00$/, "")}% commission` : null;
  const location = str(data, "location", "city", "territoryName");
  const owner = str(data, "organizerName", "actorName", "subjectType", "category");
  const statusValue = String(data.status ?? data.outcome ?? "pending");
  return {
    id,
    primary: str(data, "subject", "name", "title", "action"),
    secondary: owner === "—" ? str(data, "kind", "type", "description", "action") : owner,
    status: displayStatus(statusValue),
    statusValue,
    value: amount ?? rate ?? str(data, "displayValue", "value", "effectiveFrom"),
    meta: [location, str(data, "summary", "statusReason", "policyVersion")].filter((item) => item !== "—").join(" · ") || "No additional context",
    version: Number.isSafeInteger(data.version) ? (data.version as number) : version,
    updatedAt: isoOf(updatedAt ?? data.updatedAt ?? data.at),
    raw: { ...data },
  };
}

/* ------------------------------ Firebase path ------------------------------ */

export async function subscribeGovernanceCollection(
  name: GovernanceCollection,
  observer: (records: LiveGovernanceRecord[]) => void,
  onError: (message: string) => void,
): Promise<() => void> {
  const [{ collection, limit, onSnapshot, query }, { getFirebaseClient }] = await Promise.all([
    import("firebase/firestore"),
    import("./firebase/client"),
  ]);
  const source = query(collection(getFirebaseClient().firestore, name), limit(500));
  return onSnapshot(
    source,
    (snapshot) => observer(snapshot.docs.map((d) => adaptGovernanceDoc(d.id, d.data(), 0, d.data().updatedAt))),
    (error) => onError(error.message),
  );
}

function requestId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function callable(name: string, payload: Record<string, unknown>) {
  const [{ httpsCallable }, { getFirebaseClient }] = await Promise.all([import("firebase/functions"), import("./firebase/client")]);
  return httpsCallable(getFirebaseClient().functions, name)(payload);
}

export async function decideCaseRemote(caseId: string, expectedVersion: number, outcome: "approved" | "rejected" | "information-requested", note: string) {
  return callable("decideCase", { requestId: requestId("decision"), caseId, expectedVersion, outcome, note });
}

export async function setEntityStatusRemote(entityType: "organizer" | "arena" | "event" | "risk-alert", entityId: string, expectedVersion: number, status: "active" | "paused" | "blocked" | "under-review" | "resolved", reason: string) {
  return callable("setMarketplaceEntityStatus", { requestId: requestId("status"), entityType, entityId, expectedVersion, status, reason });
}

export async function submitIntakeRemote(input: IntakeInput) {
  return callable("submitGovernanceIntake", { requestId: requestId("intake"), ...input });
}
