/**
 * firebase/client.ts
 *
 * Initializes the Firebase client SDK — browser-only.
 *
 * DATA MODE BEHAVIOR:
 *
 *   prototype        — Firebase is NOT imported or initialized.
 *                      This module must never be imported in prototype mode.
 *
 *   firebase-emulator — Initializes Firebase app and explicitly connects
 *                       Auth, Firestore and Functions to local emulators.
 *                       Requires NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-experience-os.
 *                       Fails closed if configuration is wrong.
 *
 *   firebase-live    — Throws immediately.
 *                       Live mode is NOT approved in PR-0B.
 *
 *   (anything else)  — Treated as invalid; fails closed.
 *                       Never defaults to firebase-live.
 *
 * IDEMPOTENCY:
 *   getApps() is checked before initialization so repeated imports do not
 *   create duplicate Firebase apps.
 *
 * BROWSER-ONLY:
 *   This file uses the firebase/app, firebase/auth, firebase/firestore and
 *   firebase/functions client SDKs. firebase-admin is never imported here.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getFirebaseConfig } from "./config";
import { connectToEmulators } from "./emulator";
import { initializeFirebaseAppCheck } from "./app-check";

export type DataMode = "prototype" | "firebase-emulator" | "firebase-live";

export function resolveDataMode(): DataMode {
  const raw = process.env.NEXT_PUBLIC_DATA_MODE;
  if (raw === "firebase-emulator") return "firebase-emulator";
  if (raw === "firebase-live") return "firebase-live";
  // prototype is the safe default — unknown values never select live
  return "prototype";
}

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
 * Only call this function when NEXT_PUBLIC_DATA_MODE=firebase-emulator.
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
