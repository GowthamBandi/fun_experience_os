import * as functions from "firebase-functions/v1";
import { isEmulator } from "./platform/security";
export { decideCase, setMarketplaceEntityStatus } from "./governance/callables";
export { setOperatorAccess } from "./auth/operatorAccess";
export * from "./identity";
export * from "./catalog";
export * from "./commerce";
export { runDataRetention, setLegalHold } from "./platform/retention";

/** Region of checkHealth: us-central1, where the console and runbook expect it (API_CONTRACT). */
const HEALTH_REGION = "us-central1";

function projectIdFromEnv(): string | null {
  const direct = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  if (direct) return direct;
  try {
    const cfg = JSON.parse(process.env.FIREBASE_CONFIG ?? "{}") as { projectId?: unknown };
    return typeof cfg.projectId === "string" ? cfg.projectId : null;
  } catch {
    return null;
  }
}

/**
 * checkHealth — unauthenticated post-deploy smoke probe (runbook
 * ENVIRONMENTS_AND_DEPLOYMENT.md). Reports where it is running and which
 * revision answered; touches no data and returns nothing sensitive (no
 * secrets, no config values beyond the public project id).
 */
export const checkHealth = functions.region(HEALTH_REGION).https.onCall((_data, _context) => {
  return {
    ok: true,
    environment: isEmulator() ? "emulator" : "deployed",
    projectId: projectIdFromEnv(),
    region: process.env.FUNCTION_REGION ?? HEALTH_REGION,
    time: new Date().toISOString(),
    version: process.env.K_REVISION ?? null,
  };
});
