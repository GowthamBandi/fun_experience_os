/**
 * Organizer onboarding primitives shared by the console (decideCase approval,
 * reissueOrganizerCode) and PULSE (redeemOrganizerCode). ADR-0004.
 */

import type { Timestamp } from "firebase-admin/firestore";
import { generateCode, hashCode } from "../platform/security";
import { serverNow, Timestamp as Ts } from "../platform/firestore";

export const ORGANIZER_CODE_LENGTH = 10;
export const ORGANIZER_CODE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const KYC_POLICY_VERSION = "KYC-2.0";

export const organizerCaseId = (applicantUid: string) => `organizer-kyc_${applicantUid}`;

/**
 * A fresh organizer code. The plaintext goes back to the admin exactly once;
 * only the HMAC (keyed with CODE_PEPPER) is ever persisted.
 */
export function newOrganizerCode(): { code: string; codeHash: string; expiresAt: Timestamp } {
  const code = generateCode(ORGANIZER_CODE_LENGTH);
  return {
    code,
    codeHash: hashCode("organizer", code),
    expiresAt: Ts.fromMillis(serverNow().toMillis() + ORGANIZER_CODE_TTL_MS),
  };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "organizer";
}

export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? "O").slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The public organizer projection. Deliberately excludes commission, legal
 * name, KYC state, contact email and owner uid.
 */
export function publicOrganizerDoc(org: {
  orgId: string;
  name: string;
  handle: string;
  city: string;
  categories: string[];
  about: string;
  hostingSince: Timestamp;
}) {
  return {
    orgId: org.orgId,
    name: org.name,
    handle: org.handle,
    city: org.city,
    categories: org.categories,
    about: org.about,
    verified: true,
    hostingSince: org.hostingSince,
    monogram: monogram(org.name),
    updatedAt: serverNow(),
  };
}
