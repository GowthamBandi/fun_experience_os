/**
 * Shared identity plumbing: idempotency receipts for PULSE commands, access
 * code policy, failed-attempt auditing and PII masking (ADR-0004).
 */

import type { Transaction } from "firebase-admin/firestore";
import type { UserActor } from "../platform/actors";
import { writeAudit } from "../platform/audit";
import { COLLECTIONS, db, serverNow, Timestamp } from "../platform/firestore";
import { DomainError } from "../platform/errors";
import { consumeRateLimit } from "../platform/rateLimit";
import { logWarn } from "../platform/log";
import type { Membership } from "../access/permissions";

export type PhoneActor = UserActor & { phone: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export const CODE_POLICY = {
  organizer: { length: 10, ttlMs: 14 * DAY_MS },
  staff: { length: 8, ttlMs: 7 * DAY_MS },
  /** Per-uid attempts per window (ADR-0004: 5 per hour, then lockout). */
  attemptsPerWindow: 5,
  windowSeconds: 60 * 60,
  /** Lifetime wrong guesses against one code before it must be re-issued. */
  maxAttemptsPerCode: 10,
} as const;

// ---- idempotency -----------------------------------------------------------

/**
 * PULSE receipts are namespaced by uid so one person can never block (or
 * observe) another person's request ids. The receipt still binds action and
 * actor, and a mismatch is refused.
 */
function receiptDoc(uid: string, requestId: string) {
  return db().collection(COLLECTIONS.commandReceipts).doc(`pulse__${uid}__${requestId}`);
}

export async function readReceipt(
  tx: Transaction,
  actorUid: string,
  requestId: string,
  action: string
): Promise<Record<string, unknown> | null> {
  const snap = await tx.get(receiptDoc(actorUid, requestId));
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.action !== action || data.actorUid !== actorUid) {
    throw new DomainError("CONFLICT", "This request was already used for a different action.", {
      nextStep: "Refresh and try again.",
    });
  }
  return (data.result ?? {}) as Record<string, unknown>;
}

/**
 * Stores the command outcome. NEVER pass a plaintext access code here: the
 * caller strips it and stores `codeAlreadyIssued: true` instead.
 */
export function writeReceipt(
  tx: Transaction,
  actorUid: string,
  requestId: string,
  action: string,
  result: Record<string, unknown>
): void {
  tx.create(receiptDoc(actorUid, requestId), { action, actorUid, result, createdAt: serverNow() });
}

// ---- codes -----------------------------------------------------------------

export const codeBucket = (purpose: "organizer" | "staff", uid: string) => `code-${purpose}-${uid}`;

/**
 * Counts one redemption attempt against the caller's hourly budget. A refused
 * attempt is audited as `access.code-failed` before the error surfaces.
 */
export async function consumeCodeAttempt(actor: PhoneActor, purpose: "organizer" | "staff"): Promise<void> {
  try {
    await consumeRateLimit({
      bucket: codeBucket(purpose, actor.uid),
      limit: CODE_POLICY.attemptsPerWindow,
      windowSeconds: CODE_POLICY.windowSeconds,
      message: "Too many incorrect codes. For your security, code entry is locked for an hour.",
    });
  } catch (error) {
    await auditCodeFailure(actor, purpose, "rate-limited");
    throw error;
  }
}

export type CodeFailureReason =
  | "rate-limited"
  | "bad-format"
  | "no-activation"
  | "not-issued"
  | "locked"
  | "mismatch"
  | "expired"
  | "no-invite"
  | "already-member"
  | "organizer-unavailable";

/**
 * Security signal for the `code_failures` metric. Never the attempted code.
 * Emitted ONCE per refused attempt, after the write that audits it has
 * committed — never from inside a transaction callback, which Firestore may
 * run several times (retries) or abandon (abort), inflating the metric.
 */
export function logCodeFailure(
  actor: PhoneActor,
  purpose: "organizer" | "staff",
  reason: CodeFailureReason,
  orgId: string | null = null
): void {
  logWarn({ event: "security.code-failed", uid: actor.uid, orgId, purpose, reason });
}

/**
 * Writes the `access.code-failed` audit entry into `writer` (a transaction or
 * batch). Does NOT log: the caller logs with logCodeFailure() once the write
 * has committed.
 */
export function codeFailureAudit(
  writer: Parameters<typeof writeAudit>[0],
  actor: PhoneActor,
  purpose: "organizer" | "staff",
  reason: CodeFailureReason,
  extra: { resourceId?: string; orgId?: string | null } = {}
): void {
  writeAudit(writer, {
    action: "access.code-failed",
    actorUid: actor.uid,
    actorRole: "customer",
    resourceType: purpose === "organizer" ? "organizerActivation" : "staffInvite",
    resourceId: extra.resourceId ?? actor.uid,
    orgId: extra.orgId ?? null,
    // Never the attempted code: a near-miss code in the audit trail is a leak.
    after: { purpose, reason },
    reason,
    source: "pulse-app",
  });
}

export async function auditCodeFailure(
  actor: PhoneActor,
  purpose: "organizer" | "staff",
  reason: CodeFailureReason,
  extra: { resourceId?: string; orgId?: string | null } = {}
): Promise<void> {
  const batch = db().batch();
  codeFailureAudit(batch, actor, purpose, reason, extra);
  await batch.commit();
  logCodeFailure(actor, purpose, reason, extra.orgId ?? null);
}

/** The user-facing error for a refused code (deliberately uninformative). */
export function codeRefused(reason: CodeFailureReason): DomainError {
  if (reason === "expired") {
    return new DomainError("PRECONDITION", "This code has expired.", {
      nextStep: "Ask for a new code.",
    });
  }
  if (reason === "locked") {
    return new DomainError("PRECONDITION", "This code has been locked after too many incorrect tries.", {
      nextStep: "Ask for a new code.",
    });
  }
  if (reason === "already-member") {
    return new DomainError("CONFLICT", "You already have access to this organizer.", {
      nextStep: "Open the organizer workspace from your profile.",
    });
  }
  if (reason === "organizer-unavailable") {
    return new DomainError("PRECONDITION", "This organizer can't accept new access right now.", {
      nextStep: "Contact PULSE support.",
    });
  }
  return new DomainError("INVALID_INPUT", "That code isn't valid for your account.", {
    nextStep: "Check the code and try again. Codes are single-use and tied to your phone number.",
  });
}

export const expiresIn = (ms: number) => Timestamp.fromMillis(serverNow().toMillis() + ms);

// ---- presentation ----------------------------------------------------------

export function iso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return null;
}

/** "+919876543210" → "+91 •••••• 3210". */
export function maskPhone(phone: unknown): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const last = digits.slice(-4).padStart(4, "•");
  return `+91 •••••• ${last}`;
}

export function membershipView(m: Membership) {
  return {
    orgId: m.orgId,
    uid: m.uid,
    role: m.role,
    status: m.status,
    title: m.title ?? null,
    permissions: m.permissions,
    eventScope: m.eventScope,
    version: m.version,
  };
}
