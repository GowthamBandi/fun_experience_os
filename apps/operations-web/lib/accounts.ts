/**
 * Account controls (pause / block / re-activate a PULSE person) — pure logic,
 * unit-tested in tests/unit/notifications.test.ts.
 *
 * Server: setAccountStatus (capability accounts.moderate), docs/NOTIFICATION_CENTER_CONTRACT.md §3 + §5.
 *  - accountStatus/{uid}         { status, messageToUser, until, updatedAt, updatedBy } (the person reads it)
 *  - accountStatusPrivate/{uid}  { reason, history: [{ status, reason, messageToUser, until, at, by }] } (admins only)
 */

import type { BadgeTone } from "@/components/pulse/Badge";
import { toDate } from "./console/records";

type Raw = Record<string, unknown>;

export const ACCOUNT_STATUSES = ["active", "paused", "blocked"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_LIMITS = { reason: [10, 2000], message: [0, 500], untilMaxMs: 2 * 365 * 86_400_000 } as const;

export interface AccountState {
  status: AccountStatus;
  messageToUser: string | null;
  until: Date | null;
  updatedAt: Date | null;
  /** `until` has passed: the person is active again (the daily job writes it). */
  lapsed: boolean;
}

/** accountStatus/{uid} → what applies now. No document = active. */
export function accountStateOf(raw: Raw | null | undefined, now: Date): AccountState {
  const r = raw ?? {};
  const stored: AccountStatus = r.status === "paused" || r.status === "blocked" ? r.status : "active";
  const until = toDate(r.until);
  const lapsed = stored !== "active" && !!until && until.getTime() <= now.getTime();
  return {
    status: lapsed ? "active" : stored,
    messageToUser: typeof r.messageToUser === "string" && r.messageToUser.trim() ? r.messageToUser.trim() : null,
    until: stored === "active" ? null : until,
    updatedAt: toDate(r.updatedAt),
    lapsed,
  };
}

export const ACCOUNT_BADGE: Record<AccountStatus, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "ok" },
  paused: { label: "Paused", tone: "warn" },
  blocked: { label: "Blocked", tone: "err" },
};

export interface AccountAction {
  status: AccountStatus;
  label: string;
  question: (name: string) => string;
  consequence: string;
  tone: "volt" | "danger";
  confirm: string;
  /** Typed confirmation phrase for the high-risk ones. */
  phrase: string | null;
  done: string;
}

export const BLOCK_PHRASE = "BLOCK ACCOUNT";

const PAUSE: AccountAction = {
  status: "paused",
  label: "Pause",
  question: (n) => `Pause ${n}'s account?`,
  consequence: "They can still sign in, look around and contact support, but can't book events or trips, join waitlists, review or follow. Their own organizations are not affected. They get an inbox message.",
  tone: "danger",
  confirm: "Pause account",
  phrase: null,
  done: "Paused",
};

const BLOCK: AccountAction = {
  status: "blocked",
  label: "Block",
  question: (n) => `Block ${n}'s account?`,
  consequence: "Signs them out everywhere and disables sign-in. Every action is refused and unpaid holds are released; confirmed bookings are kept (decide refunds separately). No inbox message is sent.",
  tone: "danger",
  confirm: "Block account",
  phrase: BLOCK_PHRASE,
  done: "Blocked",
};

const REACTIVATE: AccountAction = {
  status: "active",
  label: "Re-activate",
  question: (n) => `Re-activate ${n}'s account?`,
  consequence: "Everything works again straight away (a blocked person can sign in again). They get an inbox message if they were paused.",
  tone: "volt",
  confirm: "Re-activate",
  phrase: null,
  done: "Re-activated",
};

export function accountActions(status: AccountStatus): AccountAction[] {
  switch (status) {
    case "active": return [PAUSE, BLOCK];
    case "paused": return [REACTIVATE, PAUSE, BLOCK];
    case "blocked": return [REACTIVATE, PAUSE, BLOCK];
  }
}

export class AccountInputError extends Error {}

/** The setAccountStatus payload, validated like the server (contract §3 + §5). */
export function buildAccountStatusPayload(input: {
  requestId: string;
  uid: string;
  status: AccountStatus;
  reason: string;
  messageToUser: string;
  /** ISO or null. */
  until: string | null;
  now: Date;
}) {
  if (!(ACCOUNT_STATUSES as readonly string[]).includes(input.status)) throw new AccountInputError("Choose a status.");
  const reason = input.reason.trim();
  if (reason.length < ACCOUNT_LIMITS.reason[0] || reason.length > ACCOUNT_LIMITS.reason[1]) throw new AccountInputError(`Reason must be ${ACCOUNT_LIMITS.reason[0]}–${ACCOUNT_LIMITS.reason[1]} characters.`);
  const message = input.messageToUser.trim();
  if (message.length > ACCOUNT_LIMITS.message[1]) throw new AccountInputError(`The message to the person can be at most ${ACCOUNT_LIMITS.message[1]} characters.`);
  let until: string | null = null;
  if (input.until) {
    if (input.status === "active") throw new AccountInputError("An end date only applies to a pause or a block.");
    const ms = Date.parse(input.until);
    if (!Number.isFinite(ms)) throw new AccountInputError("The end date isn't valid.");
    if (ms <= input.now.getTime()) throw new AccountInputError("The end date must be in the future.");
    if (ms - input.now.getTime() > ACCOUNT_LIMITS.untilMaxMs) throw new AccountInputError("The end date can be at most 2 years ahead.");
    until = new Date(ms).toISOString();
  }
  return {
    requestId: input.requestId,
    uid: input.uid,
    status: input.status,
    reason,
    ...(message ? { messageToUser: message } : {}),
    ...(until ? { until } : {}),
  };
}

export interface StatusHistoryRow {
  key: string;
  status: AccountStatus;
  reason: string | null;
  messageToUser: string | null;
  until: Date | null;
  at: Date | null;
  by: string | null;
  source: "private" | "audit";
}

const statusOf = (v: unknown): AccountStatus => (v === "paused" || v === "blocked" ? v : "active");

/**
 * The status-change history: accountStatusPrivate.history (has reasons) merged
 * with audit events `account.status-changed` (the source of truth), newest first.
 * An audit event already covered by a private entry (same status, within 60 s) is dropped.
 */
export function statusHistory(privateDoc: Raw | null | undefined, audits: Array<{ id: string; raw: Raw }>): StatusHistoryRow[] {
  const rows: StatusHistoryRow[] = [];
  const hist = Array.isArray(privateDoc?.history) ? (privateDoc!.history as unknown[]) : [];
  hist.forEach((h, i) => {
    if (!h || typeof h !== "object") return;
    const r = h as Raw;
    rows.push({
      key: `p${i}`,
      status: statusOf(r.status),
      reason: typeof r.reason === "string" ? r.reason : null,
      messageToUser: typeof r.messageToUser === "string" && r.messageToUser ? r.messageToUser : null,
      until: toDate(r.until),
      at: toDate(r.at),
      by: typeof r.by === "string" ? r.by : null,
      source: "private",
    });
  });
  for (const a of audits) {
    if (a.raw.action !== "account.status-changed") continue;
    const after = (a.raw.after && typeof a.raw.after === "object" ? a.raw.after : {}) as Raw;
    const at = toDate(a.raw.at);
    const status = statusOf(after.status);
    const dup = rows.some((r) => r.source === "private" && r.status === status && r.at && at && Math.abs(r.at.getTime() - at.getTime()) < 60_000);
    if (dup) continue;
    rows.push({
      key: `a${a.id}`,
      status,
      reason: typeof a.raw.reason === "string" ? a.raw.reason : null,
      messageToUser: typeof after.messageToUser === "string" && after.messageToUser ? after.messageToUser : null,
      until: toDate(after.until),
      at,
      by: typeof a.raw.actorUid === "string" ? a.raw.actorUid : null,
      source: "audit",
    });
  }
  return rows.sort((x, y) => (y.at?.getTime() ?? 0) - (x.at?.getTime() ?? 0));
}

/** "Paused until 2 Dec 2026, 6:00 pm" / "Blocked" / "Active". */
export function accountStatusLine(state: Pick<AccountState, "status" | "until">): string {
  const base = ACCOUNT_BADGE[state.status].label;
  if (!state.until || state.status === "active") return base;
  const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(state.until);
  return `${base} until ${when}`;
}
