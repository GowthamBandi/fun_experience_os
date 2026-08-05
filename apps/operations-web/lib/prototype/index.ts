/**
 * Prototype central-state package.
 *
 * Public barrel for the normalized prototype domain. Structure:
 *   entities/        — type surface (moved to ./entities.ts)
 *   seed.ts          — deterministic seed data
 *   selectors/       — read models (pure derivations of state)
 *   services/        — commands (pure state transforms)
 *   validators/      — cross-entity consistency checks
 *   scenarios/       — PrototypeState, initial state, scenario engine
 *   persistence/     — localStorage adapter
 *   repositories/    — domain facade re-exporting selectors + services
 */
export * from "./entities";
export * from "./seed";
export * from "./selectors";
export * from "./services";
export * from "./validators";
export * from "./scenarios";
export * from "./persistence";
