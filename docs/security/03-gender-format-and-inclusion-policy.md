# 03 — Gender Format and Inclusion Policy

> **Status:** Planning draft — decision-resolution phase (SA-0C).
> **Document type:** Policy proposal.
> **This document is a planning draft.** **Legal conclusions in this document are BLOCKED** until reviewed by an appropriate Indian legal professional. Nothing here is legal advice.

---

## 1. Purpose

Define the product purpose of gender-based event formats, keep **user-declared gender** separate from **government identity verification**, and set a default of **no invasive verification**. This document governs eligibility, staff visibility, dispute handling and dignity.

## 2. Format definitions

| Format | Product purpose | Eligibility rule (draft) |
| --- | --- | --- |
| Women-only | Comfort and safety for women; lower entry barriers; builds a women's community | Participant declares women's eligibility per format definition |
| Men-only | Comfort and preference for men | Participant declares men's eligibility |
| Mixed | Men and women participate together | Open to all |
| Open | No gender-based rule | Open to all |

> Note: "mixed" and "open" are distinct in v1: mixed implies the format is designed for mixed play; open has no gender dimension at all.

## 3. Separation of concerns

| Concept | Definition | Data |
| --- | --- | --- |
| User-declared gender | What the participant chooses to state in their profile for eligibility | Gender declaration (participant-controlled) |
| Government identity verification | Formal identity/KYC (driving licence, Aadhaar, etc.) | Not part of routine gender eligibility; see `docs/security/04-verification-and-trust-model.md` |
| Event eligibility | Whether a participant may book a format | Derived from declared gender + format rules |
| Safety operations | Incident handling, emergency access | Independent of format; see `docs/security/02-anonymity-and-reveal-policy.md` |
| Public participant information | What other participants see | Aliases/temp IDs only; gender never public (DEC-SA-038) |

## 4. What the participant declares

| Item | Required? | Where stored |
| --- | --- | --- |
| Gender declaration (for eligibility) | Required only for single-gender formats | Profile (participant-controlled, editable) |
| Age/age band | Required for 18+ gate | Profile |
| Identity document | Not required for routine booking | Not stored by default (see verification model) |

**Default (DEC-SA-041):** no government-identity verification is required to join single-gender formats in v1. Eligibility is based on the participant's declaration, enforced by the app at booking. Exceptions (safety, legal requirements) are handled case-by-case.

## 5. Visibility rules

| Party | Sees | Does not see |
| --- | --- | --- |
| Other participants | Alias/temp ID only | Gender declaration, identity, contact |
| Assigned coordinator | Declaration when enforcing eligibility at check-in | Public-facing identity data unrelated to the event |
| Eligibility staff (check-in/enforcement) | Declaration for the session being enforced | Full verification documents |
| Safety & Moderation Officer | Declaration during disputes/investigations | Unrelated private data |
| Super Admin / Platform Owner | Declaration (audit/oversight) | — |

## 6. Handling disputes and incorrect selection

| Scenario | Draft handling |
| --- | --- |
| Participant claims another participant's declaration is wrong | Report flow; no gender data exposed to the reporter |
| Participant challenges their own eligibility (mistake) | Self-service profile correction; pending change reflected at next booking |
| Booking made under wrong format by error | Support-assisted correction or refund per cancellation policy |
| Dispute at the venue | Coordinator follows escalation; Safety Officer investigates; no on-field adjudication of identity |
| Repeated abuse of declaration | Reliability/ban pipeline (see `docs/admin/07-participant-and-safety-management.md`) |

## 7. Coordinator gender requirements

Coordinator gender requirements **may apply** per format, decided by the operator:

| Format | Draft stance |
| --- | --- |
| Women-only | Coordinator of the same gender preferred; may be required by policy |
| Men-only | Same-gender coordinator preferred where feasible |
| Mixed / open | No requirement |

This is a configurable policy per experience template, not a platform hard rule (DEC-SA-043).

## 8. Privacy and dignity principles

1. Gender declaration is **never shown to other participants**.
2. No one is asked to prove gender at a venue by default.
3. Declarations are used only for eligibility and safety, not marketing or ranking.
4. A participant may choose "prefer not to say" where the format allows (open/mixed).
5. All gender-related access is logged and role-limited.

## 9. Reporting and appeals

- Reports about format misuse follow the standard report pipeline (`docs/admin/07-participant-and-safety-management.md`).
- Appeals of eligibility decisions route to Safety & Moderation Officer with escalation to Super Admin.
- Appeal outcomes are recorded; identity data is not disclosed to third parties.

## 10. Legal review requirements (blocked items)

| # | Legal question | Status |
| --- | --- | --- |
| L1 | Lawfulness of women-only / men-only formats in India (constitutional + consumer law context) | **Blocked — legal review required** |
| L2 | Whether gender verification is ever permissible/required | **Blocked — legal review required** |
| L3 | Liability for eligibility disputes | **Blocked — legal review required** |
| L4 | Data handling of gender declarations (sensitive personal data) | **Blocked — legal review required** |

## 11. Decision topics

### 11.1 Format set and eligibility model

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Men/women/mixed confirmed; "open" not previously defined. |
| 2 | Options | (a) Declared-gender eligibility, (b) no eligibility, (c) identity-verified eligibility. |
| 3 | Benefits | (a) balances inclusion, safety and privacy. |
| 4 | Risks | Declaration abuse; legal exposure (RSK-SA-003). |
| 5 | Operational consequences | Simple check-in; disputes rare by design. |
| 6 | Technical consequences | Format + declared-gender rule at booking; no document storage. |
| 7 | Recommended v1 decision | Declared-gender eligibility for single-gender formats; open/mixed open to all. |
| 8 | Unresolved | "Prefer not to say" behavior on single-gender formats. |
| 9 | External review | Indian legal review required (L1). |
| 10 | Decision status | **Proposed — DEC-SA-039** |

### 11.2 No invasive verification by default

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Verification previously "conditional" (D-014); method open. |
| 2 | Options | (a) Declaration only, (b) phone-verified only, (c) full KYC. |
| 3 | Benefits | (a) preserves anonymity-first and low-friction signup. |
| 4 | Risks | Misuse of formats (RSK-SA-003). |
| 5 | Operational consequences | No document checks at venues by default. |
| 6 | Technical consequences | No identity-document storage in v1 pipeline. |
| 7 | Recommended v1 decision | Declaration only for eligibility; no government-identity verification by default. |
| 8 | Unresolved | Whether phone verification is required for any format. |
| 9 | External review | Legal review (L2). |
| 10 | Decision status | **Proposed — DEC-SA-040** |

### 11.3 Coordinator gender requirements configurable

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Undefined previously. |
| 2 | Options | (a) Configurable per template, (b) never, (c) always match. |
| 3 | Benefits | (a) lets ops match participant comfort without a hard rule. |
| 4 | Risks | Staffing constraints; employment-law considerations (RSK-SA-011). |
| 5 | Operational consequences | Roster planning considers format-specific staffing. |
| 6 | Technical consequences | Staffing rule as config on template. |
| 7 | Recommended v1 decision | Configurable per template; default: same-gender preferred for single-gender formats. |
| 8 | Unresolved | Enforcement vs. preference semantics. |
| 9 | External review | Legal review of staffing rules (employment context). |
| 10 | Decision status | **Proposed — DEC-SA-041** |

## 12. Confirmed decisions (this workstream)

| ID | Decision | Status |
| --- | --- | --- |
| DEC-SA-039 | Format set: women-only / men-only / mixed / open; declared-gender eligibility | Proposed |
| DEC-SA-040 | No invasive verification by default | Proposed |
| DEC-SA-041 | Coordinator gender requirements configurable per template | Proposed |
| DEC-SA-042 | Gender declaration visible only to eligibility staff; never public | Approved (from WS5) |
| DEC-SA-043 | Legal conclusions blocked pending Indian legal review | Blocked |

## 13. Assumptions introduced

| ID | Assumption |
| --- | --- |
| ASM-SA-029 | Declared-gender eligibility is socially and legally workable at v1 scale. |
| ASM-SA-030 | Single-gender formats have sufficient demand to meet minimums. |

## 14. Open questions raised

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-046 | Indian legal review of women-only/men-only formats — outcome? | Legal |
| OQ-SA-059 | "Prefer not to say" behavior on single-gender formats? | Founder |
| OQ-SA-060 | Is same-gender coordinator required or preferred for women-only sessions? | Founder + Ops |

## 15. Dependencies

- **Anonymity:** `docs/security/02-anonymity-and-reveal-policy.md`.
- **Verification:** `docs/security/04-verification-and-trust-model.md`.
- **Safety:** `docs/admin/07-participant-and-safety-management.md`.
- **Roles:** `docs/admin/02-admin-users-and-roles.md`.

## 16. Related documents

- `docs/security/01-security-and-privacy-principles.md`
- `docs/product/01-product-vision.md`
