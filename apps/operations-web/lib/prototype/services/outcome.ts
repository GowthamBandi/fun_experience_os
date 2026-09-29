import type { PrototypeState } from "../scenarios/state";

/**
 * Result of a Trust & Safety or tournament command. On refusal `state` is the
 * unchanged input and `error` is an operator-readable sentence.
 */
export type CommandResult<Extra extends object = object> = { state: PrototypeState; error?: string } & Partial<Extra>;

export const refuse = (state: PrototypeState, error: string): { state: PrototypeState; error: string } => ({ state, error });

export const isoNow = (): string => new Date().toISOString();
