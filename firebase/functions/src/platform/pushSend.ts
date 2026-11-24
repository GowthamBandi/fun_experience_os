/**
 * Direct FCM sends for the notification center (contract §2 / §5): a topic
 * push (`all`, `city_<key>`) or a push to chosen people's registered devices
 * (`users/{uid}.pushTokens`, identity/push.ts) without an inbox item. The
 * emulator has no FCM backend, so sends are recorded as "skipped-emulator"
 * (same as broadcast.ts and deliverNotification).
 */
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { FieldValue } from "firebase-admin/firestore";
import { app, db } from "./firestore";
import { isEmulator } from "./security";
import { logWarn } from "./log";

export interface PushContent {
  title: string;
  body: string;
  /** https image (rich notifications). */
  imageUrl?: string | null;
  /** Flat string data for the app's tap routing. */
  data: Record<string, string>;
}

const DEAD_TOKEN = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);
const httpsImage = (u: string | null | undefined) => (typeof u === "string" && u.startsWith("https://") ? u : undefined);

/** One push to an FCM topic. Returns "sent", "skipped-emulator" or "failed:<code>". */
export async function sendTopicPush(topic: string, content: PushContent): Promise<string> {
  if (isEmulator()) return "skipped-emulator";
  try {
    const imageUrl = httpsImage(content.imageUrl);
    await getMessaging(app()).send({
      topic,
      notification: { title: content.title, body: content.body, ...(imageUrl ? { imageUrl } : {}) },
      data: content.data,
    });
    return "sent";
  } catch (e) {
    const code = String((e as { code?: unknown })?.code ?? "unknown").slice(0, 60);
    logWarn({ event: "push.topic-failed", topic, code });
    return `failed:${code}`;
  }
}

/** Pushes to several topics (e.g. one per city); "sent" when at least one went out. */
export async function sendTopicsPush(topics: string[], content: PushContent): Promise<string> {
  if (topics.length === 0) return "no-topic";
  const results = [];
  for (const t of topics) results.push(await sendTopicPush(t, content));
  if (results.every((r) => r === "skipped-emulator")) return "skipped-emulator";
  return results.find((r) => r === "sent") ?? results[0]!;
}

/**
 * Pushes to every registered device of [uids] (max 50 000 people), 500 tokens
 * per multicast. Dead tokens are dropped from the person's list.
 */
export async function sendPushToUids(uids: string[], content: PushContent): Promise<{ status: string; devices: number; sent: number; failed: number }> {
  const tokensByUid = new Map<string, string[]>();
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids.slice(i, i + 100).map((u) => db().collection("users").doc(u));
    if (refs.length === 0) continue;
    const snaps = await db().getAll(...refs, { fieldMask: ["pushTokens"] });
    for (const s of snaps) {
      const t = (s.data()?.pushTokens as unknown[] | undefined)?.filter((x): x is string => typeof x === "string") ?? [];
      if (t.length) tokensByUid.set(s.id, t);
    }
  }
  const pairs = [...tokensByUid.entries()].flatMap(([uid, ts]) => ts.map((token) => ({ uid, token })));
  if (pairs.length === 0) return { status: "no-device", devices: 0, sent: 0, failed: 0 };
  if (isEmulator()) return { status: "skipped-emulator", devices: pairs.length, sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  const imageUrl = httpsImage(content.imageUrl);
  for (let i = 0; i < pairs.length; i += 500) {
    const chunk = pairs.slice(i, i + 500);
    const msg: MulticastMessage = {
      tokens: chunk.map((p) => p.token),
      notification: { title: content.title, body: content.body, ...(imageUrl ? { imageUrl } : {}) },
      data: content.data,
    };
    try {
      const res = await getMessaging(app()).sendEachForMulticast(msg);
      sent += res.successCount;
      failed += res.failureCount;
      const dead = new Map<string, string[]>();
      res.responses.forEach((r, j) => {
        if (!r.success && DEAD_TOKEN.has(r.error?.code ?? "")) {
          const p = chunk[j]!;
          dead.set(p.uid, [...(dead.get(p.uid) ?? []), p.token]);
        }
      });
      for (const [uid, ts] of dead) {
        await db().collection("users").doc(uid).set({ pushTokens: FieldValue.arrayRemove(...ts) }, { merge: true });
      }
    } catch (e) {
      failed += chunk.length;
      logWarn({ event: "push.multicast-failed", code: String((e as { code?: unknown })?.code ?? "unknown").slice(0, 60), devices: chunk.length });
    }
  }
  return { status: sent > 0 ? "sent" : "failed:no-delivery", devices: pairs.length, sent, failed };
}
