/**
 * Organizer verification (KYC) documents.
 *
 * The applicant uploads the file straight to Storage at
 * `kyc/{uid}/{slot}-{random}.{pdf|jpg|png}` (storage.rules: owner-only,
 * write-once, ≤10 MB, PDF/JPEG/PNG). `attachKycDocument` then checks the
 * object really exists with an allowed type and size, and records it in
 * `kycDocuments/{uid}` — the reviewer's source of truth. Clients can read
 * their own record but never write it.
 *
 * An `organizer-kyc` case can't be approved until the required documents are
 * on record (governance/service.ts → missingKycDocuments).
 */

import { getStorage } from "firebase-admin/storage";
import type { Transaction } from "firebase-admin/firestore";
import { writeAudit } from "../platform/audit";
import { COLLECTIONS, app, db, serverNow, type Timestamp } from "../platform/firestore";
import { DomainError, precondition } from "../platform/errors";
import type { PhoneActor } from "./common";

export const KYC_COLLECTION = "kycDocuments";
export const KYC_SLOTS = ["id", "pan", "gst", "venue"] as const;
export type KycSlot = (typeof KYC_SLOTS)[number];

export const KYC_MAX_BYTES = 10 * 1024 * 1024;
const KYC_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export interface KycDocumentEntry {
  path: string;
  contentType: string;
  size: number;
  uploadedAt: Timestamp;
}

/** Slots an applicant of [kind] must provide before approval. */
export function requiredKycSlots(kind: string): KycSlot[] {
  return kind === "business" ? ["id", "pan", "gst"] : ["id", "pan"];
}

/** Labels for reviewer-facing messages. */
const LABEL: Record<KycSlot, string> = {
  id: "Government photo ID",
  pan: "PAN",
  gst: "GST registration",
  venue: "Venue permission",
};

/** Required slots that [uid] hasn't provided yet, read inside [tx]. */
export async function missingKycDocuments(tx: Transaction, uid: string, kind: string): Promise<string[]> {
  const snap = await tx.get(db().collection(KYC_COLLECTION).doc(uid));
  const docs = (snap.data()?.documents ?? {}) as Partial<Record<KycSlot, KycDocumentEntry>>;
  return requiredKycSlots(kind).filter((s) => !docs[s]).map((s) => LABEL[s]);
}

/* ------------------------------------------------------------ storage stat */

export type StorageStat = (path: string) => Promise<{ contentType: string; size: number } | null>;

const defaultStat: StorageStat = async (path) => {
  const file = getStorage(app()).bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [meta] = await file.getMetadata();
  return { contentType: String(meta.contentType ?? ""), size: Number(meta.size ?? 0) };
};

let stat: StorageStat = defaultStat;

/** Tests run without a Storage emulator: they inject the object's metadata. */
export function setKycStorageStatForTests(fn: StorageStat | null): void {
  stat = fn ?? defaultStat;
}

/* ----------------------------------------------------------------- command */

export function parseAttachKyc(data: unknown): { requestId: string; slot: KycSlot; path: string } {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const requestId = typeof d.requestId === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(d.requestId) ? d.requestId : "";
  if (!requestId) throw new DomainError("INVALID_INPUT", "requestId is required.");
  if (!KYC_SLOTS.includes(d.slot as KycSlot)) throw new DomainError("INVALID_INPUT", "Choose which document this is.");
  if (typeof d.path !== "string" || d.path.length > 300) throw new DomainError("INVALID_INPUT", "The upload path is invalid.");
  return { requestId, slot: d.slot as KycSlot, path: d.path };
}

export async function attachKycDocument(
  command: { requestId: string; slot: KycSlot; path: string },
  actor: PhoneActor
): Promise<{ slot: KycSlot; path: string; replayed: boolean }> {
  // Only the caller's own folder, and the file name must say which slot it is.
  const shape = new RegExp(`^kyc/${actor.uid}/${command.slot}-[A-Za-z0-9_-]{6,64}\\.(pdf|jpg|jpeg|png)$`);
  if (!shape.test(command.path)) {
    throw new DomainError("NOT_PERMITTED", "That file isn't one of your uploads.", { nextStep: "Upload the document again." });
  }
  const object = await stat(command.path);
  if (!object) throw precondition("We couldn't find that upload.", "Upload the document again.");
  if (!KYC_TYPES.includes(object.contentType)) {
    throw new DomainError("INVALID_INPUT", "Upload a PDF, JPG or PNG.");
  }
  if (object.size <= 0 || object.size > KYC_MAX_BYTES) {
    throw new DomainError("INVALID_INPUT", "The file must be smaller than 10 MB.");
  }

  const ref = db().collection(KYC_COLLECTION).doc(actor.uid);
  const appRef = db().collection(COLLECTIONS.organizerApplications).doc(actor.uid);
  const receipt = db().collection(COLLECTIONS.commandReceipts).doc(`attachKyc_${actor.uid}_${command.requestId}`);
  return db().runTransaction(async (tx) => {
    const [r, snap, appSnap] = await Promise.all([tx.get(receipt), tx.get(ref), tx.get(appRef)]);
    if (r.exists) return { ...(r.data()!.result as { slot: KycSlot; path: string }), replayed: true };
    const status = appSnap.data()?.status;
    if (status === "rejected") {
      throw precondition("Your organizer application was not approved.", "Contact PULSE support if your circumstances have changed.");
    }
    const now = serverNow();
    const prev = (snap.data()?.documents ?? {})[command.slot] as KycDocumentEntry | undefined;
    const entry: KycDocumentEntry = { path: command.path, contentType: object.contentType, size: object.size, uploadedAt: now };
    const history = Array.isArray(snap.data()?.history) ? (snap.data()!.history as unknown[]) : [];
    tx.set(ref, {
      uid: actor.uid,
      documents: { ...(snap.data()?.documents ?? {}), [command.slot]: entry },
      // Storage is write-once: replaced files stay for the audit trail.
      history: prev ? [...history, { slot: command.slot, ...prev, replacedAt: now }].slice(-40) : history,
      updatedAt: now,
    });
    writeAudit(tx, {
      action: prev ? "organizer.kyc-document-replaced" : "organizer.kyc-document-added",
      actorUid: actor.uid,
      actorRole: "customer",
      resourceType: "kycDocument",
      resourceId: actor.uid,
      before: prev ? { slot: command.slot, path: prev.path } : null,
      after: { slot: command.slot, path: command.path, contentType: object.contentType, size: object.size },
      requestId: command.requestId,
    });
    const result = { slot: command.slot, path: command.path };
    tx.set(receipt, { action: "attachKycDocument", actorUid: actor.uid, result, createdAt: now });
    return { ...result, replayed: false };
  });
}
