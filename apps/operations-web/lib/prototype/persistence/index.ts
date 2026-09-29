/**
 * Workspace persistence.
 *
 * The browser workspace is stored in IndexedDB (database `experience-os`,
 * object store `workspace`) as a versioned envelope. localStorage is used only
 * as a fallback when IndexedDB is unavailable and as the source for a one-time
 * migration of the legacy `xos.prototype.state` key.
 *
 * Every slice of PrototypeState is persisted and restored. Missing slices are
 * filled from the empty state, and registered migrations normalise older data.
 */
import { getEmptyState, getInitialState } from "../scenarios";
import type { PrototypeState } from "../scenarios";
import { migrateState } from "../migrations";

export const SCHEMA_VERSION = 3;
export const PROTOTYPE_STATE_KEY = "xos.prototype.state";
export const WALKTHROUGH_STEP_KEY = "xos.prototype.walkthrough_step";
const FALLBACK_KEY = "xos.workspace.v3";
const DB_NAME = "experience-os";
const STORE = "workspace";
const RECORD_KEY = "current";
const CHANNEL = "xos-workspace";

export interface WorkspaceEnvelope {
  app: "experience-os";
  schemaVersion: number;
  savedAt: string;
  state: PrototypeState;
}

export type LoadSource = "indexeddb" | "localstorage" | "legacy" | "seed";

/* ------------------------------ IndexedDB ------------------------------ */

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const db = () => (dbPromise ??= openDb());

async function idbGet<T>(key: string): Promise<T | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function idbPut(key: string, value: unknown): Promise<boolean> {
  const d = await db();
  if (!d) return false;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function idbDelete(key: string): Promise<void> {
  const d = await db();
  if (!d) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/* ------------------------------ envelope ------------------------------ */

export function hydrateState(raw: unknown): PrototypeState {
  const empty = getEmptyState();
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const merged = { ...empty } as Record<string, unknown>;
  for (const key of Object.keys(empty)) {
    const value = source[key];
    if (Array.isArray(value)) merged[key] = value;
  }
  return migrateState(merged as unknown as PrototypeState);
}

export function toEnvelope(state: PrototypeState): WorkspaceEnvelope {
  return { app: "experience-os", schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), state };
}

/** Parse an exported backup. Throws a readable error if the file is not a workspace. */
export function parseWorkspaceBackup(text: string): PrototypeState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const env = parsed as Partial<WorkspaceEnvelope>;
  if (!env || env.app !== "experience-os" || typeof env.schemaVersion !== "number" || !env.state) {
    throw new Error("This file is not an Experience OS workspace backup.");
  }
  if (env.schemaVersion > SCHEMA_VERSION) {
    throw new Error("This backup was made by a newer version of Experience OS.");
  }
  return hydrateState(env.state);
}

/* ------------------------------ load / save ------------------------------ */

export async function loadWorkspace(): Promise<{ state: PrototypeState; source: LoadSource; savedAt?: string }> {
  const stored = await idbGet<WorkspaceEnvelope>(RECORD_KEY);
  if (stored?.state) return { state: hydrateState(stored.state), source: "indexeddb", savedAt: stored.savedAt };

  try {
    const fallback = window.localStorage.getItem(FALLBACK_KEY);
    if (fallback) {
      const env = JSON.parse(fallback) as WorkspaceEnvelope;
      return { state: hydrateState(env.state), source: "localstorage", savedAt: env.savedAt };
    }
    const legacy = window.localStorage.getItem(PROTOTYPE_STATE_KEY);
    if (legacy) {
      const state = hydrateState(JSON.parse(legacy));
      await saveWorkspace(state);
      window.localStorage.removeItem(PROTOTYPE_STATE_KEY);
      return { state, source: "legacy" };
    }
  } catch {
    /* fall through to seed */
  }
  return { state: migrateState(getInitialState()), source: "seed" };
}

let channel: BroadcastChannel | null = null;
const tabId = Math.random().toString(36).slice(2);
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  return (channel ??= new BroadcastChannel(CHANNEL));
}

/** Persist the whole workspace. Resolves to false if nothing could be written. */
export async function saveWorkspace(state: PrototypeState): Promise<boolean> {
  const env = toEnvelope(state);
  let ok = await idbPut(RECORD_KEY, env);
  if (!ok) {
    try {
      window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(env));
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (ok) getChannel()?.postMessage({ type: "saved", from: tabId, savedAt: env.savedAt });
  return ok;
}

/** Notify when another tab saved the workspace. Returns an unsubscribe function. */
export function onWorkspaceSavedElsewhere(handler: () => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const listener = (e: MessageEvent) => {
    if (e.data?.type === "saved" && e.data.from !== tabId) handler();
  };
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}

export async function clearWorkspace(): Promise<void> {
  await idbDelete(RECORD_KEY);
  try {
    window.localStorage.removeItem(FALLBACK_KEY);
    window.localStorage.removeItem(PROTOTYPE_STATE_KEY);
  } catch {
    /* noop */
  }
}

/** Download a JSON backup of the workspace. */
export function downloadWorkspaceBackup(state: PrototypeState): void {
  const blob = new Blob([JSON.stringify(toEnvelope(state), null, 2)], { type: "application/json" });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  downloadBlob(blob, `experience-os-backup-${stamp}.json`);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------ legacy API ------------------------------ */

/** @deprecated Synchronous seed read kept for tests; use loadWorkspace(). */
export function loadPrototypeState(): PrototypeState {
  return migrateState(getInitialState());
}

/** @deprecated Use saveWorkspace(). */
export function savePrototypeState(state: PrototypeState): void {
  void saveWorkspace(state);
}

export function clearPrototypeState(): void {
  void clearWorkspace();
}

export function loadDemoStep(): number {
  try {
    const raw = window.localStorage.getItem(WALKTHROUGH_STEP_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function saveDemoStep(step: number): void {
  try {
    window.localStorage.setItem(WALKTHROUGH_STEP_KEY, String(step));
  } catch {
    /* noop */
  }
}
