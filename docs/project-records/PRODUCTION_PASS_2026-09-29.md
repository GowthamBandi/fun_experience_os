# Production Pass Report — 2026-09-29

Record of the work done in the production pass, per area, as reported by each workstream and integrated on branch `claude/zen-brahmagupta-se2svs`. The consolidated summary is in `CHANGELOG.md`; verified status is in `docs/PRODUCTION_STATUS.md`.

## Foundation (console platform)
- Daylight design system: tokens, fonts (self-hosted), UI kit (buttons, status chips, metric tiles, dialogs via portal, toasts), rebuilt shell with mobile navigation, live clock, save indicator, account menu and ⌘K entity search.
- Route→role policy (`lib/nav.ts`); local workspace mode with operator-profile sign-in; Firebase modes unchanged for sign-in.
- Store: synchronous commit (commands return real results), actor always the signed-in operator, activity record journalling of every command, operator accounts, workspace export/import/start-fresh, 30-second hold sweeper.
- Persistence: IndexedDB envelope with schema version, migrations registry, cross-tab sync, legacy migration; Firestore adapter + `syncWorkspace` callable for Firebase modes.
- Local marketplace governance mirroring the Cloud Functions (decide, status transitions, intake) with seed data shared with the emulator seed.
- Pages: Overview, Audit & records, Workspace & backups, Access, all governance pages; error boundaries.
- Integration fixes: session tabs unified, `.overline`→`.eyebrow`, grid overflow on phones, session scheduling validation, removal of unguarded `createBooking`, seed consistency and repair migration.

## Bookings, capacity & money — agent report summary
- One canonical booking vocabulary (selectors/status.ts): payment-pending, confirmed, payment-failed, reservation-expired, waitlisted, waitlist-offered, cancelled-user, cancelled-company, no-show, refunded, completed; LEGACY map + seatClass(); bookedCount counts confirmed+holds (Overview 1/40 → 36/40).
- Capacity ledger counts each booking once; capacity from session max (areas contradicted sessions).
- Real ISO expiry: 15-min holds, waitlist offers per session (default 10); releaseExpiredHolds implemented with auto-offer to next in queue; live countdowns.
- Payments/Refunds are the money source of truth; transactions derived (buildLedgerTransactions); cancelSession requires reason, creates requested refunds, refuses repeat.
- Refund flow requested → approved → paid out (manual payout with method+reference, once); over-refund guard on payments actually collected; approvers finance/super-admin/owner.
- Refund exceptions: over-refund guard, approved refund linked, completes when paid out; reasons required.
- Migrations: 2026-09-29-bookings-canonical-status, 2026-09-29-money-single-ledger (idempotent).
- Store: commands return { error }; removed updateBooking, confirmBooking, promoteWaitlistUser, simulateRefund, retryPayment.
- Alerts rewritten (plain English, ISO, severity sorted, new money/hold alerts).
- Honest payment labelling; payments require method + reference.
- UI rebuilt: /bookings, /bookings/[id], /bookings/new, /money, /money/payments, /money/refunds, /money/reconciliation, /missions/[id]/{bookings,waitlist,money}; new components/bookings/{dialogs,SessionFrame}.tsx.
- Tests: bookings.test.ts 16, money.test.ts 19 (158 total passing at the time).
- Left: legacy createBooking in create.ts (no UI caller); overview alerts not territory filtered.

## Session operations — agent report summary
- BLOCKER-005 fixed: participant profile + Codes tab use EmergencyIdentityPanel (real reason ≥15 chars in a dialog, record visible only while own grant active, live expiry, close); service requires real booking in session, one open grant per operator/booking, records operatorRole, closedAt/closedBy; only holder/owner/super-admin can close.
- BLOCKER-006 fixed: live page no longer passes role display name; emergency allowed for platform-owner, super-admin, safety, ops-manager and the session's lead coordinator (resolved by crew or operator id); tested for all five.
- allocateTeamsRandomly persists auto-created teams; Fisher–Yates; capacity; history; migration 2026-09-29-orphan-team-assignments.
- endLiveSession Live/Paused→Ending→Ended; openSession uses validateSessionOpenReadiness with override reason (hard blocks not overridable); startLiveSession only from Ready/Opening.
- cancelReveal actually reverts (statusBeforeReveal), refuses if not revealed or already live; triggerReveal/delayReveal validated.
- validateIdentityGeneration, validatePatternSafety, validateTeamAssignment wired in; code generation fixes (no duplicates of locked codes, revoked codes regenerate, capacity).
- resolveSessionPerson helper (crew or operator id) used for readiness, completion, checkInStaff, emergency permission.
- Check-in rules fixed (missing count, session membership, closed sessions, reasons); createCheckInRecords requires reveal.
- Live-session rules: steps only while clock runs, results only for run steps, confirmed results via correction flow, equipment count validation, emergency writes a critical note; completeLiveSession requires Ended and records closing note/override.
- Deleted 12 unused geo widgets incl. AI placeholder; privacyTest selector moved into tests.
- UI: MissionShell frame (tabs, KPIs, stepper), sessions list, schedule page, overview, codes, teams, reveal, door check-in screen, run, results, finish, printable report, identity patterns, participants directory/profile.
- Tests: liveSession.test.ts 14, sessionOperations.test.ts 18.
- Left: createSession has no service-side validation (create.ts); seed s-1 contradictory (status live vs Ready, 4 bookings without codes/teams); bookings/waitlist/money tabs not yet in MissionShell.

## Trust, safety & tournaments — agent report summary
- BLOCKER-003 fixed: typed SAFETY_PERMISSIONS over real RoleIds (owners all; safety all incident/dispute/moderation except permanent bans; city/ops/coordinator report/ack/triage/evidence in own territory; support report + disputes; finance refund exceptions). resolveActor from state.operators (suspended refused), authorizeSafetyAction (services, territory scope), safetyGate (UI). Every safety/dispute/moderation service authorises and returns readable errors, including reject moderation action and evidence handlers.
- Tournament permission matrix (lib/tournaments/access.ts); validators wired into every tournament command; standard seeding (fixes empty match with 5 teams); dual verification (no self-verify); corrections blocked once next match started.
- Disputes support partially-upheld; moderation eligibility ignores expired/future actions and respects scope; four-eyes approval for suspensions/bans.
- TournamentEntrant entity; matches reference entrant ids; Safety Incident + Tournament Day scenarios canonical; seed rewritten; migrations for incident fields and tournament entrants.
- Store callbacks typed, return { error }; new closeModerationCase, updateEvidenceStatus; removed advanceVerifiedWinner and legacy updateMatchScore.
- UI: /safety split into tabs components with KPIs, deadlines by severity, drawers, dialogs; /tournaments list with verification queue; /tournaments/new; /tournaments/[id] visual bracket, match drawer, teams panel, champion card.
- Tests: access.test.ts 10, tournament.test.ts 12, safety.test.ts 17.
- Verified as Priya (safety), Ishaan (finance), Aditya (owner), Ravi (ops, territory-scoped).
- Product decisions to confirm: four-eyes for suspensions/bans; response-deadline targets (critical 15m/24h, high 1h/72h, medium 4h/7d, low 24h/14d); territory scope by operator.territoryId.

## Setup, catalog, staff & reporting — agent report summary
- Staff id space unified on crew ids; seed crew extended (c-9..c-16); migration 2026-09-29-session-staff-crew-ids (mapOperatorStaffToCrew, idempotent); resolveCrewId tolerates both.
- New services/staff.ts: create/update/assign/unassign/attendance with validation (venue in territory, duplicates, off members, role per slot, closed sessions, overlap conflicts), audits, { state, error, id }; store runResult helper; no hard-coded defaults.
- lib/types.ts reduced to live types; duplicates removed from mock.ts and store; operatorName from state; selectors barrel completed.
- Empty-workspace guided first run (8 steps); every page has empty states.
- geo access bound to nav routes; staff actions added.
- Analytics computed from records (selectors/analytics.ts) with range, scope, KPIs, charts, CSV; notifications inbox with read/unread.
- Catalog rules: validation, reasons for pause/archive stored in versions, archive blocked while in use, activation requires readiness, unique duplicates, readiness links fixed, word-based equipment matching.
- Setup validation for all five levels; geo status rules (parents, upcoming sessions, capacity).
- Dead code removed (dev panels, RoleSimulator, DemoWalkthroughPanel, unused geo/catalog/staff components, lib/motion.ts, unused helpers).
- UI: schema-driven setup kit; every setup/catalog/staffing/people/analytics/notifications page rebuilt; light 404; server redirects for legacy routes.
- Tests: staff.test.ts 23, setup.test.ts, analytics.test.ts 4.
- Left: scenario definitions write op-7/op-9; static analytics slice unused.

## Backend (firebase/) — summary of agent report
- Node 22 runtime (Node 24 was rejected by firebase-tools 13, so the functions emulator never loaded any function).
- New domain error codes: CASE_NOT_FOUND, RECORD_NOT_FOUND, USER_NOT_FOUND, TARGET_NOT_FOUND, INVALID_TRANSITION, SETTLEMENT_BLOCKED, LAST_OWNER.
- requireCurrentActor: live Auth check (disabled / revoked / role changed) for every privileged command.
- Unified audit + receipt shapes (platform/commands.ts), receipts expire after 7 days (TTL field override).
- reserveSeat exported as callable (BOOKING_ROLES, territory scope); receipt replay bound to actor+session.
- releaseExpiredHolds scheduled every 5 minutes (Asia/Kolkata), with index reservationStatus+reservationExpiresAt.
- Governance: transition table, missing case/target errors, settlement fraud block, submitGovernanceIntake.
- setOperatorAccess: idempotent, 13 roles + auditor, scope/franchise/territory claims, Auth disabled flag, token revocation, last-owner protection, rollback.
- Rules: client writes denied; admins read governance/operations/customers/payments/refunds/audit/users/workspaces; auditors read governance/operations/audit; missing `disabled` claim handled.
- Seed imports the web governance seed (single source); seed/reset scripts precedence bug fixed; reset clears emulators.
- Tests: functions 68/68 (7 suites), rules 16/16, tune 1/1. CI workflow added. README + data model updated.
- Left: territory/franchise scoping in rules; other data-model indexes (no queries yet); no web call sites for setOperatorAccess/reserveSeat yet.
