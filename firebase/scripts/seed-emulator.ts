/**
 * seed-emulator.ts — safety-guarded entry point for operations seed data.
 *
 * Governance data is seeded by firebase/functions/scripts/seed-governance-emulator.mjs
 * (root: `npm run firebase:seed`). Operations data (sessions, bookings) is
 * still pending the PR-0C migration; this script only validates the guards.
 *
 * SAFETY GUARDS:
 * - Refuses to run unless FIRESTORE_EMULATOR_HOST is set.
 * - Refuses to run unless project ID equals demo-experience-os.
 * - No live credential fallback.
 */

const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
// `??` binds tighter than `?:`, so the FIREBASE_CONFIG fallback must be
// parenthesised — otherwise a set GCLOUD_PROJECT was ignored and the project
// id was always read from FIREBASE_CONFIG.
const GCLOUD_PROJECT: string | undefined =
  process.env.GCLOUD_PROJECT ??
  (process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG).projectId : undefined);

if (!FIRESTORE_EMULATOR_HOST) {
  console.error(
    "[seed-emulator] ABORT: FIRESTORE_EMULATOR_HOST is not set.\n" +
      "This script must only run inside firebase emulators:exec."
  );
  process.exit(1);
}

if (GCLOUD_PROJECT !== "demo-experience-os") {
  console.error(
    `[seed-emulator] ABORT: Expected project "demo-experience-os" but got "${GCLOUD_PROJECT}".\n` +
      "Refusing to seed a non-demo project."
  );
  process.exit(1);
}

console.log("[seed-emulator] Safety guards passed. For governance data run `npm run firebase:seed` from the repository root.");
process.exit(0);
