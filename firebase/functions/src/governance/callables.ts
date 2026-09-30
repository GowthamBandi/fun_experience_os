import * as functions from "firebase-functions/v1";
import { requireAdmin } from "../platform/auth";
import { DomainError, invalidInput } from "../platform/errors";
import { SECRET_NAMES } from "../platform/security";
import { correlationIdOf, logCallableFailure, safeRequestId } from "../platform/log";
import type { CallableContext } from "firebase-functions/v1/https";
import { parseDecisionCommand, parseEntityStatusCommand, parseReissueOrganizerCodeCommand } from "./model";
import { changeMarketplaceEntityStatus, decideGovernanceCase, reissueOrganizerActivationCode } from "./service";

function callableError(fn: string, error: unknown, data: unknown, context: CallableContext): never {
  logCallableFailure(fn, error, { uid: context.auth?.uid ?? null, requestId: safeRequestId(data), correlationId: correlationIdOf(context) });
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
    callableError("decideCase", error, data, context);
  }
});

export const setMarketplaceEntityStatus = functions.runWith({ enforceAppCheck }).https.onCall(async (data, context) => {
  try {
    return await changeMarketplaceEntityStatus(parseEntityStatusCommand(data), requireAdmin(context, "change marketplace access"));
  } catch (error) {
    callableError("setMarketplaceEntityStatus", error, data, context);
  }
});


/** Console: new Organizer Code for an approved applicant; the old one dies. */
export const reissueOrganizerCode = functions.runWith({ enforceAppCheck, secrets: codeSecrets }).https.onCall(async (data, context) => {
  try {
    return await reissueOrganizerActivationCode(parseReissueOrganizerCodeCommand(data), requireAdmin(context, "re-issue organizer codes"));
  } catch (error) {
    callableError("reissueOrganizerCode", error, data, context);
  }
});
