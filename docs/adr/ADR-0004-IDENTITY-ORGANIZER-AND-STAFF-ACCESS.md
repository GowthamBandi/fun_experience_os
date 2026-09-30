# ADR-0004: One identity, organizer activation codes, granular staff access

- **Status:** Accepted
- **Date:** 2026-09-30
- **Supersedes:** the 8-tier franchise command chain (`docs/admin/15-franchise-operating-model.md`, DEC-SA-062/063) and the operator role table in `apps/operations-web/lib/types.ts` for anything outside the Operations Console.

## Decision

### One PULSE identity
- Every person signs in to PULSE with **Firebase phone auth** (phone → OTP). One uid covers everything.
- Customer use needs no approval.
- Organizer and staff capability is **additive**, held in `memberships`. It never replaces the customer identity: an organizer can still book, review and use Rooms.
- Super Admins use the **Operations Console** with email/password and custom claims (`roleId: platform-owner | super-admin | auditor`). That is unchanged from the current implementation. Platform roles are never granted to PULSE phone users.

### Organizer activation
1. The customer submits an organizer application (`submitOrganizerApplication`). This creates an `organizer-kyc` governance case.
2. A Super Admin approves it in the console (`decideCase`). The server then:
   - creates `organizers/{orgId}` (`active`);
   - creates an **Organizer Code**: 10 characters from a 31-symbol alphabet with no ambiguous characters, so there are more than 8×10¹⁴ combinations. The code is **returned once** in the callable response for the admin to deliver out-of-band.
   - Only an **HMAC-SHA256 hash** (keyed with the server secret `CODE_PEPPER`) is stored, in `organizerActivations/{applicantUid}`, with a 14-day expiry.
3. The organizer signs in to PULSE with the same phone. The client sees an approved activation pending for their uid (via their own application document) and asks for the code. `redeemOrganizerCode` does the following:
   - it verifies the hash;
   - it checks that the uid is the applicant's;
   - it checks that the code is unexpired and unused, with at most **5 attempts per hour per uid** and lockout;
   - it then creates `memberships/{orgId}__{uid}` with `role: owner` and all permissions, and burns the code.
4. A lost or expired code can be **re-issued** by an admin (`reissueOrganizerCode`), which invalidates the old one.

### Staff
1. An owner, or a member with `staff.manage`, calls `inviteStaff(orgId, phone, role, permissions, eventIds | "all")`.
   - The server rejects any permission the caller does not hold: you can't grant what you don't have.
   - It creates `staffInvites/{id}` with the normalised E.164 phone, a hashed **Staff Access Code** (8 characters, 7-day expiry) and the grant. The code is returned once to the inviter.
2. The staff member signs in to PULSE with that phone. The client asks the server whether there are pending invites for the caller's verified phone number (`myPendingAccess`). It returns only the organizer names.
3. `redeemStaffCode(code)` does the following:
   - it matches the verified phone from the ID token plus the code hash, **5 attempts per hour** per uid;
   - it creates the `memberships` document (`active`, with the grant) and burns the invite.
   - **Knowing the phone number alone never grants anything.** Without a valid code the person stays a customer.
4. `updateStaff` changes permissions or event scope. `revokeStaff` sets the membership to `revoked`, with a reason; this is audited and immediate, because every privileged path reads the membership. Revoked members keep their customer identity. Audit history is never deleted.

### Permission model: WHAT × WHERE
- **WHAT:** a fixed catalog, enforced server-side (`src/access/permissions.ts`):
  - `experiences.view`, `experiences.edit`, `experiences.submit`
  - `events.view`, `events.edit`, `events.submit`, `events.publish`, `events.operate`, `events.cancel`
  - `attendees.view`
  - `tickets.scan`
  - `reviews.view`, `reviews.respond`
  - `refunds.view`, `refunds.request`
  - `earnings.view`
  - `staff.manage`
- **WHERE:** `eventScope: { all: true }` or `{ eventIds: [...] }`.
  - Event-scoped permissions (`events.operate`, `attendees.view`, `tickets.scan`, `events.view`) are checked against the scope.
  - Organization-wide permissions (`earnings.view`, `staff.manage`, `experiences.*`, `refunds.*`) require `eventScope.all` **or** being the owner.
- **Role templates** are only UI presets. Checks always read the explicit permission list.
  - Check-in: `events.view`, `attendees.view`, `tickets.scan`.
  - Event lead: adds `events.operate`, `reviews.view`, `refunds.request`.
  - Manager: everything except `staff.manage` and `earnings.view`.

### Why not custom claims for organizers and staff
Custom claims need a token refresh to revoke, and they are capped at 1 KB. Membership documents are read in each privileged callable and in security rules (`get()`), so revocation is immediate and scoped grants have no size limit.

## Abuse controls
- OTP abuse is handled by Firebase Auth phone rate limits and App Check (enforced on all callables outside the emulator), plus reCAPTCHA / Play Integrity on clients.
- Code brute force: HMAC hashes, high-entropy codes, 5 attempts per hour per uid with a lockout counter in `rateLimits`, and every failed attempt audited.
- Phone reuse: invites bind to the verified phone at redemption time. A recycled number can only redeem an invite if the holder also has the code. Revoking a member is instant.
