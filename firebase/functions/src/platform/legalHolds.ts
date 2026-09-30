/**
 * Legal / compliance holds (docs/runbooks/DATA_RETENTION.md).
 *
 * A hold freezes retention deletion for one subject while a dispute, a
 * regulator's request, law-enforcement request or litigation is open. There
 * was no hold concept anywhere in the data model (docs/database,
 * FIRESTORE_DATA_MODEL.md, rules), so this is the one place it lives:
 *
 *   legalHolds/{subjectType}_{subjectId}
 *     subjectType: "user" (see HOLD_SUBJECTS)
 *     subjectId, status: "active" | "released", reason, reference,
 *     placedBy, placedAt, releasedBy, releasedAt, releaseReason,
 *     version, updatedAt
 *
 * One document per subject (deterministic id) so the retention job can check
 * a hold with a single `get`. The full place/release history is the audit
 * trail (`legal-hold.placed` / `legal-hold.released`), which is never deleted.
 * Only platform admins can change a hold; admins and auditors can read them.
 */

import type { Transaction } from "firebase-admin/firestore";
import { writeAudit } from "./audit";
import type { VerifiedActor } from "./auth";
import { DomainError } from "./errors";
import { db } from "./firestore";
import { runCommand } from "../catalog/common";

export const LEGAL_HOLDS = "legalHolds";
/**
 * Subjects a hold can target. Only "user" exists today because the only
 * retention deletion of evidence-grade data (KYC documents) is per user. Add a
 * subject type together with the retention task that honours it — a hold type
 * that protects nothing would mislead the operator placing it.
 */
export const HOLD_SUBJECTS = ["user"] as const;
export type HoldSubject = (typeof HOLD_SUBJECTS)[number];

export const legalHoldId = (subjectType: HoldSubject, subjectId: string) => `${subjectType}_${subjectId}`;
const holdRef = (subjectType: HoldSubject, subjectId: string) =>
  db().collection(LEGAL_HOLDS).doc(legalHoldId(subjectType, subjectId));

/** True while an active hold exists for the subject. */
export async function isUnderLegalHold(subjectType: HoldSubject, subjectId: string, tx?: Transaction): Promise<boolean> {
  const ref = holdRef(subjectType, subjectId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return snap.exists && snap.data()?.status === "active";
}

export interface SetLegalHoldCommand {
  requestId: string;
  subjectType: HoldSubject;
  subjectId: string;
  action: "place" | "release";
  reason: string;
  /** External reference (ticket, notice or case number). Optional. */
  reference: string | null;
}

export async function setLegalHold(admin: VerifiedActor, input: SetLegalHoldCommand) {
  return runCommand(
    "platform.legal-hold-set",
    admin.uid,
    `setLegalHold_${admin.uid}_${input.requestId}`,
    async (tx, now) => {
      const ref = holdRef(input.subjectType, input.subjectId);
      const snap = await tx.get(ref);
      const cur = snap.data();
      const active = snap.exists && cur?.status === "active";
      const version = Number.isSafeInteger(cur?.version) ? Number(cur!.version) + 1 : 0;

      if (input.action === "place") {
        if (active) {
          throw new DomainError("CONFLICT", "This subject is already under a legal hold.", {
            nextStep: "Release the existing hold first if its reason has changed.",
          });
        }
        tx.set(ref, {
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          status: "active",
          reason: input.reason,
          reference: input.reference,
          placedBy: admin.uid,
          placedAt: now,
          releasedBy: null,
          releasedAt: null,
          releaseReason: null,
          version,
          updatedAt: now,
        });
      } else {
        if (!active) {
          throw new DomainError("PRECONDITION", "There is no active legal hold on this subject.", {
            nextStep: "Refresh; someone may already have released it.",
          });
        }
        tx.update(ref, { status: "released", releasedBy: admin.uid, releasedAt: now, releaseReason: input.reason, version, updatedAt: now });
      }
      writeAudit(tx, {
        action: input.action === "place" ? "legal-hold.placed" : "legal-hold.released",
        actorUid: admin.uid,
        actorRole: `platform:${admin.roleId}`,
        resourceType: "legalHold",
        resourceId: ref.id,
        before: snap.exists ? { status: cur?.status ?? null, version: cur?.version ?? null } : null,
        after: { status: input.action === "place" ? "active" : "released", version, reference: input.reference },
        reason: input.reason,
        requestId: input.requestId,
        source: "operations-console",
      });
      return { holdId: ref.id, status: input.action === "place" ? "active" : "released", version };
    }
  );
}
