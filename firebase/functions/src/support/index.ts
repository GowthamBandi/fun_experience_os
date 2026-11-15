// Support requests and problem reports (support/requests.ts).
// PULSE callables run in asia-south1; the console reply is admin-only.
import { callable, docId, obj, oneOf, optStr, requestId } from "../platform/callable";
import { requirePhoneUser } from "../platform/actors";
import { requireAdmin } from "../platform/auth";
import { bool } from "../catalog/common";
import { setOrganizerBlock as setOrganizerBlockSvc } from "./blocks";
import {
  SUPPORT_STATUSES, addSupportMessage as addSupportMessageSvc, parseSubmitSupport, respondSupportRequest as respondSvc,
  submitSupportRequest as submitSvc,
} from "./requests";

/** PULSE (customer or organizer): opens a help request or a problem report. */
export const submitSupportRequest = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  return submitSvc(uid, parseSubmitSupport(data));
});

/** PULSE: the opener replies on their own request. */
export const addSupportMessage = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  const d = obj(data);
  return addSupportMessageSvc(uid, { id: docId(d.id, "id"), message: typeof d.message === "string" ? d.message : "" });
});

/** PULSE: block or unblock an organizer for yourself (support/blocks.ts). */
export const setOrganizerBlock = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  const d = obj(data);
  return setOrganizerBlockSvc(uid, docId(d.orgId, "orgId"), bool(d.blocked, "blocked"));
});

/** Console: reply and/or change status. */
export const respondSupportRequest = callable(async (data, context) => {
  const admin = requireAdmin(context, "support.respond");
  const d = obj(data);
  return respondSvc(admin, {
    requestId: requestId(d.requestId),
    id: docId(d.id, "id"),
    message: optStr(d.message, "Reply", 4000),
    status: oneOf(d.status, "status", SUPPORT_STATUSES),
  });
});
