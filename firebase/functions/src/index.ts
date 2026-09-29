/**
 * Experience OS Cloud Functions — every deployed function is exported here.
 *
 *   checkHealth                 callable   emulator / uptime probe (no auth)
 *   reserveSeat                 callable   take a seat (no-oversell transaction)
 *   releaseExpiredHolds         scheduled  every 5 min: give back expired reservation holds
 *   decideCase                  callable   decide a marketplace governance case
 *   setMarketplaceEntityStatus  callable   pause / block / reactivate / resolve a marketplace record
 *   submitGovernanceIntake      callable   record an application and open its review case
 *   setOperatorAccess           callable   set an operator's role, scope, territories and status
 *   syncWorkspace               callable   save console workspace slices (see workspace/sync.ts)
 */
import * as functions from "firebase-functions/v1";

export { reserveSeat } from "./bookings/callables";
export { releaseExpiredHoldsJob as releaseExpiredHolds } from "./bookings/releaseExpiredHolds";
export { decideCase, setMarketplaceEntityStatus, submitGovernanceIntake } from "./governance/callables";
export { setOperatorAccess } from "./auth/operatorAccess";
export { syncWorkspace } from "./workspace/sync";

/** Connectivity probe. Returns fixed data; touches nothing. */
export const checkHealth = functions.https.onCall(() => ({
  ok: true,
  environment: process.env.FUNCTIONS_EMULATOR === "true" ? "emulator" : "cloud",
  projectId: process.env.GCLOUD_PROJECT ?? "demo-experience-os",
}));
