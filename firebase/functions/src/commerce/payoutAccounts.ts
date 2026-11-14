/**
 * Organizer payout accounts (bank account or UPI ID).
 *
 * No payments partner verifies accounts yet, so PULSE operations verify them
 * by hand. The design keeps the full number out of every client path:
 * - `payoutAccounts/{orgId}`: the masked projection + verification state. The
 *   organizer owner and platform admins can read it (rules).
 * - `payoutSecrets/{orgId}`: the full details, AES-256-GCM encrypted with
 *   PAYOUT_ENCRYPTION_KEY. No client can read it (rules deny everything);
 *   only `revealPayoutAccount` (platform-owner, audited) decrypts it.
 * Changing the account always returns it to `pending-verification`, and a
 * settlement can only be marked paid to a verified account (settlements.ts).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { readMembership } from "../access/permissions";
import { writeAudit } from "../platform/audit";
import { db, serverNow, type Timestamp } from "../platform/firestore";
import { DomainError, notFound, precondition } from "../platform/errors";
import { notify } from "../platform/notify";
import { SECRET_NAMES, secret } from "../platform/security";

export const PAYOUT_COLLECTIONS = {
  accounts: "payoutAccounts",
  secrets: "payoutSecrets",
} as const;

export type PayoutMethod = "bank" | "upi";
export type PayoutStatus = "pending-verification" | "verified" | "rejected";

export interface PayoutAccountDoc {
  orgId: string;
  method: PayoutMethod;
  holderName: string;
  /** "•••• 6789" (bank) or "ra•••@okicici" (UPI). */
  masked: string;
  /** IFSC is public bank-branch data; kept in clear for ops. Bank only. */
  ifsc: string | null;
  status: PayoutStatus;
  note: string | null;
  submittedBy: string;
  submittedAt: Timestamp;
  decidedBy: string | null;
  decidedAt: Timestamp | null;
  version: number;
  updatedAt: Timestamp;
}

interface PayoutDetails {
  accountNumber?: string;
  upiId?: string;
}

/* ------------------------------------------------------------- validation */

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_RE = /^\d{9,18}$/;
export const UPI_RE = /^[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,63}$/;

export interface PayoutAccountInput {
  orgId: string;
  method: PayoutMethod;
  holderName: string;
  accountNumber?: string;
  ifsc?: string;
  upiId?: string;
}

/** Normalizes and validates; throws INVALID_INPUT naming the field. */
export function parsePayoutInput(d: Record<string, unknown>): PayoutAccountInput {
  const bad = (field: string, message: string) => new DomainError("INVALID_INPUT", message, { detail: { field } });
  const orgId = typeof d.orgId === "string" ? d.orgId : "";
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(orgId)) throw bad("orgId", "This organizer couldn't be identified.");
  const method = d.method;
  if (method !== "bank" && method !== "upi") throw bad("method", "Choose a bank account or a UPI ID.");
  const holderName = String(d.holderName ?? "").replace(/\s+/g, " ").trim();
  if (holderName.length < 3 || holderName.length > 80 || !/^[\p{L}][\p{L} .'&-]*$/u.test(holderName)) {
    throw bad("holderName", "Enter the account holder's name as the bank has it.");
  }
  if (method === "bank") {
    const accountNumber = String(d.accountNumber ?? "").replace(/[\s-]/g, "");
    if (!ACCOUNT_RE.test(accountNumber)) throw bad("accountNumber", "Enter a 9–18 digit account number.");
    const ifsc = String(d.ifsc ?? "").replace(/\s/g, "").toUpperCase();
    if (!IFSC_RE.test(ifsc)) throw bad("ifsc", "Enter a valid 11-character IFSC (like HDFC0001234).");
    return { orgId, method, holderName, accountNumber, ifsc };
  }
  const upiId = String(d.upiId ?? "").trim().toLowerCase();
  if (!UPI_RE.test(upiId)) throw bad("upiId", "Enter a valid UPI ID (like name@okhdfcbank).");
  return { orgId, method, holderName, upiId };
}

export function maskAccount(accountNumber: string): string {
  return `•••• ${accountNumber.slice(-4)}`;
}

export function maskUpi(upiId: string): string {
  const [user, handle] = upiId.split("@") as [string, string];
  return `${user.slice(0, 2)}•••@${handle}`;
}

/* ------------------------------------------------------------- encryption */

const KEY_VERSION = 1;

function key(): Buffer {
  // Any length of secret material → a 32-byte AES key.
  return createHash("sha256").update(secret(SECRET_NAMES.payoutEncryptionKey)).digest();
}

/** AES-256-GCM; the org id is bound as additional data, so a ciphertext can't be moved to another org. */
export function encryptDetails(orgId: string, details: PayoutDetails): { iv: string; tag: string; data: string; keyVersion: number } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`payout:${orgId}`));
  const data = Buffer.concat([cipher.update(JSON.stringify(details), "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64"), keyVersion: KEY_VERSION };
}

export function decryptDetails(orgId: string, box: { iv: string; tag: string; data: string }): PayoutDetails {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(box.iv, "base64"));
  decipher.setAAD(Buffer.from(`payout:${orgId}`));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  const out = Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]);
  return JSON.parse(out.toString("utf8")) as PayoutDetails;
}

/* ---------------------------------------------------------------- commands */

const accountRef = (orgId: string) => db().collection(PAYOUT_COLLECTIONS.accounts).doc(orgId);
const secretRef = (orgId: string) => db().collection(PAYOUT_COLLECTIONS.secrets).doc(orgId);

/** Organizer owner sets (or replaces) the payout account. Always back to pending verification. */
export async function setPayoutAccountCommand(
  uid: string,
  input: PayoutAccountInput & { requestId: string }
): Promise<{ orgId: string; status: PayoutStatus; masked: string; replayed: boolean }> {
  const receipt = db().collection("commandReceipts").doc(`setPayoutAccount_${uid}_${input.requestId}`);
  return db().runTransaction(async (tx) => {
    const m = await readMembership(input.orgId, uid, tx);
    if (!m || m.status !== "active" || m.role !== "owner") {
      throw new DomainError("NOT_PERMITTED", "Only the organizer owner can change where payouts go.", {
        nextStep: "Ask the owner of this organizer to add the payout account.",
      });
    }
    const r = await tx.get(receipt);
    if (r.exists) return { ...(r.data()!.result as { orgId: string; status: PayoutStatus; masked: string }), replayed: true };
    const prev = await tx.get(accountRef(input.orgId));
    const now = serverNow();
    const masked = input.method === "bank" ? maskAccount(input.accountNumber!) : maskUpi(input.upiId!);
    const doc: PayoutAccountDoc = {
      orgId: input.orgId,
      method: input.method,
      holderName: input.holderName,
      masked,
      ifsc: input.method === "bank" ? input.ifsc! : null,
      status: "pending-verification",
      note: null,
      submittedBy: uid,
      submittedAt: now,
      decidedBy: null,
      decidedAt: null,
      version: prev.exists ? Number(prev.data()!.version ?? 0) + 1 : 0,
      updatedAt: now,
    };
    const details: PayoutDetails = input.method === "bank" ? { accountNumber: input.accountNumber } : { upiId: input.upiId };
    tx.set(accountRef(input.orgId), doc);
    tx.set(secretRef(input.orgId), { orgId: input.orgId, ...encryptDetails(input.orgId, details), updatedAt: now });
    writeAudit(tx, {
      action: "payout.account-submitted",
      actorUid: uid,
      actorRole: `org:${input.orgId}:owner`,
      resourceType: "payoutAccount",
      resourceId: input.orgId,
      orgId: input.orgId,
      // Masked only: the audit trail never holds a full account number.
      before: prev.exists ? { method: prev.data()!.method, masked: prev.data()!.masked, status: prev.data()!.status } : null,
      after: { method: input.method, masked, status: doc.status },
      requestId: input.requestId,
    });
    const result = { orgId: input.orgId, status: doc.status, masked };
    tx.set(receipt, { command: "setPayoutAccount", actorUid: uid, requestId: input.requestId, result, at: now });
    return { ...result, replayed: false };
  });
}

/** Console: verify or reject a pending payout account (optimistic on `version`). */
export async function decidePayoutAccountCommand(
  admin: { uid: string; roleId: string },
  input: { requestId: string; orgId: string; expectedVersion: number; outcome: "verified" | "rejected"; note: string }
): Promise<{ orgId: string; status: PayoutStatus }> {
  const receipt = db().collection("commandReceipts").doc(`decidePayoutAccount_${admin.uid}_${input.requestId}`);
  return db().runTransaction(async (tx) => {
    const r = await tx.get(receipt);
    if (r.exists) return r.data()!.result as { orgId: string; status: PayoutStatus };
    const snap = await tx.get(accountRef(input.orgId));
    if (!snap.exists) throw notFound("This organizer hasn't added a payout account.");
    const a = snap.data() as PayoutAccountDoc;
    if (a.version !== input.expectedVersion) {
      throw new DomainError("CONFLICT", "The organizer changed this payout account while you were reviewing it.", {
        nextStep: "Reload and review the new details.",
        detail: { currentVersion: a.version },
      });
    }
    if (a.status !== "pending-verification") throw precondition("This payout account has already been decided.");
    if (input.outcome === "rejected" && input.note.trim().length < 5) {
      throw new DomainError("INVALID_INPUT", "Say why, so the organizer can fix it.");
    }
    const owner = await ownerOf(tx, input.orgId);
    const now = serverNow();
    tx.update(accountRef(input.orgId), {
      status: input.outcome, note: input.note.trim() || null, decidedBy: admin.uid, decidedAt: now, updatedAt: now,
    });
    writeAudit(tx, {
      action: `payout.account-${input.outcome}`,
      actorUid: admin.uid,
      actorRole: `platform:${admin.roleId}`,
      resourceType: "payoutAccount",
      resourceId: input.orgId,
      orgId: input.orgId,
      before: { status: a.status, masked: a.masked, version: a.version },
      after: { status: input.outcome },
      reason: input.note.trim() || null,
      requestId: input.requestId,
      source: "operations-console",
    });
    if (owner) {
      notify(tx, {
        recipientUid: owner,
        kind: "payout-account",
        title: input.outcome === "verified" ? "Payout account verified" : "Check your payout account",
        body: input.outcome === "verified"
          ? `Settlements will be paid to ${a.masked}.`
          : `We couldn't verify ${a.masked}: ${input.note.trim()}`,
        dedupeKey: `${input.orgId}-v${a.version}`,
        link: { type: "payout-account", id: input.orgId },
      });
    }
    const result = { orgId: input.orgId, status: input.outcome };
    tx.set(receipt, { command: "decidePayoutAccount", actorUid: admin.uid, requestId: input.requestId, result, at: now });
    return result;
  });
}

/**
 * Console, platform owner only: the full details, to check against the
 * organizer's documents or to pay a settlement. Every reveal is audited.
 */
export async function revealPayoutAccountQuery(
  admin: { uid: string; roleId: string },
  input: { orgId: string; reason: string }
): Promise<{ orgId: string; method: PayoutMethod; holderName: string; ifsc: string | null; accountNumber: string | null; upiId: string | null }> {
  if (admin.roleId !== "platform-owner") {
    throw new DomainError("NOT_PERMITTED", "Only a Platform Owner can see full payout details.");
  }
  if (input.reason.trim().length < 5) throw new DomainError("INVALID_INPUT", "Say why you need the full details.");
  const [aSnap, sSnap] = await Promise.all([accountRef(input.orgId).get(), secretRef(input.orgId).get()]);
  if (!aSnap.exists || !sSnap.exists) throw notFound("This organizer hasn't added a payout account.");
  const a = aSnap.data() as PayoutAccountDoc;
  const details = decryptDetails(input.orgId, sSnap.data() as { iv: string; tag: string; data: string });
  const batch = db().batch();
  writeAudit(batch, {
    action: "payout.account-revealed",
    actorUid: admin.uid,
    actorRole: `platform:${admin.roleId}`,
    resourceType: "payoutAccount",
    resourceId: input.orgId,
    orgId: input.orgId,
    after: { masked: a.masked },
    reason: input.reason.trim(),
    source: "operations-console",
  });
  await batch.commit();
  return {
    orgId: input.orgId,
    method: a.method,
    holderName: a.holderName,
    ifsc: a.ifsc,
    accountNumber: details.accountNumber ?? null,
    upiId: details.upiId ?? null,
  };
}

/** The verified account a settlement for [orgId] may be paid to, or a precondition error. */
export async function requireVerifiedPayoutAccount(tx: Transaction, orgId: string): Promise<PayoutAccountDoc> {
  const snap = await tx.get(accountRef(orgId));
  const a = snap.data() as PayoutAccountDoc | undefined;
  if (!a || a.status !== "verified") {
    throw precondition(
      "This organizer has no verified payout account.",
      "Verify the organizer's payout account first (Partners → Payout accounts).",
      { payoutStatus: a?.status ?? "missing" }
    );
  }
  return a;
}

async function ownerOf(tx: Transaction, orgId: string): Promise<string | null> {
  const org = await tx.get(db().collection("organizers").doc(orgId));
  const owner = org.data()?.ownerUid;
  return typeof owner === "string" ? owner : null;
}
