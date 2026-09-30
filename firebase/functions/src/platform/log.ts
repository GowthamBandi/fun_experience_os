/**
 * Structured logging (docs/runbooks/OBSERVABILITY.md).
 *
 * One JSON entry per interesting thing, written through the firebase-functions
 * logger so Cloud Logging indexes `severity` and every field under
 * `jsonPayload`. Log-based metrics filter on `jsonPayload.event`, so event
 * names are part of the contract: rename one only together with its metric.
 *
 * NEVER logged: phone numbers, access codes or their hashes, push tokens,
 * signatures, secrets, request/response bodies. `sanitize()` enforces this by
 * key name and by value shape, so a careless caller can't leak them either.
 * Uids are logged raw (they are opaque identifiers, not personal data on their
 * own) so an operator can correlate a log line with the audit trail.
 */

import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import { DomainError, type DomainErrorCode } from "./errors";

export type Severity = "DEBUG" | "INFO" | "NOTICE" | "WARNING" | "ERROR" | "CRITICAL" | "ALERT";

export interface LogFields {
  /** Stable, dot-separated event name, e.g. `security.rate-limited`. */
  event: string;
  /** Client idempotency key of the command, when there is one. */
  requestId?: string | null;
  /** Cloud Trace id of the HTTP request (joins all lines of one call). */
  correlationId?: string | null;
  uid?: string | null;
  orgId?: string | null;
  /** DomainError code (never an access code). */
  code?: string | null;
  [key: string]: unknown;
}

/** Keys whose values are never written, whatever they contain. */
const DENY_KEY = /phone|token|secret|signature|password|passcode|pepper|codeHash|organizerCode|staffCode|^body$|^rawBody$|^payload$|^data$/i;
/**
 * A plausible Indian mobile number: optional `+91` / `91` / `0` prefix, then
 * exactly 10 digits starting 6–9 (optionally split 5+5 by a space or dash),
 * and NOT part of a longer token (letters, digits, `_`, `-`). Deliberately narrow: trace ids
 * (hex), ISO timestamps, request ids and document ids contain long digit runs
 * and must stay readable, so they are never matched.
 */
const PHONE_LIKE = /(?<![A-Za-z0-9_+-])(?:\+91[\s-]?|91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![A-Za-z0-9_])/g;
/**
 * Keys whose values are identifiers or timestamps: exempt from value-shape
 * scrubbing (a phone can't legitimately live there, and redacting them breaks
 * correlation). Key-name denial (DENY_KEY) still applies first.
 */
const ID_KEY = /^(?:correlationId|requestId|trace|traceId|time|timestamp|uid|at)$|[a-z0-9](?:Id|Ids|At)$/;

/** Replaces phone-number-shaped substrings. Exported for jobs.ts and tests. */
/**
 * Standalone 12–19 digit numbers (optionally grouped by spaces or dashes):
 * Aadhaar, card and bank-account shapes. No server path should log these;
 * this is defence in depth. Id/timestamp keys are exempt (see ID_KEY).
 */
// 12 digits (Aadhaar) or 15–19 (cards, bank accounts); 13–14 are left alone
// because epoch-millisecond timestamps have that shape. Not part of a longer
// token (letters, digits, "_" or "-" on either side).
const LONG_NUMBER = /(?<![A-Za-z0-9_-])\d(?:(?:[\s-]?\d){11}|(?:[\s-]?\d){14,18})(?![A-Za-z0-9_-]|[\s-]\d)/g;

export function redactPhones(s: string): string {
  return s.replace(PHONE_LIKE, "[redacted]").replace(LONG_NUMBER, "[redacted]");
}

function scrub(value: unknown, depth: number, key = ""): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return (ID_KEY.test(key) ? value : redactPhones(value)).slice(0, key === "stack" ? 4000 : 500);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (depth > 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1, key));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      out[k] = DENY_KEY.test(k) ? "[redacted]" : scrub(v, depth + 1, k);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

/** Removes secrets/PII from a field bag. Exported for tests. */
export function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  return scrub(fields, 0) as Record<string, unknown>;
}

export function log(severity: Severity, fields: LogFields): void {
  const clean = sanitize(fields);
  functions.logger.write({ severity, message: fields.event, ...clean });
}

export const logInfo = (f: LogFields) => log("INFO", f);
export const logWarn = (f: LogFields) => log("WARNING", f);
export const logError = (f: LogFields) => log("ERROR", f);

/** The Cloud Trace id of a callable request, if the platform supplied one. */
export function correlationIdOf(context: CallableContext | undefined): string | null {
  const headers = (context?.rawRequest as { headers?: Record<string, unknown> } | undefined)?.headers;
  const trace = headers?.["x-cloud-trace-context"];
  if (typeof trace === "string" && trace.length > 0) return trace.split("/")[0]!.slice(0, 64);
  return null;
}

/** A client idempotency key is safe to log (random, 8–128 url-safe chars). */
export function safeRequestId(data: unknown): string | null {
  const v = (data as Record<string, unknown> | null | undefined)?.requestId;
  return typeof v === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(v) ? v : null;
}

/** DomainError codes that are security signals, not ordinary user mistakes. */
const SECURITY_EVENT: Partial<Record<DomainErrorCode, string>> = {
  NOT_PERMITTED: "security.permission-denied",
  NOT_AUTHENTICATED: "security.unauthenticated",
  RATE_LIMITED: "security.rate-limited",
  SOLD_OUT: "booking.capacity-exhausted",
  VENUE_FULL: "booking.capacity-exhausted",
};

/**
 * Logs a failed callable. DomainErrors are expected, user-facing outcomes:
 * WARNING with the business code (and a security event name when relevant).
 * Anything else is a defect: ERROR with the stack, never shown to the user.
 */
export function logCallableFailure(
  fn: string,
  error: unknown,
  ctx: { uid?: string | null; requestId?: string | null; correlationId?: string | null }
): void {
  if (error instanceof DomainError) {
    // INVALID_INPUT / NOT_FOUND / CONFLICT are routine; keep them at INFO so
    // WARNING stays meaningful and log volume sane.
    const routine = ["INVALID_INPUT", "NOT_FOUND", "BOOKING_NOT_FOUND", "SESSION_NOT_FOUND", "CONFLICT"].includes(error.code);
    log(routine ? "INFO" : "WARNING", {
      event: SECURITY_EVENT[error.code] ?? "callable.domain-error",
      fn,
      code: error.code,
      uid: ctx.uid ?? null,
      requestId: ctx.requestId ?? null,
      correlationId: ctx.correlationId ?? null,
      detail: error.detail ?? null,
    });
    return;
  }
  const e = error as { name?: string; message?: string; stack?: string; code?: unknown };
  log("ERROR", {
    event: "callable.internal-error",
    fn,
    code: "INTERNAL",
    uid: ctx.uid ?? null,
    requestId: ctx.requestId ?? null,
    correlationId: ctx.correlationId ?? null,
    errorName: e?.name ?? typeof error,
    errorMessage: String(e?.message ?? error).slice(0, 500),
    errorCode: typeof e?.code === "string" || typeof e?.code === "number" ? e.code : null,
    stack: typeof e?.stack === "string" ? e.stack.slice(0, 4000) : null,
  });
}
