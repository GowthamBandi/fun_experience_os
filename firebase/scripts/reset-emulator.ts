/**
 * reset-emulator.ts — PR-0C scaffold
 *
 * Clears all Firestore emulator data.
 * This script is a scaffold only — implementation deferred to PR-0C.
 *
 * SAFETY GUARDS:
 * - Refuses to run unless FIRESTORE_EMULATOR_HOST is set.
 * - Refuses to run unless project ID equals demo-experience-os.
 * - No live credential fallback.
 */

const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const GCLOUD_PROJECT = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_CONFIG
  ? JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId
  : undefined;

if (!FIRESTORE_EMULATOR_HOST) {
  console.error(
    "[reset-emulator] ABORT: FIRESTORE_EMULATOR_HOST is not set.\n" +
      "This script must only run inside firebase emulators:exec."
  );
  process.exit(1);
}

if (GCLOUD_PROJECT !== "demo-experience-os") {
  console.error(
    `[reset-emulator] ABORT: Expected project "demo-experience-os" but got "${GCLOUD_PROJECT}".\n` +
      "Refusing to reset a non-demo project."
  );
  process.exit(1);
}

console.log("[reset-emulator] Safety guards passed. Scaffold only — implement in PR-0C.");
process.exit(0);
