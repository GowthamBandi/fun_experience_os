import { FieldValue, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import {
  actorRole,
  assertCanGrant,
  requirePermission,
  type EventScope,
  type Membership,
  type Permission,
} from "../access/permissions";
import { writeAudit } from "../platform/audit";
import { COLLECTIONS, db, membershipId, serverNow } from "../platform/firestore";
import { DomainError, notFound } from "../platform/errors";
import { notify } from "../platform/notify";
import { consumeLimit, consumeRateLimit, resetRateLimit } from "../platform/rateLimit";
import { generateCode, hashCode, safeEqual } from "../platform/security";
import {
  CODE_POLICY,
  codeBucket,
  codeFailureAudit,
  codeRefused,
  consumeCodeAttempt,
  auditCodeFailure,
  expiresIn,
  iso,
  maskPhone,
  membershipView,
  readReceipt,
  writeReceipt,
  type CodeFailureReason,
  type PhoneActor,
} from "./common";
import {
  assertScopeFits,
  type InviteStaffCommand,
  type ReissueStaffCodeCommand,
  type RevokeStaffCommand,
  type UpdateStaffCommand,
} from "./model";

/** Events that make someone the accountable person on the ground. */
export const RESPONSIBLE_EVENT_STATUSES = ["published", "booking-closed", "live"] as const;

const ACTIONS = {
  invite: "identity.staff-invited",
  update: "identity.staff-updated",
  revoke: "identity.staff-revoked",
  reissue: "identity.staff-code-reissued",
} as const;

const col = (name: string) => db().collection(name);
const memberRef = (orgId: string, uid: string) => col(COLLECTIONS.memberships).doc(membershipId(orgId, uid));

function newStaffCode() {
  const code = generateCode(CODE_POLICY.staff.length);
  return { code, codeHash: hashCode("staff", code), expiresAt: expiresIn(CODE_POLICY.staff.ttlMs) };
}

/** Staff can only be managed within what the manager could grant themselves. */
function assertCanManage(manager: Membership, target: { permissions: Permission[]; eventScope: EventScope }) {
  try {
    assertCanGrant(manager, target.permissions, target.eventScope);
  } catch {
    throw new DomainError("NOT_PERMITTED", "You can't change access for someone with more access than you.", {
      nextStep: "Ask the organizer owner to make this change.",
    });
  }
}

function assertOrganizerOpen(snap: DocumentSnapshot) {
  const status = snap.data()?.status;
  if (!snap.exists || (status !== "active" && status !== "paused")) {
    throw new DomainError("PRECONDITION", "This organizer can't manage staff right now.", {
      nextStep: "Contact PULSE support.",
    });
  }
}

/** Every listed event must exist and belong to this organizer. */
async function assertEventsBelong(tx: Transaction, orgId: string, scope: EventScope) {
  if (scope.all || scope.eventIds.length === 0) return;
  const snaps = await tx.getAll(...scope.eventIds.map((id) => col(COLLECTIONS.events).doc(id)));
  for (const s of snaps) {
    if (!s.exists || s.data()?.orgId !== orgId) {
      throw new DomainError("INVALID_INPUT", "One of the assigned events isn't part of this organizer.", {
        detail: { eventId: s.id },
      });
    }
  }
}

// ---- invite ----------------------------------------------------------------

export async function inviteStaff(command: InviteStaffCommand, actor: PhoneActor) {
  if (command.phone === actor.phone) {
    throw new DomainError("INVALID_INPUT", "You can't invite yourself.");
  }
  await consumeRateLimit({
    bucket: `staff-invite-${actor.uid}`,
    limit: 30,
    windowSeconds: 60 * 60,
    message: "You've sent a lot of invites. Please wait a while and try again.",
  });
  const firestore = db();
  return firestore.runTransaction(async (tx) => {
    // Authority first: a revoked manager can't even replay an old request.
    const manager = await requirePermission(actor.uid, command.orgId, "staff.manage", { tx });
    const prior = await readReceipt(tx, actor.uid, command.requestId, ACTIONS.invite);
    if (prior) return { ...prior, replayed: true };

    const orgSnap = await tx.get(col(COLLECTIONS.organizers).doc(command.orgId));
    const [usersSnap, invitesSnap] = await Promise.all([
      tx.get(col(COLLECTIONS.users).where("phone", "==", command.phone).limit(10)),
      tx.get(
        col(COLLECTIONS.staffInvites)
          .where("orgId", "==", command.orgId)
          .where("phone", "==", command.phone)
          .where("status", "==", "pending")
      ),
    ]);
    const existingMembers = usersSnap.empty
      ? []
      : await tx.getAll(...usersSnap.docs.map((u) => memberRef(command.orgId, u.id)));
    await assertEventsBelong(tx, command.orgId, command.eventScope);

    assertOrganizerOpen(orgSnap);
    assertCanGrant(manager, command.permissions, command.eventScope);
    if (usersSnap.docs.some((u) => u.id === actor.uid)) throw new DomainError("INVALID_INPUT", "You can't invite yourself.");
    if (existingMembers.some((m) => m.exists && m.data()?.status === "active")) {
      throw new DomainError("CONFLICT", "This person is already on your team.", {
        nextStep: "Edit their access instead.",
      });
    }
    const now = serverNow();
    for (const inv of invitesSnap.docs) {
      if ((inv.data().expiresAt?.toMillis?.() ?? 0) > now.toMillis()) {
        throw new DomainError("CONFLICT", "This number already has a pending invite.", {
          nextStep: "Re-issue the code for that invite, or cancel it first.",
        });
      }
      tx.update(inv.ref, { status: "expired", codeHash: FieldValue.delete(), updatedAt: now });
    }

    const { code, codeHash, expiresAt } = newStaffCode();
    const inviteRef = col(COLLECTIONS.staffInvites).doc();
    tx.create(inviteRef, {
      orgId: command.orgId,
      orgName: String(orgSnap.data()?.name ?? ""),
      phone: command.phone,
      phoneMasked: maskPhone(command.phone),
      title: command.title,
      role: "staff",
      permissions: command.permissions,
      eventScope: command.eventScope,
      codeHash,
      status: "pending",
      attempts: 0,
      expiresAt,
      invitedBy: actor.uid,
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
    writeAudit(tx, {
      action: "staff.invited",
      actorUid: actor.uid,
      actorRole: actorRole(manager),
      resourceType: "staffInvite",
      resourceId: inviteRef.id,
      orgId: command.orgId,
      after: { phoneMasked: maskPhone(command.phone), title: command.title, permissions: command.permissions, eventScope: command.eventScope },
      requestId: command.requestId,
      source: "pulse-app",
    });
    const stored = { inviteId: inviteRef.id, expiresAt: iso(expiresAt), codeAlreadyIssued: true };
    writeReceipt(tx, actor.uid, command.requestId, ACTIONS.invite, stored);
    return { inviteId: inviteRef.id, code, expiresAt: iso(expiresAt), replayed: false };
  });
}

// ---- list ------------------------------------------------------------------

export async function listStaff(command: { orgId: string }, actor: PhoneActor) {
  await requirePermission(actor.uid, command.orgId, "staff.manage");
  const [memberSnap, inviteSnap] = await Promise.all([
    col(COLLECTIONS.memberships).where("orgId", "==", command.orgId).get(),
    col(COLLECTIONS.staffInvites).where("orgId", "==", command.orgId).where("status", "==", "pending").get(),
  ]);
  const members = memberSnap.docs.map((d) => d.data() as Membership);
  const profiles = members.length
    ? await db().getAll(...members.map((m) => col(COLLECTIONS.publicProfiles).doc(m.uid)))
    : [];
  const names = new Map(profiles.map((p) => [p.id, String(p.data()?.displayName ?? "")]));
  const now = serverNow().toMillis();
  return {
    members: members.map((m) => ({
      uid: m.uid,
      displayName: names.get(m.uid) ?? "",
      title: m.title ?? null,
      role: m.role,
      status: m.status,
      permissions: m.permissions,
      eventScope: m.eventScope,
    })),
    invites: inviteSnap.docs.map((d) => {
      const i = d.data();
      return {
        inviteId: d.id,
        phoneMasked: maskPhone(i.phone),
        title: i.title ?? null,
        permissions: i.permissions,
        eventScope: i.eventScope,
        expiresAt: iso(i.expiresAt),
        status: (i.expiresAt?.toMillis?.() ?? 0) > now ? "pending" : "expired",
      };
    }),
  };
}

// ---- redeem ----------------------------------------------------------------

type RedeemOutcome = { ok: true; orgId: string } | { ok: false; reason: CodeFailureReason; orgId?: string; inviteId?: string };

/**
 * Knowing the phone number alone grants nothing: the invite must be addressed
 * to the caller's VERIFIED phone (from the ID token) AND the code must match.
 */
export async function redeemStaffCode(command: { code: string }, actor: PhoneActor) {
  await consumeCodeAttempt(actor, "staff");
  if (command.code.length !== CODE_POLICY.staff.length) {
    await auditCodeFailure(actor, "staff", "bad-format");
    throw codeRefused("bad-format");
  }
  const attemptedHash = hashCode("staff", command.code);
  const firestore = db();

  const outcome = await firestore.runTransaction<RedeemOutcome>(async (tx) => {
    const invites = await tx.get(
      col(COLLECTIONS.staffInvites).where("phone", "==", actor.phone).where("status", "==", "pending").limit(20)
    );
    const fail = (reason: CodeFailureReason, extra: { orgId?: string; inviteId?: string } = {}): RedeemOutcome => {
      codeFailureAudit(tx, actor, "staff", reason, { orgId: extra.orgId ?? null, resourceId: extra.inviteId });
      return { ok: false, reason, ...extra };
    };
    const match = invites.docs.find((d) => typeof d.data().codeHash === "string" && safeEqual(d.data().codeHash, attemptedHash));
    if (!match) {
      // Every pending invite for this phone is a target: count the miss on
      // each and lock any that has absorbed too many guesses.
      const now = serverNow();
      for (const d of invites.docs) {
        const attempts = Number(d.data().attempts ?? 0) + 1;
        tx.update(d.ref, {
          attempts,
          lastFailedAt: now,
          ...(attempts >= CODE_POLICY.maxAttemptsPerCode ? { status: "locked", codeHash: FieldValue.delete() } : {}),
        });
      }
      return fail(invites.empty ? "no-invite" : "mismatch");
    }
    const invite = match.data();
    const orgId = String(invite.orgId);
    const ids = { orgId, inviteId: match.id };
    const [mSnap, orgSnap] = await Promise.all([tx.get(memberRef(orgId, actor.uid)), tx.get(col(COLLECTIONS.organizers).doc(orgId))]);
    if ((invite.expiresAt?.toMillis?.() ?? 0) <= serverNow().toMillis()) return fail("expired", ids);
    const prior = mSnap.data() as (Membership & Record<string, unknown>) | undefined;
    if (prior?.status === "active") return fail("already-member", ids);
    const orgStatus = orgSnap.data()?.status;
    if (!orgSnap.exists || (orgStatus !== "active" && orgStatus !== "paused")) return fail("organizer-unavailable", ids);

    const now = serverNow();
    const membership = {
      orgId,
      uid: actor.uid,
      role: "staff" as const,
      status: "active" as const,
      permissions: invite.permissions as Permission[],
      eventScope: invite.eventScope as EventScope,
      title: String(invite.title ?? ""),
      inviteId: match.id,
      invitedBy: invite.invitedBy ?? null,
      activatedAt: now,
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
      version: prior ? Number(prior.version ?? 0) + 1 : 0,
    };
    // A full `set` so a previously revoked membership comes back with ONLY
    // the new grant (no stale permissions or revocation leftovers).
    tx.set(memberRef(orgId, actor.uid), membership);
    tx.update(match.ref, { status: "redeemed", codeHash: FieldValue.delete(), redeemedBy: actor.uid, redeemedAt: now, updatedAt: now });
    notify(tx, {
      recipientUid: actor.uid,
      kind: "staff-activated",
      title: "You're on the team",
      body: `You now have ${membership.title || "staff"} access for ${String(orgSnap.data()?.name ?? "this organizer")}.`,
      dedupeKey: `${membershipId(orgId, actor.uid)}:${match.id}`,
      link: { type: "organizer", id: orgId },
    });
    writeAudit(tx, {
      action: "staff.activated",
      actorUid: actor.uid,
      actorRole: `org:${orgId}:staff`,
      resourceType: "membership",
      resourceId: membershipId(orgId, actor.uid),
      orgId,
      before: prior ? { status: prior.status, permissions: prior.permissions } : null,
      after: { status: "active", permissions: membership.permissions, eventScope: membership.eventScope, inviteId: match.id },
      source: "pulse-app",
    });
    return { ok: true, orgId };
  });

  if (!outcome.ok) throw codeRefused(outcome.reason);
  await resetRateLimit(codeBucket("staff", actor.uid));
  return { orgId: outcome.orgId };
}

// ---- update ----------------------------------------------------------------

export async function updateStaff(command: UpdateStaffCommand, actor: PhoneActor) {
  await consumeLimit("staffManage", actor.uid);
  const firestore = db();
  return firestore.runTransaction(async (tx) => {
    const manager = await requirePermission(actor.uid, command.orgId, "staff.manage", { tx });
    const prior = await readReceipt(tx, actor.uid, command.requestId, ACTIONS.update);
    if (prior) return { ...prior, replayed: true };
    const ref = memberRef(command.orgId, command.uid);
    const snap = await tx.get(ref);
    if (command.eventScope) await assertEventsBelong(tx, command.orgId, command.eventScope);

    if (!snap.exists) throw notFound("This team member wasn't found.");
    const current = snap.data() as Membership;
    if (current.role === "owner") throw new DomainError("NOT_PERMITTED", "The organizer owner's access can't be edited.");
    if (command.uid === actor.uid) throw new DomainError("NOT_PERMITTED", "You can't change your own access.");
    if (current.status !== "active") {
      throw new DomainError("PRECONDITION", "This person's access has been revoked.", { nextStep: "Invite them again instead." });
    }
    const permissions = command.permissions ?? current.permissions;
    const eventScope = command.eventScope ?? current.eventScope;
    assertScopeFits(permissions, eventScope);
    assertCanManage(manager, current);
    assertCanGrant(manager, permissions, eventScope);

    const now = serverNow();
    const version = Number(current.version ?? 0) + 1;
    const title = command.title ?? current.title ?? "";
    tx.update(ref, { permissions, eventScope, title, version, updatedAt: now, updatedBy: actor.uid });
    notify(tx, {
      recipientUid: command.uid,
      kind: "staff-updated",
      title: "Your access changed",
      body: "Your team access was updated. Open the organizer workspace to see what you can do.",
      dedupeKey: `${membershipId(command.orgId, command.uid)}:v${version}`,
      link: { type: "organizer", id: command.orgId },
    });
    writeAudit(tx, {
      action: "staff.updated",
      actorUid: actor.uid,
      actorRole: actorRole(manager),
      resourceType: "membership",
      resourceId: membershipId(command.orgId, command.uid),
      orgId: command.orgId,
      before: { permissions: current.permissions, eventScope: current.eventScope, title: current.title ?? null },
      after: { permissions, eventScope, title },
      requestId: command.requestId,
      source: "pulse-app",
    });
    const result = { ...membershipView({ ...current, permissions, eventScope, title, version }), replayed: false };
    writeReceipt(tx, actor.uid, command.requestId, ACTIONS.update, result);
    return result;
  });
}

// ---- revoke ----------------------------------------------------------------

export async function revokeStaff(command: RevokeStaffCommand, actor: PhoneActor) {
  await consumeLimit("staffManage", actor.uid);
  const firestore = db();
  return firestore.runTransaction(async (tx) => {
    const manager = await requirePermission(actor.uid, command.orgId, "staff.manage", { tx });
    const prior = await readReceipt(tx, actor.uid, command.requestId, ACTIONS.revoke);
    if (prior) return { ...prior, replayed: true };

    const mRef = command.uid ? memberRef(command.orgId, command.uid) : null;
    const iRef = command.inviteId ? col(COLLECTIONS.staffInvites).doc(command.inviteId) : null;
    const mSnap = mRef ? await tx.get(mRef) : null;
    const iSnap = iRef ? await tx.get(iRef) : null;
    const responsible = command.uid
      ? await tx.get(
          col(COLLECTIONS.events)
            .where("orgId", "==", command.orgId)
            .where("responsibility.primaryUid", "==", command.uid)
            .where("status", "in", [...RESPONSIBLE_EVENT_STATUSES])
            .limit(1)
        )
      : null;

    const now = serverNow();
    const result: Record<string, unknown> = { orgId: command.orgId, replayed: false };

    if (mRef && mSnap) {
      if (!mSnap.exists) throw notFound("This team member wasn't found.");
      const current = mSnap.data() as Membership;
      if (current.role === "owner") throw new DomainError("NOT_PERMITTED", "The organizer owner can't be removed.");
      if (command.uid === actor.uid) throw new DomainError("NOT_PERMITTED", "You can't remove your own access.");
      if (current.status !== "active") throw new DomainError("PRECONDITION", "This person's access is already revoked.");
      assertCanManage(manager, current);
      if (responsible && !responsible.empty) {
        const ev = responsible.docs[0]!;
        throw new DomainError("PRECONDITION", "This person is the responsible lead for a live or published event.", {
          nextStep: "Make someone else the responsible person for that event first.",
          detail: { eventId: ev.id },
        });
      }
      const version = Number(current.version ?? 0) + 1;
      tx.update(mRef, {
        status: "revoked",
        revokedAt: now,
        revokedBy: actor.uid,
        revokeReason: command.reason,
        version,
        updatedAt: now,
      });
      notify(tx, {
        recipientUid: command.uid!,
        kind: "staff-revoked",
        title: "Your team access ended",
        body: "Your staff access for this organizer was removed. Your PULSE account is unchanged.",
        dedupeKey: `${membershipId(command.orgId, command.uid!)}:v${version}`,
        link: { type: "organizer", id: command.orgId },
      });
      writeAudit(tx, {
        action: "staff.revoked",
        actorUid: actor.uid,
        actorRole: actorRole(manager),
        resourceType: "membership",
        resourceId: membershipId(command.orgId, command.uid!),
        orgId: command.orgId,
        before: { status: current.status, permissions: current.permissions },
        after: { status: "revoked" },
        reason: command.reason,
        requestId: command.requestId,
        source: "pulse-app",
      });
      result.uid = command.uid;
      result.status = "revoked";
    }

    if (iRef && iSnap) {
      const invite = iSnap.data();
      if (!iSnap.exists || invite?.orgId !== command.orgId) throw notFound("This invite wasn't found.");
      if (invite.status === "pending" || invite.status === "locked") {
        assertCanManage(manager, { permissions: invite.permissions, eventScope: invite.eventScope });
        tx.update(iRef, { status: "cancelled", codeHash: FieldValue.delete(), cancelledBy: actor.uid, cancelReason: command.reason, updatedAt: now });
        writeAudit(tx, {
          action: "staff.invite-cancelled",
          actorUid: actor.uid,
          actorRole: actorRole(manager),
          resourceType: "staffInvite",
          resourceId: iRef.id,
          orgId: command.orgId,
          before: { status: invite.status },
          after: { status: "cancelled" },
          reason: command.reason,
          requestId: command.requestId,
          source: "pulse-app",
        });
        result.inviteStatus = "cancelled";
      } else if (!mRef) {
        throw new DomainError("PRECONDITION", "This invite is no longer pending.");
      }
      result.inviteId = iRef.id;
    }

    writeReceipt(tx, actor.uid, command.requestId, ACTIONS.revoke, result);
    return result;
  });
}

// ---- reissue ---------------------------------------------------------------

export async function reissueStaffCode(command: ReissueStaffCodeCommand, actor: PhoneActor) {
  await consumeLimit("staffReissue", actor.uid);
  const firestore = db();
  return firestore.runTransaction(async (tx) => {
    const manager = await requirePermission(actor.uid, command.orgId, "staff.manage", { tx });
    const prior = await readReceipt(tx, actor.uid, command.requestId, ACTIONS.reissue);
    if (prior) return { ...prior, replayed: true };
    const ref = col(COLLECTIONS.staffInvites).doc(command.inviteId);
    const snap = await tx.get(ref);
    const invite = snap.data();
    if (!snap.exists || invite?.orgId !== command.orgId) throw notFound("This invite wasn't found.");
    if (!["pending", "locked"].includes(String(invite.status))) {
      throw new DomainError("PRECONDITION", "This invite has already been used or cancelled.", {
        nextStep: "Send a new invite instead.",
      });
    }
    assertCanManage(manager, { permissions: invite.permissions, eventScope: invite.eventScope });
    const { code, codeHash, expiresAt } = newStaffCode();
    const now = serverNow();
    tx.update(ref, {
      codeHash,
      expiresAt,
      status: "pending",
      attempts: 0,
      reissuedAt: now,
      reissuedBy: actor.uid,
      updatedAt: now,
      version: FieldValue.increment(1),
    });
    writeAudit(tx, {
      action: "staff.code-reissued",
      actorUid: actor.uid,
      actorRole: actorRole(manager),
      resourceType: "staffInvite",
      resourceId: ref.id,
      orgId: command.orgId,
      after: { expiresAt: iso(expiresAt) },
      requestId: command.requestId,
      source: "pulse-app",
    });
    writeReceipt(tx, actor.uid, command.requestId, ACTIONS.reissue, { inviteId: ref.id, expiresAt: iso(expiresAt), codeAlreadyIssued: true });
    return { inviteId: ref.id, code, expiresAt: iso(expiresAt), replayed: false };
  });
}
