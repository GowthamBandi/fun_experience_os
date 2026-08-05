import * as functions from "firebase-functions";

/**
 * checkHealth — callable Cloud Function.
 *
 * Purpose: Emulator connectivity verification only.
 * Returns a fixed response confirming the emulator environment is active.
 * No production business logic lives here in PR-0B.
 */
export const checkHealth = functions.https.onCall((_data, _context) => {
  return {
    ok: true,
    environment: "emulator",
    projectId: "demo-experience-os",
  };
});
