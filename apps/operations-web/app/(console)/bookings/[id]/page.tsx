"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CircleCheck, CircleDot, CircleX, Clock, ReceiptIndianRupee, RotateCcw } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { PermissionDenied } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import type { Refund } from "@/lib/prototype/entities";
import { sessionTitle, venueName } from "@/lib/prototype/selectors/lookups";
import { bookingRefundTotals, paymentMethodLabel } from "@/lib/prototype/selectors/money";
import { canonicalBookingStatus, CANCELLABLE_STATUSES, seatClass } from "@/lib/prototype/selectors/status";
import { REFUND_APPROVER_ROLES } from "@/lib/prototype/services/money";
import {
  BookingStatusChip,
  Breadcrumbs,
  Countdown,
  KeyValues,
  NotFoundCard,
  PageFrame,
  PaymentStatusChip,
  ProviderNotice,
  RefundStatusChip,
  Section,
  bookingSourceLabel,
  bookingTypeLabel,
  formatWhen,
  refundTypeLabel,
  whenMillis,
} from "@/components/bookings/shared";
import {
  ApproveRefundDialog,
  CancelBookingDialog,
  ConfirmDialog,
  PayoutDialog,
  ReasonDialog,
  RecordPaymentDialog,
  RefundRequestDialog,
} from "@/components/bookings/dialogs";

type Modal = "pay" | "fail" | "release" | "withdraw" | "cancel" | "refund" | null;

interface TimelineEvent {
  at?: string;
  title: string;
  detail?: string;
  tone: "ok" | "warn" | "danger" | "info";
}

export default function BookingDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const toast = useToast();
  const { state, role, canAccess, failBookingPayment, expireReservation, expireWaitlistOffer, acceptWaitlistOffer, rejectRefund } = useStore();
  const [modal, setModal] = useState<Modal>(null);
  const [approving, setApproving] = useState<Refund>();
  const [payingOut, setPayingOut] = useState<Refund>();
  const [rejecting, setRejecting] = useState<Refund>();

  const booking = useMemo(() => state.bookings.find((b) => b.id === id), [state.bookings, id]);
  const session = useMemo(() => (booking ? state.sessions.find((s) => s.id === booking.sessionId) : undefined), [state.sessions, booking]);
  const payments = useMemo(() => (state.payments ?? []).filter((p) => p.bookingId === id), [state.payments, id]);
  const refunds = useMemo(() => (state.refunds ?? []).filter((r) => r.bookingId === id), [state.refunds, id]);
  const totals = useMemo(() => bookingRefundTotals(state, id), [state, id]);
  const opName = (opId?: string) => (!opId ? "—" : opId === "customer" ? "Customer app" : opId === "system" ? "System" : state.operators.find((o) => o.id === opId)?.name ?? opId);

  const timeline = useMemo<TimelineEvent[]>(() => {
    if (!booking) return [];
    const ev: TimelineEvent[] = [
      { at: booking.createdAt, title: canonicalBookingStatus(booking.status) === "waitlisted" || booking.waitlistOrder ? "Joined the waitlist" : "Booking created", detail: `By ${opName(booking.createdBy)}`, tone: "info" },
    ];
    if (booking.waitlistOfferedAt) ev.push({ at: booking.waitlistOfferedAt, title: "Seat offered from the waitlist", detail: booking.waitlistOfferExpiresAt ? `Offer open until ${formatWhen(booking.waitlistOfferExpiresAt)}` : undefined, tone: "info" });
    for (const p of payments) {
      if (p.confirmedAt) ev.push({ at: p.confirmedAt, title: `Payment received · ${inr(p.amount)}`, detail: `${paymentMethodLabel(p.paymentMethod)} · reference ${p.providerReference ?? "not recorded"}${p.confirmedBy ? ` · recorded by ${opName(p.confirmedBy)}` : ""}`, tone: "ok" });
      if (p.failedAt) ev.push({ at: p.failedAt, title: "Payment failed", detail: p.failureReason, tone: "danger" });
      if (p.status === "cancelled") ev.push({ at: p.cancelledAt ?? p.updatedAt, title: "Unpaid payment closed", detail: p.failureReason, tone: "warn" });
      if (p.status === "reconciled") ev.push({ at: p.updatedAt, title: "Payment verified against the statement", tone: "ok" });
    }
    if (booking.cancelledAt) ev.push({ at: booking.cancelledAt, title: canonicalBookingStatus(booking.status) === "cancelled-company" ? "Cancelled by us" : "Cancelled", detail: `${booking.cancellationReason ?? ""}${booking.cancelledBy ? ` · by ${opName(booking.cancelledBy)}` : ""}`, tone: "danger" });
    for (const r of refunds) {
      ev.push({ at: r.requestedAt, title: `Refund requested · ${inr(r.amount)}`, detail: r.reason, tone: "warn" });
      if (r.approvedAt) ev.push({ at: r.approvedAt, title: "Refund approved", detail: r.approvedBy ? `By ${opName(r.approvedBy)}` : undefined, tone: "info" });
      if (r.completedAt) ev.push({ at: r.completedAt, title: `Refund paid out · ${inr(r.amount)}`, detail: `${paymentMethodLabel(r.payoutMethod)} · reference ${r.payoutReference ?? "—"}`, tone: "ok" });
      if (r.status === "rejected") ev.push({ at: r.rejectedAt ?? r.updatedAt, title: "Refund rejected", detail: r.failureReason, tone: "danger" });
    }
    return ev.sort((a, b) => whenMillis(a.at) - whenMillis(b.at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, payments, refunds, state.operators]);

  if (!canAccess("/bookings")) return <PermissionDenied module="Bookings" />;

  if (!booking) {
    return (
      <PageFrame narrow>
        <Breadcrumbs items={[{ label: "Bookings", href: "/bookings" }, { label: "Not found" }]} />
        <NotFoundCard title="Booking not found" line={`There is no booking with the id “${id}”. It may have been created in another workspace.`} backHref="/bookings" backLabel="Back to bookings" />
      </PageFrame>
    );
  }

  const status = canonicalBookingStatus(booking.status);
  const cls = seatClass(booking);
  const canApprove = REFUND_APPROVER_ROLES.has(role.id);
  const canCancel = CANCELLABLE_STATUSES.has(status) && !booking.checkedIn;
  const canTakePaymentAgain = status === "payment-failed" || status === "reservation-expired";
  const title = sessionTitle(state, booking.sessionId);

  const accept = () => {
    const out = acceptWaitlistOffer(booking.id);
    if (out.error) toast.error("Offer not accepted", out.error);
    else toast.success("Offer accepted", `${booking.alias}'s seat is held for 15 minutes while the payment is recorded.`);
  };

  return (
    <PageFrame narrow>
      <Breadcrumbs items={[{ label: "Bookings", href: "/bookings" }, { label: booking.bookingCode ?? booking.id }]} />
      <PageHeader
        overline={`Booking · ${booking.bookingCode ?? booking.id}`}
        title={booking.alias}
        sub={`${title}${session ? ` · ${session.date} ${session.startTime} · ${venueName(state, session.venueId)}` : ""}`}
        right={
          <>
            <BookingStatusChip status={booking.status} checkedIn={booking.checkedIn} />
            {booking.bookingType !== "complimentary" && status !== "payment-pending" && <PaymentStatusChip status={booking.paymentStatus} />}
          </>
        }
      />

      {cls === "hold" && (
        <div className="flex flex-col gap-4 rounded-panel border border-amber-200 bg-amber-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-semibold text-amber-900">
              <Clock className="h-4 w-4" aria-hidden /> Seat held while payment is recorded
            </p>
            <p className="mt-1 text-sm text-amber-800">If no payment is recorded before the hold runs out, the seat is released and offered to the waitlist.</p>
            <Countdown expiresAt={booking.reservationExpiresAt} label="Time left" className="mt-2" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="success" onClick={() => setModal("pay")}>
              <ReceiptIndianRupee className="h-4 w-4" /> Record payment
            </Button>
            <Button variant="secondary" onClick={() => setModal("fail")}>
              Payment failed
            </Button>
            <Button variant="ghost" onClick={() => setModal("release")}>
              Release seat
            </Button>
          </div>
        </div>
      )}

      {cls === "offer" && (
        <div className="flex flex-col gap-4 rounded-panel border border-violet-200 bg-violet-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-violet-900">A seat is being offered to {booking.alias}</p>
            <p className="mt-1 text-sm text-violet-800">When they accept, the seat is held for 15 minutes for payment. If the offer runs out, the next person in the queue gets it.</p>
            <Countdown expiresAt={booking.waitlistOfferExpiresAt} label="Offer ends in" className="mt-2" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={accept}>Accept offer</Button>
            <Button variant="secondary" onClick={() => setModal("withdraw")}>
              Withdraw offer
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Section title="Booking details">
            <KeyValues
              rows={[
                ["Session", session ? <Link key="s" href={`/missions/${session.id}/bookings`} className="text-brand hover:underline">{title}</Link> : "Session removed"],
                ["When", session ? `${session.date} · ${session.startTime}` : "—"],
                ["Booking type", bookingTypeLabel(booking.bookingType)],
                ["Source", bookingSourceLabel(booking.source)],
                ["Phone", booking.phoneMask || "—"],
                ["Created", `${formatWhen(booking.createdAt)} · ${opName(booking.createdBy)}`],
                ...(cls === "waitlist" || cls === "offer" ? ([["Waitlist order", `#${booking.waitlistOrder ?? "—"}`]] as Array<[string, string]>) : []),
                ...(booking.tempId ? ([["Temporary ID", <span key="t" className="font-mono text-xs">{booking.tempId}</span>]] as Array<[string, ReactNode]>) : []),
                ...(booking.team ? ([["Team", booking.team]] as Array<[string, string]>) : []),
                ["Checked in", booking.checkedIn ? "Yes" : "No"],
                ["Seat", cls === "none" || cls === "waitlist" ? "Does not hold a seat" : cls === "hold" ? "Held for payment" : cls === "offer" ? "Held for the offer" : "Holds one seat"],
              ]}
            />
          </Section>

          <Section title="History" sub="Every change to this booking, oldest first">
            <ol className="space-y-4">
              {timeline.map((e, i) => {
                const Icon = e.tone === "ok" ? CircleCheck : e.tone === "danger" ? CircleX : e.tone === "warn" ? RotateCcw : CircleDot;
                return (
                  <li key={i} className="flex gap-3">
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", e.tone === "ok" ? "text-emerald-600" : e.tone === "danger" ? "text-red-600" : e.tone === "warn" ? "text-amber-600" : "text-sky-600")} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-lum">{e.title}</p>
                      <p className="text-xs text-ink-mut">
                        {formatWhen(e.at)}
                        {e.detail ? ` · ${e.detail}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Money">
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-bg-sunken px-2 py-3">
                <dt className="text-[11px] text-ink-mut">Price</dt>
                <dd className="font-display text-lg font-bold tabular text-ink-lum">{booking.bookingType === "complimentary" ? "Free" : inr(booking.amount)}</dd>
              </div>
              <div className="rounded-xl bg-bg-sunken px-2 py-3">
                <dt className="text-[11px] text-ink-mut">Paid</dt>
                <dd className="font-display text-lg font-bold tabular text-emerald-700">{inr(totals.paid)}</dd>
              </div>
              <div className="rounded-xl bg-bg-sunken px-2 py-3">
                <dt className="text-[11px] text-ink-mut">Refunded</dt>
                <dd className="font-display text-lg font-bold tabular text-sky-700">{inr(totals.completed)}</dd>
              </div>
            </dl>
            {(totals.awaitingApproval > 0 || totals.awaitingPayout > 0) && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {totals.awaitingApproval > 0 && `${inr(totals.awaitingApproval)} waiting for approval. `}
                {totals.awaitingPayout > 0 && `${inr(totals.awaitingPayout)} approved, waiting to be paid out.`}
              </p>
            )}

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-mut">Payments</h3>
            <ul className="mt-2 divide-y divide-slate-100">
              {payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink-lum">{inr(p.amount)} · {p.paymentMethod ? paymentMethodLabel(p.paymentMethod) : "not paid yet"}</p>
                    <p className="truncate text-xs text-ink-mut">
                      {p.providerReference ? <span className="font-mono">{p.providerReference}</span> : "No reference yet"} · {formatWhen(p.confirmedAt ?? p.failedAt ?? p.initiatedAt)}
                    </p>
                  </div>
                  <PaymentStatusChip status={p.status} />
                </li>
              ))}
              {payments.length === 0 && <li className="py-2.5 text-sm text-ink-mut">{booking.bookingType === "complimentary" ? "Free pass — no payment needed." : "No payment has been started."}</li>}
            </ul>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-mut">Refunds</h3>
            <ul className="mt-2 divide-y divide-slate-100">
              {refunds.map((r) => (
                <li key={r.id} className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-ink-lum">{inr(r.amount)} · {refundTypeLabel(r.type)}</p>
                      <p className="text-xs text-ink-mut">{r.reason}</p>
                      {r.payoutReference && <p className="text-xs text-ink-mut">Paid via {paymentMethodLabel(r.payoutMethod)} · <span className="font-mono">{r.payoutReference}</span></p>}
                      {r.status === "rejected" && r.failureReason && <p className="text-xs text-red-600">Rejected: {r.failureReason}</p>}
                    </div>
                    <RefundStatusChip status={r.status} />
                  </div>
                  {canApprove && (r.status === "requested" || r.status === "under-review") && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="success" onClick={() => setApproving(r)}>Approve</Button>
                      <Button size="sm" variant="secondary" onClick={() => setRejecting(r)}>Reject</Button>
                    </div>
                  )}
                  {canApprove && (r.status === "approved" || r.status === "processing") && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="success" onClick={() => setPayingOut(r)}>Record payout</Button>
                      <Button size="sm" variant="secondary" onClick={() => setRejecting(r)}>Reject</Button>
                    </div>
                  )}
                </li>
              ))}
              {refunds.length === 0 && <li className="py-2.5 text-sm text-ink-mut">No refunds.</li>}
            </ul>
            {!canApprove && refunds.some((r) => ["requested", "under-review", "approved", "processing"].includes(r.status)) && (
              <p className="mt-2 text-xs text-ink-mut">Finance approves and pays out refunds.</p>
            )}
          </Section>

          <Section title="Actions">
            <div className="flex flex-col gap-2">
              {canTakePaymentAgain && (
                <Button variant="success" onClick={() => setModal("pay")}>
                  <ReceiptIndianRupee className="h-4 w-4" /> Take payment again
                </Button>
              )}
              {totals.refundable > 0 && (
                <Button variant="secondary" onClick={() => setModal("refund")}>
                  Request a refund
                </Button>
              )}
              {canCancel && (
                <Button variant="danger" onClick={() => setModal("cancel")}>
                  {cls === "waitlist" || cls === "offer" ? "Remove from waitlist" : "Cancel booking"}
                </Button>
              )}
              {!canTakePaymentAgain && totals.refundable <= 0 && !canCancel && <p className="text-sm text-ink-mut">No further actions for this booking.</p>}
              {booking.checkedIn && <p className="text-xs text-ink-mut">Checked-in bookings can&apos;t be cancelled; request a refund instead.</p>}
            </div>
          </Section>
          <ProviderNotice />
        </div>
      </div>

      <RecordPaymentDialog booking={booking} open={modal === "pay"} onClose={() => setModal(null)} />
      <CancelBookingDialog booking={booking} open={modal === "cancel"} onClose={() => setModal(null)} />
      <RefundRequestDialog booking={booking} open={modal === "refund"} onClose={() => setModal(null)} />
      <ReasonDialog
        open={modal === "fail"}
        onClose={() => setModal(null)}
        title="Record a failed payment?"
        description={<>The seat held for {booking.alias} is released and offered to the waitlist. Say what went wrong so the team can follow up.</>}
        placeholder="e.g. UPI collect request declined"
        minLength={3}
        confirmLabel="Mark payment failed"
        onConfirm={(reason) => failBookingPayment(booking.id, reason)}
        successTitle="Payment marked as failed"
        successDetail="The seat was released."
      />
      <ConfirmDialog
        open={modal === "release"}
        onClose={() => setModal(null)}
        title="Release this seat now?"
        confirmLabel="Release seat"
        variant="warning"
        onConfirm={() => expireReservation(booking.id)}
        successTitle="Seat released"
        successDetail="The hold was closed and the seat offered to the waitlist."
      >
        The hold for {booking.alias} ends immediately, the unpaid payment is closed and the seat goes to the next person waiting.
      </ConfirmDialog>
      <ConfirmDialog
        open={modal === "withdraw"}
        onClose={() => setModal(null)}
        title="Withdraw this seat offer?"
        confirmLabel="Withdraw offer"
        onConfirm={() => expireWaitlistOffer(booking.id)}
        successTitle="Offer withdrawn"
        successDetail="The seat was offered to the next person in the queue."
      >
        {booking.alias} loses the offered seat and it passes to the next person on the waitlist.
      </ConfirmDialog>
      <ApproveRefundDialog refund={approving} open={Boolean(approving)} onClose={() => setApproving(undefined)} />
      <PayoutDialog refund={payingOut} open={Boolean(payingOut)} onClose={() => setPayingOut(undefined)} />
      <ReasonDialog
        open={Boolean(rejecting)}
        onClose={() => setRejecting(undefined)}
        title="Reject this refund?"
        description={<>The {rejecting ? inr(rejecting.amount) : ""} refund will not be paid. The customer keeps their current booking status.</>}
        placeholder="e.g. Cancelled after the 24-hour refund window"
        confirmLabel="Reject refund"
        onConfirm={(reason) => (rejecting ? rejectRefund(rejecting.id, reason) : undefined)}
        successTitle="Refund rejected"
      />
    </PageFrame>
  );
}
