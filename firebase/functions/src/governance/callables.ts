import * as functions from "firebase-functions/v1";
import { requireAdmin } from "../platform/auth";
import { DomainError, invalidInput } from "../platform/errors";
import { SECRET_NAMES } from "../platform/security";
import { parseDecisionCommand, parseEntityStatusCommand, parseReissueOrganizerCodeCommand } from "./model";
import { changeMarketplaceEntityStatus, decideGovernanceCase, reissueOrganizerActivationCode } from "./service";

function callableError(error: unknown): never {
  const domain = error instanceof DomainError ? error : error instanceof Error ? invalidInput(error.message) : invalidInput("The request is invalid.");
  throw new functions.https.HttpsError(domain.httpsCode as functions.https.FunctionsErrorCode, domain.operatorMessage, domain.toOperatorPayload());
}

const enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== "true";
// Organizer codes are HMAC'd with CODE_PEPPER; bind it outside the emulator
// so a missing secret fails the deploy instead of the approval.
const codeSecrets = enforceAppCheck ? [SECRET_NAMES.codePepper] : [];

export const decideCase = functions.runWith({ enforceAppCheck, secrets: codeSecrets }).https.onCall(async (data, context) => {
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


/** Console: new Organizer Code for an approved applicant; the old one dies. */
export const reissueOrganizerCode = functions.runWith({ enforceAppCheck, secrets: codeSecrets }).https.onCall(async (data, context) => {
  try {
    return await reissueOrganizerActivationCode(parseReissueOrganizerCodeCommand(data), requireAdmin(context, "re-issue organizer codes"));
  } catch (error) {
    callableError(error);
  }
});
