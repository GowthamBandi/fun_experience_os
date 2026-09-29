/**
 * Shared operations workspace.
 *
 * The Super Admin console keeps its operations modules (setup, catalog,
 * sessions, bookings, staffing, safety, money records, activity record) as a
 * set of named slices. In Firebase modes those slices are stored here so every
 * operator works on the same data:
 *
 *   workspaces/{workspaceId}/slices/{slice}   { version, chunkCount, bytes, updatedAt, updatedBy, updatedByName }
 *   workspaces/{workspaceId}/chunks/{slice}__{n}   { json }   (≤ 900 KB each)
 *
 * Writes go only through the `syncWorkspace` callable (clients cannot write).
 * Each slice carries an optimistic-concurrency version: a write based on an
 * older version is refused with CONFLICT and the client reloads. Append-only
 * record slices (activity record, operations log) are merged by id instead, so
 * concurrent operators never lose each other's records.
 */
import * as functions from "firebase-functions/v1";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../platform/firestore";
import { requireAdmin, type VerifiedActor } from "../platform/auth";
import { DomainError, invalidInput } from "../platform/errors";

export const APPEND_ONLY_SLICES = new Set(["activityLog", "audits"]);
const SLICE_NAME = /^[a-zA-Z][a-zA-Z0-9]{1,39}$/;
const WORKSPACE_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const CHUNK_BYTES = 900_000;
const MAX_REQUEST_BYTES = 9_000_000;

export interface SliceWrite {
  name: string;
  expectedVersion: number;
  items: unknown[];
}

export interface SyncCommand {
  workspaceId: string;
  slices: SliceWrite[];
}

export function parseSyncCommand(value: unknown): SyncCommand {
  if (!value || typeof value !== "object") throw invalidInput("The workspace update is invalid.");
  const data = value as Record<string, unknown>;
  const workspaceId = typeof data.workspaceId === "string" ? data.workspaceId : "";
  if (!WORKSPACE_ID.test(workspaceId)) throw invalidInput("The workspace id is invalid.");
  if (!Array.isArray(data.slices) || data.slices.length === 0 || data.slices.length > 60) throw invalidInput("Send between 1 and 60 slices.");
  const seen = new Set<string>();
  const slices = data.slices.map((raw) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const name = typeof s.name === "string" ? s.name : "";
    if (!SLICE_NAME.test(name)) throw invalidInput(`"${name}" is not a valid slice name.`);
    if (seen.has(name)) throw invalidInput(`Slice "${name}" was sent twice.`);
    seen.add(name);
    if (!Number.isSafeInteger(s.expectedVersion) || (s.expectedVersion as number) < 0) throw invalidInput("expectedVersion must be a non-negative integer.");
    if (!Array.isArray(s.items)) throw invalidInput(`Slice "${name}" must be a list.`);
    return { name, expectedVersion: s.expectedVersion as number, items: s.items };
  });
  const bytes = Buffer.byteLength(JSON.stringify(slices));
  if (bytes > MAX_REQUEST_BYTES) throw invalidInput("This update is too large. Save more often or archive old records.");
  return { workspaceId, slices };
}

function chunk(items: unknown[]): string[] {
  const out: string[] = [];
  let current: unknown[] = [];
  let size = 2;
  for (const item of items) {
    const itemJson = JSON.stringify(item) ?? "null";
    const itemBytes = Buffer.byteLength(itemJson) + 1;
    if (itemBytes > CHUNK_BYTES) throw invalidInput("A single record is too large to store.");
    if (size + itemBytes > CHUNK_BYTES && current.length) {
      out.push(JSON.stringify(current));
      current = [];
      size = 2;
    }
    current.push(item);
    size += itemBytes;
  }
  out.push(JSON.stringify(current));
  return out;
}

function mergeById(incoming: unknown[], existing: unknown[]): unknown[] {
  const idOf = (x: unknown) => (x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string" ? (x as { id: string }).id : undefined);
  const seen = new Set(incoming.map(idOf).filter(Boolean) as string[]);
  const merged = [...incoming, ...existing.filter((x) => {
    const id = idOf(x);
    return !id || !seen.has(id);
  })];
  const time = (x: unknown) => {
    const r = x as { at?: unknown; timestamp?: unknown };
    return typeof r.at === "string" ? r.at : "";
  };
  return merged.sort((a, b) => time(b).localeCompare(time(a)));
}

const sliceRef = (ws: string, name: string) => db().collection("workspaces").doc(ws).collection("slices").doc(name);
const chunkRef = (ws: string, name: string, i: number) => db().collection("workspaces").doc(ws).collection("chunks").doc(`${name}__${i}`);

export async function syncWorkspaceSlices(cmd: SyncCommand, actor: VerifiedActor & { name?: string }) {
  return db().runTransaction(async (tx) => {
    const metas = await Promise.all(cmd.slices.map((s) => tx.get(sliceRef(cmd.workspaceId, s.name))));
    const conflicts: Array<{ name: string; version: number }> = [];
    const existingItems: Record<string, unknown[]> = {};

    for (let i = 0; i < cmd.slices.length; i++) {
      const s = cmd.slices[i];
      const meta = metas[i].exists ? metas[i].data()! : { version: 0, chunkCount: 0 };
      const version = Number(meta.version ?? 0);
      if (APPEND_ONLY_SLICES.has(s.name)) {
        const chunkDocs = await Promise.all(Array.from({ length: Number(meta.chunkCount ?? 0) }, (_, n) => tx.get(chunkRef(cmd.workspaceId, s.name, n))));
        existingItems[s.name] = chunkDocs.flatMap((d) => (d.exists ? (JSON.parse(String(d.data()!.json)) as unknown[]) : []));
      } else if (version !== s.expectedVersion) {
        conflicts.push({ name: s.name, version });
      }
    }
    if (conflicts.length) {
      throw new DomainError("CONFLICT", "Another operator saved changes to the same records.", {
        nextStep: "The latest data has been loaded. Check it and repeat your last change if it is still needed.",
        detail: { conflicts },
      });
    }

    const result: Record<string, number> = {};
    for (let i = 0; i < cmd.slices.length; i++) {
      const s = cmd.slices[i];
      const meta = metas[i].exists ? metas[i].data()! : { version: 0, chunkCount: 0 };
      const items = APPEND_ONLY_SLICES.has(s.name) ? mergeById(s.items, existingItems[s.name] ?? []) : s.items;
      const chunks = chunk(items);
      chunks.forEach((json, n) => tx.set(chunkRef(cmd.workspaceId, s.name, n), { json }));
      for (let n = chunks.length; n < Number(meta.chunkCount ?? 0); n++) tx.delete(chunkRef(cmd.workspaceId, s.name, n));
      const version = Number(meta.version ?? 0) + 1;
      tx.set(sliceRef(cmd.workspaceId, s.name), {
        version,
        chunkCount: chunks.length,
        count: items.length,
        bytes: chunks.reduce((a, c) => a + Buffer.byteLength(c), 0),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
        updatedByName: actor.name ?? actor.email ?? actor.uid,
      });
      result[s.name] = version;
    }
    tx.set(db().collection("workspaces").doc(cmd.workspaceId), { updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
    return { versions: result };
  });
}

function callableError(error: unknown): never {
  const domain = error instanceof DomainError ? error : error instanceof Error ? invalidInput(error.message) : invalidInput("The request is invalid.");
  throw new functions.https.HttpsError(domain.httpsCode as functions.https.FunctionsErrorCode, domain.operatorMessage, domain.toOperatorPayload());
}

const enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== "true";

export const syncWorkspace = functions
  .runWith({ enforceAppCheck, memory: "512MB", timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    try {
      const actor = requireAdmin(context, "save workspace changes");
      const name = typeof context.auth?.token.name === "string" ? context.auth.token.name : undefined;
      return await syncWorkspaceSlices(parseSyncCommand(data), { ...actor, name });
    } catch (error) {
      callableError(error);
    }
  });
