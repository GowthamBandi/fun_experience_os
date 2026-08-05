/**
 * firebase/emulator.ts
 *
 * Emulator connection logic for firebase-emulator mode.
 *
 * Connects the Firebase Auth, Firestore, and Functions SDKs explicitly
 * to the local emulators. Fails closed — never falls back to live Firebase.
 *
 * Must only be called from client.ts after app initialization.
 */

import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { Functions } from "firebase/functions";
import { connectAuthEmulator } from "firebase/auth";
import { connectFirestoreEmulator } from "firebase/firestore";
import { connectFunctionsEmulator } from "firebase/functions";

const EMULATOR_AUTH_HOST = "127.0.0.1";
const EMULATOR_AUTH_PORT = 9099;
const EMULATOR_FIRESTORE_HOST = "127.0.0.1";
const EMULATOR_FIRESTORE_PORT = 8080;
const EMULATOR_FUNCTIONS_HOST = "127.0.0.1";
const EMULATOR_FUNCTIONS_PORT = 5001;
const EXPECTED_PROJECT_ID = "demo-experience-os";

/**
 * Asserts the project ID matches demo-experience-os.
 * Throws if it does not — this prevents accidentally binding to a live project.
 */
function assertDemoProject(projectId: string): void {
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(
      `[Firebase Emulator] FAIL CLOSED: expected project "${EXPECTED_PROJECT_ID}" ` +
        `but got "${projectId}". Refusing to connect. ` +
        `Set NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-experience-os in .env.local.`
    );
  }
}

/**
 * Connects all three Firebase SDKs to their local emulators.
 * This function is idempotent — the Firebase SDK prevents double-connection.
 */
export function connectToEmulators(
  auth: Auth,
  firestore: Firestore,
  functions: Functions,
  projectId: string
): void {
  assertDemoProject(projectId);

  connectAuthEmulator(
    auth,
    `http://${EMULATOR_AUTH_HOST}:${EMULATOR_AUTH_PORT}`,
    { disableWarnings: false }
  );

  connectFirestoreEmulator(
    firestore,
    EMULATOR_FIRESTORE_HOST,
    EMULATOR_FIRESTORE_PORT
  );

  connectFunctionsEmulator(
    functions,
    EMULATOR_FUNCTIONS_HOST,
    EMULATOR_FUNCTIONS_PORT
  );
}
