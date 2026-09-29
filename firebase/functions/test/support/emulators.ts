/**
 * Helpers for end-to-end callable tests: real ID tokens from the Auth
 * emulator, real HTTPS calls to the Functions emulator.
 *
 * Requires `firebase emulators:exec --only firestore,functions,auth` (the root
 * `npm run test:functions` script). emulators:exec exports
 * FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST for this process.
 */
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export const PROJECT_ID = "demo-experience-os";
export const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
export const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
export const FUNCTIONS_ORIGIN = "http://127.0.0.1:5001";
export const PASSWORD = "Test-Password-2026!";

process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

let app: App | undefined;
export function adminApp(): App {
  app ??= getApps().find((a) => a.name === "e2e") ?? initializeApp({ projectId: PROJECT_ID }, "e2e");
  return app;
}
export const adminAuth = (): Auth => getAuth(adminApp());
export const adminDb = (): Firestore => getFirestore(adminApp());

/** Wipes every Auth emulator account and every Firestore emulator document. */
export async function resetEmulators(): Promise<void> {
  const [auth, firestore] = await Promise.all([
    fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" }),
    fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" }),
  ]);
  if (!auth.ok || !firestore.ok) throw new Error(`Emulator reset failed: auth ${auth.status}, firestore ${firestore.status}`);
}

export interface TestOperator {
  uid: string;
  email: string;
  token: string;
}

/** Creates a verified operator with the given claims and signs them in. */
export async function createOperator(
  uid: string,
  roleId: string,
  opts: { name?: string; claims?: Record<string, unknown>; emailVerified?: boolean; userDoc?: boolean } = {}
): Promise<TestOperator> {
  const email = `${uid}@experience.test`;
  await adminAuth().createUser({ uid, email, password: PASSWORD, emailVerified: opts.emailVerified ?? true, displayName: opts.name ?? uid });
  await adminAuth().setCustomUserClaims(uid, { roleId, disabled: false, ...(opts.claims ?? {}) });
  if (opts.userDoc !== false) {
    await adminDb().doc(`users/${uid}`).set({ uid, email, displayName: opts.name ?? uid, roleId, status: "active", scope: "platform", territoryIds: [], version: 0 });
  }
  return { uid, email, token: await signIn(email) };
}

export async function signIn(email: string): Promise<string> {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const json = (await res.json()) as { idToken?: string; error?: unknown };
  if (!json.idToken) throw new Error(`Sign-in failed: ${JSON.stringify(json.error)}`);
  return json.idToken;
}

export type CallOutcome<T> =
  | { ok: true; result: T }
  | { ok: false; status: string; message: string; code?: string };

/** Calls a callable function over HTTPS exactly as the Firebase client SDK does. */
export async function call<T = Record<string, unknown>>(name: string, data: unknown, token?: string): Promise<CallOutcome<T>> {
  const res = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/us-central1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const json = (await res.json()) as { result?: T; error?: { status: string; message: string; details?: { code?: string } } };
  if (json.error) return { ok: false, status: json.error.status, message: json.error.message, code: json.error.details?.code };
  return { ok: true, result: json.result as T };
}

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
