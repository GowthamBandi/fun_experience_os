import type { PrototypeState } from "../scenarios/state";
import type { ScheduledSession } from "../entities";

export const sessionRepo = {
  // Retrieve all sessions
  getAll: (state: PrototypeState): ScheduledSession[] => state.sessions,

  // Find a session by ID
  getById: (state: PrototypeState, id: string): ScheduledSession | undefined =>
    state.sessions.find((s) => s.id === id),

  // Add a new session (expects a session with id already generated)
  add: (state: PrototypeState, session: ScheduledSession): PrototypeState => {
    return { ...state, sessions: [...state.sessions, session] };
  },

  // Update an existing session (partial updates)
  update: (
    state: PrototypeState,
    id: string,
    updates: Partial<ScheduledSession>
  ): PrototypeState => {
    const sessions = state.sessions.map((s) =>
      s.id === id ? { ...s, ...updates } : s
    );
    return { ...state, sessions };
  },

  // Remove a session (prototype only)
  remove: (state: PrototypeState, id: string): PrototypeState => {
    const sessions = state.sessions.filter((s) => s.id !== id);
    return { ...state, sessions };
  },
};
