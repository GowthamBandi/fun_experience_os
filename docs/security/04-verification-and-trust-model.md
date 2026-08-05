# 04 — Verification and Trust Model

> **Status:** Planning draft — decision-resolution phase (SA-0C).
> **Document type:** Identity / trust policy.
> **This document is a planning draft.** It defines progressive verification levels. **No verification or KYC implementation exists.** A specialized verification provider is recommended later; building a custom KYC system is explicitly avoided.

---

## 1. Purpose

Define a **progressive verification** model so trust grows with need while preserving the anonymity-first product: most users start phone-verified only; identity verification is reserved for cases that genuinely need it.

## 2. Verification levels (draft)

| Level | Purpose | Required information | Who can view status | Which activities require it | Failure & retry | Manual review | Expiry / re-verification | Privacy concerns |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| V1 Phone verified | Base identity; account recovery; prevents duplicate/abuse | Verified phone number (OTP) | Participant, Support (on-ticket), Super Admin | All bookings (base) | OTP retry with rate limit; new OTP resend | No | Rarely re-verified; on number change | Phone in system = participant-identifiable |
| V2 Email verified | Receipts and policy notices | Verified email | Participant, Support (on-ticket) | Bookings needing email (receipts) | Link/OTP resend | No | On email change | Email = participant-identifiable |
| V3 Identity verified | High-trust or high-risk activities; ban enforcement | Identity document + live selfie via specialized provider | Participant, Safety Officer, Super Admin, (Ops on need) | Adventure/high-risk, dispute-affected re-entry, banned-user appeals | Provider retry; rejection reason shown; appeal to manual review | Yes | Per provider policy (e.g., annual) | Highest sensitivity; provider-hosted |
| V4 Emergency contact added | Duty of care at high-risk events | Emergency contact name + phone | Participant, Coordinator (incident only, DEC-SA-037), Safety Officer | Adventure, women-only overnight-style or long-duration events | Editable; reminder at booking | No | Reconfirm periodically | Emergency contact = sensitive |
| V5 Trusted participant | Reward for attendance reliability | Derived (attendance history, no violations) | Participant (badge), Safety Officer, Support | None required; status badge | n/a (derived) | Review on flag | Rolling; recomputed | Minimal; derived data |
| V6 Staff verified | Confirm company staff identity for admin access | Admin account + verification per staff policy | Platform Owner, Super Admin | Admin access | HR/staff process | Yes | Periodic (e.g., annually) | Staff identity |
| V7 Venue verified | Confirm venue partnership/eligibility | Venue contract + contact verification | City Manager, Platform Owner | Venue goes live | Manual process | Yes | Contract renewal | Venue/contract data |

## 3. Model rules (draft)

| Rule | Detail |
| --- | --- |
| Base requirement | Phone verification for all participant accounts (V1). |
| Progressive | Higher levels triggered by activity or incident context, never by marketing. |
| Provider | Identity verification (V3) via a **specialized verification provider** when adopted — never a custom KYC build (DEC-SA-045). |
| No unnecessary storage | Identity-document images are **not stored by default**; provider returns a status/ref only (DEC-SA-046). |
| Status privacy | Verification status is visible only to the participant and authorized staff; it is never public. |
| Tied to anonymity | A verified participant remains anonymous to other participants (see `docs/security/02-anonymity-and-reveal-policy.md`). |

## 4. Activity requirements (proposed v1)

| Activity class | Required levels |
| --- | --- |
| Box cricket, badminton, indoor games (18+) | V1 (phone) |
| Competitive tournaments | V1; V3 recommended for prize events |
| Adventure activities | V1 + V3 (identity) + V4 (emergency contact) |
| Women-only / men-only formats | V1 only (declared gender, no documents — see `docs/security/03-gender-format-and-inclusion-policy.md`) |
| Social experiences | V1 |

## 5. Decision topics

### 5.1 Progressive verification levels

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Verification previously "conditional per activity" (D-014) without levels. |
| 2 | Options | (a) Levels above, (b) single binary verified/unverified, (c) no verification. |
| 3 | Benefits | (a) matches risk to requirement; keeps friction low. |
| 4 | Risks | Level semantics confuse users if unexplained (RSK-SA-012). |
| 5 | Operational consequences | Safety can raise the bar for high-risk categories without slowing casual signups. |
| 6 | Technical consequences | Verification-status attribute with level + expiry; provider integration later. |
| 7 | Recommended v1 decision | Adopt the seven levels; implement V1 (phone) at launch, V3/V4 for adventure and prize tournaments. |
| 8 | Unresolved | Exact levels triggered per activity; prize-tournament policy. |
| 9 | External review | Legal review for KYC-data handling (if provider adopted). |
| 10 | Decision status | **Proposed — DEC-SA-044** |

### 5.2 Specialized provider; no custom KYC

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | No verification provider decided. |
| 2 | Options | (a) Specialized provider (KYC/ID-verification SaaS), (b) custom document upload + manual review, (c) none. |
| 3 | Benefits | (a) compliance, security and cost efficiency; avoids bespoke sensitive-data handling. |
| 4 | Risks | Provider dependency and cost (RSK-SA-012). |
| 5 | Operational consequences | Manual review stays limited to edge cases. |
| 6 | Technical consequences | Integrate provider APIs later; store provider refs/status, not documents. |
| 7 | Recommended v1 decision | Use a specialized provider when identity verification launches; never build custom KYC. |
| 8 | Unresolved | Provider choice (OQ-SA-044). |
| 9 | External review | Legal review of provider data-processing terms. |
| 10 | Decision status | **Proposed — DEC-SA-045** |

### 5.3 No identity-document image storage by default

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Earlier principles require data minimization (P4). |
| 2 | Options | (a) Provider-hosted; store status + ref only, (b) store copies ourselves. |
| 3 | Benefits | (a) minimizes breach surface and storage obligations. |
| 4 | Risks | Retention/dependency on provider (RSK-SA-012). |
| 5 | Operational consequences | No document-handling workflow in the admin. |
| 6 | Technical consequences | Only verification status/ref stored; document lifecycle owned by provider. |
| 7 | Recommended v1 decision | No identity-document images stored by default; provider status/ref only. |
| 8 | Unresolved | None. |
| 9 | External review | Legal review. |
| 10 | Decision status | **Approved — DEC-SA-046** |

### 5.4 Verification tied to activities

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Activity classes need different trust levels. |
| 2 | Options | (a) Per-category requirements, (b) global verification, (c) none. |
| 3 | Benefits | (a) keeps casual sports friction-free. |
| 4 | Risks | Category misclassification (RSK-SA-012). |
| 5 | Operational consequences | Safety sets requirements; blocked at booking if unmet. |
| 6 | Technical consequences | Requirement map as config; enforcement at booking. |
| 7 | Recommended v1 decision | Per-activity-class requirements as in §4. |
| 8 | Unresolved | Final mapping and adventure-category rules. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-047** |

## 6. Confirmed decisions (this workstream)

| ID | Decision | Status |
| --- | --- | --- |
| DEC-SA-044 | Progressive verification levels (V1–V7) | Proposed |
| DEC-SA-045 | Specialized provider later; no custom KYC | Proposed |
| DEC-SA-046 | No identity-document image storage by default | Approved |
| DEC-SA-047 | Per-activity-class verification requirements | Proposed |

## 7. Assumptions introduced

| ID | Assumption |
| --- | --- |
| ASM-SA-031 | A specialized verification provider is available and affordable for the v1 launch market. |
| ASM-SA-032 | Phone OTP verification is sufficient to control abuse at v1 scale. |

## 8. Open questions raised

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-044 | Which specialized verification provider (timing, cost, data terms)? | Founder + Engineering + Legal |
| OQ-SA-061 | Do prize tournaments require identity verification in v1? | Founder + Ops |
| OQ-SA-062 | What is the verification-failure appeal path for V3? | Safety Officer |

## 9. Dependencies

- **Anonymity:** `docs/security/02-anonymity-and-reveal-policy.md`.
- **Gender formats:** `docs/security/03-gender-format-and-inclusion-policy.md`.
- **Safety:** bans/verification use in `docs/admin/07-participant-and-safety-management.md`.

## 10. Related documents

- `docs/security/01-security-and-privacy-principles.md`
- `docs/product/04-v1-scope.md`
