import * as functions from "firebase-functions/v1";
import { getAuth } from "firebase-admin/auth";
import { db, COLLECTIONS, serverNow } from "../platform/firestore";
import { requireActor } from "../platform/auth";
import { DomainError, invalidInput, notPermitted } from "../platform/errors";

const ROLES = ["platform-owner", "super-admin", "auditor"] as const;

function parse(data: unknown) {
  if (!data || typeof data !== "object") throw invalidInput("The access request is invalid.");
  const value = data as Record<string, unknown>;
  const uid = typeof value.uid === "string" ? value.uid.trim() : "";
  const roleId = typeof value.roleId === "string" ? value.roleId.trim() : "";
  const status = value.status;
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(uid)) throw invalidInput("A valid user ID is required.");
  if (!ROLES.includes(roleId as (typeof ROLES)[number])) throw invalidInput("The requested role is not supported.");
  if (status !== "active" && status !== "suspended" && status !== "disabled") throw invalidInput("The account status is not supported.");
  if (reason.length < 10 || reason.length > 1000) throw invalidInput("A reason of 10-1000 characters is required.");
  return { uid, roleId, status, reason };
}

export const setOperatorAccess = functions.runWith({ enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" }).https.onCall(async (data, context) => {
  try {
    const actor = requireActor(context);
    if (actor.roleId !== "platform-owner") throw notPermitted("manage Super Admin access");
    const command = parse(data);
    if (command.uid === actor.uid && command.status !== "active") throw invalidInput("You cannot suspend or disable your own account.");

    const auth = getAuth();
    const user = await auth.getUser(command.uid);
    const previousClaims = user.customClaims ?? {};
    const disabled = command.status !== "active";
    await auth.setCustomUserClaims(command.uid, { ...previousClaims, roleId: command.roleId, disabled });
    if (disabled) await auth.revokeRefreshTokens(command.uid);

    try {
      const firestore = db();
      const now = serverNow();
      await firestore.runTransaction(async (transaction) => {
        const userRef = firestore.collection(COLLECTIONS.users).doc(command.uid);
        const previous = await transaction.get(userRef);
        transaction.set(userRef, {
          uid: command.uid, displayName: user.displayName ?? user.email ?? "Operator", email: user.email ?? null,
          roleId: command.roleId, scope: "platform", franchiseId: null, territoryIds: [], status: command.status,
          createdAt: previous.data()?.createdAt ?? now, createdBy: previous.data()?.createdBy ?? actor.uid,
          updatedAt: now, updatedBy: actor.uid, version: Number(previous.data()?.version ?? 0) + 1,
        }, { merge: true });
        transaction.create(firestore.collection(COLLECTIONS.auditEvents).doc(), {
          action: "access.operator-updated", actorUid: actor.uid, actorRoleId: actor.roleId,
          resourceType: "user", resourceId: command.uid,
          before: previous.exists ? { roleId: previous.data()?.roleId, status: previous.data()?.status } : null,
          after: { roleId: command.roleId, status: command.status }, reason: command.reason, at: now, schemaVersion: 1,
        });
      });
    } catch (error) {
      await auth.setCustomUserClaims(command.uid, previousClaims);
      throw error;
    }
    return { uid: command.uid, roleId: command.roleId, status: command.status };
  } catch (error) {
    const domain = error instanceof DomainError ? error : new DomainError("INTERNAL", "Access could not be updated.", { nextStep: "Try again. If this continues, contact platform engineering." });
    throw new functions.https.HttpsError(domain.httpsCode as functions.https.FunctionsErrorCode, domain.operatorMessage, domain.toOperatorPayload());
  }
});
