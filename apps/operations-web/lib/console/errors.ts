/**
 * Maps a thrown callable/Firestore error onto something an operator can act on.
 *
 * Server contract (docs/API_CONTRACT.md): HttpsError whose `message` is always
 * safe to show, with `details = { code, message, nextStep }`.
 */

import { CommandValidationError } from "./actions";

export type ConsoleErrorKind =
  | "validation"
  | "conflict"
  | "dual-control"
  | "permission"
  | "precondition"
  | "not-found"
  | "rate-limited"
  | "unauthenticated"
  | "unavailable"
  | "unknown";

export interface ConsoleError {
  kind: ConsoleErrorKind;
  /** Operator-facing message. For server errors this is the server's message verbatim. */
  message: string;
  nextStep: string | null;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

const DUAL_CONTROL = /different admin|two different admins|second approv/i;

export const CONFLICT_MESSAGE = "Someone else changed this — refresh to see the latest version.";

export function mapConsoleError(error: unknown): ConsoleError {
  if (error instanceof CommandValidationError) return { kind: "validation", message: error.message, nextStep: null };

  const rawCode = String(field(error, "code") ?? "");
  const code = rawCode.replace(/^(functions|firestore|auth)\//, "");
  const details = field(error, "details");
  const detailMessage = field(details, "message");
  const nextStepRaw = field(details, "nextStep");
  const serverMessage = typeof detailMessage === "string" && detailMessage.trim()
    ? detailMessage
    : typeof field(error, "message") === "string" ? String(field(error, "message")) : "";
  const nextStep = typeof nextStepRaw === "string" && nextStepRaw.trim() ? nextStepRaw : null;
  const domainCode = String(field(details, "code") ?? "");

  switch (code) {
    case "aborted":
      // CONFLICT / CONTENTION: stale version or already decided.
      return { kind: "conflict", message: serverMessage ? `${CONFLICT_MESSAGE} (${serverMessage})` : CONFLICT_MESSAGE, nextStep: nextStep ?? "Refresh, review the current state and decide again." };
    case "permission-denied":
      if (DUAL_CONTROL.test(serverMessage) || DUAL_CONTROL.test(nextStep ?? "")) {
        return { kind: "dual-control", message: serverMessage, nextStep };
      }
      return { kind: "permission", message: serverMessage || "Your account is not permitted to do this.", nextStep };
    case "failed-precondition":
      return { kind: "precondition", message: serverMessage || "This action isn't allowed in the record's current state.", nextStep };
    case "not-found":
      return { kind: "not-found", message: serverMessage || "This record no longer exists.", nextStep: nextStep ?? "Refresh the list." };
    case "invalid-argument":
      return { kind: "validation", message: serverMessage || "The request was invalid.", nextStep };
    case "resource-exhausted":
      return { kind: "rate-limited", message: serverMessage || "Too many attempts. Try again later.", nextStep };
    case "unauthenticated":
      return { kind: "unauthenticated", message: "Your session has expired. Sign in again.", nextStep: null };
    case "unavailable":
    case "deadline-exceeded":
      return { kind: "unavailable", message: "The server could not be reached. Your request is safe to retry — it will not be applied twice.", nextStep: null };
    default:
      if (domainCode === "CONFLICT") return { kind: "conflict", message: CONFLICT_MESSAGE, nextStep };
      if (code === "internal" && /not found|does not exist/i.test(serverMessage)) {
        return { kind: "unavailable", message: "This server action is not deployed in the connected environment.", nextStep: "Deploy the Firebase functions or start the emulator suite." };
      }
      return { kind: "unknown", message: serverMessage || "The action could not be completed.", nextStep };
  }
}

/** Friendly message for a Firestore listener failure. */
export function describeReadError(message: string): string {
  if (/permission|insufficient/i.test(message)) {
    return "Your account can't read these records. Only verified Platform Owner / Super Admin accounts can view governance data.";
  }
  if (/offline|unavailable|network/i.test(message)) return "The database could not be reached. Records will appear when the connection returns.";
  return `The records could not be loaded: ${message}`;
}
