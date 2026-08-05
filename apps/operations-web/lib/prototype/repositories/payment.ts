import type { PrototypeState } from "../scenarios/state";
import type { Payment, Refund } from "../entities";

export const paymentRepo = {
  getAll: (state: PrototypeState): Payment[] => state.payments ?? [],

  getById: (state: PrototypeState, id: string): Payment | undefined =>
    (state.payments ?? []).find((p) => p.id === id),

  getByBookingId: (state: PrototypeState, bookingId: string): Payment | undefined =>
    (state.payments ?? []).find((p) => p.bookingId === bookingId),

  getBySessionId: (state: PrototypeState, sessionId: string): Payment[] =>
    (state.payments ?? []).filter((p) => p.sessionId === sessionId),

  add: (state: PrototypeState, payment: Payment): PrototypeState => ({
    ...state,
    payments: [...(state.payments ?? []), payment]
  }),

  update: (
    state: PrototypeState,
    id: string,
    updates: Partial<Payment>
  ): PrototypeState => ({
    ...state,
    payments: (state.payments ?? []).map((p) =>
      p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
    )
  })
};

export const refundRepo = {
  getAll: (state: PrototypeState): Refund[] => state.refunds ?? [],

  getById: (state: PrototypeState, id: string): Refund | undefined =>
    (state.refunds ?? []).find((r) => r.id === id),

  getByBookingId: (state: PrototypeState, bookingId: string): Refund[] =>
    (state.refunds ?? []).filter((r) => r.bookingId === bookingId),

  getBySessionId: (state: PrototypeState, sessionId: string): Refund[] =>
    (state.refunds ?? []).filter((r) => r.sessionId === sessionId),

  add: (state: PrototypeState, refund: Refund): PrototypeState => ({
    ...state,
    refunds: [...(state.refunds ?? []), refund]
  }),

  update: (
    state: PrototypeState,
    id: string,
    updates: Partial<Refund>
  ): PrototypeState => ({
    ...state,
    refunds: (state.refunds ?? []).map((r) =>
      r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r
    )
  })
};
