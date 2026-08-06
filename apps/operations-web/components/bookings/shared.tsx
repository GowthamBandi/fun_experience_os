"use client";

import React, { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { cn, inr } from "@/lib/format";
import { Badge, FillMeter } from "@/components/ui/primitives";
import type { Booking } from "@/lib/prototype/entities";
import { sessionCapacityLedger, type SessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import type { PrototypeState } from "@/lib/prototype/scenarios/state";
import { ArrowLeft, Clock, AlertTriangle, CheckCircle, Users, RefreshCw } from "lucide-react";

/* =================================================================
 * TERMINOLOGY MAP — Internal → Operator-Friendly
 * ================================================================= */

const BOOKING_STATUS_MAP: Record<string, { label: string; explanation: string; tone: string }> = {
  "reserved":              { label: "Waiting for Payment", explanation: "This person started booking but has not completed payment.", tone: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25" },
  "payment-pending":       { label: "Waiting for Payment", explanation: "This person started booking but has not completed payment.", tone: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25" },
  "payment-confirmed":     { label: "Confirmed", explanation: "Payment received. This person has a confirmed space.", tone: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25" },
  "confirmed":             { label: "Confirmed", explanation: "Payment received. This person has a confirmed space.", tone: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25" },
  "checked-in":            { label: "Checked In", explanation: "This person is physically present at the event.", tone: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25" },
  "payment-failed":        { label: "Payment Problem", explanation: "The payment did not complete. The space is available again.", tone: "text-[#ff8f86] bg-[#f04438]/12 border-[#f04438]/25" },
  "reservation-expired":   { label: "Booking Time Expired", explanation: "This person did not complete payment in time.", tone: "text-ink-mut bg-white/4 border-white/6" },
  "waitlisted":            { label: "Waiting List", explanation: "This person is waiting for a space to become available.", tone: "text-[#c4b5fd] bg-[#7c3aed]/12 border-[#7c3aed]/25" },
  "waitlist-joined":       { label: "Waiting List", explanation: "This person is waiting for a space to become available.", tone: "text-[#c4b5fd] bg-[#7c3aed]/12 border-[#7c3aed]/25" },
  "waitlist-offered":      { label: "Space Offered", explanation: "One space is being held temporarily for this person.", tone: "text-[#ffd28a] bg-[#f7b955]/14 border-[#f7b955]/30" },
  "waitlist-promoted":     { label: "Space Accepted", explanation: "This person accepted the offered space.", tone: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25" },
  "complimentary":         { label: "Free Pass", explanation: "This person has a complimentary entry.", tone: "text-[#9db4ff] bg-[#4c6fff]/12 border-[#4c6fff]/25" },
  "cancelled":             { label: "Cancelled", explanation: "This booking was cancelled.", tone: "text-ink-mut bg-white/4 border-white/6" },
  "cancelled-user":        { label: "Cancelled", explanation: "The customer cancelled this booking.", tone: "text-ink-mut bg-white/4 border-white/6" },
  "cancelled-company":     { label: "Cancelled", explanation: "The company cancelled this booking.", tone: "text-ink-mut bg-white/4 border-white/6" },
  "no-show":               { label: "No Show", explanation: "This person did not attend the event.", tone: "text-[#ff8f86] bg-[#f04438]/12 border-[#f04438]/25" },
  "refund-pending":        { label: "Refund Pending", explanation: "A refund is being processed for this booking.", tone: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25" },
  "refunded":              { label: "Refunded", explanation: "The refund has been completed.", tone: "text-[#9db4ff] bg-[#4c6fff]/12 border-[#4c6fff]/25" },
  "completed":             { label: "Completed", explanation: "This booking is complete.", tone: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25" },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; explanation: string; tone: string }> = {
  "none":         { label: "No Payment", explanation: "No payment required.", tone: "text-ink-mut bg-white/4 border-white/6" },
  "not-started":  { label: "Not Started", explanation: "Payment has not been initiated.", tone: "text-ink-mut bg-white/4 border-white/6" },
  "pending":      { label: "Waiting", explanation: "Payment is being processed.", tone: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25" },
  "initiated":    { label: "Waiting", explanation: "Payment has been started.", tone: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25" },
  "confirmed":    { label: "Paid", explanation: "Payment is confirmed.", tone: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25" },
  "failed":       { label: "Problem", explanation: "Payment failed. Please retry.", tone: "text-[#ff8f86] bg-[#f04438]/12 border-[#f04438]/25" },
  "refund-pending": { label: "Refund Pending", explanation: "A refund is being processed.", tone: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25" },
  "refunded":     { label: "Refunded", explanation: "Payment was refunded.", tone: "text-[#9db4ff] bg-[#4c6fff]/12 border-[#4c6fff]/25" },
  "reconciled":   { label: "Verified", explanation: "Payment has been verified.", tone: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25" },
  "cancelled":    { label: "Cancelled", explanation: "Payment was cancelled.", tone: "text-ink-mut bg-white/4 border-white/6" },
};

const REFUND_STATUS_MAP: Record<string, { label: string; explanation: string; tone: string }> = {
  "requested":    { label: "Requested", explanation: "A refund has been requested.", tone: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25" },
  "under-review": { label: "Needs Review", explanation: "This refund is waiting for finance approval.", tone: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25" },
  "approved":     { label: "Approved", explanation: "Refund approved. Processing will begin.", tone: "text-[#9db4ff] bg-[#4c6fff]/12 border-[#4c6fff]/25" },
  "processing":   { label: "Being Processed", explanation: "Refund is currently being processed.", tone: "text-[#9db4ff] bg-[#4c6fff]/12 border-[#4c6fff]/25" },
  "completed":    { label: "Completed", explanation: "Refund has been sent back.", tone: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25" },
  "failed":       { label: "Failed", explanation: "Refund could not be completed.", tone: "text-[#ff8f86] bg-[#f04438]/12 border-[#f04438]/25" },
  "rejected":     { label: "Rejected", explanation: "This refund was rejected.", tone: "text-[#ff8f86] bg-[#f04438]/12 border-[#f04438]/25" },
};

/* =================================================================
 * 1. BookingStatusBadge
 * ================================================================= */

export function BookingStatusBadge({ status, showTooltip = true }: { status: string; showTooltip?: boolean }) {
  const mapped = BOOKING_STATUS_MAP[status] ?? { label: status.replace(/-/g, " "), explanation: "", tone: "text-ink-mut bg-white/4 border-white/6" };
  return (
    <span className="relative group inline-flex">
      <Badge className={cn("border capitalize", mapped.tone)}>
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-breath" />
        {mapped.label}
      </Badge>
      {showTooltip && mapped.explanation && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-[10px] text-ink-sec whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
          {mapped.explanation}
        </span>
      )}
    </span>
  );
}

/* =================================================================
 * 2. PaymentStatusBadge
 * ================================================================= */

export function PaymentStatusBadge({ status, showTooltip = true }: { status: string; showTooltip?: boolean }) {
  const mapped = PAYMENT_STATUS_MAP[status] ?? { label: status.replace(/-/g, " "), explanation: "", tone: "text-ink-mut bg-white/4 border-white/6" };
  return (
    <span className="relative group inline-flex">
      <Badge className={cn("border capitalize", mapped.tone)}>
        {mapped.label}
      </Badge>
      {showTooltip && mapped.explanation && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-[10px] text-ink-sec whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
          {mapped.explanation}
        </span>
      )}
    </span>
  );
}

/* =================================================================
 * 3. RefundStatusBadge
 * ================================================================= */

export function RefundStatusBadge({ status, showTooltip = true }: { status: string; showTooltip?: boolean }) {
  const mapped = REFUND_STATUS_MAP[status] ?? { label: status.replace(/-/g, " "), explanation: "", tone: "text-ink-mut bg-white/4 border-white/6" };
  return (
    <span className="relative group inline-flex">
      <Badge className={cn("border capitalize", mapped.tone)}>
        {mapped.label}
      </Badge>
      {showTooltip && mapped.explanation && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-[10px] text-ink-sec whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
          {mapped.explanation}
        </span>
      )}
    </span>
  );
}

/* =================================================================
 * 4. CapacitySummary — Visual capacity panel
 * ================================================================= */

export function CapacitySummary({ ledger, compact = false }: { ledger: SessionCapacityLedger; compact?: boolean }) {
  const totalJoined = ledger.confirmedPaidBookings + ledger.confirmedComplimentaryBookings;
  const isFull = ledger.remainingSellableCapacity === 0;

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-xs">
        <span className="font-bold text-ink-lum">{totalJoined}/{ledger.sellableCapacity}</span>
        <FillMeter value={ledger.fillRate} className="w-20" />
        <span className="text-ink-mut">
          {isFull ? "Full" : `${ledger.remainingSellableCapacity} left`}
        </span>
        {ledger.waitlistCount > 0 && (
          <span className="text-[#c4b5fd]">{ledger.waitlistCount} waiting</span>
        )}
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 border border-white/5 space-y-3">
      {/* Fill bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-ink-lum">{totalJoined} of {ledger.sellableCapacity} joined</span>
          <span className={cn("font-bold", isFull ? "text-[#ff8f86]" : "text-ink-sec")}>
            {isFull ? "Event Full" : `${ledger.remainingSellableCapacity} spaces left`}
          </span>
        </div>
        <FillMeter value={ledger.fillRate} />
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
        <MetricCell label="Total Spaces" value={ledger.sellableCapacity} />
        <MetricCell label="Confirmed" value={ledger.confirmedPaidBookings} color="text-[#5fd7a3]" />
        <MetricCell label="Waiting for Payment" value={ledger.activeReservationHolds} color="text-[#ffc46b]" />
        <MetricCell label="Spaces Left" value={ledger.remainingSellableCapacity} color={isFull ? "text-[#ff8f86]" : "text-ink-sec"} />
        <MetricCell label="Waiting" value={ledger.waitlistCount} color="text-[#c4b5fd]" />
      </div>

      {/* Context hints */}
      {ledger.activeReservationHolds > 0 && (
        <p className="text-[10px] text-ink-mut">
          {ledger.activeReservationHolds} space{ledger.activeReservationHolds > 1 ? "s are" : " is"} being held while payment is completed.
        </p>
      )}
      {isFull && ledger.waitlistCount > 0 && (
        <p className="text-[10px] text-[#c4b5fd]">
          This event is full. {ledger.waitlistCount} {ledger.waitlistCount === 1 ? "person is" : "people are"} waiting for a space.
        </p>
      )}
    </div>
  );
}

function MetricCell({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="px-2">
      <span className="block text-[9px] text-ink-mut uppercase font-semibold">{label}</span>
      <span className={cn("text-sm font-bold", color ?? "text-ink-lum")}>{value}</span>
    </div>
  );
}

/* =================================================================
 * 5. BookingMetricsSummary — Top-level summary cards
 * ================================================================= */

export interface BookingMetrics {
  totalJoined: number;
  confirmed: number;
  waitingForPayment: number;
  paymentProblems: number;
  waitingList: number;
  cancelled: number;
  spacesLeft: number;
  collectedToday: number;
  freePasses: number;
}

export function deriveBookingMetrics(state: PrototypeState): BookingMetrics {
  const all = state.bookings;
  const confirmed = all.filter((b) => b.status === "confirmed" || b.paymentStatus === "confirmed").length;
  const waitingForPayment = all.filter((b) => b.reservationStatus === "active" || b.status === "reserved" || b.status === "payment-pending").length;
  const paymentProblems = all.filter((b) => b.status === "payment-failed" || b.paymentStatus === "failed").length;
  const waitingList = all.filter((b) => b.status === "waitlisted" || b.status === "waitlist-joined" || b.status === "waitlist-offered").length;
  const cancelled = all.filter((b) => b.status === "cancelled" || b.status === "cancelled-user" || b.status === "cancelled-company").length;
  const freePasses = all.filter((b) => b.bookingType === "complimentary").length;
  const totalJoined = confirmed + waitingForPayment;

  // Collected from confirmed payments
  const collectedToday = all
    .filter((b) => b.paymentStatus === "confirmed" && b.bookingType !== "complimentary")
    .reduce((sum, b) => sum + b.amount, 0);

  // Overall spaces across active sessions
  let spacesLeft = 0;
  const activeSessions = state.sessions.filter((s) => s.status !== "cancelled" && s.status !== "archived" && s.status !== "completed");
  for (const s of activeSessions) {
    const ledger = sessionCapacityLedger(state, s.id);
    spacesLeft += ledger.remainingSellableCapacity;
  }

  return { totalJoined, confirmed, waitingForPayment, paymentProblems, waitingList, cancelled, spacesLeft, collectedToday, freePasses };
}

export function BookingMetricsSummary({ metrics }: { metrics: BookingMetrics }) {
  const cards: { label: string; value: string | number; color: string; hint?: string }[] = [
    { label: "Total Joined", value: metrics.totalJoined, color: "text-ink-lum", hint: "People who have a booking" },
    { label: "Confirmed", value: metrics.confirmed, color: "text-[#5fd7a3]", hint: "Paid and ready" },
    { label: "Waiting for Payment", value: metrics.waitingForPayment, color: "text-[#ffc46b]", hint: "Started but not paid yet" },
    { label: "Payment Problems", value: metrics.paymentProblems, color: "text-[#ff8f86]", hint: "Payment failed" },
    { label: "Waiting List", value: metrics.waitingList, color: "text-[#c4b5fd]", hint: "Waiting for a space" },
    { label: "Free Passes", value: metrics.freePasses, color: "text-[#9db4ff]", hint: "Complimentary entries" },
    { label: "Spaces Left", value: metrics.spacesLeft, color: metrics.spacesLeft === 0 ? "text-[#ff8f86]" : "text-ink-sec", hint: "Across all events" },
    { label: "Collected", value: inr(metrics.collectedToday), color: "text-[#5fd7a3]", hint: "From confirmed payments" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="glass rounded-xl p-3 border border-white/5 group relative">
          <span className="block text-[9px] text-ink-mut uppercase font-semibold tracking-wider">{c.label}</span>
          <span className={cn("text-lg font-bold block mt-0.5", c.color)}>{c.value}</span>
          {c.hint && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 text-[10px] text-ink-sec whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
              {c.hint}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* =================================================================
 * 6. BookingNextAction — Derives one clear next action
 * ================================================================= */

export function getBookingNextAction(booking: Booking): { label: string; actionKey: string; variant: "primary" | "warning" | "info" | "muted" } | null {
  const s = booking.status;
  if (s === "payment-pending" || s === "reserved") return { label: "Mark as Paid", actionKey: "confirm-payment", variant: "primary" };
  if (s === "payment-failed") return { label: "Retry Payment", actionKey: "retry-payment", variant: "warning" };
  if (s === "waitlisted" || s === "waitlist-joined") return { label: "Offer Space", actionKey: "offer-waitlist", variant: "info" };
  if (s === "waitlist-offered") return { label: "Accept Offer", actionKey: "accept-waitlist", variant: "primary" };
  if (s === "confirmed" && !booking.checkedIn) return { label: "View Booking", actionKey: "view", variant: "muted" };
  return null;
}

const actionVariantStyle: Record<string, string> = {
  primary: "bg-[#12b76a]/90 hover:bg-[#12b76a] text-white font-bold",
  warning: "bg-[#f04438]/80 hover:bg-[#f04438] text-white font-bold",
  info: "bg-[#7c3aed]/80 hover:bg-[#7c3aed] text-white font-bold",
  muted: "bg-white/5 hover:bg-white/10 text-ink-sec",
};

export function BookingPrimaryAction({
  booking,
  onAction,
  disabled,
  tooltip,
}: {
  booking: Booking;
  onAction: (actionKey: string, bookingId: string) => void;
  disabled?: boolean;
  tooltip?: string;
}) {
  const action = getBookingNextAction(booking);
  if (!action) return null;

  return (
    <span className="relative group inline-flex">
      <button
        onClick={() => onAction(action.actionKey, booking.id)}
        disabled={disabled}
        className={cn(
          "px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
          actionVariantStyle[action.variant]
        )}
      >
        {action.label}
      </button>
      {tooltip && disabled && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 text-[10px] text-ink-sec whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
          {tooltip}
        </span>
      )}
    </span>
  );
}

/* =================================================================
 * 7. PaymentCountdown
 * ================================================================= */

export function PaymentCountdown({ expiresAt }: { expiresAt?: string }) {
  const [timeLeft, setTimeLeft] = useState("--:--");

  useEffect(() => {
    // In prototype mode, show a static countdown since times are relative strings
    if (!expiresAt) {
      setTimeLeft("10:00");
      return;
    }
    // If the expiry is a date string, calculate. Otherwise show static.
    try {
      const expiry = new Date(expiresAt).getTime();
      if (isNaN(expiry)) {
        setTimeLeft("08:42");
        return;
      }
      const update = () => {
        const diff = Math.max(0, expiry - Date.now());
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
      };
      update();
      const interval = setInterval(update, 1000);
      return () => clearInterval(interval);
    } catch {
      setTimeLeft("08:42");
    }
  }, [expiresAt]);

  return (
    <div className="glass rounded-xl p-4 border border-[#f79009]/25 space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-[#ffc46b]" />
        <span className="text-xs font-bold text-[#ffc46b] uppercase tracking-wider">Time Left to Complete Payment</span>
      </div>
      <span className="text-3xl font-bold text-ink-lum font-mono tabular-nums">{timeLeft}</span>
      <p className="text-[11px] text-ink-mut">
        If payment is not completed, this space will become available again.
      </p>
    </div>
  );
}

/* =================================================================
 * 8. BookingTimeline — Visual timeline of booking stages
 * ================================================================= */

type TimelineStage = "completed" | "current" | "upcoming" | "problem";

interface TimelineStep {
  label: string;
  stage: TimelineStage;
  time?: string;
}

export function deriveBookingTimeline(booking: Booking): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const s = booking.status;
  const isWaitlist = s === "waitlisted" || s === "waitlist-joined" || s === "waitlist-offered" || s === "waitlist-promoted";

  // Step 1: Created
  steps.push({ label: "Booking Created", stage: "completed", time: booking.createdAt });

  if (isWaitlist) {
    steps.push({ label: "Added to Waiting List", stage: s === "waitlisted" || s === "waitlist-joined" ? "current" : "completed" });
    if (s === "waitlist-offered") {
      steps.push({ label: "Space Offered", stage: "current" });
    }
    if (s === "waitlist-promoted") {
      steps.push({ label: "Space Accepted", stage: "completed" });
      steps.push({ label: "Booking Confirmed", stage: "current" });
    }
    return steps;
  }

  // Step 2: Payment
  if (s === "payment-pending" || s === "reserved") {
    steps.push({ label: "Waiting for Payment", stage: "current" });
    steps.push({ label: "Payment Received", stage: "upcoming" });
    steps.push({ label: "Booking Confirmed", stage: "upcoming" });
    return steps;
  }

  if (s === "payment-failed") {
    steps.push({ label: "Payment Problem", stage: "problem" });
    return steps;
  }

  if (s === "reservation-expired") {
    steps.push({ label: "Booking Time Expired", stage: "problem" });
    return steps;
  }

  // Paid & beyond
  steps.push({ label: "Payment Received", stage: "completed", time: booking.confirmedAt });

  if (s === "cancelled" || s === "cancelled-user" || s === "cancelled-company") {
    steps.push({ label: "Cancelled", stage: "problem", time: booking.cancelledAt });
    return steps;
  }

  steps.push({ label: "Booking Confirmed", stage: s === "confirmed" && !booking.checkedIn ? "current" : "completed" });

  if (booking.checkedIn) {
    steps.push({ label: "Checked In", stage: s === "checked-in" ? "current" : "completed" });
  } else if (s === "confirmed") {
    steps.push({ label: "Checked In", stage: "upcoming" });
  }

  if (s === "completed") {
    steps.push({ label: "Completed", stage: "completed" });
  } else if ((s as string) !== "cancelled" && (s as string) !== "cancelled-user" && (s as string) !== "cancelled-company") {
    steps.push({ label: "Completed", stage: "upcoming" });
  }

  if (s === "refund-pending") {
    steps.push({ label: "Refund Pending", stage: "current" });
  }
  if (s === "refunded") {
    steps.push({ label: "Refunded", stage: "completed" });
  }

  return steps;
}

const stageStyles: Record<TimelineStage, { dot: string; line: string; text: string }> = {
  completed: { dot: "bg-[#12b76a] border-[#12b76a]/40", line: "bg-[#12b76a]/40", text: "text-ink-sec" },
  current: { dot: "bg-brand border-brand/40 ring-4 ring-brand/20 animate-pulse", line: "bg-white/10", text: "text-ink-lum font-bold" },
  upcoming: { dot: "bg-white/10 border-white/10", line: "bg-white/5", text: "text-ink-mut" },
  problem: { dot: "bg-[#f04438] border-[#f04438]/40", line: "bg-[#f04438]/20", text: "text-[#ff8f86] font-bold" },
};

export function BookingTimeline({ booking }: { booking: Booking }) {
  const steps = deriveBookingTimeline(booking);

  return (
    <div className="glass rounded-xl p-4 border border-white/5 space-y-0">
      {steps.map((step, i) => {
        const style = stageStyles[step.stage];
        const isLast = i === steps.length - 1;
        return (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={cn("h-3 w-3 rounded-full border-2 mt-0.5 shrink-0", style.dot)} />
              {!isLast && <div className={cn("w-0.5 h-6", style.line)} />}
            </div>
            <div className="pb-3">
              <span className={cn("text-xs block", style.text)}>{step.label}</span>
              {step.time && <span className="text-[10px] text-ink-mut">{step.time}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =================================================================
 * 9. BookingBackNavigation
 * ================================================================= */

export function BookingBackNavigation({
  label = "Back to Bookings",
  href = "/bookings",
  breadcrumbs,
}: {
  label?: string;
  href?: string;
  breadcrumbs?: { label: string; href: string }[];
}) {
  return (
    <div className="space-y-2">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-ink-mut">
          {breadcrumbs.map((bc, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span>/</span>}
              <Link href={bc.href} className="hover:text-ink-sec transition-colors font-semibold">
                {bc.label}
              </Link>
            </React.Fragment>
          ))}
        </div>
      )}
      <Link href={href}>
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-mut hover:text-ink-lum transition-colors bg-white/4 border border-white/5 px-3 py-1.5 rounded-lg">
          <ArrowLeft className="h-4 w-4" />
          {label}
        </button>
      </Link>
    </div>
  );
}

/* =================================================================
 * 10. BookingEmptyState
 * ================================================================= */

export function BookingEmptyState({
  title,
  message,
  actionLabel,
  actionHref,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="glass rounded-xl border border-white/5 p-8 text-center space-y-3">
      <div className="mx-auto w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
        <Users className="h-6 w-6 text-ink-mut" />
      </div>
      <h3 className="text-sm font-bold text-ink-lum">{title}</h3>
      <p className="text-xs text-ink-mut max-w-sm mx-auto">{message}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref}>
          <button className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-brand text-white hover:bg-brand-hover transition-colors">
            {actionLabel}
          </button>
        </Link>
      )}
    </div>
  );
}

/* =================================================================
 * 11. OperatorHintPanel — Contextual priorities from state
 * ================================================================= */

interface OperatorHint {
  icon: React.ReactNode;
  text: string;
  color: string;
}

export function deriveOperatorHints(state: PrototypeState): { hints: OperatorHint[]; recommendedAction: { label: string; href: string } | null } {
  const hints: OperatorHint[] = [];

  const waitingForPayment = state.bookings.filter((b) => b.reservationStatus === "active" || b.status === "reserved" || b.status === "payment-pending").length;
  const paymentProblems = state.bookings.filter((b) => b.status === "payment-failed" || b.paymentStatus === "failed").length;
  const pendingRefunds = (state.refunds ?? []).filter((r) => r.status === "requested" || r.status === "under-review").length;
  const waitlist = state.bookings.filter((b) => b.status === "waitlisted" || b.status === "waitlist-joined").length;

  // Almost full sessions
  const almostFull = state.sessions.filter((s) => {
    if (s.status === "cancelled" || s.status === "archived" || s.status === "completed") return false;
    const sessionBookings = state.bookings.filter((b) => b.sessionId === s.id && (b.status === "confirmed" || b.paymentStatus === "confirmed"));
    const max = s.maxParticipants || 10;
    return sessionBookings.length >= max * 0.85 && sessionBookings.length < max;
  });

  if (waitingForPayment > 0) {
    hints.push({ icon: <Clock className="h-4 w-4" />, text: `${waitingForPayment} booking${waitingForPayment > 1 ? "s are" : " is"} waiting for payment`, color: "text-[#ffc46b]" });
  }
  if (paymentProblems > 0) {
    hints.push({ icon: <AlertTriangle className="h-4 w-4" />, text: `${paymentProblems} payment problem${paymentProblems > 1 ? "s" : ""} need attention`, color: "text-[#ff8f86]" });
  }
  if (pendingRefunds > 0) {
    hints.push({ icon: <RefreshCw className="h-4 w-4" />, text: `${pendingRefunds} refund${pendingRefunds > 1 ? "s" : ""} need${pendingRefunds === 1 ? "s" : ""} review`, color: "text-[#ffc46b]" });
  }
  if (waitlist > 0) {
    hints.push({ icon: <Users className="h-4 w-4" />, text: `${waitlist} ${waitlist === 1 ? "person is" : "people are"} on the waiting list`, color: "text-[#c4b5fd]" });
  }
  for (const s of almostFull) {
    const name = s.templateId; // Will be resolved in the page
    hints.push({ icon: <AlertTriangle className="h-4 w-4" />, text: `An event is almost full`, color: "text-[#ffc46b]" });
    break; // Only show one
  }

  let recommendedAction: { label: string; href: string } | null = null;
  if (paymentProblems > 0) {
    recommendedAction = { label: "Review Payment Problems", href: "/bookings?tab=failures" };
  } else if (pendingRefunds > 0) {
    recommendedAction = { label: "Review Refunds", href: "/money/refunds" };
  } else if (waitingForPayment > 0) {
    recommendedAction = { label: "Review Bookings", href: "/bookings" };
  }

  return { hints, recommendedAction };
}

export function OperatorHintPanel({ state }: { state: PrototypeState }) {
  const { hints, recommendedAction } = useMemo(() => deriveOperatorHints(state), [state]);

  if (hints.length === 0) {
    return (
      <div className="glass rounded-xl p-4 border border-[#12b76a]/20 space-y-1">
        <div className="flex items-center gap-2 text-xs font-bold text-[#5fd7a3]">
          <CheckCircle className="h-4 w-4" />
          All Clear
        </div>
        <p className="text-[11px] text-ink-mut">No bookings need immediate attention.</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 border border-white/5 space-y-3">
      <span className="text-[10px] font-bold text-ink-mut uppercase tracking-wider">Today&apos;s Priority</span>
      <ul className="space-y-2">
        {hints.map((h, i) => (
          <li key={i} className={cn("flex items-center gap-2 text-xs", h.color)}>
            {h.icon}
            <span>{h.text}</span>
          </li>
        ))}
      </ul>
      {recommendedAction && (
        <div className="pt-2 border-t border-white/5">
          <span className="text-[10px] text-ink-mut block mb-1.5">Recommended action</span>
          <Link href={recommendedAction.href}>
            <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand-hover transition-colors">
              {recommendedAction.label}
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}

/* =================================================================
 * 12. RoleGate — Show disabled state with reason
 * ================================================================= */

export function RoleGate({
  allowedRoles,
  currentRole,
  children,
  tooltip,
}: {
  allowedRoles: string[];
  currentRole: string;
  children: React.ReactNode;
  tooltip?: string;
}) {
  const allowed = allowedRoles.includes(currentRole) || currentRole === "super-admin" || currentRole === "platform-owner";
  const defaultTooltip = `Requires ${allowedRoles.join(" or ")} role`;

  if (allowed) return <>{children}</>;

  return (
    <span className="relative group inline-flex">
      <span className="opacity-40 pointer-events-none">{children}</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 text-[10px] text-ink-sec whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
        {tooltip ?? defaultTooltip}
      </span>
    </span>
  );
}

/* =================================================================
 * 13. Booking Type Label
 * ================================================================= */

export function bookingTypeLabel(type?: string): string {
  switch (type) {
    case "individual": return "Customer Booking";
    case "group": return "Group Booking";
    case "complimentary": return "Free Pass";
    case "admin": return "Staff Added Booking";
    default: return "Customer Booking";
  }
}

export function bookingSourceLabel(source?: string): string {
  switch (source) {
    case "customer-app": return "App";
    case "admin": return "Staff";
    case "complimentary": return "Free Pass";
    case "waitlist-promotion": return "Waiting List";
    case "campaign": return "Campaign";
    default: return "App";
  }
}

/* =================================================================
 * 14. Prototype Mode Banner
 * ================================================================= */

export function PrototypeModeBanner({ message }: { message?: string }) {
  return (
    <div className="rounded-lg bg-white/3 border border-white/5 px-3 py-2 text-[10px] text-ink-mut text-center">
      {message ?? "Payment simulation — no payment provider is connected. · Prototype role simulation — not production authorization."}
    </div>
  );
}
