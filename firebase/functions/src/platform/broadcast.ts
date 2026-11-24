/**
 * Console broadcasts: one push to everyone, or to one city. The app keeps the
 * city on the phone and subscribes to an FCM topic for it (`city_<key>`), so
 * PULSE never stores where people are. Audited; at most 3 per day.
 */
import { getMessaging } from "firebase-admin/messaging";
import { callable, oneOf, str } from "./callable";
import { requireAdmin } from "./auth";
import { DomainError } from "./errors";
import { app, db, serverNow, Timestamp } from "./firestore";
import { writeAudit } from "./audit";
import { isEmulator } from "./security";
import { cityKey } from "../catalog/cityKey";

export const BROADCASTS_PER_DAY = 3;
const CITY_RE = /^[a-z0-9-]{2,60}$/;

/** FCM topic for a city, same key as the app ("Bangalore" → "city_bengaluru",
 *  "Navi Mumbai" → "city_navi-mumbai"). */
export const cityTopic = (name: string) => `city_${cityKey(name).replace(/ /g, "-")}`;

/** Broad pushes (this callable + limited notification-center sends) in the last 24 hours. */
export async function broadcastsInLastDay(): Promise<number> {
  const now = serverNow();
  const recent = await db().collection("broadcasts").where("createdAt", ">", Timestamp.fromMillis(now.toMillis() - 86_400_000)).count().get();
  return recent.data().count;
}

/** Refuses a broad push once BROADCASTS_PER_DAY have gone out in 24 hours (shared quota, contract §2). */
export async function assertBroadcastQuota(message?: string): Promise<void> {
  if ((await broadcastsInLastDay()) >= BROADCASTS_PER_DAY) {
    throw new DomainError("PRECONDITION", message ?? `At most ${BROADCASTS_PER_DAY} broadcasts a day, so people don't mute PULSE.`, {
      nextStep: "Target specific people or organizations, or wait until tomorrow.",
      facts: { dailyLimit: BROADCASTS_PER_DAY },
    });
  }
}

export const sendBroadcast = callable(async (data, context) => {
  const admin = requireAdmin(context, "broadcast");
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const audience = oneOf(d.audience, "audience", ["all", "city"] as const);
  const city = audience === "city" ? cityKey(String(d.city ?? "")).replace(/ /g, "-") : null;
  if (audience === "city" && !CITY_RE.test(city!)) throw new DomainError("INVALID_INPUT", "Choose a city.");
  const title = str(d.title, "Title", 3, 65);
  const body = str(d.body, "Message", 5, 240);
  const reason = str(d.reason, "Reason", 3, 200);
  const now = serverNow();
  await assertBroadcastQuota();
  const topic = audience === "all" ? "all" : `city_${city}`;
  let status = "sent";
  if (isEmulator()) status = "skipped-emulator"; // no FCM backend here
  else {
    try {
      await getMessaging(app()).send({ topic, notification: { title, body }, data: { route: "explore" } });
    } catch (e) {
      status = `failed:${String((e as { code?: unknown })?.code ?? "unknown").slice(0, 60)}`;
    }
  }
  const ref = db().collection("broadcasts").doc();
  const batch = db().batch();
  batch.set(ref, { audience, city, topic, title, body, status, createdAt: now, createdBy: admin.uid });
  writeAudit(batch, {
    action: "platform.broadcast", actorUid: admin.uid, actorRole: `platform:${admin.roleId}`,
    resourceType: "broadcast", resourceId: ref.id, after: { audience, city, title, status }, reason, source: "operations-console",
  });
  await batch.commit();
  if (status.startsWith("failed")) throw new DomainError("PRECONDITION", "The push service didn't accept the broadcast. Try again shortly.");
  return { id: ref.id, topic, status };
});
