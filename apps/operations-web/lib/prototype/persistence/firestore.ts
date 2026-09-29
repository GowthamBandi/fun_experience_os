/**
 * Shared workspace adapter for Firebase modes.
 *
 * Reads the workspace slices from Firestore (admin read via security rules),
 * writes only the slices that changed through the `syncWorkspace` callable
 * (optimistic concurrency per slice), and reloads when another operator saves.
 * See firebase/functions/src/workspace/sync.ts for the server side.
 */
import { collection, getDocs, onSnapshot, type Firestore } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase/client";
import { getEmptyState, getInitialState } from "../scenarios";
import type { PrototypeState } from "../scenarios";
import { hydrateState } from "./index";

export const WORKSPACE_ID = "default";

type SliceName = keyof PrototypeState;

/** Marketplace governance lives in its own Firestore collections (written by audited callables), not in the workspace. */
const NOT_SYNCED = new Set<string>(["governance"]);

const versions = new Map<string, number>();
const synced = new Map<string, unknown>();
let ownSaves = 0;

function waitForUser(): Promise<User> {
  const { auth } = getFirebaseClient();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => {
      if (u) {
        off();
        resolve(u);
      }
    });
  });
}

async function readAll(fs: Firestore): Promise<{ raw: Record<string, unknown[]>; metaVersions: Map<string, number> } | null> {
  const base = `workspaces/${WORKSPACE_ID}`;
  const [slices, chunks] = await Promise.all([getDocs(collection(fs, `${base}/slices`)), getDocs(collection(fs, `${base}/chunks`))]);
  if (slices.empty) return null;
  const byName = new Map<string, Array<{ n: number; json: string }>>();
  chunks.forEach((d) => {
    const [name, n] = d.id.split("__");
    const list = byName.get(name) ?? [];
    list.push({ n: Number(n), json: String(d.data().json ?? "[]") });
    byName.set(name, list);
  });
  const raw: Record<string, unknown[]> = {};
  const metaVersions = new Map<string, number>();
  slices.forEach((d) => {
    const meta = d.data();
    const count = Number(meta.chunkCount ?? 0);
    const parts = (byName.get(d.id) ?? []).filter((c) => c.n < count).sort((a, b) => a.n - b.n);
    raw[d.id] = parts.flatMap((p) => JSON.parse(p.json) as unknown[]);
    metaVersions.set(d.id, Number(meta.version ?? 0));
  });
  return { raw, metaVersions };
}

export async function loadRemoteWorkspace(): Promise<PrototypeState> {
  await waitForUser();
  const { firestore } = getFirebaseClient();
  const found = await readAll(firestore);
  versions.clear();
  synced.clear();
  if (!found) {
    // A brand-new project starts empty in live mode and with sample data on the emulator.
    const fresh = process.env.NEXT_PUBLIC_DATA_MODE === "firebase-live" ? getEmptyState() : getInitialState();
    return { ...fresh, governance: [] };
  }
  const state = { ...hydrateState(found.raw), governance: [] };
  for (const [name, v] of found.metaVersions) versions.set(name, v);
  // Remember what the server holds so only real changes are sent.
  for (const key of Object.keys(state) as SliceName[]) if (found.raw[key]) synced.set(key, state[key]);
  return state;
}

export class WorkspaceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceConflictError";
  }
}

export async function saveRemoteWorkspace(state: PrototypeState): Promise<boolean> {
  const changed = (Object.keys(state) as SliceName[]).filter((k) => !NOT_SYNCED.has(k) && synced.get(k) !== state[k]);
  if (changed.length === 0) return true;
  const { functions } = getFirebaseClient();
  const call = httpsCallable<unknown, { versions: Record<string, number> }>(functions, "syncWorkspace");
  try {
    ownSaves++;
    const res = await call({
      workspaceId: WORKSPACE_ID,
      slices: changed.map((name) => ({ name, expectedVersion: versions.get(name) ?? 0, items: JSON.parse(JSON.stringify(state[name])) })),
    });
    for (const [name, v] of Object.entries(res.data.versions)) versions.set(name, v);
    for (const name of changed) synced.set(name, state[name]);
    return true;
  } catch (cause) {
    const code = (cause as { code?: string }).code ?? "";
    if (code.includes("aborted")) throw new WorkspaceConflictError((cause as Error).message);
    return false;
  } finally {
    setTimeout(() => (ownSaves = Math.max(0, ownSaves - 1)), 1500);
  }
}

/** Calls `handler` when another operator saves a slice this client has not seen. */
export function subscribeRemoteWorkspace(handler: () => void): () => void {
  let off = () => {};
  let cancelled = false;
  void waitForUser().then(() => {
    if (cancelled) return;
    const { firestore } = getFirebaseClient();
    off = onSnapshot(collection(firestore, `workspaces/${WORKSPACE_ID}/slices`), (snap) => {
      const newer = snap.docChanges().some((c) => Number(c.doc.data().version ?? 0) > (versions.get(c.doc.id) ?? 0));
      if (newer && ownSaves === 0) handler();
    });
  });
  return () => {
    cancelled = true;
    off();
  };
}
