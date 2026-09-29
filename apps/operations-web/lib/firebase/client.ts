/**
 * firebase/client.ts — browser-only Firebase client.
 *
 *   prototype         — never call getFirebaseClient(); the console uses the local workspace.
 *   firebase-emulator — connects Auth, Firestore and Functions to the local emulators and
 *                       requires NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-experience-os.
 *   firebase-live     — initialises App Check (reCAPTCHA Enterprise) against the configured project.
 *
 * getApps() is checked before initialization so repeated imports never create duplicate apps.
 * firebase-admin is never imported here.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getFirebaseConfig } from "./config";
import { connectToEmulators } from "./emulator";
import { initializeFirebaseAppCheck } from "./app-check";

import { resolveDataMode, type DataMode } from "./mode";

export { resolveDataMode, type DataMode };

interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
}

let _client: FirebaseClient | null = null;

/**
 * Returns the initialized Firebase client.
 * Throws if called in prototype mode.
 *
 * Only call this function in firebase-emulator or firebase-live mode.
 */
export function getFirebaseClient(): FirebaseClient {
  const mode = resolveDataMode();

  if (mode === "prototype") {
    throw new Error(
      "[Firebase] getFirebaseClient() must not be called in prototype mode. " +
        "Check NEXT_PUBLIC_DATA_MODE."
    );
  }

  // Firebase mode — initialize once.
  if (_client) return _client;

  const config = getFirebaseConfig();

  // Idempotent — reuse existing app if already initialized
  const app =
    getApps().length > 0
      ? getApps()[0]!
      : initializeApp(config);

  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const functions = getFunctions(app, "us-central1");

  if (mode === "firebase-emulator") {
    connectToEmulators(auth, firestore, functions, config.projectId);
  } else {
    initializeFirebaseAppCheck(app);
  }

  _client = { app, auth, firestore, functions };
  return _client;
}
