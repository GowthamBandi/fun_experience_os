/**
 * Workspace data migrations.
 *
 * `migrateState` runs on every load (IndexedDB, legacy localStorage, imported
 * backup and fresh seed). Each migration must be idempotent: running it on
 * already-migrated data must return equivalent data.
 */
import type { PrototypeState } from "./scenarios/state";
import { mapOperatorStaffToCrew } from "./services/staff";
import { migrateLegacyBookings } from "./services/bookings";
import { migrateLegacyMoney } from "./services/money";
import { repairOrphanTeamAssignments } from "./services/teams";
import { migrateLegacyIncidents } from "./services/safety";
import { migrateLegacyTournaments } from "./services/tournament";

export type Migration = { id: string; description: string; run: (state: PrototypeState) => PrototypeState };

const MIGRATIONS: Migration[] = [
  {
    id: "2026-09-29-operators-status",
    description: "Every operator account has an explicit status.",
    run: (s) => ({ ...s, operators: s.operators.map((o) => ({ ...o, status: o.status ?? "active" })) }),
  },
  {
    id: "2026-09-29-session-staff-crew-ids",
    description: "Session staffing slots reference crew members (c-*), not console operator ids (op-*).",
    run: mapOperatorStaffToCrew,
  },
  {
    id: "2026-09-29-bookings-canonical-status",
    description:
      "Bookings use one status vocabulary (payment-confirmed/checked-in → confirmed, waitlist-joined → waitlisted, waitlist-promoted → waitlist-offered, cancelled → cancelled-user/company) and hold/offer expiries are ISO timestamps.",
    run: (s) => migrateLegacyBookings(s),
  },
  {
    id: "2026-09-29-money-single-ledger",
    description:
      "Payments and refunds are the source of truth: ledger-only payment/refund rows become Payment/Refund records, paid bookings without a payment get one, and the transactions list is rebuilt from them.",
    run: (s) => migrateLegacyMoney(s),
  },
  {
    id: "2026-09-29-orphan-team-assignments",
    description: "Recreate teams that random allocation assigned participants to without saving the team itself.",
    run: (s) => repairOrphanTeamAssignments(s),
  },
  {
    id: "2026-09-29-incidents-canonical-fields",
    description:
      "Incidents use canonical fields only: reporterId → reportedBy, type → category, time → reportedAt/occurredAt, peopleInvolved → participantTemporaryIds, escalatedToVenue → venueEscalated, ownerId → followUpOwnerId.",
    run: (s) => migrateLegacyIncidents(s),
  },
  {
    id: "2026-09-29-tournament-entrant-ids",
    description:
      "Tournament teams become entrant records with stable ids; match slots, winners and champions reference those ids instead of team names, and deprecated mirror fields are removed.",
    run: (s) => migrateLegacyTournaments(s),
  },
];

/** Register an additional migration (module-level, at import time). */
export function registerMigration(m: Migration): void {
  if (!MIGRATIONS.some((x) => x.id === m.id)) MIGRATIONS.push(m);
}

export function migrateState(state: PrototypeState): PrototypeState {
  return MIGRATIONS.reduce((acc, m) => m.run(acc), state);
}

export function listMigrations(): Array<Pick<Migration, "id" | "description">> {
  return MIGRATIONS.map(({ id, description }) => ({ id, description }));
}
