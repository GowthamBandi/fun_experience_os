import { getInitialState } from "../scenarios";
import type { PrototypeState } from "../scenarios";

export const PROTOTYPE_STATE_KEY = "xos.prototype.state";
export const WALKTHROUGH_STEP_KEY = "xos.prototype.walkthrough_step";

const SLICES = [
  "franchises",
  "territories",
  "cities",
  "venues",
  "playingAreas",
  "categories",
  "templates",
  "templateVersions",
  "sessions",
  "bookings",
  "crew",
  "shifts",
  "tournaments",
  "transactions",
  "incidents",
  "signals",
  "audits",
  "analytics",
  "promoCodes"
] as const;

export function loadPrototypeState(): PrototypeState {
  const defaults = getInitialState();
  try {
    const raw = window.localStorage.getItem(PROTOTYPE_STATE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PrototypeState>;
    const merged: PrototypeState = { ...defaults };
    for (const slice of SLICES) {
      const value = parsed[slice];
      merged[slice] = (value && Array.isArray(value) ? value : defaults[slice]) as never;
    }
    return merged;
  } catch {
    return defaults;
  }
}

export function savePrototypeState(state: PrototypeState): void {
  try {
    window.localStorage.setItem(PROTOTYPE_STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

export function clearPrototypeState(): void {
  try {
    window.localStorage.removeItem(PROTOTYPE_STATE_KEY);
  } catch {
    /* noop */
  }
}

export function loadDemoStep(): number {
  try {
    const raw = window.localStorage.getItem(WALKTHROUGH_STEP_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

export function saveDemoStep(step: number): void {
  try {
    window.localStorage.setItem(WALKTHROUGH_STEP_KEY, String(step));
  } catch {
    /* noop */
  }
}
