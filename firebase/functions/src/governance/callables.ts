import * as functions from "firebase-functions/v1";
import { ADMIN_ROLES, requireCurrentActor } from "../platform/auth";
import { enforceAppCheck, toHttpsError } from "../platform/callable";
import { parseDecisionCommand, parseEntityStatusCommand, parseIntakeCommand } from "./model";
import { changeMarketplaceEntityStatus, decideGovernanceCase, submitGovernanceIntake as recordIntake } from "./service";

/** Platform Owner / Super Admin: decide a queued governance case. */
export const decideCase = functions.runWith({ enforceAppCheck }).https.onCall(async (data, context) => {
  try {
    const actor = await requireCurrentActor(context, ADMIN_ROLES, "decide governance cases");
    return await decideGovernanceCase(parseDecisionCommand(data), actor);
  } catch (error) {
    throw toHttpsError(error, "The decision could not be saved.");
  }
});

/** Platform Owner / Super Admin: pause, block, reactivate or resolve a marketplace record. */
export const setMarketplaceEntityStatus = functions.runWith({ enforceAppCheck }).https.onCall(async (data, context) => {
  try {
    const actor = await requireCurrentActor(context, ADMIN_ROLES, "change marketplace access");
    return await changeMarketplaceEntityStatus(parseEntityStatusCommand(data), actor);
  } catch (error) {
    throw toHttpsError(error, "The status could not be changed.");
  }
});

/** Platform Owner / Super Admin: record an application and open its review case. */
export const submitGovernanceIntake = functions.runWith({ enforceAppCheck }).https.onCall(async (data, context) => {
  try {
    const actor = await requireCurrentActor(context, ADMIN_ROLES, "record marketplace applications");
    return await recordIntake(parseIntakeCommand(data), actor);
  } catch (error) {
    throw toHttpsError(error, "The application could not be recorded.");
  }
});
