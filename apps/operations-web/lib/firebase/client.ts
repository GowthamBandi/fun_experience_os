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
 *   firebase-live    — Initializes against the configured project with
 *                       App Check (reCAPTCHA Enterprise) enforced.
 *
 *   (anything else)  — Treated as prototype; fails closed. The console's
 *                       login screen explains the required configuration
 *                       (lib/firebase/data-mode.ts). Never defaults to live.
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
import { connectFunctionsToEmulator, connectToEmulators } from "./emulator";
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
  /** Legacy governance callables (decideCase, setMarketplaceEntityStatus, setOperatorAccess, reissueOrganizerCode). */
  functions: Functions;
  /** Commerce/catalog callables (decideRefund, buildSettlement, decideSettlement, adminCancelEvent, moderateReview). */
  regionalFunctions: Functions;
}

export const LEGACY_FUNCTIONS_REGION = "us-central1";
export const COMMERCE_FUNCTIONS_REGION = "asia-south1";

let _client: FirebaseClient | null = null;

/**
 * Returns the initialized Firebase client.
 * Throws if called in prototype mode.
 *
 * Only call this function when NEXT_PUBLIC_DATA_MODE is firebase-emulator or firebase-live.
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
  const functions = getFunctions(app, LEGACY_FUNCTIONS_REGION);
  const regionalFunctions = getFunctions(app, COMMERCE_FUNCTIONS_REGION);

  if (mode === "firebase-emulator") {
    connectToEmulators(auth, firestore, functions, config.projectId);
    connectFunctionsToEmulator(regionalFunctions);
  } else {
    initializeFirebaseAppCheck(app);
  }

  _client = { app, auth, firestore, functions, regionalFunctions };
  return _client;
}
