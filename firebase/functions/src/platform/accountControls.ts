/**
 * Account controls from the console (docs/NOTIFICATION_CENTER_CONTRACT.md §3 / §5):
 * pause, block or re-activate a PULSE person, and find people.
 *
 *  - setAccountStatus (accounts.moderate): writes accountStatus/{uid} (the
 *    person reads it), accountStatusPrivate/{uid} (reason + history, admins),
 *    the audit event and an inbox item (paused / back to active, never on a
 *    block); then syncs Firebase Auth: the `acct` claim, and for a block the
 *    user is disabled and refresh tokens revoked; held bookings are released.
 *  - searchAccounts (announcements.manage or accounts.moderate).
 *  - expireStatuses (daily job): a passed `until` returns the account to active.
 */
import { getAuth } from "firebase-admin/auth";
import { callable, obj, oneOf, optStr, str } from "./callable";
import { requireCapability, type VerifiedActor } from "./auth";
import { app, db, serverNow, Timestamp } from "./firestore";
import { DomainError, precondition } from "./errors";
import { writeAudit } from "./audit";
import { notify } from "./notify";
import { logError, logWarn } from "./log";
import { parseInstant, runCommand } from "../catalog/common";
import {
  ACCOUNT_STATUSES, accountStatusPrivateRef, accountStatusRef, effectiveAccountStatus, istUntilLabel, type AccountStatusValue,
} from "./accountStatus";
import { releaseExpiredHolds } from "../commerce/holds";
import { releaseHeldTripBooking } from "../trips/bookings";

export const MAX_UNTIL_MS = 2 * 365 * 86_400_000;
export const HISTORY_MAX = 50;

const UID = /^[A-Za-z0-9_-]{4,128}$/;

export interface SetAccountStatusInput {
  requestId: string;
  uid: string;
  status: AccountStatusValue;
  reason: string;
  messageToUser: string | null;
  until: Timestamp | null;
}

export function parseSetAccountStatus(data: unknown, nowMs: number): SetAccountStatusInput {
  const d = obj(data);
  const requestId = str(d.requestId, "requestId", 8, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(requestId)) throw new DomainError("INVALID_INPUT", "requestId is not valid.");
  const uid = str(d.uid, "uid", 4, 128);
  if (!UID.test(uid)) throw new DomainError("INVALID_INPUT", "uid is not valid.");
  const status = oneOf(d.status, "status", ACCOUNT_STATUSES);
  const reason = str(d.reason, "Reason", 10, 2000);
  const messageToUser = optStr(d.messageToUser, "Message to the person", 500);
  let until: Timestamp | null = null;
  if (d.until !== undefined && d.until !== null && d.until !== "") {
    if (status === "active") throw new DomainError("INVALID_INPUT", "An end date only applies to a pause or a block.");
    until = parseInstant(d.until, "Until");
    if (until.toMillis() <= nowMs + 60_000) throw new DomainError("INVALID_INPUT", "The end date must be in the future.");
    if (until.toMillis() > nowMs + MAX_UNTIL_MS) throw new DomainError("INVALID_INPUT", "The end date can be at most 2 years ahead.");
  }
  return { requestId, uid, status, reason, messageToUser, until };
}

const isoOf = (t: Timestamp | null | undefined) => (t ? t.toDate().toISOString() : null);

function inboxFor(status: AccountStatusValue, previous: AccountStatusValue, input: { until: Timestamp | null; messageToUser: string | null }) {
  if (status === "paused") {
    const until = input.until ? ` until ${istUntilLabel(input.until)}` : "";
    return {
      title: "Your PULSE account is paused",
      body: `You can look around, but you can't book right now${until}.${input.messageToUser ? ` ${input.messageToUser}` : ""} Contact support if you have questions.`.slice(0, 900),
    };
  }
  if (status === "active" && previous !== "active") {
    return { title: "Your PULSE account is active again", body: input.messageToUser ?? "You can book, review and follow organizers again." };
  }
  return null;
}

/**
 * Applies the Auth side of a status: the `acct` claim, and disabled + revoked
 * sessions for a block. Re-enables only accounts PULSE itself blocked.
 * Returns false when Auth couldn't be updated (the status doc still applies).
 */
export async function syncAuthForStatus(uid: string, status: AccountStatusValue): Promise<boolean> {
  const auth = getAuth(app());
  try {
    const user = await auth.getUser(uid);
    const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
    const wasBlockedByUs = claims.acct === "blocked";
    if (status === "active") delete claims.acct;
    else claims.acct = status;
    await auth.setCustomUserClaims(uid, claims);
    if (status === "blocked") {
      if (!user.disabled) await auth.updateUser(uid, { disabled: true });
      await auth.revokeRefreshTokens(uid);
    } else if (user.disabled && wasBlockedByUs) {
      await auth.updateUser(uid, { disabled: false });
    }
    return true;
  } catch (e) {
    if ((e as { code?: string })?.code === "auth/user-not-found") return true; // nothing to lock
    logError({ event: "account.auth-sync-failed", uid, status, error: String((e as Error)?.message ?? e).slice(0, 200) });
    return false;
  }
}

/** A blocked person's unpaid holds are released; confirmed bookings stay (ops decide refunds). */
export async function releaseHoldsOf(uid: string, actorUid: string): Promise<{ events: number; trips: number }> {
  const [bookings, tripBookings] = await Promise.all([
    db().collection("bookings").where("customerUid", "==", uid).get(),
    db().collection("tripBookings").where("customerUid", "==", uid).get(),
  ]);
  let events = 0;
  for (const b of bookings.docs.filter((d) => d.get("status") === "held")) {
    const shortened = await db().runTransaction(async (tx) => {
      const cur = await tx.get(b.ref);
      if (cur.get("status") !== "held") return false;
      tx.update(b.ref, { holdExpiresAt: serverNow(), updatedAt: serverNow() });
      return true;
    });
    if (shortened) events++;
  }
  // The hold sweeper releases seats with the event's occupancy math (exactly once).
  if (events) await releaseExpiredHolds({ limit: 500 });
  let trips = 0;
  for (const t of tripBookings.docs.filter((d) => d.get("status") === "held")) {
    if (await releaseHeldTripBooking(t.id, actorUid)) trips++;
  }
  return { events, trips };
}

/** setAccountStatus: pause / block / re-activate one PULSE person. */
export async function setAccountStatusCommand(admin: VerifiedActor, data: unknown) {
  const input = parseSetAccountStatus(data, serverNow().toMillis());
  if (input.uid === admin.uid) throw new DomainError("INVALID_INPUT", "You can't change your own account status.");
  const userSnap = await db().collection("users").doc(input.uid).get();
  if (userSnap.get("scope") === "platform") {
    throw precondition("This is a console operator account.", "Use Operator access to suspend or disable operators.");
  }
  const result = await runCommand("account.status-changed", admin.uid, input.requestId, async (tx, now) => {
    const [cur, priv] = await Promise.all([tx.get(accountStatusRef(input.uid)), tx.get(accountStatusPrivateRef(input.uid))]);
    const before = effectiveAccountStatus(cur.data(), now.toMillis());
    const version = Number(cur.get("version") ?? 0) + 1;
    tx.set(accountStatusRef(input.uid), {
      status: input.status, messageToUser: input.messageToUser, until: input.until, updatedAt: now, updatedBy: admin.uid, version,
    });
    const entry = { status: input.status, reason: input.reason, messageToUser: input.messageToUser, until: input.until, at: now, by: admin.uid };
    const history = Array.isArray(priv.get("history")) ? (priv.get("history") as unknown[]) : [];
    tx.set(accountStatusPrivateRef(input.uid), { reason: input.reason, history: [entry, ...history].slice(0, HISTORY_MAX), updatedAt: now });
    writeAudit(tx, {
      action: "account.status-changed", actorUid: admin.uid, actorRole: `platform:${admin.roleId}`, resourceType: "user", resourceId: input.uid,
      before: { status: before.status, until: isoOf(before.until) },
      after: { status: input.status, messageToUser: input.messageToUser, until: isoOf(input.until) },
      reason: input.reason, requestId: input.requestId, source: "operations-console",
    });
    const message = inboxFor(input.status, before.status, input);
    if (message) {
      notify(tx, {
        recipientUid: input.uid, kind: "account-status", ...message, dedupeKey: `v${version}`, link: { type: "account", id: input.uid },
      });
    }
    return { uid: input.uid, status: input.status, until: isoOf(input.until), previous: before.status };
  });
  // Auth is synced on every call (also on a replay), so a failed sync heals on retry.
  const authSynced = await syncAuthForStatus(input.uid, input.status);
  if (input.status === "blocked" && !result.replayed) {
    try {
      await releaseHoldsOf(input.uid, admin.uid);
    } catch (e) {
      logWarn({ event: "account.release-holds-failed", uid: input.uid, error: String((e as Error)?.message ?? e).slice(0, 200) });
    }
  }
  return { uid: result.uid, status: result.status, until: result.until, authSynced, replayed: result.replayed };
}

/** Daily: statuses whose `until` passed go back to active (Auth re-enabled for a block). */
export async function expireStatuses(limit = 500): Promise<{ due: number; reactivated: number; authFailed: number }> {
  const now = serverNow();
  const due = await db().collection("accountStatus").where("until", "<=", now).limit(limit).get();
  let reactivated = 0;
  let authFailed = 0;
  for (const doc of due.docs) {
    const done = await db().runTransaction(async (tx) => {
      const [cur, priv] = await Promise.all([tx.get(doc.ref), tx.get(accountStatusPrivateRef(doc.id))]);
      const stored = String(cur.get("status"));
      const until = cur.get("until");
      if (stored === "active" || !(until instanceof Timestamp) || until.toMillis() > Date.now()) return null;
      const t = serverNow();
      const version = Number(cur.get("version") ?? 0) + 1;
      tx.set(doc.ref, { status: "active", messageToUser: null, until: null, updatedAt: t, updatedBy: "system", version });
      const history = Array.isArray(priv.get("history")) ? (priv.get("history") as unknown[]) : [];
      const reason = `The ${stored === "blocked" ? "block" : "pause"} ended automatically on its end date.`;
      tx.set(accountStatusPrivateRef(doc.id), {
        reason, history: [{ status: "active", reason, messageToUser: null, until: null, at: t, by: "system" }, ...history].slice(0, HISTORY_MAX), updatedAt: t,
      }, { merge: true });
      writeAudit(tx, {
        action: "account.status-changed", actorUid: "system", actorRole: "system", resourceType: "user", resourceId: doc.id,
        before: { status: stored, until: until.toDate().toISOString() }, after: { status: "active", messageToUser: null, until: null },
        reason, source: "scheduler",
      });
      notify(tx, {
        recipientUid: doc.id, kind: "account-status", title: "Your PULSE account is active again",
        body: "You can book, review and follow organizers again.", dedupeKey: `v${version}`, link: { type: "account", id: doc.id },
      });
      return stored;
    });
    if (!done) continue;
    reactivated++;
    if (!(await syncAuthForStatus(doc.id, "active"))) authFailed++;
  }
  return { due: due.size, reactivated, authFailed };
}

/* -------------------------------------------------------------- search */

export interface AccountRow {
  uid: string;
  displayName: string | null;
  phoneMasked: string | null;
  role: "customer" | "organizer";
  orgs: Array<{ orgId: string; name: string }>;
  accountStatus: AccountStatusValue;
  accountStatusUntil: string | null;
}

/** "+91 98765 43210" → "+91 ••••• •3210". */
export function maskPhone(phone: unknown): string | null {
  if (typeof phone !== "string" || phone.length < 6) return null;
  const m = /^\+91(\d{10})$/.exec(phone);
  if (m) return `+91 ••••• •${m[1]!.slice(-4)}`;
  return `${phone.slice(0, 3)}${"•".repeat(Math.max(0, phone.length - 7))}${phone.slice(-4)}`;
}

/** Phone-prefix bounds for digits typed in the search box. */
export function phonePrefix(digits: string): string {
  if (digits.length > 10 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length <= 10) return `+91${digits}`;
  return `+${digits}`;
}

function nameVariants(q: string): string[] {
  const lower = q.toLowerCase();
  const cap = lower.charAt(0).toUpperCase() + lower.slice(1);
  const title = lower.replace(/(^|\s)(\S)/g, (_m, s: string, c: string) => s + c.toUpperCase());
  return [...new Set([q, cap, title, lower])];
}

/** searchAccounts: up to 20 people by phone digits, uid or display-name prefix. */
export async function searchAccountsQuery(data: unknown): Promise<{ accounts: AccountRow[] }> {
  const q = str(obj(data).query, "Search", 2, 80);
  const uids = new Set<string>();
  const phoneLike = /^[+\d\s()-]+$/.test(q);
  const digits = q.replace(/\D/g, "");
  if (phoneLike && digits.length >= 4) {
    const prefix = phonePrefix(digits);
    const snap = await db().collection("users").where("phone", ">=", prefix).where("phone", "<=", `${prefix}`).limit(20).get();
    snap.docs.forEach((d) => uids.add(d.id));
  } else {
    if (UID.test(q) && q.length >= 20) {
      const u = await db().collection("users").doc(q).get();
      if (u.exists) uids.add(u.id);
    }
    const reads = await Promise.all(
      nameVariants(q).map((v) => db().collection("publicProfiles").orderBy("displayName").startAt(v).endAt(`${v}`).limit(20).get())
    );
    for (const r of reads) r.docs.forEach((d) => uids.add(d.id));
  }
  const list = [...uids].slice(0, 40);
  if (list.length === 0) return { accounts: [] };
  const [users, profiles, statuses, memberships] = await Promise.all([
    db().getAll(...list.map((u) => db().collection("users").doc(u))),
    db().getAll(...list.map((u) => db().collection("publicProfiles").doc(u))),
    db().getAll(...list.map((u) => accountStatusRef(u))),
    Promise.all(Array.from({ length: Math.ceil(list.length / 30) }, (_, i) =>
      db().collection("memberships").where("uid", "in", list.slice(i * 30, i * 30 + 30)).get())),
  ]);
  const orgsOf = new Map<string, string[]>();
  for (const snap of memberships) {
    for (const m of snap.docs) {
      if (m.get("status") !== "active") continue;
      const u = String(m.get("uid"));
      orgsOf.set(u, [...(orgsOf.get(u) ?? []), String(m.get("orgId"))]);
    }
  }
  const orgIds = [...new Set([...orgsOf.values()].flat())];
  const orgNames = new Map<string, string>();
  if (orgIds.length) {
    const orgs = await db().getAll(...orgIds.map((o) => db().collection("organizers").doc(o)));
    for (const o of orgs) orgNames.set(o.id, String(o.get("name") ?? o.get("displayName") ?? o.id));
  }
  const nowMs = serverNow().toMillis();
  const accounts: AccountRow[] = [];
  list.forEach((uid, i) => {
    const u = users[i]!;
    if (u.get("scope") === "platform") return; // console operators aren't PULSE accounts
    if (!u.exists && !profiles[i]!.exists) return;
    const s = effectiveAccountStatus(statuses[i]!.data(), nowMs);
    const orgs = (orgsOf.get(uid) ?? []).map((orgId) => ({ orgId, name: orgNames.get(orgId) ?? orgId }));
    accounts.push({
      uid,
      displayName: typeof profiles[i]!.get("displayName") === "string" ? (profiles[i]!.get("displayName") as string) : null,
      phoneMasked: maskPhone(u.get("phone")),
      role: orgs.length ? "organizer" : "customer",
      orgs,
      accountStatus: s.status,
      accountStatusUntil: s.status === "active" ? null : isoOf(s.until),
    });
  });
  return { accounts: accounts.slice(0, 20) };
}

/* ------------------------------------------------------------ callables */

export const setAccountStatus = callable(async (data, context) =>
  setAccountStatusCommand(requireCapability(context, "accounts.moderate"), data), { timeoutSeconds: 120 });

export const searchAccounts = callable(async (data, context) => {
  requireCapability(context, ["announcements.manage", "accounts.moderate"]);
  return searchAccountsQuery(data);
});
