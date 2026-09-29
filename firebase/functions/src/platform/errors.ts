/**
 * Domain errors and their human-readable surface.
 *
 * PRINCIPLE (Mission 16): every error a normal business operator can see must
 * answer three questions — what happened, why, and what to do next. Internal
 * detail stays in the logs and never reaches the operator's screen.
 */

export type DomainErrorCode =
  | "SOLD_OUT"
  | "VENUE_FULL"
  | "SESSION_NOT_FOUND"
  | "SESSION_NOT_BOOKABLE"
  | "BOOKING_NOT_FOUND"
  | "INVALID_INPUT"
  | "NOT_AUTHENTICATED"
  | "NOT_PERMITTED"
  | "CONFLICT"
  | "CONTENTION"
  | "INTERNAL";

/** How a DomainError maps onto a callable-function error code. */
const HTTPS_CODE: Record<DomainErrorCode, string> = {
  SOLD_OUT: "failed-precondition",
  VENUE_FULL: "failed-precondition",
  SESSION_NOT_FOUND: "not-found",
  SESSION_NOT_BOOKABLE: "failed-precondition",
  BOOKING_NOT_FOUND: "not-found",
  INVALID_INPUT: "invalid-argument",
  NOT_AUTHENTICATED: "unauthenticated",
  NOT_PERMITTED: "permission-denied",
  CONFLICT: "aborted",
  CONTENTION: "aborted",
  INTERNAL: "internal",
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  /** Shown to the operator. Plain business language, never jargon. */
  readonly operatorMessage: string;
  /** What the operator can do about it. */
  readonly nextStep?: string;
  /** Structured detail for logs and tests. Never rendered verbatim. */
  readonly detail?: Record<string, unknown>;

  constructor(
    code: DomainErrorCode,
    operatorMessage: string,
    opts: { nextStep?: string; detail?: Record<string, unknown>; cause?: unknown } = {}
  ) {
    super(`${code}: ${operatorMessage}`);
    this.name = "DomainError";
    this.code = code;
    this.operatorMessage = operatorMessage;
    this.nextStep = opts.nextStep;
    this.detail = opts.detail;
    if (opts.cause) (this as { cause?: unknown }).cause = opts.cause;
  }

  get httpsCode(): string {
    return HTTPS_CODE[this.code];
  }

  /** The safe, operator-facing payload. Contains no internals. */
  toOperatorPayload() {
    return {
      code: this.code,
      message: this.operatorMessage,
      nextStep: this.nextStep,
    };
  }
}

export const soldOut = (message: string) =>
  new DomainError("SOLD_OUT", message, {
    nextStep: "You can add this person to the waiting list instead.",
  });

export const venueFull = (message: string) =>
  new DomainError("VENUE_FULL", message, {
    nextStep: "Free up a place, or move the session to a larger playing area.",
  });

export const notPermitted = (action: string) =>
  new DomainError("NOT_PERMITTED", "You don't have permission to do this.", {
    nextStep: "Ask a Platform Owner or Super Admin if you need access.",
    detail: { action },
  });

export const notAuthenticated = () =>
  new DomainError("NOT_AUTHENTICATED", "You've been signed out.", {
    nextStep: "Sign in again to continue.",
  });

export const invalidInput = (message: string, detail?: Record<string, unknown>) =>
  new DomainError("INVALID_INPUT", message, { detail });
