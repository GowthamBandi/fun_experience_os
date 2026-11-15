import { FieldValue } from "firebase-admin/firestore";
import { DomainError } from "../platform/errors";
import { COLLECTIONS, db, serverNow } from "../platform/firestore";
import { writeAudit } from "../platform/audit";

/** A person can block at most this many organizers (one document). */
export const MAX_BLOCKED_ORGANIZERS = 500;

/**
 * userBlocks/{uid}: organizers this person blocked. The app hides their
 * experiences and profile for them. Readable only by the person (rules);
 * written only here.
 */
export async function setOrganizerBlock(uid: string, orgId: string, blocked: boolean) {
  const firestore = db();
  const ref = firestore.collection(COLLECTIONS.userBlocks).doc(uid);
  return firestore.runTransaction(async (tx) => {
    const org = await tx.get(firestore.collection(COLLECTIONS.organizers).doc(orgId));
    if (blocked && !org.exists) throw new DomainError("NOT_FOUND", "That organizer doesn't exist.");
    const cur = await tx.get(ref);
    const ids: string[] = Array.isArray(cur.data()?.orgIds) ? cur.data()!.orgIds : [];
    if (blocked && !ids.includes(orgId) && ids.length >= MAX_BLOCKED_ORGANIZERS) {
      throw new DomainError("PRECONDITION", "You've blocked the most organizers allowed. Unblock some first.");
    }
    const now = serverNow();
    tx.set(ref, { uid, orgIds: blocked ? FieldValue.arrayUnion(orgId) : FieldValue.arrayRemove(orgId), updatedAt: now }, { merge: true });
    writeAudit(tx, {
      action: blocked ? "trust.organizer-blocked" : "trust.organizer-unblocked",
      actorUid: uid,
      actorRole: "customer",
      resourceType: "organizer",
      resourceId: orgId,
      orgId,
      before: null,
      after: { blocked },
    });
    return { orgId, blocked };
  });
}
