/**
 * Pure commerce rules: eligibility and cancellation policy. No I/O.
 */

import type { CancellationPolicy } from "./config";

export type GenderRule = "open" | "women-only" | "men-only" | "mixed";

export interface Eligibility {
  ageMin: number;
  ageMax: number | null;
  genderRule: GenderRule;
}

export const DEFAULT_ELIGIBILITY: Eligibility = { ageMin: 18, ageMax: null, genderRule: "open" };

const IST_OFFSET_MS = 330 * 60_000;

/** Whole years of age on the event's start date, in India time. */
export function ageOn(birthDate: string, at: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const by = Number(m[1]);
  const bm = Number(m[2]);
  const bd = Number(m[3]);
  if (bm < 1 || bm > 12 || bd < 1 || bd > 31) return null;
  const local = new Date(at.getTime() + IST_OFFSET_MS);
  const y = local.getUTCFullYear();
  const mo = local.getUTCMonth() + 1;
  const d = local.getUTCDate();
  let age = y - by;
  if (mo < bm || (mo === bm && d < bd)) age--;
  return age;
}

export type EligibilityVerdict =
  | { ok: true; snapshot: { ageVerifiedOk: true; genderOk: true } }
  | { ok: false; reason: "profile" | "age" | "gender"; message: string };

export function checkEligibility(
  rule: Partial<Eligibility> | undefined,
  safety: { birthDate?: unknown; gender?: unknown } | undefined,
  startsAt: Date
): EligibilityVerdict {
  const r: Eligibility = { ...DEFAULT_ELIGIBILITY, ...(rule ?? {}) };
  if (!safety || typeof safety.birthDate !== "string" || typeof safety.gender !== "string") {
    return { ok: false, reason: "profile", message: "Complete your profile before booking." };
  }
  const age = ageOn(safety.birthDate, startsAt);
  if (age === null) return { ok: false, reason: "profile", message: "Complete your profile before booking." };
  if (age < r.ageMin || (r.ageMax !== null && r.ageMax !== undefined && age > r.ageMax)) {
    return {
      ok: false,
      reason: "age",
      message:
        r.ageMax !== null && r.ageMax !== undefined
          ? `This experience is for ages ${r.ageMin}–${r.ageMax}.`
          : `This experience is for ages ${r.ageMin} and over.`,
    };
  }
  if (r.genderRule === "women-only" && safety.gender !== "woman") {
    return { ok: false, reason: "gender", message: "This experience is for women only." };
  }
  if (r.genderRule === "men-only" && safety.gender !== "man") {
    return { ok: false, reason: "gender", message: "This experience is for men only." };
  }
  return { ok: true, snapshot: { ageVerifiedOk: true, genderOk: true } };
}

/** Refund percent for a cancellation `hoursBefore` the start (the PULSE presets). */
export function cancellationPercent(policy: CancellationPolicy | string | undefined, hoursBefore: number): number {
  if (hoursBefore < 0) return 0;
  switch (policy) {
    case "flexible":
      return hoursBefore >= 24 ? 100 : 50;
    case "moderate":
      return hoursBefore >= 72 ? 100 : hoursBefore >= 24 ? 50 : 0;
    case "strict":
      return hoursBefore >= 168 ? 100 : 0;
    default:
      // Unknown policy: the most customer-protective reading is not ours to
      // invent; fall back to the strict preset.
      return hoursBefore >= 168 ? 100 : 0;
  }
}

/** Integer paise, rounded down (never refunds more than the policy). */
export function refundAmount(paidMinor: number, percent: number): number {
  return Math.floor((paidMinor * percent) / 100);
}
