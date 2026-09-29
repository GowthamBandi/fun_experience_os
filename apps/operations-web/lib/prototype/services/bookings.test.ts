import { describe, expect, it } from "vitest";
import { getInitialState } from "../scenarios/initial";
import type { PrototypeState } from "../scenarios/state";
import type { Booking } from "../entities";
import { sessionCapacityLedger } from "../selectors/capacity";
import { bookedCount, waitlistCount, seatClass, canonicalBookingStatus } from "../selectors/status";
import { sessionViews } from "../selectors/views";
import { selectSessionWaitlistQueue } from "../selectors/bookings";
import {
  acceptWaitlistOffer,
  cancelBooking,
  confirmBookingPayment,
  createBookingReservation,
  expireWaitlistOffer,
  failBookingPayment,
  joinWaitlist,
  migrateLegacyBookings,
  offerWaitlistSlot,
  releaseExpiredHolds,
} from "./bookings";
import { allocateTeams } from "./operations";

const T0 = "2026-09-29T12:00:00.000Z";
const at = (mins: number) => new Date(Date.parse(T0) + mins * 60_000).toISOString();
const PAY = { method: "upi", reference: "UTR123456789" };

/** The seed without its live holds and offers (their expiries are relative to the real clock). */
function quietSeed(): PrototypeState {
  const seed = getInitialState();
  return { ...seed, bookings: seed.bookings.filter((b) => seatClass(b) !== "hold" && seatClass(b) !== "offer") };
}

/** An empty, bookable 4-seat session built on the seed catalogue. */
function smallSession(state: PrototypeState, patch: Partial<PrototypeState["sessions"][number]> = {}): PrototypeState {
  const base = state.sessions.find((s) => s.id === "s-13")!;
  return {
    ...state,
    sessions: [...state.sessions, { ...base, id: "s-test", status: "booking-open", maxParticipants: 4, targetParticipants: 4, minParticipants: 2, compSlots: 0, blockedSlots: 0, waitlistEnabled: true, waitlistOfferExpiryMins: 10, ...patch }],
  };
}

function reserve(state: PrototypeState, alias: string, nowIso = T0) {
  const out = createBookingReservation(state, { sessionId: "s-test", alias, operatorId: "op-1" }, nowIso);
  expect(out.error).toBeUndefined();
  return { state: out.state, id: out.booking!.id };
}

function fill(state: PrototypeState, n: number, nowIso = T0): { state: PrototypeState; ids: string[] } {
  const ids: string[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    const r = reserve(s, `Guest${i + 1}`, nowIso);
    s = r.state;
    ids.push(r.id);
  }
  return { state: s, ids };
}

describe("canonical booking vocabulary and capacity", () => {
  it("counts seeded confirmed bookings as booked seats (no more '0 seats')", () => {
    const state = getInitialState();
    const ledger = sessionCapacityLedger(state, "s-1");
    expect(ledger.confirmedPaidBookings).toBe(8);
    expect(bookedCount(state, "s-1")).toBe(8);
    expect(waitlistCount(state, "s-1")).toBe(1);
    const today = sessionViews(state).filter((s) => s.date === "Today");
    expect(today.reduce((a, s) => a + s.booked, 0)).toBeGreaterThan(40);
  });

  it("every seeded booking uses the canonical vocabulary", () => {
    const state = getInitialState();
    for (const b of state.bookings) expect(canonicalBookingStatus(b.status)).toBe(b.status);
  });

  it("tolerates legacy statuses on read", () => {
    const legacy = (status: string) => ({ status, bookingType: "individual" }) as Pick<Booking, "status" | "bookingType">;
    expect(seatClass(legacy("payment-confirmed"))).toBe("paid");
    expect(seatClass(legacy("checked-in"))).toBe("paid");
    expect(seatClass(legacy("waitlist-joined"))).toBe("waitlist");
    expect(seatClass(legacy("waitlist-promoted"))).toBe("offer");
    expect(seatClass(legacy("cancelled"))).toBe("none");
  });

  it("never oversells: holds count against capacity and the fifth paid booking is refused", () => {
    const { state } = fill(smallSession(quietSeed()), 4);
    const ledger = sessionCapacityLedger(state, "s-test");
    expect(ledger.activeReservationHolds).toBe(4);
    expect(ledger.remainingSellableCapacity).toBe(0);
    const fifth = createBookingReservation(state, { sessionId: "s-test", alias: "Latecomer" }, T0);
    expect(fifth.error).toMatch(/full/i);
    expect(fifth.state).toBe(state);
    expect(state.sessions.find((s) => s.id === "s-test")!.status).toBe("full");
  });

  it("complimentary bookings use reserved comp slots first, then sellable seats", () => {
    let state = smallSession(quietSeed(), { compSlots: 1 });
    expect(sessionCapacityLedger(state, "s-test").sellableCapacity).toBe(3);
    state = fill(state, 3).state;
    const comp = createBookingReservation(state, { sessionId: "s-test", alias: "Guest VIP", bookingType: "complimentary" }, T0);
    expect(comp.error).toBeUndefined();
    expect(comp.booking!.status).toBe("confirmed");
    const secondComp = createBookingReservation(comp.state, { sessionId: "s-test", alias: "Guest VIP2", bookingType: "complimentary" }, T0);
    expect(secondComp.error).toBeDefined();
  });

  it("rejects a duplicate active booking for the same person", () => {
    const { state } = reserve(smallSession(quietSeed()), "SamePerson");
    const again = createBookingReservation(state, { sessionId: "s-test", alias: "sameperson" }, T0);
    expect(again.error).toMatch(/already has an active booking/);
  });

  it("the waitlist only opens when the session is full", () => {
    const empty = smallSession(quietSeed());
    expect(joinWaitlist(empty, { sessionId: "s-test", alias: "Early" }, T0).error).toMatch(/still free/);
    const { state } = fill(empty, 4);
    const joined = joinWaitlist(state, { sessionId: "s-test", alias: "Waiter" }, T0);
    expect(joined.error).toBeUndefined();
    expect(joined.booking!.status).toBe("waitlisted");
    expect(selectSessionWaitlistQueue(joined.state, "s-test")).toHaveLength(1);
  });

  it("payment must be recorded with a method and reference", () => {
    const { state, id } = reserve(smallSession(quietSeed()), "Payer");
    expect(confirmBookingPayment(state, id, { method: "upi", reference: "" }, "op-1", T0).error).toMatch(/reference/);
    expect(confirmBookingPayment(state, id, { method: "bitcoin", reference: "X123" }, "op-1", T0).error).toMatch(/how the payment/);
    const ok = confirmBookingPayment(state, id, PAY, "op-1", T0);
    expect(ok.error).toBeUndefined();
    const b = ok.state.bookings.find((x) => x.id === id)!;
    expect(b.status).toBe("confirmed");
    expect(b.paymentReference).toBe(PAY.reference);
    const p = ok.state.payments.find((x) => x.bookingId === id)!;
    expect(p.status).toBe("confirmed");
    expect(p.providerReference).toBe(PAY.reference);
    expect(p.paymentMethod).toBe("upi");
    expect(ok.state.transactions.some((t) => t.paymentId === p.id && t.status === "settled")).toBe(true);
    expect(confirmBookingPayment(ok.state, id, PAY, "op-1", T0).error).toMatch(/already paid/);
  });

  it("allocates teams from confirmed bookings only", () => {
    const state = getInitialState();
    const next = allocateTeams(state, "s-1", "op-1");
    const withTeam = next.bookings.filter((b) => b.sessionId === "s-1" && b.team);
    expect(withTeam).toHaveLength(8);
    expect(withTeam.every((b) => b.status === "confirmed")).toBe(true);
  });
});

describe("releaseExpiredHolds", () => {
  it("returns the same state object when nothing has expired", () => {
    const { state } = fill(smallSession(quietSeed()), 2);
    expect(releaseExpiredHolds(state, at(5), "system")).toBe(state);
    const seeded = getInitialState();
    expect(releaseExpiredHolds(seeded, new Date().toISOString())).toBe(seeded);
  });

  it("stores ISO expiries: 15 minute holds", () => {
    const { state, id } = reserve(smallSession(quietSeed()), "Holder");
    const b = state.bookings.find((x) => x.id === id)!;
    expect(b.reservationExpiresAt).toBe(at(15));
  });

  it("releases an expired hold, cancels its payment and frees the seat; unexpired holds are untouched", () => {
    const base = smallSession(quietSeed());
    const first = reserve(base, "Early", T0);
    const second = reserve(first.state, "Later", at(10));
    const next = releaseExpiredHolds(second.state, at(16), "system");
    expect(next).not.toBe(second.state);
    const early = next.bookings.find((b) => b.id === first.id)!;
    const later = next.bookings.find((b) => b.id === second.id)!;
    expect(early.status).toBe("reservation-expired");
    expect(early.reservationStatus).toBe("expired");
    expect(next.payments.find((p) => p.bookingId === first.id)!.status).toBe("cancelled");
    expect(later.status).toBe("payment-pending");
    expect(next.payments.find((p) => p.bookingId === second.id)!.status).toBe("pending");
    expect(sessionCapacityLedger(next, "s-test").activeReservationHolds).toBe(1);
    expect(next.audits[0].action).toMatch(/Reservation Expired/);
    // Idempotent: a second sweep at the same time changes nothing.
    expect(releaseExpiredHolds(next, at(16), "system")).toBe(next);
  });

  it("offers a freed seat to the next person on the waitlist, and passes it on when the offer expires", () => {
    const filled = fill(smallSession(quietSeed(), { waitlistOfferExpiryMins: 7 }), 4, T0);
    let state = filled.state;
    state = joinWaitlist(state, { sessionId: "s-test", alias: "FirstInLine" }, at(1)).state;
    state = joinWaitlist(state, { sessionId: "s-test", alias: "SecondInLine" }, at(2)).state;
    // Pay for three holds; the fourth expires.
    for (const id of filled.ids.slice(0, 3)) state = confirmBookingPayment(state, id, PAY, "op-1", at(3)).state;

    const afterHold = releaseExpiredHolds(state, at(16), "system");
    const first = afterHold.bookings.find((b) => b.alias === "FirstInLine")!;
    const second = afterHold.bookings.find((b) => b.alias === "SecondInLine")!;
    expect(first.status).toBe("waitlist-offered");
    expect(first.waitlistOfferExpiresAt).toBe(at(16 + 7));
    expect(second.status).toBe("waitlisted");
    expect(sessionCapacityLedger(afterHold, "s-test").remainingSellableCapacity).toBe(0);

    const afterOffer = releaseExpiredHolds(afterHold, at(24), "system");
    expect(afterOffer.bookings.find((b) => b.alias === "FirstInLine")!.status).toBe("reservation-expired");
    const promoted = afterOffer.bookings.find((b) => b.alias === "SecondInLine")!;
    expect(promoted.status).toBe("waitlist-offered");
    expect(promoted.waitlistOfferExpiresAt).toBe(at(24 + 7));
  });

  it("an accepted offer becomes a 15-minute payment hold; an expired offer can't be accepted", () => {
    let state = fill(smallSession(quietSeed()), 4, T0).state;
    state = joinWaitlist(state, { sessionId: "s-test", alias: "Waiter" }, at(1)).state;
    const holdId = state.bookings.find((b) => b.alias === "Guest1")!.id;
    state = cancelBooking(state, holdId, { reason: "Customer changed plans" }, "op-1", at(2)).state;
    const waiter = state.bookings.find((b) => b.alias === "Waiter")!;
    expect(waiter.status).toBe("waitlist-offered");
    expect(acceptWaitlistOffer(state, waiter.id, "op-1", at(30)).error).toMatch(/expired/);
    const accepted = acceptWaitlistOffer(state, waiter.id, "op-1", at(3));
    expect(accepted.error).toBeUndefined();
    const b = accepted.state.bookings.find((x) => x.id === waiter.id)!;
    expect(b.status).toBe("payment-pending");
    expect(b.reservationExpiresAt).toBe(at(18));
    expect(accepted.state.payments.some((p) => p.bookingId === waiter.id && p.status === "pending")).toBe(true);
  });

  it("manual offer and withdrawal follow the queue", () => {
    let state = fill(smallSession(quietSeed()), 4, T0).state;
    state = joinWaitlist(state, { sessionId: "s-test", alias: "Alpha" }, at(1)).state;
    state = joinWaitlist(state, { sessionId: "s-test", alias: "Bravo" }, at(1)).state;
    expect(offerWaitlistSlot(state, "s-test", "op-1", at(2)).error).toMatch(/no free seat/i);
    const failed = failBookingPayment(state, state.bookings.find((b) => b.alias === "Guest2")!.id, "Card declined", "op-1", at(2));
    expect(failed.state.bookings.find((b) => b.alias === "Alpha")!.status).toBe("waitlist-offered");
    const withdrawn = expireWaitlistOffer(failed.state, failed.state.bookings.find((b) => b.alias === "Alpha")!.id, "op-1", at(3));
    expect(withdrawn.state.bookings.find((b) => b.alias === "Bravo")!.status).toBe("waitlist-offered");
  });
});

describe("legacy booking migration", () => {
  it("rewrites legacy statuses and display-string expiries, and is idempotent", () => {
    const seed = getInitialState();
    const legacy: PrototypeState = {
      ...seed,
      bookings: [
        ...seed.bookings,
        { id: "b-l1", sessionId: "s-7", alias: "OldPaid", phoneMask: "", amount: 199, status: "payment-confirmed", createdAt: "Today, 10:00" },
        { id: "b-l2", sessionId: "s-7", alias: "OldWait", phoneMask: "", amount: 199, status: "waitlist-joined", createdAt: "Today, 10:00", waitlistOrder: 9 },
        { id: "b-l3", sessionId: "s-7", alias: "OldOffer", phoneMask: "", amount: 199, status: "waitlist-promoted", createdAt: "Today, 10:00", waitlistOfferExpiresAt: "19:45" },
        { id: "b-l4", sessionId: "s-7", alias: "OldHold", phoneMask: "", amount: 199, status: "payment-pending", createdAt: "Today, 10:00", reservationExpiresAt: "15:00 mins" },
        { id: "b-l5", sessionId: "s-11", alias: "OldCancel", phoneMask: "", amount: 249, status: "cancelled", createdAt: "Yesterday, 10:00" },
        { id: "b-l6", sessionId: "s-7", alias: "OldIn", phoneMask: "", amount: 199, status: "checked-in", createdAt: "Today, 10:00" },
      ],
    };
    const migrated = migrateLegacyBookings(legacy, T0);
    const get = (id: string) => migrated.bookings.find((b) => b.id === id)!;
    expect(get("b-l1").status).toBe("confirmed");
    expect(get("b-l2").status).toBe("waitlisted");
    expect(get("b-l3").status).toBe("waitlist-offered");
    expect(get("b-l3").waitlistOfferExpiresAt).toBe(at(15));
    expect(get("b-l4").reservationExpiresAt).toBe(at(15));
    expect(get("b-l5").status).toBe("cancelled-company");
    expect(get("b-l6").status).toBe("confirmed");
    expect(get("b-l6").checkedIn).toBe(true);
    expect(migrateLegacyBookings(migrated, at(60))).toBe(migrated);
    expect(migrateLegacyBookings(seed, T0)).toBe(seed);
  });
});
