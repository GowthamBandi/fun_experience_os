import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import { DomainError } from "./errors";
import { correlationIdOf, logCallableFailure, safeRequestId } from "./log";
import { isEmulator, type SecretName } from "./security";

/** Maps any thrown value onto a safe HttpsError (no internals leak). */
export function toHttpsError(error: unknown): functions.https.HttpsError {
  if (error instanceof functions.https.HttpsError) return error;
  if (error instanceof DomainError) {
    return new functions.https.HttpsError(
      error.httpsCode as functions.https.FunctionsErrorCode,
      error.operatorMessage,
      error.toOperatorPayload()
    );
  }
  return new functions.https.HttpsError("internal", "Something went wrong on our side. Please try again.", {
    code: "INTERNAL",
    message: "Something went wrong on our side. Please try again.",
    nextStep: "Try again in a moment.",
  });
}

/** Deployed v1 functions carry their export name in FUNCTION_TARGET. */
const functionName = () => process.env.FUNCTION_TARGET ?? process.env.K_SERVICE ?? "callable";

/**
 * Standard PULSE callable: App Check enforced outside the emulator, secrets
 * bound at deploy time, every error mapped to a business-language payload.
 *
 * Every failure is logged once, structurally (platform/log.ts): DomainErrors
 * at WARNING/INFO with their business code (security codes get a
 * `security.*` event), anything unexpected at ERROR with its stack. The
 * request payload is never logged.
 */
export function callable<T>(
  handler: (data: unknown, context: CallableContext) => Promise<T>,
  opts: { secrets?: SecretName[]; region?: string } = {}
) {
  const emulator = isEmulator();
  return functions
    .region(opts.region ?? "asia-south1")
    .runWith({ enforceAppCheck: !emulator, secrets: emulator ? [] : (opts.secrets ?? []) })
    .https.onCall(async (data, context) => {
      try {
        return await handler(data, context);
      } catch (error) {
        if (!(error instanceof functions.https.HttpsError)) {
          logCallableFailure(functionName(), error, {
            uid: context?.auth?.uid ?? null,
            requestId: safeRequestId(data),
            correlationId: correlationIdOf(context),
          });
        }
        throw toHttpsError(error);
      }
    });
}

// ---- input validation ------------------------------------------------------

/** An unpaired UTF-16 surrogate (String.prototype.isWellFormed is ES2024; target is ES2021). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** True when `s` is well-formed Unicode (no lone surrogates). Firestore rejects anything else. */
export function isWellFormed(s: string): boolean {
  return !LONE_SURROGATE.test(s);
}

/** Refuses malformed Unicode as INVALID_INPUT before it can reach Firestore (which would answer INTERNAL). */
export function assertWellFormed(s: string, name: string): string {
  if (!isWellFormed(s)) throw new DomainError("INVALID_INPUT", `${name} contains invalid characters.`);
  return s;
}

export function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("INVALID_INPUT", "The request is invalid.");
  }
  return value as Record<string, unknown>;
}

export function str(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== "string") throw new DomainError("INVALID_INPUT", `${name} is required.`);
  assertWellFormed(value, name);
  const clean = value.trim();
  if (clean.length < min || clean.length > max) {
    throw new DomainError("INVALID_INPUT", `${name} must be ${min}–${max} characters.`);
  }
  return clean;
}

export function optStr(value: unknown, name: string, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return str(value, name, 0, max);
}

export function int(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new DomainError("INVALID_INPUT", `${name} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{3,127}$/;

export function docId(value: unknown, name: string): string {
  const s = str(value, name, 4, 128);
  if (!ID.test(s)) throw new DomainError("INVALID_INPUT", `${name} is not valid.`);
  return s;
}

const COMPOSITE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{3,149}$/;

/**
 * Server-composed document ids that can exceed docId()'s 128 characters,
 * e.g. refunds `req_{uid}_{requestId}` / `dup_{providerPaymentId}` and
 * settlements `stl_{orgId}_{requestId}` (both sliced to 150).
 */
export function compositeId(value: unknown, name: string): string {
  const s = str(value, name, 4, 150);
  if (!COMPOSITE_ID.test(s)) throw new DomainError("INVALID_INPUT", `${name} is not valid.`);
  return s;
}

/** Client idempotency key: 8–128 safe characters. */
export function requestId(value: unknown): string {
  const s = str(value, "requestId", 8, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new DomainError("INVALID_INPUT", "requestId is not valid.");
  return s;
}

export function strList(value: unknown, name: string, maxItems: number, maxLen: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new DomainError("INVALID_INPUT", `${name} must be a list.`);
  if (value.length > maxItems) throw new DomainError("INVALID_INPUT", `${name} can have at most ${maxItems} items.`);
  return value.map((v, i) => str(v, `${name} #${i + 1}`, 1, maxLen));
}

export function oneOf<T extends string>(value: unknown, name: string, options: readonly T[]): T {
  if (!options.includes(value as T)) throw new DomainError("INVALID_INPUT", `${name} is not supported.`);
  return value as T;
}
