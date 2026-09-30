import { FieldValue } from "firebase-admin/firestore";
import { writeAudit } from "../platform/audit";
import { COLLECTIONS, db, serverNow } from "../platform/firestore";
import { DomainError } from "../platform/errors";
import type { Membership } from "../access/permissions";
import { iso, type PhoneActor } from "./common";
import { ageOn, type UpdateProfileCommand } from "./model";

export const MIN_AGE = 13;

/**
 * Upserts the three identity documents. `publicProfiles` gets ONLY the fields
 * the owner may later edit directly under the rules (displayName, bio,
 * updatedAt) — any extra key would make every later client edit fail
 * `keys().hasOnly(...)`. Birth date and gender live in `customerSafety`,
 * never on the public profile. The phone comes from the verified token only.
 */
export async function updateMyProfile(command: UpdateProfileCommand, actor: PhoneActor) {
  const today = serverNow().toDate();
  const age = ageOn(command.birthDate, today);
  if (age < 0 || age > 120) throw new DomainError("INVALID_INPUT", "Enter your real date of birth.");
  if (age < MIN_AGE) {
    throw new DomainError("NOT_ELIGIBLE", `You must be at least ${MIN_AGE} to use PULSE.`, {
      nextStep: "Ask a parent or guardian to book for you.",
    });
  }
  const firestore = db();
  const userRef = firestore.collection(COLLECTIONS.users).doc(actor.uid);
  const profileRef = firestore.collection(COLLECTIONS.publicProfiles).doc(actor.uid);
  const safetyRef = firestore.collection(COLLECTIONS.customerSafety).doc(actor.uid);
  await firestore.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const now = serverNow();
    tx.set(
      userRef,
      {
        uid: actor.uid,
        phone: actor.phone,
        updatedAt: now,
        ...(userSnap.exists && userSnap.data()?.createdAt ? {} : { createdAt: now }),
      },
      { merge: true }
    );
    tx.set(
      profileRef,
      { displayName: command.displayName, bio: command.bio ?? FieldValue.delete(), updatedAt: now },
      { merge: true }
    );
    tx.set(safetyRef, { birthDate: command.birthDate, gender: command.gender, updatedAt: now });
    writeAudit(tx, {
      action: "profile.updated",
      actorUid: actor.uid,
      actorRole: "customer",
      resourceType: "user",
      resourceId: actor.uid,
      // Safety facts are not copied into the audit trail.
      after: { displayName: command.displayName, profileComplete: true },
      source: "pulse-app",
    });
  });
  return { ok: true as const };
}

/**
 * Which access prompts the app should show. Never returns codes or hashes.
 */
export async function myAccess(actor: PhoneActor) {
  const firestore = db();
  const [profile, safety, application, activation, membershipSnap, inviteSnap] = await Promise.all([
    firestore.collection(COLLECTIONS.publicProfiles).doc(actor.uid).get(),
    firestore.collection(COLLECTIONS.customerSafety).doc(actor.uid).get(),
    firestore.collection(COLLECTIONS.organizerApplications).doc(actor.uid).get(),
    firestore.collection(COLLECTIONS.organizerActivations).doc(actor.uid).get(),
    firestore.collection(COLLECTIONS.memberships).where("uid", "==", actor.uid).get(),
    firestore.collection(COLLECTIONS.staffInvites).where("phone", "==", actor.phone).where("status", "==", "pending").get(),
  ]);
  const now = serverNow().toMillis();

  const active = membershipSnap.docs.map((d) => d.data() as Membership).filter((m) => m.status === "active");
  const pendingInvites = inviteSnap.docs.filter((d) => (d.data().expiresAt?.toMillis?.() ?? 0) > now);
  const orgIds = [...new Set([...active.map((m) => m.orgId), ...pendingInvites.map((d) => String(d.data().orgId))])];
  const orgNames = new Map<string, string>();
  if (orgIds.length) {
    const orgs = await firestore.getAll(...orgIds.map((id) => firestore.collection(COLLECTIONS.organizers).doc(id)));
    for (const o of orgs) if (o.exists) orgNames.set(o.id, String(o.data()?.name ?? ""));
  }

  const app = application.data();
  const act = activation.data();
  const activationPending =
    !!act && act.status === "issued" && (act.expiresAt?.toMillis?.() ?? 0) > now;

  return {
    profileComplete: !!profile.data()?.displayName && !!safety.data()?.birthDate,
    organizer: {
      applicationStatus: (app?.status as string | undefined) ?? "none",
      activationPending,
      ...(app?.orgId ? { orgId: String(app.orgId) } : {}),
    },
    memberships: active.map((m) => ({
      orgId: m.orgId,
      orgName: orgNames.get(m.orgId) ?? "",
      role: m.role,
      title: m.title ?? null,
      permissions: m.permissions,
      eventScope: m.eventScope,
    })),
    pendingStaffInvites: pendingInvites.map((d) => ({
      inviteId: d.id,
      orgName: orgNames.get(String(d.data().orgId)) ?? String(d.data().orgName ?? ""),
      expiresAt: iso(d.data().expiresAt),
    })),
  };
}
