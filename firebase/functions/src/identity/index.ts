// Identity callables (docs/API_CONTRACT.md → Identity). PULSE callables run
// in asia-south1 via platform/callable.ts.
export {
  updateMyProfile,
  myAccess,
  submitOrganizerApplication,
  redeemOrganizerCode,
  inviteStaff,
  listStaff,
  redeemStaffCode,
  updateStaff,
  revokeStaff,
  reissueStaffCode,
} from "./callables";

// Console callable (us-central1, admin claims). Lives with governance but is
// exported here because src/index.ts re-exports this module wholesale.
export { reissueOrganizerCode } from "../governance/callables";

// Push delivery for in-app notifications (best-effort; inbox is the truth).
export { registerPushToken, unregisterPushToken, deliverNotifications } from "./push";
