/**
 * Firestore access boundary.
 *
 * Every server-side module goes through this file so that collection paths,
 * admin initialisation and converters exist in exactly one place.
 */

import { initializeApp, getApps, App } from "firebase-admin/app";
import { getFirestore, Firestore, Timestamp } from "firebase-admin/firestore";

let _app: App | undefined;

export function app(): App {
  if (!_app) {
    _app = getApps().length ? getApps()[0]! : initializeApp();
  }
  return _app;
}

let _db: Firestore | undefined;

/**
 * Firestore's `settings()` may be called at most once per instance, and only
 * before any other method touches it. If a trigger, a test harness, or another
 * module reaches Firestore first, a naive `settings()` call throws
 * "Firestore has already been initialized" and takes the whole function down.
 *
 * Configuration is therefore best-effort and never fatal: the flag we set is a
 * convenience, not a correctness requirement, so losing the race is harmless
 * while crashing on it is not. Caught by test/concurrency.test.ts PROOF 1.
 */
export function db(): Firestore {
  if (!_db) {
    const instance = getFirestore(app());
    try {
      instance.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Already configured by an earlier caller — use it as it stands.
    }
    _db = instance;
  }
  return _db;
}

/**
 * Canonical collection paths. Every client of the platform — the Next.js
 * Super Admin today, the Flutter Organizer and Customer apps later — reads and
 * writes these and only these. See docs/FIRESTORE_DATA_MODEL.md.
 */
export const COLLECTIONS = {
  /** Operator/staff accounts, keyed by Firebase Auth uid. */
  users: "users",
  /** Franchise → territory → city → venue → playing area footprint. */
  franchises: "franchises",
  territories: "territories",
  cities: "cities",
  venues: "venues",
  playingAreas: "playingAreas",
  /** Catalog. */
  activityCategories: "activityCategories",
  experienceTemplates: "experienceTemplates",
  /** Operations. */
  scheduledSessions: "scheduledSessions",
  bookings: "bookings",
  payments: "payments",
  refunds: "refunds",
  /** Append-only trails. Never writable from a client. */
  auditEvents: "auditEvents",
  /** Idempotency ledger for at-most-once command execution. */
  commandReceipts: "commandReceipts",
  /** Marketplace-governance control plane. */
  governanceCases: "governanceCases",
  organizers: "organizers",
  arenas: "arenas",
  events: "events",
  commercialAgreements: "commercialAgreements",
  riskAlerts: "riskAlerts",
  refundCases: "refundCases",
  settlementControls: "settlementControls",
  policyVersions: "policyVersions",
  customers: "customers",
  /** Canonical marketplace model (ADR-0003). */
  publicProfiles: "publicProfiles",
  customerSafety: "customerSafety",
  organizerApplications: "organizerApplications",
  organizerActivations: "organizerActivations",
  memberships: "memberships",
  staffInvites: "staffInvites",
  experiences: "experiences",
  tickets: "tickets",
  paymentEvents: "paymentEvents",
  ledgerEntries: "ledgerEntries",
  settlements: "settlements",
  reviews: "reviews",
  userNotifications: "userNotifications",
  rateLimits: "rateLimits",
} as const;

export const membershipId = (orgId: string, uid: string) => `${orgId}__${uid}`;

/** The bookable unit is the event (ADR-0003; formerly `scheduledSessions`). */
export const sessionRef = (eventId: string) =>
  db().collection(COLLECTIONS.events).doc(eventId);

export const bookingRef = (bookingId: string) =>
  db().collection(COLLECTIONS.bookings).doc(bookingId);

export const newBookingRef = () => db().collection(COLLECTIONS.bookings).doc();

export const auditRef = () => db().collection(COLLECTIONS.auditEvents).doc();

export const receiptRef = (requestId: string) =>
  db().collection(COLLECTIONS.commandReceipts).doc(requestId);

/**
 * Server clock. Never accept a timestamp from a client for anything
 * authoritative — a client clock is attacker-controlled.
 */
export const serverNow = (): Timestamp => Timestamp.now();

export { Timestamp };
