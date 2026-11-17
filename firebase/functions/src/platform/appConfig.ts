/**
 * Live switches for the mobile app, set from the super admin.
 * `appConfig/mobile` = { minBuild, maintenance, maintenanceMessage, updatedAt, updatedBy }
 * (public read; written only here, audited).
 *  - minBuild: app builds below this number must update before continuing.
 *  - maintenance: the app shows a "back soon" screen instead of the app.
 */
import { callable, int, str } from "./callable";
import { requireAdmin } from "./auth";
import { db, serverNow } from "./firestore";
import { writeAudit } from "./audit";

export const APP_CONFIG_DOC = "appConfig/mobile";

export const setAppConfig = callable(async (data, context) => {
  const admin = requireAdmin(context, "app.config");
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const minBuild = int(d.minBuild, "minBuild", 0, 1_000_000);
  const maintenance = d.maintenance === true;
  const maintenanceMessage = maintenance
    ? str(d.maintenanceMessage ?? "PULSE is getting an upgrade. We'll be back shortly.", "Maintenance message", 5, 300)
    : null;
  const reason = str(d.reason, "Reason", 3, 200);
  const ref = db().doc(APP_CONFIG_DOC);
  const batch = db().batch();
  const after = { minBuild, maintenance, maintenanceMessage };
  batch.set(ref, { ...after, updatedAt: serverNow(), updatedBy: admin.uid });
  writeAudit(batch, {
    action: "platform.app-config-set", actorUid: admin.uid, actorRole: `platform:${admin.roleId}`,
    resourceType: "appConfig", resourceId: "mobile", after, reason, source: "operations-console",
  });
  await batch.commit();
  return after;
});
