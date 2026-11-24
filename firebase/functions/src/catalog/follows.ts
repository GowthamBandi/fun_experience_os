/**
 * Following organizers. `follows/{orgId}__{uid}` = { orgId, uid, createdAt }
 * (the person reads their own; written only by setFollow). When an organizer
 * publishes an event, followers get one notification (dedupe per event).
 */
import * as functions from "firebase-functions/v1";
import { callable, docId, obj } from "../platform/callable";
import { requireCustomerAction, requirePhoneUser } from "../platform/actors";
import { consumeLimit } from "../platform/rateLimit";
import { DomainError } from "../platform/errors";
import { COLLECTIONS, db, serverNow } from "../platform/firestore";
import { notify } from "../platform/notify";
import { logInfo } from "../platform/log";
import { bool } from "./common";

export const followRef = (orgId: string, uid: string) => db().collection("follows").doc(`${orgId}__${uid}`);

export async function setFollowCommand(uid: string, data: unknown) {
  const d = obj(data);
  const orgId = docId(d.orgId, "orgId");
  const follow = bool(d.follow, "follow");
  const ref = followRef(orgId, uid);
  if (follow) {
    const org = await db().collection("publicOrganizers").doc(orgId).get();
    if (!org.exists) throw new DomainError("NOT_FOUND", "That organizer doesn't exist.");
    await ref.set({ orgId, uid, createdAt: serverNow() }, { merge: true });
  } else {
    await ref.delete();
  }
  return { orgId, follow };
}

export const setFollow = callable(async (data, context) => {
  // Following is a customer action (refused while paused); unfollowing always works.
  const follow = !!data && typeof data === "object" && (data as Record<string, unknown>).follow === true;
  const uid = follow ? (await requireCustomerAction(context)).uid : requirePhoneUser(context).uid;
  await consumeLimit("catalogOps", uid);
  return setFollowCommand(uid, data);
});

/** Notifies an organizer's followers about a newly published event. */
export async function notifyFollowers(eventId: string, ev: Record<string, unknown>): Promise<number> {
  const orgId = String(ev.orgId ?? "");
  if (!orgId) return 0;
  const snap = await db().collection("follows").where("orgId", "==", orgId).limit(5000).get();
  let sent = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db().batch();
    for (const f of snap.docs.slice(i, i + 400)) {
      notify(batch, {
        recipientUid: String(f.data().uid),
        kind: "followed-new-event",
        title: `New from ${String(ev.organizerName ?? "an organizer you follow")}`,
        body: `${String(ev.title ?? "A new experience")} is now open for booking.`,
        dedupeKey: `${eventId}-new`,
        link: { type: "event", id: eventId },
      });
      sent++;
    }
    await batch.commit();
  }
  return sent;
}

export const onEventPublishedNotifyFollowers = functions
  .region("asia-south1")
  .runWith({ failurePolicy: true, timeoutSeconds: 120 })
  .firestore.document(`${COLLECTIONS.events}/{eventId}`)
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before?.status === "published" || after?.status !== "published") return;
    const sent = await notifyFollowers(context.params.eventId as string, after);
    if (sent > 0) logInfo({ event: "job.completed", job: "onEventPublishedNotifyFollowers", eventId: context.params.eventId, sent });
  });
