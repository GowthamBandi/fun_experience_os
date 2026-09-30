import type { CallableContext } from "firebase-functions/v1/https";
import { DomainError, notAuthenticated } from "./errors";

/**
 * A signed-in PULSE person (customer, organizer or staff — one identity).
 * Organizer/staff authority is NOT carried here; it is resolved from
 * `memberships` per request (ADR-0004), so revocation is immediate.
 */
export interface UserActor {
  uid: string;
  /** Verified E.164 phone from the Firebase phone-auth token, if any. */
  phone: string | null;
  /** Platform role claim (console operators only). */
  platformRole: string | null;
}

export function requireUser(context: CallableContext): UserActor {
  if (!context.auth) throw notAuthenticated();
  const token = context.auth.token as Record<string, unknown>;
  if (token.disabled === true) {
    throw new DomainError("NOT_PERMITTED", "This account is suspended.", {
      nextStep: "Contact PULSE support if you think this is a mistake.",
    });
  }
  const phone = typeof token.phone_number === "string" ? token.phone_number : null;
  const role = typeof token.roleId === "string" ? token.roleId : null;
  return { uid: context.auth.uid, phone, platformRole: role };
}

/** Customers/organizers/staff must sign in with a verified phone number. */
export function requirePhoneUser(context: CallableContext): UserActor & { phone: string } {
  const actor = requireUser(context);
  if (!actor.phone) {
    throw new DomainError("NOT_PERMITTED", "Sign in with your mobile number to continue.", {
      nextStep: "Use phone sign-in in the PULSE app.",
    });
  }
  return actor as UserActor & { phone: string };
}
