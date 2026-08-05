/**
 * Domain repository facade — the public read-model + command surface.
 *
 * Pages and the store import from here. Read models come from the
 * selectors layer (pure derivations of central state) and mutations come
 * from the services layer (pure state transforms). The store is the only
 * place that wires a transform to persistence.
 */
export * from "../selectors";
export * from "../services";
export * from "../validators";
