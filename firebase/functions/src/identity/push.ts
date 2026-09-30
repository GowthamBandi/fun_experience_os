import * as functions from "firebase-functions/v1";
import { getMessaging } from "firebase-admin/messaging";
import { FieldValue } from "firebase-admin/firestore";
import { callable, obj, str } from "../platform/callable";
import { requirePhoneUser } from "../platform/actors";
import { app, db, serverNow } from "../platform/firestore";
import { DomainError } from "../platform/errors";
import { isEmulator } from "../platform/security";

/**
 * Push delivery for in-app notifications.
 *
 * The in-app inbox (`userNotifications`) is the source of truth and always
 * works. Push is best-effort: when the recipient has registered FCM tokens
 * (PULSE with firebase_messaging + APNs/FCM configured for the project) the
 * notification is sent and its `push.status` recorded; otherwise it stays
 * `no-device`. Nothing is ever reported as delivered that wasn't.
 */
export async function registerPushTokenService(uid: string, data: unknown) {
  const input = obj(data);
  const token = str(input.token, "token", 20, 4096);
  const platform = input.platform === "ios" ? "ios" : input.platform === "android" ? "android" : null;
  if (!platform) throw new DomainError("INVALID_INPUT", "platform must be android or ios.");
  await db()
    .collection("users")
    .doc(uid)
    .set({ pushTokens: FieldValue.arrayUnion(token), pushPlatform: platform, pushUpdatedAt: serverNow() }, { merge: true });
  return { ok: true };
}

export const registerPushToken = callable(async (data, context) => {
  const actor = requirePhoneUser(context);
  return registerPushTokenService(actor.uid, data);
});

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
  const res = await getMessaging(app()).sendEachForMulticast({
    tokens,
    notification: { title: String(data.title ?? ""), body: String(data.body ?? "") },
    data: { notificationId, kind: String(data.kind ?? "") },
  });
  const dead = res.responses
    .map((r, i) => (!r.success && r.error?.code === "messaging/registration-token-not-registered" ? tokens[i] : null))
    .filter((t): t is string => !!t);
  if (dead.length) {
    await db().collection("users").doc(recipient).set({ pushTokens: FieldValue.arrayRemove(...dead) }, { merge: true });
  }
  const status = res.successCount > 0 ? "sent" : "failed";
  await ref.set({ push: { status, successCount: res.successCount, failureCount: res.failureCount, at: serverNow() } }, { merge: true });
  return status;
}

export const deliverNotifications = functions
  .region("asia-south1")
  .firestore.document("userNotifications/{id}")
  .onCreate(async (snap) => {
    await deliverNotification(snap.id, snap.data());
  });
