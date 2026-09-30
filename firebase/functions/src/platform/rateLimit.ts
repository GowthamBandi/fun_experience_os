import { db, serverNow, Timestamp } from "./firestore";
import { DomainError } from "./errors";

/**
 * Fixed-window rate limiter backed by `rateLimits/{bucket}` (server-only).
 * Used for brute-forceable operations (access codes) and abuse-prone
 * commands (booking, reviews). Runs in its own transaction so a rejected
 * attempt is still counted.
 */
export async function consumeRateLimit(opts: {
  bucket: string;
  limit: number;
  windowSeconds: number;
  message?: string;
}): Promise<void> {
  const ref = db().collection("rateLimits").doc(opts.bucket.replace(/\//g, "_"));
  const allowed = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = serverNow();
    const data = snap.data() as { windowStart?: Timestamp; count?: number } | undefined;
    const start = data?.windowStart?.toMillis() ?? 0;
    const inWindow = now.toMillis() - start < opts.windowSeconds * 1000;
    const count = inWindow ? (data?.count ?? 0) : 0;
    if (count >= opts.limit) return false;
    tx.set(ref, {
      windowStart: inWindow ? data!.windowStart : now,
      count: count + 1,
      updatedAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + opts.windowSeconds * 1000),
    });
    return true;
  });
  if (!allowed) {
    throw new DomainError("RATE_LIMITED", opts.message ?? "Too many attempts. Please wait a while and try again.", {
      nextStep: "Try again later.",
      detail: { bucket: opts.bucket },
    });
  }
}

/** Resets a bucket after a successful attempt (e.g. correct code). */
export async function resetRateLimit(bucket: string): Promise<void> {
  await db().collection("rateLimits").doc(bucket.replace(/\//g, "_")).delete();
}

/**
 * Per-uid limits for identity/catalog endpoints (commerce keeps its own table
 * in commerce/config.ts RATE_LIMITS). Sized far above honest use: they exist
 * to cap automated abuse (governance-queue spam, write amplification, push
 * token stuffing), not to shape normal traffic. See docs/runbooks/OBSERVABILITY.md.
 */
export const LIMITS = {
  /** updateMyProfile. */
  profileUpdate: { limit: 20, windowSeconds: 60 * 60 },
  /** registerPushToken + unregisterPushToken (one shared bucket). */
  pushToken: { limit: 30, windowSeconds: 60 * 60 },
  /** saveExperience / saveEvent drafts. PULSE autosaves ~700 ms after each edit, so this is sized for autosave bursts. */
  catalogSave: { limit: 600, windowSeconds: 10 * 60 },
  /** submitExperience / submitEvent: each opens a governance case. */
  catalogSubmit: { limit: 30, windowSeconds: 60 * 60 },
  /** publishEvent / setEventPhase / setEventResponsibility. */
  catalogOps: { limit: 60, windowSeconds: 10 * 60 },
  /** cancelEvent: fans out refunds to every booking. */
  eventCancel: { limit: 10, windowSeconds: 60 * 60 },
  /** reissueStaffCode: mints a new access code each time. */
  staffReissue: { limit: 30, windowSeconds: 60 * 60 },
  /** updateStaff / revokeStaff. */
  staffManage: { limit: 60, windowSeconds: 60 * 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

/** Consumes one unit of a named per-uid limit (`<name>_<uid>` bucket). */
export function consumeLimit(name: LimitName, uid: string, message?: string): Promise<void> {
  return consumeRateLimit({ bucket: `${name}_${uid}`, ...LIMITS[name], message });
}
