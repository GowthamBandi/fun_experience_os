import * as functions from "firebase-functions/v1";
import { getMessaging } from "firebase-admin/messaging";
import { FieldValue } from "firebase-admin/firestore";
import { callable, obj, str } from "../platform/callable";
import { requirePhoneUser, requireUser } from "../platform/actors";
import { app, db, serverNow } from "../platform/firestore";
import { DomainError } from "../platform/errors";
import { isEmulator } from "../platform/security";
import { consumeLimit } from "../platform/rateLimit";
import { logWarn } from "../platform/log";

/**
 * Push delivery for in-app notifications.
 *
 * The in-app inbox (`userNotifications`) is the source of truth and always
 * works. Push is best-effort: when the recipient has registered FCM tokens
 * (PULSE with firebase_messaging + APNs/FCM configured for the project) the
 * notification is sent and its `push.status` recorded; otherwise it stays
 * `no-device`. Nothing is ever reported as delivered that wasn't.
 */
/** A person rarely has more than a few devices; older tokens are dropped. */
export const MAX_PUSH_TOKENS = 10;

function parseToken(data: unknown): string {
  return str(obj(data).token, "token", 20, 4096);
}

export async function registerPushTokenService(uid: string, data: unknown) {
  const input = obj(data);
  const token = parseToken(input);
  const platform = input.platform === "ios" ? "ios" : input.platform === "android" ? "android" : null;
  if (!platform) throw new DomainError("INVALID_INPUT", "platform must be android or ios.");
  await consumeLimit("pushToken", uid);
  const ref = db().collection("users").doc(uid);
  const count = await db().runTransaction(async (tx) => {
    const current = ((await tx.get(ref)).data()?.pushTokens as unknown[] | undefined) ?? [];
    // Most-recent last; a re-registered token moves to the end. Cap the list
    // so a buggy or hostile client can't grow the fan-out without bound.
    const tokens = [...current.filter((t): t is string => typeof t === "string" && t !== token), token].slice(-MAX_PUSH_TOKENS);
    tx.set(ref, { pushTokens: tokens, pushPlatform: platform, pushUpdatedAt: serverNow() }, { merge: true });
    return tokens.length;
  });
  return { ok: true, tokens: count };
}

/** Sign-out / notification opt-out: forget this device's token. Idempotent. */
export async function unregisterPushTokenService(uid: string, data: unknown) {
  const token = parseToken(data);
  await consumeLimit("pushToken", uid);
  await db()
    .collection("users")
    .doc(uid)
    .set({ pushTokens: FieldValue.arrayRemove(token), pushUpdatedAt: serverNow() }, { merge: true });
  return { ok: true };
}

export const registerPushToken = callable(async (data, context) => {
  const actor = requirePhoneUser(context);
  return registerPushTokenService(actor.uid, data);
});

/**
 * Requires only a signed-in user (not a verified phone): the app calls it on
 * sign-out, possibly with a token whose phone claim is already stale.
 */
export const unregisterPushToken = callable(async (data, context) => {
  const actor = requireUser(context);
  return unregisterPushTokenService(actor.uid, data);
});

/** FCM errors that mean the token will never work again. */
const DEAD_TOKEN = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

export async function deliverNotification(notificationId: string, data: Record<string, unknown>) {
  const ref = db().collection("userNotifications").doc(notificationId);
  const recipient = String(data.recipientUid ?? "");
  const user = recipient ? await db().collection("users").doc(recipient).get() : null;
  const tokens: string[] = (user?.data()?.pushTokens as string[] | undefined) ?? [];
  if (tokens.length === 0) {
    await ref.set({ push: { status: "no-device", at: serverNow() } }, { merge: true });
    return "no-device";
  }
  if (isEmulator()) {
    // The emulator has no FCM backend; record honestly.
    await ref.set({ push: { status: "skipped-emulator", at: serverNow() } }, { merge: true });
    return "skipped-emulator";
  }
  let res;
  try {
    res = await getMessaging(app()).sendEachForMulticast({
      tokens,
      notification: { title: String(data.title ?? ""), body: String(data.body ?? "") },
      data: { notificationId, kind: String(data.kind ?? "") },
    });
  } catch (e) {
    // Whole-request failure (FCM outage, bad credentials). The inbox entry
    // stands; record the push outcome honestly and surface it in the logs.
    const code = String((e as { code?: unknown })?.code ?? "unknown");
    await ref.set({ push: { status: "failed", error: code.slice(0, 100), at: serverNow() } }, { merge: true });
    logWarn({ event: "push.send-failed", uid: recipient, notificationId, code });
    return "failed";
  }
  const dead = res.responses
    .map((r, i) => (!r.success && DEAD_TOKEN.has(r.error?.code ?? "") ? tokens[i] : null))
    .filter((t): t is string => !!t);
  if (dead.length) {
    await db().collection("users").doc(recipient).set({ pushTokens: FieldValue.arrayRemove(...dead) }, { merge: true });
  }
  const status = res.successCount > 0 ? "sent" : "failed";
  await ref.set({ push: { status, successCount: res.successCount, failureCount: res.failureCount, at: serverNow() } }, { merge: true });
  if (status === "failed") logWarn({ event: "push.send-failed", uid: recipient, notificationId, failureCount: res.failureCount, deadDevices: dead.length });
  return status;
}

/**
 * Best-effort push for each new inbox entry. Deliberately NOT retried
 * (no failurePolicy): a retry after a partial send would push twice, and the
 * inbox entry — the source of truth — is already written.
 */
export const deliverNotifications = functions
  .region("asia-south1")
  .firestore.document("userNotifications/{id}")
  .onCreate(async (snap) => {
    await deliverNotification(snap.id, snap.data());
  });
