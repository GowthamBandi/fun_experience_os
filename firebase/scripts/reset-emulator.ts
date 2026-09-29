/**
 * reset-emulator.ts
 *
 * Clears all Firestore emulator data (and Auth emulator accounts when the Auth
 * emulator is running) through the emulators' REST reset endpoints.
 * Run inside `firebase emulators:exec` (Node 22.18+ runs .ts directly).
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

async function reset(): Promise<void> {
  const targets = [
    `http://${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${GCLOUD_PROJECT}/databases/(default)/documents`,
  ];
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    targets.push(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${GCLOUD_PROJECT}/accounts`);
  }
  for (const url of targets) {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE ${url} failed with ${res.status}`);
    console.log(`[reset-emulator] Cleared ${url}`);
  }
}

reset().then(
  () => process.exit(0),
  (error) => {
    console.error("[reset-emulator] FAILED:", error);
    process.exit(1);
  }
);
