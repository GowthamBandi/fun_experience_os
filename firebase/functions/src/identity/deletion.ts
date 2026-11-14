import { getAuth } from "firebase-admin/auth";
import { writeAudit } from "../platform/audit";
import { COLLECTIONS, db, serverNow } from "../platform/firestore";
import { DomainError } from "../platform/errors";
import { isUnderLegalHold } from "../platform/legalHolds";
import { consumeLimit } from "../platform/rateLimit";
import { T } from "../trips/refs";
import type { PhoneActor } from "./common";

/**
 * Self-service account deletion (App Store 5.1.1(v), Play User Data policy).
 *
 * Refused while the person still has something in flight that deletion would
 * strand: an upcoming event booking or trip, an active host or staff role, or
 * a legal hold. Otherwise it deletes the identity documents (users,
 * publicProfiles, customerSafety, an open organizer application), the inbox,
 * and the Firebase Auth user, so the phone number can sign up afresh. Reviews
 * stay published but lose their author link.
 *
 * KEPT, as the privacy policy says: bookings, tickets, payments, refunds,
 * ledger entries and audit events. They are financial or safety
 * records with statutory retention and carry the alias, not the phone.
 */
export async function deleteMyAccount(actor: PhoneActor) {
  await consumeLimit("profileUpdate", actor.uid, "Please wait a little before trying again.");
  const firestore = db();
  const nowMs = serverNow().toMillis();

  if (await isUnderLegalHold("user", actor.uid)) {
    throw new DomainError("PRECONDITION", "Your account can't be deleted right now. Contact PULSE support and we'll explain why.", {
      nextStep: "Contact PULSE support and we'll explain why.",
    });
  }

  // Single-equality queries (automatic indexes); status is filtered here.
  const [membershipSnap, bookingSnap, tripSnap] = await Promise.all([
    firestore.collection(COLLECTIONS.memberships).where("uid", "==", actor.uid).get(),
    firestore.collection(COLLECTIONS.bookings).where("customerUid", "==", actor.uid).get(),
    firestore.collection(T.tripBookings).where("customerUid", "==", actor.uid).get(),
  ]);
  const live = (d: FirebaseFirestore.QueryDocumentSnapshot) => ["held", "confirmed"].includes(String(d.data().status));
  const bookings = { docs: bookingSnap.docs.filter(live) };
  const trips = { docs: tripSnap.docs.filter(live) };

  if (membershipSnap.docs.some((d) => d.data().status === "active")) {
    throw new DomainError("PRECONDITION", "You still host or work on PULSE. Ask your organizer's owner to remove you, or contact PULSE to close your organizer.", {
      nextStep: "Ask your organizer's owner to remove you, or contact PULSE to close your organizer, then try again.",
    });
  }
  if (trips.docs.some((d) => (d.data().departureStart?.toMillis?.() ?? 0) > nowMs)) {
    throw new DomainError("PRECONDITION", "You have an upcoming trip. Cancel it from Your trips first, then delete your account.", {
      nextStep: "Cancel it from Your trips first, then delete your account.",
    });
  }
  const eventIds = [...new Set(bookings.docs.map((d) => String(d.data().eventId)))];
  if (eventIds.length) {
    const events = await firestore.getAll(...eventIds.map((id) => firestore.collection(COLLECTIONS.events).doc(id)));
    if (events.some((e) => !e.exists || (e.data()?.startsAt?.toMillis?.() ?? 0) > nowMs)) {
      throw new DomainError("PRECONDITION", "You have an upcoming booking. Cancel it from Plans first, then delete your account.", {
        nextStep: "Cancel it from Plans first, then delete your account.",
      });
    }
  }

  const [inbox, reviews] = await Promise.all([
    firestore.collection(COLLECTIONS.userNotifications).where("recipientUid", "==", actor.uid).get(),
    firestore.collection(COLLECTIONS.reviews).where("authorUid", "==", actor.uid).get(),
  ]);
  const refs = [
    firestore.collection(COLLECTIONS.users).doc(actor.uid),
    firestore.collection(COLLECTIONS.publicProfiles).doc(actor.uid),
    firestore.collection(COLLECTIONS.customerSafety).doc(actor.uid),
    ...inbox.docs.map((d) => d.ref),
  ];
  const application = await firestore.collection(COLLECTIONS.organizerApplications).doc(actor.uid).get();
  if (application.exists && application.data()?.status !== "approved") refs.push(application.ref);

  // Reviews stay published but are no longer linked to the person.
  const unlink = reviews.docs.map((d) => d.ref);
  const writes = [...refs.map((ref) => ({ ref, unlink: false })), ...unlink.map((ref) => ({ ref, unlink: true }))];

  // Batches of 400 writes; the audit event rides on the last one.
  for (let i = 0; i < writes.length; i += 400) {
    const batch = firestore.batch();
    for (const w of writes.slice(i, i + 400)) {
      if (w.unlink) batch.update(w.ref, { authorUid: null, authorName: "PULSE member" });
      else batch.delete(w.ref);
    }
    if (i + 400 >= writes.length) {
      writeAudit(batch, {
        action: "account.deleted",
        actorUid: actor.uid,
        actorRole: "customer",
        resourceType: "user",
        resourceId: actor.uid,
        after: { inboxDeleted: inbox.size, reviewsUnlinked: unlink.length },
        source: "pulse-app",
      });
    }
    await batch.commit();
  }

  try {
    await getAuth().deleteUser(actor.uid);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
  }
  return { ok: true as const };
}
