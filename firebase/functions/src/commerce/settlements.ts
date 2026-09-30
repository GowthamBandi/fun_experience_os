/**
 * Organizer settlements (ADR-0005 "Settlements").
 *
 * buildSettlement claims unsettled `organizer_payable` entries of COMPLETED
 * events created up to `periodEnd`. Claiming happens in transactions that set
 * `settlementId` only where it is still null and add the claimed amounts to the
 * settlement's running totals in the same commit — so an entry can never be in
 * two settlements, concurrent builds partition the entries, and a crashed
 * build resumes exactly where it stopped (same requestId → same settlement).
 *
 *   netMinor == grossMinor − commissionMinor − refundsMinor   (always)
 *
 * decideSettlement: approve / hold / release-hold / mark-paid. Above ₹50,000
 * the admin who approved may not also mark it paid (dual control).
 */

import { Timestamp, db, serverNow } from "../platform/firestore";
import { DomainError, notFound, precondition } from "../platform/errors";
import { writeAudit } from "../platform/audit";
import type { EventDoc } from "../bookings/reserveSeat";
import { C, CURRENCY, SETTLEMENT_DUAL_CONTROL_MINOR } from "./config";

export type SettlementStatus = "accruing" | "pending-approval" | "approved" | "held" | "paid" | "empty";

export interface SettlementDoc {
  id: string;
  orgId: string;
  periodEnd: Timestamp;
  currency: string;
  grossMinor: number;
  commissionMinor: number;
  refundsMinor: number;
  netMinor: number;
  entryCount: number;
  status: SettlementStatus;
  heldFrom?: SettlementStatus | null;
  approvedBy?: string | null;
  paidBy?: string | null;
  payoutReference?: string | null;
  builtBy: string;
  requestId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface LedgerEntryDoc {
  txnId: string;
  kind: "capture" | "refund";
  account: string;
  orgId: string;
  direction: "debit" | "credit";
  amountMinor: number;
  eventId: string;
  settlementId: string | null;
  txnGrossMinor: number;
  txnCommissionMinor: number;
  createdAt: Timestamp;
}

const CHUNK = 200;

export async function buildSettlement(
  admin: { uid: string; roleId: string },
  input: { requestId: string; orgId: string; periodEnd: Date }
): Promise<{ settlementId: string | null; status: SettlementStatus; netMinor: number; entryCount: number }> {
  const settlementId = `stl_${input.orgId}_${input.requestId}`.slice(0, 150);
  const sRef = db().collection(C.settlements).doc(settlementId);
  const periodEnd = Timestamp.fromDate(input.periodEnd);

  // Create (or resume) the settlement shell.
  const shell = await db().runTransaction(async (tx) => {
    const s = await tx.get(sRef);
    if (s.exists) return s.data() as SettlementDoc;
    const now = serverNow();
    const doc: SettlementDoc = {
      id: settlementId,
      orgId: input.orgId,
      periodEnd,
      currency: CURRENCY,
      grossMinor: 0,
      commissionMinor: 0,
      refundsMinor: 0,
      netMinor: 0,
      entryCount: 0,
      status: "accruing",
      heldFrom: null,
      approvedBy: null,
      paidBy: null,
      payoutReference: null,
      builtBy: admin.uid,
      requestId: input.requestId,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(sRef, doc);
    return doc;
  });
  if (shell.status !== "accruing") {
    return {
      settlementId: shell.status === "empty" ? null : settlementId,
      status: shell.status,
      netMinor: shell.netMinor,
      entryCount: shell.entryCount,
    };
  }

  // Candidate entries (re-checked inside each claiming transaction).
  const snap = await db()
    .collection(C.ledgerEntries)
    .where("orgId", "==", input.orgId)
    .where("account", "==", "organizer_payable")
    .where("settlementId", "==", null)
    .get();
  const candidates = snap.docs.filter((d) => (d.data() as LedgerEntryDoc).createdAt.toMillis() <= periodEnd.toMillis());
  const eventIds = [...new Set(candidates.map((d) => (d.data() as LedgerEntryDoc).eventId))];
  const completed = new Set<string>();
  for (let i = 0; i < eventIds.length; i += 100) {
    const refs = eventIds.slice(i, i + 100).map((id) => db().collection(C.events).doc(id));
    const events = refs.length ? await db().getAll(...refs) : [];
    for (const e of events) if (e.exists && (e.data() as EventDoc).status === "completed") completed.add(e.id);
  }
  const eligible = candidates.filter((d) => completed.has((d.data() as LedgerEntryDoc).eventId)).map((d) => d.ref);

  for (let i = 0; i < eligible.length; i += CHUNK) {
    const chunk = eligible.slice(i, i + CHUNK);
    await db().runTransaction(async (tx) => {
      const s = (await tx.get(sRef)).data() as SettlementDoc;
      const entries = await tx.getAll(...chunk);
      let gross = 0;
      let commission = 0;
      let refunds = 0;
      let net = 0;
      let count = 0;
      for (const e of entries) {
        const l = e.data() as LedgerEntryDoc | undefined;
        if (!l || l.settlementId !== null || l.account !== "organizer_payable" || l.orgId !== input.orgId) continue;
        if (l.direction === "credit") {
          gross += l.txnGrossMinor;
          commission += l.txnCommissionMinor;
          net += l.amountMinor;
        } else {
          refunds += l.amountMinor;
          net -= l.amountMinor;
        }
        count++;
        tx.update(e.ref, { settlementId });
      }
      if (count === 0) return;
      tx.update(sRef, {
        grossMinor: s.grossMinor + gross,
        commissionMinor: s.commissionMinor + commission,
        refundsMinor: s.refundsMinor + refunds,
        netMinor: s.netMinor + net,
        entryCount: s.entryCount + count,
        updatedAt: serverNow(),
      });
    });
  }

  return db().runTransaction(async (tx) => {
    const s = (await tx.get(sRef)).data() as SettlementDoc;
    if (s.status !== "accruing") {
      return { settlementId: s.status === "empty" ? null : settlementId, status: s.status, netMinor: s.netMinor, entryCount: s.entryCount };
    }
    if (s.grossMinor - s.commissionMinor - s.refundsMinor !== s.netMinor) {
      throw new DomainError("INTERNAL", "The settlement didn't reconcile.", { detail: { settlementId } });
    }
    const status: SettlementStatus = s.entryCount === 0 ? "empty" : "pending-approval";
    const now = serverNow();
    tx.update(sRef, { status, updatedAt: now });
    writeAudit(tx, {
      action: "settlement.built",
      actorUid: admin.uid,
      actorRole: `platform:${admin.roleId}`,
      resourceType: "settlement",
      resourceId: settlementId,
      orgId: input.orgId,
      after: {
        status,
        grossMinor: s.grossMinor,
        commissionMinor: s.commissionMinor,
        refundsMinor: s.refundsMinor,
        netMinor: s.netMinor,
        entryCount: s.entryCount,
      },
      requestId: input.requestId,
      source: "operations-console",
    });
    return { settlementId: status === "empty" ? null : settlementId, status, netMinor: s.netMinor, entryCount: s.entryCount };
  });
}

export type SettlementAction = "approve" | "hold" | "release-hold" | "mark-paid";

export async function decideSettlement(
  admin: { uid: string; roleId: string },
  input: { requestId: string; settlementId: string; action: SettlementAction; note: string; payoutReference?: string | null }
): Promise<{ settlementId: string; status: SettlementStatus }> {
  const sRef = db().collection(C.settlements).doc(input.settlementId);
  const receipt = db().collection(C.commandReceipts).doc(`decideSettlement_${admin.uid}_${input.requestId}`);
  return db().runTransaction(async (tx) => {
    const r = await tx.get(receipt);
    if (r.exists) return (r.data() as { result: { settlementId: string; status: SettlementStatus } }).result;
    const snap = await tx.get(sRef);
    if (!snap.exists) throw notFound("We couldn't find that settlement.");
    const s = snap.data() as SettlementDoc;
    const now = serverNow();
    const patch: Record<string, unknown> = { updatedAt: now };
    let next: SettlementStatus;

    switch (input.action) {
      case "approve":
        if (s.status !== "pending-approval") throw precondition("Only a settlement pending approval can be approved.");
        next = "approved";
        patch.approvedBy = admin.uid;
        patch.approvedAt = now;
        break;
      case "hold":
        if (s.status !== "pending-approval" && s.status !== "approved") throw precondition("This settlement can't be put on hold now.");
        next = "held";
        patch.heldFrom = s.status;
        break;
      case "release-hold":
        if (s.status !== "held") throw precondition("This settlement isn't on hold.");
        next = s.heldFrom ?? "pending-approval";
        patch.heldFrom = null;
        break;
      case "mark-paid": {
        if (s.status !== "approved") throw precondition("Only an approved settlement can be marked paid.");
        const ref = (input.payoutReference ?? "").trim();
        if (ref.length < 3 || ref.length > 100) {
          throw new DomainError("INVALID_INPUT", "Enter the bank or payout reference for this payment.");
        }
        if (s.netMinor > SETTLEMENT_DUAL_CONTROL_MINOR && s.approvedBy === admin.uid) {
          throw new DomainError("NOT_PERMITTED", "A different admin must mark this settlement as paid.", {
            nextStep: "Settlements above ₹50,000 need two different admins.",
          });
        }
        next = "paid";
        patch.paidBy = admin.uid;
        patch.paidAt = now;
        patch.payoutReference = ref;
        break;
      }
    }
    patch.status = next;
    tx.update(sRef, patch);
    writeAudit(tx, {
      action: `settlement.${input.action}`,
      actorUid: admin.uid,
      actorRole: `platform:${admin.roleId}`,
      resourceType: "settlement",
      resourceId: input.settlementId,
      orgId: s.orgId,
      before: { status: s.status },
      after: { status: next, netMinor: s.netMinor, payoutReference: patch.payoutReference ?? null },
      reason: input.note,
      requestId: input.requestId,
      source: "operations-console",
    });
    const result = { settlementId: input.settlementId, status: next };
    tx.set(receipt, { command: "decideSettlement", actorUid: admin.uid, requestId: input.requestId, result, at: now });
    return result;
  });
}
