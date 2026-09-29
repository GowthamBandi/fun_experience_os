/**
 * Workspace data migrations.
 *
 * `migrateState` runs on every load (IndexedDB, legacy localStorage, imported
 * backup and fresh seed). Each migration must be idempotent: running it on
 * already-migrated data must return equivalent data.
 */
import type { PrototypeState } from "./scenarios/state";

export type Migration = { id: string; description: string; run: (state: PrototypeState) => PrototypeState };

const MIGRATIONS: Migration[] = [
  {
    id: "2026-09-29-operators-status",
    description: "Every operator account has an explicit status.",
    run: (s) => ({ ...s, operators: s.operators.map((o) => ({ ...o, status: o.status ?? "active" })) }),
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
