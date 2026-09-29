/**
 * `setOperatorAccess` — Platform Owner only: set an operator's role, scope,
 * territories and account status.
 *
 * Writes, in this order:
 *   1. Firebase Auth: custom claims { roleId, scope, franchiseId, territoryIds,
 *      disabled } and the account's `disabled` flag.
 *   2. Firestore (one transaction): users/{uid}, an audit event and the
 *      command receipt. If this fails, step 1 is rolled back.
 *   3. Firebase Auth: refresh tokens are revoked whenever access changed, so
 *      the operator's next command (requireCurrentActor) demands a new sign-in
 *      carrying the new claims.
 *
 * Rules: idempotent by requestId; an operator cannot suspend or disable
 * themselves; the last active Platform Owner cannot be demoted, suspended or
 * disabled; an unknown uid is USER_NOT_FOUND, not INTERNAL.
 */
import * as functions from "firebase-functions/v1";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import type { DocumentData } from "firebase-admin/firestore";
import { COLLECTIONS, app, db, receiptRef, serverNow } from "../platform/firestore";
import { requireCurrentActor } from "../platform/auth";
import { enforceAppCheck, toHttpsError } from "../platform/callable";
import { DomainError, invalidInput } from "../platform/errors";
import { readReceipt, replayFrom, writeAudit, writeReceipt } from "../platform/commands";

export const OPERATOR_ROLES = [
  "platform-owner",
  "super-admin",
  "regional-partner",
  "city-manager",
  "ops-manager",
  "venue-manager",
  "coordinator",
  "staff",
  "support",
  "safety",
  "finance",
  "marketing",
  "analyst",
  "auditor",
] as const;

/** Roles that only exist at platform scope. */
const PLATFORM_ONLY_ROLES = ["platform-owner", "super-admin", "auditor"];
export const SCOPES = ["platform", "franchise", "territory", "city", "venue"] as const;
const STATUSES = ["active", "suspended", "disabled"] as const;
const COMMAND = "setOperatorAccess";
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const MAX_TERRITORIES = 20;

export interface OperatorAccessCommand {
  requestId: string;
  uid: string;
  roleId: (typeof OPERATOR_ROLES)[number];
  status: (typeof STATUSES)[number];
  reason: string;
  scope: (typeof SCOPES)[number];
  franchiseId: string | null;
  territoryIds: string[];
}

export interface OperatorAccessResult {
  uid: string;
  roleId: string;
  status: string;
  scope: string;
  franchiseId: string | null;
  territoryIds: string[];
  replayed: boolean;
}

export function parseOperatorAccess(data: unknown): OperatorAccessCommand {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw invalidInput("The access request is invalid.");
  const value = data as Record<string, unknown>;
  const requestId = typeof value.requestId === "string" ? value.requestId.trim() : "";
  const uid = typeof value.uid === "string" ? value.uid.trim() : "";
  const roleId = typeof value.roleId === "string" ? value.roleId.trim() : "";
  const status = value.status;
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (!REQUEST_ID.test(requestId)) throw invalidInput("This request is missing its reference. Please try again.");
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(uid)) throw invalidInput("A valid user ID is required.");
  if (!OPERATOR_ROLES.includes(roleId as OperatorAccessCommand["roleId"])) throw invalidInput("The requested role is not supported.");
  if (!STATUSES.includes(status as OperatorAccessCommand["status"])) throw invalidInput("The account status is not supported.");
  if (reason.length < 10 || reason.length > 1000) throw invalidInput("A reason of 10-1000 characters is required.");

  const scope = (value.scope ?? (PLATFORM_ONLY_ROLES.includes(roleId) ? "platform" : undefined)) as OperatorAccessCommand["scope"];
  if (!SCOPES.includes(scope)) throw invalidInput("Choose the scope this operator works in.");
  if (PLATFORM_ONLY_ROLES.includes(roleId) && scope !== "platform") throw invalidInput("This role always has platform-wide scope.");

  const franchiseId = typeof value.franchiseId === "string" && value.franchiseId.trim() ? value.franchiseId.trim() : null;
  if (franchiseId && !SCOPE_ID.test(franchiseId)) throw invalidInput("The franchise ID is invalid.");
  const rawTerritories = value.territoryIds ?? [];
  if (!Array.isArray(rawTerritories)) throw invalidInput("Territories must be a list.");
  const territoryIds = [...new Set(rawTerritories.map((t) => (typeof t === "string" ? t.trim() : "")))];
  if (territoryIds.some((t) => !SCOPE_ID.test(t))) throw invalidInput("One of the territory IDs is invalid.");
  if (territoryIds.length > MAX_TERRITORIES) throw invalidInput(`Assign at most ${MAX_TERRITORIES} territories, or give franchise or platform scope instead.`);

  if (scope === "platform") {
    return { requestId, uid, roleId: roleId as OperatorAccessCommand["roleId"], status: status as OperatorAccessCommand["status"], reason, scope, franchiseId: null, territoryIds: [] };
  }
  if (scope === "franchise" && !franchiseId) throw invalidInput("Choose the franchise this operator works in.");
  if (scope !== "franchise" && territoryIds.length === 0) throw invalidInput("Choose at least one territory for this operator.");
  return { requestId, uid, roleId: roleId as OperatorAccessCommand["roleId"], status: status as OperatorAccessCommand["status"], reason, scope, franchiseId, territoryIds };
}

const lastOwner = () =>
  new DomainError("LAST_OWNER", "This is the last active Platform Owner, so the account can't be demoted, suspended or disabled.", {
    nextStep: "Make another operator an active Platform Owner first.",
  });

const removesOwnership = (cmd: OperatorAccessCommand) => cmd.roleId !== "platform-owner" || cmd.status !== "active";

function wasActiveOwner(user: UserRecord, doc: DocumentData | undefined): boolean {
  if (doc) return doc.roleId === "platform-owner" && doc.status === "active";
  const claims = user.customClaims ?? {};
  return claims.roleId === "platform-owner" && claims.disabled !== true && !user.disabled;
}

async function loadUser(uid: string): Promise<UserRecord> {
  try {
    return await getAuth(app()).getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      throw new DomainError("USER_NOT_FOUND", "No sign-in account exists for this user ID.", {
        nextStep: "Check the user ID, or invite the operator first.",
        detail: { uid },
      });
    }
    throw error;
  }
}

export async function applyOperatorAccess(
  command: OperatorAccessCommand,
  actor: { uid: string; roleId: string; displayName: string }
): Promise<OperatorAccessResult> {
  if (command.uid === actor.uid && command.status !== "active") throw invalidInput("You cannot suspend or disable your own account.");

  const firestore = db();
  const usersRef = firestore.collection(COLLECTIONS.users);
  const userRef = usersRef.doc(command.uid);
  const ownersQuery = usersRef.where("roleId", "==", "platform-owner").where("status", "==", "active");

  // Fast replay path: no Auth side effects for a request that already succeeded.
  const existingReceipt = await receiptRef(command.requestId).get();
  const earlier = replayFrom<OperatorAccessResult>(existingReceipt.exists ? existingReceipt.data() : undefined, COMMAND, actor.uid, (r) => r.uid === command.uid);
  if (earlier) return { ...earlier, replayed: true };

  const auth = getAuth(app());
  const user = await loadUser(command.uid);
  const previousDoc = await userRef.get();

  // Pre-check before touching Auth; re-checked inside the transaction for races.
  if (wasActiveOwner(user, previousDoc.data()) && removesOwnership(command)) {
    const owners = await ownersQuery.get();
    if (!owners.docs.some((d) => d.id !== command.uid)) throw lastOwner();
  }

  const previousClaims = user.customClaims ?? {};
  const previousDisabled = user.disabled;
  const disabled = command.status !== "active";
  const nextClaims = {
    ...previousClaims,
    roleId: command.roleId,
    scope: command.scope,
    franchiseId: command.franchiseId,
    territoryIds: command.territoryIds,
    disabled,
  };
  await auth.setCustomUserClaims(command.uid, nextClaims);
  if (previousDisabled !== disabled) await auth.updateUser(command.uid, { disabled });

  let result: OperatorAccessResult;
  let changed = false;
  try {
    result = await firestore.runTransaction(async (tx) => {
      const prior = await readReceipt<OperatorAccessResult>(tx, command.requestId, COMMAND, actor.uid, (r) => r.uid === command.uid);
      if (prior) return { ...prior, replayed: true };
      const previous = await tx.get(userRef);
      const owners = await tx.get(ownersQuery);
      if (wasActiveOwner(user, previous.data()) && removesOwnership(command) && !owners.docs.some((d) => d.id !== command.uid)) throw lastOwner();

      const before = previous.exists
        ? {
            roleId: previous.data()?.roleId ?? null,
            status: previous.data()?.status ?? null,
            scope: previous.data()?.scope ?? null,
            franchiseId: previous.data()?.franchiseId ?? null,
            territoryIds: previous.data()?.territoryIds ?? [],
          }
        : null;
      const after = { roleId: command.roleId, status: command.status, scope: command.scope, franchiseId: command.franchiseId, territoryIds: command.territoryIds };
      changed = JSON.stringify(before) !== JSON.stringify(after);

      const now = serverNow();
      const displayName = user.displayName ?? user.email ?? "Operator";
      tx.set(userRef, {
        uid: command.uid,
        displayName,
        email: user.email ?? null,
        ...after,
        statusReason: command.reason,
        createdAt: previous.data()?.createdAt ?? now,
        createdBy: previous.data()?.createdBy ?? actor.uid,
        updatedAt: now,
        updatedBy: actor.uid,
        version: Number(previous.data()?.version ?? 0) + 1,
      }, { merge: true });
      writeAudit(tx, actor, {
        action: "access.operator-updated",
        subject: `${displayName} → ${command.roleId.replace(/-/g, " ")} · ${command.status}`,
        summary: command.reason,
        entityType: "user",
        entityId: command.uid,
        before,
        after,
        requestId: command.requestId,
        context: { reason: command.reason },
      }, now);
      const value: OperatorAccessResult = { uid: command.uid, ...after, replayed: false };
      writeReceipt(tx, command.requestId, COMMAND, actor.uid, value, now);
      return value;
    });
  } catch (error) {
    await auth.setCustomUserClaims(command.uid, previousClaims);
    if (previousDisabled !== disabled) await auth.updateUser(command.uid, { disabled: previousDisabled });
    throw error;
  }

  if (!result.replayed && (changed || disabled)) await auth.revokeRefreshTokens(command.uid);
  return result;
}

export const setOperatorAccess = functions.runWith({ enforceAppCheck }).https.onCall(async (data, context) => {
  try {
    const actor = await requireCurrentActor(context, ["platform-owner"], "manage operator access");
    return await applyOperatorAccess(parseOperatorAccess(data), actor);
  } catch (error) {
    throw toHttpsError(error, "Access could not be updated.");
  }
});
