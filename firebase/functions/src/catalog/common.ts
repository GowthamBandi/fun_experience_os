/**
 * Catalog command plumbing: idempotency receipts, timestamps and small
 * shared validators. Every catalog mutation runs as ONE Firestore transaction:
 *
 *   authorize → read receipt → (replay | validate + read state) → write state
 *   → writeAudit → write receipt
 *
 * The receipt is bound to (action, actorUid): the same requestId reused for a
 * different action, or by a different person, is refused with CONFLICT.
 */

import type { Transaction } from "firebase-admin/firestore";
import { DomainError, precondition } from "../platform/errors";
import { COLLECTIONS, db, receiptRef, serverNow, Timestamp } from "../platform/firestore";
import { readMembership, allows, type Membership } from "../access/permissions";

export type Json = Record<string, unknown>;

export async function runCommand<T extends Json>(
  action: string,
  actorUid: string,
  requestId: string,
  body: (tx: Transaction, now: Timestamp) => Promise<T>,
  opts: {
    /**
     * Authorization that must hold on EVERY call, including idempotent
     * replays: a revoked member replaying an old requestId is refused, so
     * revocation is immediate even for read-back of past results.
     */
    authorize?: (tx: Transaction) => Promise<unknown>;
  } = {}
): Promise<T & { replayed: boolean }> {
  return db().runTransaction(async (tx) => {
    const ref = receiptRef(requestId);
    if (opts.authorize) await opts.authorize(tx);
    const snap = await tx.get(ref);
    if (snap.exists) {
      const r = snap.data()!;
      if (r.action !== action || r.actorUid !== actorUid) {
        throw new DomainError("CONFLICT", "This request ID has already been used for another action.", {
          nextStep: "Generate a new request ID and try again.",
        });
      }
      return { ...(r.result as T), replayed: true };
    }
    const now = serverNow();
    const result = await body(tx, now);
    tx.create(ref, { action, actorUid, result, createdAt: now });
    return { ...result, replayed: false };
  });
}

export const iso = (t: unknown): string | null =>
  t instanceof Timestamp ? t.toDate().toISOString() : null;

export function parseInstant(value: unknown, name: string): Timestamp {
  if (typeof value !== "string" || value.length > 40) throw new DomainError("INVALID_INPUT", `${name} is required.`);
  // ISO-8601 with an explicit offset or Z; a local time without zone is ambiguous.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new DomainError("INVALID_INPUT", `${name} must be an ISO-8601 date-time with a time zone.`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new DomainError("INVALID_INPUT", `${name} is not a valid date.`);
  return Timestamp.fromMillis(ms);
}

export function bool(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new DomainError("INVALID_INPUT", `${name} must be true or false.`);
  return value;
}

export function num(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new DomainError("INVALID_INPUT", `${name} must be a number between ${min} and ${max}.`);
  }
  return value;
}

export const notFoundHere = (what: string) =>
  new DomainError("NOT_FOUND", `This ${what} doesn't exist or isn't part of this organizer.`, {
    nextStep: "Go back and refresh.",
  });

export const organizerRef = (orgId: string) => db().collection(COLLECTIONS.organizers).doc(orgId);
export const experienceRef = (id: string) => db().collection(COLLECTIONS.experiences).doc(id);
export const eventRef = (id: string) => db().collection(COLLECTIONS.events).doc(id);

/** Organizer display name for governance/console fields. */
export function organizerName(org: Json | undefined): string {
  const n = org?.displayName ?? org?.name ?? org?.legalName;
  return typeof n === "string" && n.length > 0 ? n : "Organizer";
}

/**
 * The responsibility invariant (ADR-0003 §3): the primary must be an ACTIVE
 * member of the owning organizer holding `events.operate` for this event.
 */
export async function assertResponsibility(
  tx: Transaction,
  orgId: string,
  eventId: string,
  primaryUid: string,
  staffUids: string[]
): Promise<void> {
  const primary = await readMembership(orgId, primaryUid, tx);
  if (!allows(primary, "events.operate", eventId)) {
    throw precondition(
      "The person responsible for this event must be an active team member who can run events.",
      "Choose a team member with event-running access, or update their access first.",
      { primaryUid }
    );
  }
  const staff = await Promise.all(staffUids.map((u) => readMembership(orgId, u, tx)));
  staff.forEach((m: Membership | null, i) => {
    if (!m || m.status !== "active") {
      throw precondition("Every assigned staff member must be an active member of your team.", "Remove them or re-invite them.", {
        staffUid: staffUids[i],
      });
    }
  });
}

export function uidList(value: unknown, name: string, max: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new DomainError("INVALID_INPUT", `${name} must be a list.`);
  if (value.length > max) throw new DomainError("INVALID_INPUT", `${name} can have at most ${max} people.`);
  const out = value.map((v) => {
    if (typeof v !== "string" || !/^[A-Za-z0-9_-]{4,128}$/.test(v)) throw new DomainError("INVALID_INPUT", `${name} contains an invalid person.`);
    return v;
  });
  return [...new Set(out)];
}
