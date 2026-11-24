/**
 * Account status (docs/NOTIFICATION_CENTER_CONTRACT.md §3 and §5): PULSE can
 * pause or block a person. This module is the ONE place the status is read
 * and enforced; the console callable lives in platform/accountControls.ts.
 *
 *   accountStatus/{uid}        { status, messageToUser, until, updatedAt, updatedBy, version }
 *                              readable by the person (no reason in it)
 *   accountStatusPrivate/{uid} { reason, history[], updatedAt }  admins only
 *   custom claim `acct`        "paused" | "blocked" (absent when active)
 *
 * Enforcement:
 *  - blocked: the shared callable() wrapper calls assertAccountUsable() for
 *    every signed-in call (claim + status doc), and requireUser() refuses an
 *    `acct: "blocked"` token outright.
 *  - paused: customer actions call assertCustomerActionAllowed() (support,
 *    reading and organizer work stay allowed).
 *  - `until`: a passed `until` reads as active everywhere; the daily job
 *    (accountControls.expireAccountStatuses) writes the return to active.
 *
 * No import of ./callable here: callable.ts imports this module.
 */
import type { Transaction } from "firebase-admin/firestore";
import { db, serverNow, Timestamp } from "./firestore";
import { DomainError } from "./errors";

export const ACCOUNT_STATUS = "accountStatus";
export const ACCOUNT_STATUS_PRIVATE = "accountStatusPrivate";
export const ACCOUNT_STATUSES = ["active", "paused", "blocked"] as const;
export type AccountStatusValue = (typeof ACCOUNT_STATUSES)[number];

export const accountStatusRef = (uid: string) => db().collection(ACCOUNT_STATUS).doc(uid);
export const accountStatusPrivateRef = (uid: string) => db().collection(ACCOUNT_STATUS_PRIVATE).doc(uid);

export interface EffectiveAccountStatus {
  status: AccountStatusValue;
  /** The status stored on the document, before applying `until`. */
  stored: AccountStatusValue;
  messageToUser: string | null;
  until: Timestamp | null;
  /** True when the stored status is paused/blocked but `until` has passed. */
  expired: boolean;
}

const ACTIVE: EffectiveAccountStatus = { status: "active", stored: "active", messageToUser: null, until: null, expired: false };

/** The status a document means right now (a passed `until` reads as active). */
export function effectiveAccountStatus(data: Record<string, unknown> | undefined | null, nowMs = Date.now()): EffectiveAccountStatus {
  if (!data) return ACTIVE;
  const stored = (ACCOUNT_STATUSES as readonly string[]).includes(String(data.status)) ? (data.status as AccountStatusValue) : "active";
  const until = data.until instanceof Timestamp ? data.until : null;
  const messageToUser = typeof data.messageToUser === "string" && data.messageToUser.trim() ? data.messageToUser.trim() : null;
  if (stored === "active") return { ...ACTIVE, messageToUser };
  const expired = !!until && until.toMillis() <= nowMs;
  return { status: expired ? "active" : stored, stored, messageToUser, until, expired };
}

export async function readAccountStatus(uid: string, tx?: Transaction): Promise<EffectiveAccountStatus> {
  const ref = accountStatusRef(uid);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return effectiveAccountStatus(snap.data(), serverNow().toMillis());
}

/** "2 Dec 2026, 6:00 pm IST" — how the person reads an `until`. */
export function istUntilLabel(t: Timestamp): string {
  const s = new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  }).format(t.toDate());
  return `${s.replace(/\s+/g, " ").replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase())} IST`;
}

/**
 * "Your account is paused{until …}. {messageToUser}" (contract §3). HTTPS status
 * permission-denied; `details.code` = "ACCOUNT_PAUSED" so the app can react
 * without reading accountStatus/{uid}.
 */
export function pausedError(s: Pick<EffectiveAccountStatus, "until" | "messageToUser">): DomainError {
  const until = s.until ? ` until ${istUntilLabel(s.until)}` : "";
  const message = `Your account is paused${until}.${s.messageToUser ? ` ${s.messageToUser}` : ""}`;
  return new DomainError("ACCOUNT_PAUSED", message, {
    nextStep: "You can still look around and contact PULSE support.",
    facts: { accountStatus: "paused", ...(s.until ? { until: s.until.toDate().toISOString() } : {}) },
    detail: { accountStatus: "paused" },
  });
}

/** permission-denied with `details.code` = "ACCOUNT_BLOCKED". */
export function blockedError(): DomainError {
  return new DomainError("ACCOUNT_BLOCKED", "This account is suspended.", {
    nextStep: "Contact PULSE support if you think this is a mistake.",
    facts: { accountStatus: "blocked" },
    detail: { accountStatus: "blocked" },
  });
}

/**
 * Customer actions (book, pay for a new booking, join a waitlist, review,
 * follow, apply to host) refuse a paused or blocked account. One read.
 */
export async function assertCustomerActionAllowed(uid: string, tx?: Transaction): Promise<void> {
  const s = await readAccountStatus(uid, tx);
  if (s.status === "blocked") throw blockedError();
  if (s.status === "paused") throw pausedError(s);
}

const CONSOLE_ROLES = new Set(["platform-owner", "super-admin", "auditor"]);

/**
 * Every signed-in callable (platform/callable.ts): a blocked account is
 * refused. The `acct` claim is the cheap first check; the status document is
 * the authority (a token minted before the block carries no claim, and a
 * re-activated account's doc wins over a stale claim). Console operators carry
 * no account status and skip the read.
 */
export async function assertAccountUsable(uid: string, token: Record<string, unknown> | undefined): Promise<void> {
  const t = token ?? {};
  if (t.email_verified === true && typeof t.roleId === "string" && CONSOLE_ROLES.has(t.roleId)) return;
  const snap = await accountStatusRef(uid).get();
  if (!snap.exists) {
    if (t.acct === "blocked") throw blockedError();
    return;
  }
  const s = effectiveAccountStatus(snap.data(), serverNow().toMillis());
  if (s.status === "blocked") throw blockedError();
}
