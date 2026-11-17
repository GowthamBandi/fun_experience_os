import { DomainError } from "../platform/errors";
import type { Timestamp } from "../platform/firestore";

/**
 * The Organizer Event Agreement every organizer accepts each time they submit
 * an experience, event or trip (app: legal_documents.dart → organizerAgreement).
 * Bump the version whenever the text changes: older app builds then can't
 * submit until they show the new text.
 */
export const ORGANIZER_AGREEMENT_VERSION = "ORG-EVENT-1.0";

export interface AgreementAcceptance {
  version: string;
  acceptedBy: string;
  acceptedAt: Timestamp;
}

/** Shape check, before any permission or database read (INVALID_INPUT). */
export function parseAgreementVersion(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 40) {
    throw new DomainError("INVALID_INPUT", "Read and accept the Organizer Event Agreement to submit.", {
      nextStep: "Update the app if you don't see the agreement.",
    });
  }
  return value;
}

/** Refuses a submission that didn't accept the current agreement. */
export function requireAgreement(value: unknown, uid: string, now: Timestamp): AgreementAcceptance {
  if (value !== ORGANIZER_AGREEMENT_VERSION) {
    throw new DomainError(
      "PRECONDITION",
      "Read and accept the Organizer Event Agreement to submit.",
      { nextStep: "Update the app if you don't see the agreement.", detail: { required: ORGANIZER_AGREEMENT_VERSION, got: typeof value === "string" ? value : null } },
    );
  }
  return { version: ORGANIZER_AGREEMENT_VERSION, acceptedBy: uid, acceptedAt: now };
}
