/**
 * Callable error surface. Every callable funnels failures through here so an
 * operator only ever sees a DomainError's plain-language message; anything
 * unexpected is logged server-side and surfaced as a generic INTERNAL error.
 */
import * as functions from "firebase-functions/v1";
import { DomainError } from "./errors";

/** App Check is enforced everywhere except the local emulator. */
export const enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== "true";

export function toHttpsError(error: unknown, fallbackMessage: string): functions.https.HttpsError {
  if (error instanceof functions.https.HttpsError) return error;
  const domain =
    error instanceof DomainError
      ? error
      : new DomainError("INTERNAL", fallbackMessage, {
          nextStep: "Try again. If this continues, contact platform engineering.",
          cause: error,
        });
  if (!(error instanceof DomainError)) functions.logger.error(fallbackMessage, error);
  return new functions.https.HttpsError(
    domain.httpsCode as functions.https.FunctionsErrorCode,
    domain.operatorMessage,
    domain.toOperatorPayload()
  );
}
