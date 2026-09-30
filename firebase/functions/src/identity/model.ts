/**
 * Input parsing for the identity callables (docs/API_CONTRACT.md → Identity).
 * Every parser throws a DomainError("INVALID_INPUT") with a safe message.
 */

import { docId, obj, oneOf, optStr, requestId, str, strList } from "../platform/callable";
import { DomainError } from "../platform/errors";
import { normalizeCode, normalizeIndianPhone } from "../platform/security";
import { ORG_WIDE, parsePermissions, parseScope, type EventScope, type Permission } from "../access/permissions";

export const GENDERS = ["woman", "man", "non-binary", "prefer-not"] as const;
export type Gender = (typeof GENDERS)[number];

export interface UpdateProfileCommand {
  displayName: string;
  bio: string | null;
  birthDate: string;
  gender: Gender;
}

export function parseUpdateProfile(value: unknown): UpdateProfileCommand {
  const data = obj(value);
  const birthDate = str(data.birthDate, "birthDate", 10, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!m || !d || d.toISOString().slice(0, 10) !== birthDate) {
    throw new DomainError("INVALID_INPUT", "Enter your date of birth as YYYY-MM-DD.");
  }
  return {
    // Same bounds as the publicProfiles rule so later client edits stay valid.
    displayName: str(data.displayName, "Display name", 2, 30),
    bio: optStr(data.bio, "Bio", 160),
    birthDate,
    gender: oneOf(data.gender, "gender", GENDERS),
  };
}

/** Whole years between [birthDate] and [today] (both UTC calendar dates). */
export function ageOn(birthDate: string, today: Date): number {
  const [y, mo, d] = birthDate.split("-").map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - y;
  const beforeBirthday = today.getUTCMonth() + 1 < mo || (today.getUTCMonth() + 1 === mo && today.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export interface OrganizerApplicationCommand {
  requestId: string;
  kind: "individual" | "business";
  displayName: string;
  legalName: string;
  city: string;
  categories: string[];
  about: string;
  contactEmail: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseOrganizerApplication(value: unknown): OrganizerApplicationCommand {
  const data = obj(value);
  const categories = strList(data.categories, "categories", 8, 40);
  if (categories.length === 0) throw new DomainError("INVALID_INPUT", "Choose at least one category.");
  const contactEmail = optStr(data.contactEmail, "Contact email", 254);
  if (contactEmail && !EMAIL.test(contactEmail)) throw new DomainError("INVALID_INPUT", "Enter a valid email address.");
  return {
    requestId: requestId(data.requestId),
    kind: oneOf(data.kind, "kind", ["individual", "business"] as const),
    displayName: str(data.displayName, "Organizer name", 2, 60),
    legalName: str(data.legalName, "Legal name", 2, 120),
    city: str(data.city, "City", 2, 60),
    categories: [...new Set(categories)],
    about: str(data.about, "About", 10, 1000),
    contactEmail: contactEmail ? contactEmail.toLowerCase() : null,
  };
}

export function parseCode(value: unknown): { code: string } {
  const data = obj(value);
  if (typeof data.code !== "string" || data.code.length > 64) {
    throw new DomainError("INVALID_INPUT", "Enter the code you were given.");
  }
  return { code: normalizeCode(data.code) };
}

/** Organization-wide permissions need the all-events scope (ADR-0004). */
export function assertScopeFits(permissions: Permission[], scope: EventScope): void {
  if (scope.all) return;
  const orgWide = permissions.filter((p) => ORG_WIDE.has(p));
  if (orgWide.length) {
    throw new DomainError("INVALID_INPUT", "Organization-wide permissions need access to all events.", {
      detail: { permissions: orgWide },
    });
  }
}

export interface InviteStaffCommand {
  requestId: string;
  orgId: string;
  phone: string;
  title: string;
  permissions: Permission[];
  eventScope: EventScope;
}

export function parseInviteStaff(value: unknown): InviteStaffCommand {
  const data = obj(value);
  const phone = normalizeIndianPhone(data.phone);
  if (!phone) throw new DomainError("INVALID_INPUT", "Enter a valid Indian mobile number.");
  const permissions = parsePermissions(data.permissions);
  const eventScope = parseScope(data.eventScope);
  assertScopeFits(permissions, eventScope);
  return {
    requestId: requestId(data.requestId),
    orgId: docId(data.orgId, "orgId"),
    phone,
    title: str(data.title, "Title", 2, 40),
    permissions,
    eventScope,
  };
}

export function parseOrgOnly(value: unknown): { orgId: string } {
  return { orgId: docId(obj(value).orgId, "orgId") };
}

export interface UpdateStaffCommand {
  requestId: string;
  orgId: string;
  uid: string;
  permissions: Permission[] | null;
  eventScope: EventScope | null;
  title: string | null;
}

export function parseUpdateStaff(value: unknown): UpdateStaffCommand {
  const data = obj(value);
  const permissions = data.permissions === undefined ? null : parsePermissions(data.permissions);
  const eventScope = data.eventScope === undefined ? null : parseScope(data.eventScope);
  const title = data.title === undefined ? null : str(data.title, "Title", 2, 40);
  if (!permissions && !eventScope && !title) throw new DomainError("INVALID_INPUT", "Nothing to change.");
  return { requestId: requestId(data.requestId), orgId: docId(data.orgId, "orgId"), uid: docId(data.uid, "uid"), permissions, eventScope, title };
}

export interface RevokeStaffCommand {
  requestId: string;
  orgId: string;
  uid: string | null;
  inviteId: string | null;
  reason: string;
}

export function parseRevokeStaff(value: unknown): RevokeStaffCommand {
  const data = obj(value);
  const uid = data.uid === undefined || data.uid === null ? null : docId(data.uid, "uid");
  const inviteId = data.inviteId === undefined || data.inviteId === null ? null : docId(data.inviteId, "inviteId");
  if (!uid && !inviteId) throw new DomainError("INVALID_INPUT", "Choose a team member or an invite.");
  return { requestId: requestId(data.requestId), orgId: docId(data.orgId, "orgId"), uid, inviteId, reason: str(data.reason, "Reason", 3, 500) };
}

export interface ReissueStaffCodeCommand {
  requestId: string;
  orgId: string;
  inviteId: string;
}

export function parseReissueStaffCode(value: unknown): ReissueStaffCodeCommand {
  const data = obj(value);
  return { requestId: requestId(data.requestId), orgId: docId(data.orgId, "orgId"), inviteId: docId(data.inviteId, "inviteId") };
}
