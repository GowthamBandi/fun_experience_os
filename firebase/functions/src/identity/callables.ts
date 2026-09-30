import { requirePhoneUser } from "../platform/actors";
import { callable } from "../platform/callable";
import { SECRET_NAMES } from "../platform/security";
import {
  parseCode,
  parseInviteStaff,
  parseOrganizerApplication,
  parseOrgOnly,
  parseReissueStaffCode,
  parseRevokeStaff,
  parseUpdateProfile,
  parseUpdateStaff,
} from "./model";
import { redeemOrganizerCode as redeemOrganizerCodeService, submitOrganizerApplication as submitOrganizerApplicationService } from "./organizer";
import { myAccess as myAccessService, updateMyProfile as updateMyProfileService } from "./profile";
import * as staff from "./staff";

/** Callables that hash or mint access codes need the pepper bound. */
const codes = { secrets: [SECRET_NAMES.codePepper] };

export const updateMyProfile = callable((data, context) => updateMyProfileService(parseUpdateProfile(data), requirePhoneUser(context)));

export const myAccess = callable((_data, context) => myAccessService(requirePhoneUser(context)));

export const submitOrganizerApplication = callable((data, context) =>
  submitOrganizerApplicationService(parseOrganizerApplication(data), requirePhoneUser(context))
);

export const redeemOrganizerCode = callable(
  (data, context) => redeemOrganizerCodeService(parseCode(data), requirePhoneUser(context)),
  codes
);

export const inviteStaff = callable((data, context) => staff.inviteStaff(parseInviteStaff(data), requirePhoneUser(context)), codes);

export const listStaff = callable((data, context) => staff.listStaff(parseOrgOnly(data), requirePhoneUser(context)));

export const redeemStaffCode = callable((data, context) => staff.redeemStaffCode(parseCode(data), requirePhoneUser(context)), codes);

export const updateStaff = callable((data, context) => staff.updateStaff(parseUpdateStaff(data), requirePhoneUser(context)));

export const revokeStaff = callable((data, context) => staff.revokeStaff(parseRevokeStaff(data), requirePhoneUser(context)));

export const reissueStaffCode = callable(
  (data, context) => staff.reissueStaffCode(parseReissueStaffCode(data), requirePhoneUser(context)),
  codes
);
