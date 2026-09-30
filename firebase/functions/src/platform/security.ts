/**
 * Cryptographic helpers and server secrets.
 *
 * Secrets come from Firebase Secret Manager (injected as env vars by
 * `runWith({ secrets })`). In the emulator a clearly-named development value
 * is used. Outside the emulator a missing secret FAILS CLOSED — the platform
 * never signs tickets or hashes codes with a guessable key.
 */

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { DomainError } from "./errors";

export const SECRET_NAMES = {
  codePepper: "CODE_PEPPER",
  ticketKey: "TICKET_SIGNING_KEY",
  razorpayKeyId: "RAZORPAY_KEY_ID",
  razorpayKeySecret: "RAZORPAY_KEY_SECRET",
  razorpayWebhookSecret: "RAZORPAY_WEBHOOK_SECRET",
} as const;

export type SecretName = (typeof SECRET_NAMES)[keyof typeof SECRET_NAMES];

/**
 * True only for local emulator/test runs. A deployed Cloud Function always
 * has K_SERVICE / FUNCTION_TARGET set, so a stray FIRESTORE_EMULATOR_HOST in
 * production can never unlock development secrets or the fake provider.
 */
export const isEmulator = (): boolean => {
  const deployed = !!process.env.K_SERVICE || !!process.env.FUNCTION_TARGET;
  if (process.env.FUNCTIONS_EMULATOR === "true") return true;
  return !deployed && !!process.env.FIRESTORE_EMULATOR_HOST;
};

/** Reads a secret. Emulator/test runs get a deterministic dev value. */
export function secret(name: SecretName): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (isEmulator()) return `dev-only-${name.toLowerCase()}-not-for-production`;
  throw new DomainError("INTERNAL", "This service isn't configured yet.", {
    nextStep: "Platform engineering must set the required secret before this feature can be used.",
    detail: { missingSecret: name },
  });
}

export function hmac(key: string, message: string): Buffer {
  return createHmac("sha256", key).update(message).digest();
}

export function hmacHex(key: string, message: string): string {
  return hmac(key, message).toString("hex");
}

export function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time string comparison (for signatures and hashes). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** No 0/O/1/I/L — codes are read aloud and typed on phones. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Cryptographically random access code, e.g. "K7Q2-M9XP-4T". */
export function generateCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Canonical code form: uppercase, alphabet characters only. */
export function normalizeCode(input: unknown): string {
  return String(input ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Keyed hash for access codes. Stored instead of the code. */
export function hashCode(purpose: "organizer" | "staff", code: string): string {
  return hmacHex(secret(SECRET_NAMES.codePepper), `${purpose}|${normalizeCode(code)}`);
}

/** Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX). */
export function normalizeIndianPhone(input: unknown): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return `+91${local}`;
}
