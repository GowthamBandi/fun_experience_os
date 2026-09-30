/**
 * Commerce constants (ADR-0005). Money is always integer paise.
 */

import { COLLECTIONS } from "../platform/firestore";

export const CURRENCY = "INR" as const;

/** Hold length before the sweeper releases an unpaid reservation (ADR-0002 §5). */
export const HOLD_MINUTES = 15;

/** Discretionary refunds above ₹10,000 need two different admins. */
export const REFUND_DUAL_CONTROL_MINOR = 1_000_000;

/** Settlements above ₹50,000 need two different admins (approve → mark-paid). */
export const SETTLEMENT_DUAL_CONTROL_MINOR = 5_000_000;

export const RATE_LIMITS = {
  reserve: { limit: 20, windowSeconds: 600 },
  paymentOrder: { limit: 20, windowSeconds: 600 },
  confirmPayment: { limit: 30, windowSeconds: 600 },
  cancel: { limit: 20, windowSeconds: 600 },
  scan: { limit: 120, windowSeconds: 60 },
  /** Organizer discretionary refund requests (each lands in the admin queue). */
  refundRequest: { limit: 20, windowSeconds: 3600 },
  /** Read-heavy lookups: cancellation quotes and attendee lists. */
  quote: { limit: 60, windowSeconds: 600 },
  attendees: { limit: 60, windowSeconds: 600 },
} as const;

/** Commerce-owned collections not (yet) listed in platform COLLECTIONS. */
export const C = {
  ...COLLECTIONS,
  ticketSecrets: "ticketSecrets",
  bookingLocks: "bookingLocks",
} as const;

export const bookingLockId = (eventId: string, uid: string) => `${eventId}__${uid}`;

export type CancellationPolicy = "flexible" | "moderate" | "strict";
