// Catalog callables (see docs/API_CONTRACT.md → Catalog).
export { saveExperience, submitExperience, deleteExperienceDraft, onExperienceRevisionApproved } from "./experiences";
export {
  saveEvent,
  submitEvent,
  publishEvent,
  setEventResponsibility,
  setEventPhase,
  cancelEvent,
  adminCancelEvent,
} from "./events";
export { submitReview, moderateReview } from "./reviews";
export { setCategoryCover } from "./categoryCovers";
export { setFollow, onEventPublishedNotifyFollowers } from "./follows";
export { resolveMapsLink } from "./mapLinks";

import { callable } from "../platform/callable";
import { requirePhoneUser } from "../platform/actors";
import { consumeLimit } from "../platform/rateLimit";
import { messageEventAttendeesCommand, saveEventDayCommand } from "./eventDay";

/** Event-day teams, safety checks, incidents and wrap-up (catalog/eventDay.ts). */
export const saveEventDay = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogOps", uid);
  return saveEventDayCommand(uid, data);
});

/** The organizer messages everyone booked on an event (catalog/eventDay.ts). */
export const messageEventAttendees = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogOps", uid);
  return messageEventAttendeesCommand(uid, data);
});
