import { describe, expect, it } from "vitest";
import { hydrateState, parseWorkspaceBackup, toEnvelope, SCHEMA_VERSION } from "./index";
import { getEmptyState, getInitialState } from "../scenarios";

describe("workspace persistence", () => {
  it("restores every slice and fills missing ones", () => {
    const partial = { bookings: [{ id: "b-x" }], unknownKey: [1] };
    const s = hydrateState(partial);
    const keys = Object.keys(getEmptyState());
    for (const k of keys) expect(Array.isArray((s as unknown as Record<string, unknown>)[k])).toBe(true);
    expect(s.bookings.length).toBe(1);
    expect(s.operators.length).toBeGreaterThan(0);
    expect((s as unknown as Record<string, unknown>).unknownKey).toBeUndefined();
  });

  it("round-trips a backup envelope", () => {
    const state = getInitialState();
    const env = toEnvelope(state);
    expect(env.schemaVersion).toBe(SCHEMA_VERSION);
    const restored = parseWorkspaceBackup(JSON.stringify(env));
    expect(restored.sessions.length).toBe(state.sessions.length);
    expect(restored.governance.length).toBe(state.governance.length);
  });

  it("rejects files that are not workspace backups", () => {
    expect(() => parseWorkspaceBackup("not json")).toThrow(/not valid JSON/);
    expect(() => parseWorkspaceBackup(JSON.stringify({ hello: 1 }))).toThrow(/not an Experience OS workspace/);
    expect(() => parseWorkspaceBackup(JSON.stringify({ app: "experience-os", schemaVersion: 999, state: {} }))).toThrow(/newer version/);
  });

  it("an empty workspace keeps operators and nothing else", () => {
    const s = getEmptyState();
    expect(s.operators.length).toBeGreaterThan(0);
    expect(s.sessions.length + s.bookings.length + s.governance.length).toBe(0);
  });
});
