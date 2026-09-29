import * as functions from "firebase-functions/v1";
import { requireAdmin } from "../platform/auth";
import { DomainError, invalidInput } from "../platform/errors";
import { parseDecisionCommand, parseEntityStatusCommand } from "./model";
import { changeMarketplaceEntityStatus, decideGovernanceCase } from "./service";

function callableError(error: unknown): never {
  const domain = error instanceof DomainError ? error : error instanceof Error ? invalidInput(error.message) : invalidInput("The request is invalid.");
  throw new functions.https.HttpsError(domain.httpsCode as functions.https.FunctionsErrorCode, domain.operatorMessage, domain.toOperatorPayload());
}

const enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== "true";

export const decideCase = functions.runWith({ enforceAppCheck }).https.onCall(async (data, context) => {
  try {
    return await decideGovernanceCase(parseDecisionCommand(data), requireAdmin(context, "decide governance cases"));
  } catch (error) {
    callableError(error);
  }
});

export const setMarketplaceEntityStatus = functions.runWith({ enforceAppCheck }).https.onCall(async (data, context) => {
  try {
    return await changeMarketplaceEntityStatus(parseEntityStatusCommand(data), requireAdmin(context, "change marketplace access"));
  } catch (error) {
    callableError(error);
  }
});
