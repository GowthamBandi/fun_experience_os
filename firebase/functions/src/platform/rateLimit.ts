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
