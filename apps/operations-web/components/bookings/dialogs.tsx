"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, inr } from "@/lib/format";
import { Dialog } from "@/components/ui/overlays";
import { Button } from "@/components/ui/primitives";
import { Input, Select } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";
import type { Booking, Refund, RefundException } from "@/lib/prototype/entities";
import { PAYMENT_METHODS, bookingRefundTotals, type PaymentMethodId } from "@/lib/prototype/selectors/money";
import { occupiesSeat } from "@/lib/prototype/selectors/status";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { refundTypeLabel } from "./shared";

/* ------------------------------ form bits ------------------------------ */

export function FormField({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-sec">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-mut">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextArea({ id, value, onChange, placeholder, invalid, rows = 3 }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean; rows?: number }) {
  return (
    <textarea
      id={id}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      className={cn("field w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-ink-lum placeholder:text-slate-400", invalid && "border-red-300 ring-2 ring-red-100")}
    />
  );
}

function ServerError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {message}
    </p>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 pt-2">{children}</div>;
}

/** Reset local form state every time a dialog opens. */
function useOnOpen(open: boolean, reset: () => void) {
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

function MethodSelect({ id, value, onChange }: { id: string; value: PaymentMethodId; onChange: (v: PaymentMethodId) => void }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value as PaymentMethodId)}>
      {PAYMENT_METHODS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </Select>
  );
}

const referenceError = (v: string) => (v.trim().length < 3 ? "Enter the reference (receipt number, UTR or POS slip), at least 3 characters." : undefined);

/* --------------------------- record a payment --------------------------- */

export function RecordPaymentDialog({ booking, open, onClose }: { booking?: Booking; open: boolean; onClose: () => void }) {
  const { confirmBookingPayment } = useStore();
  const toast = useToast();
  const id = useId();
  const [method, setMethod] = useState<PaymentMethodId>("upi");
  const [reference, setReference] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string>();
  useOnOpen(open, () => {
    setMethod("upi");
    setReference("");
    setTouched(false);
    setServerError(undefined);
  });
  if (!booking) return null;
  const refErr = referenceError(reference);

  const submit = () => {
    setTouched(true);
    if (refErr) return;
    const out = confirmBookingPayment(booking.id, { method, reference: reference.trim() });
    if (out.error) {
      setServerError(out.error);
      toast.error("Payment not recorded", out.error);
      return;
    }
    toast.success("Payment recorded", `${booking.alias} is confirmed · reference ${reference.trim()}`);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Record payment">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-sm text-ink-sec">
          Confirm that <span className="font-semibold text-ink-lum">{inr(booking.amount)}</span> was received from{" "}
          <span className="font-semibold text-ink-lum">{booking.alias}</span>. The payment provider is not connected, so record how it was paid and its reference.
        </p>
        <FormField label="Payment method" htmlFor={`${id}-m`}>
          <MethodSelect id={`${id}-m`} value={method} onChange={setMethod} />
        </FormField>
        <FormField label="Reference" htmlFor={`${id}-r`} error={touched ? refErr : undefined} hint={method === "cash" ? "Receipt number from the cash book." : "UTR, POS slip or bank reference."}>
          <Input id={`${id}-r`} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "upi" ? "e.g. UTR 4018 8231 0977" : "e.g. POS-771204"} autoFocus aria-invalid={Boolean(touched && refErr) || undefined} />
        </FormField>
        <ServerError message={serverError} />
        <Actions>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="success">
            Record payment
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}

/* --------------------------- generic reason --------------------------- */

export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  label = "Reason",
  placeholder,
  confirmLabel,
  variant = "danger",
  minLength = 5,
  onConfirm,
  successTitle,
  successDetail,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  label?: string;
  placeholder?: string;
  confirmLabel: string;
  variant?: "danger" | "warning" | "primary";
  minLength?: number;
  onConfirm: (reason: string) => { error?: string } | undefined;
  successTitle: string;
  successDetail?: string;
}) {
  const toast = useToast();
  const id = useId();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string>();
  useOnOpen(open, () => {
    setReason("");
    setTouched(false);
    setServerError(undefined);
  });
  const err = reason.trim().length < minLength ? `Write at least ${minLength} characters.` : undefined;
  const submit = () => {
    setTouched(true);
    if (err) return;
    const out = onConfirm(reason.trim());
    if (out?.error) {
      setServerError(out.error);
      toast.error("Action not completed", out.error);
      return;
    }
    toast.success(successTitle, successDetail);
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="text-sm leading-6 text-ink-sec">{description}</div>
        <FormField label={label} htmlFor={`${id}-reason`} error={touched ? err : undefined}>
          <TextArea id={`${id}-reason`} value={reason} onChange={setReason} placeholder={placeholder} invalid={Boolean(touched && err)} />
        </FormField>
        <ServerError message={serverError} />
        <Actions>
          <Button variant="secondary" onClick={onClose}>
            Keep as is
          </Button>
          <Button type="submit" variant={variant}>
            {confirmLabel}
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}

/* --------------------------- cancel a booking --------------------------- */

export function CancelBookingDialog({ booking, open, onClose }: { booking?: Booking; open: boolean; onClose: () => void }) {
  const { state, cancelBooking } = useStore();
  const toast = useToast();
  const id = useId();
  const [reason, setReason] = useState("");
  const [byCompany, setByCompany] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string>();
  useOnOpen(open, () => {
    setReason("");
    setByCompany(false);
    setTouched(false);
    setServerError(undefined);
  });
  const totals = useMemo(() => (booking ? bookingRefundTotals(state, booking.id) : undefined), [state, booking]);
  if (!booking || !totals) return null;
  const err = reason.trim().length < 5 ? "Give a reason of at least 5 characters." : undefined;
  const isWaitlist = booking.status === "waitlisted" || booking.status === "waitlist-offered";

  const submit = () => {
    setTouched(true);
    if (err) return;
    const out = cancelBooking(booking.id, reason.trim(), byCompany);
    if (out.error) {
      setServerError(out.error);
      toast.error("Booking not cancelled", out.error);
      return;
    }
    toast.success(isWaitlist ? "Removed from the waitlist" : "Booking cancelled", out.refundId ? `Refund request of ${inr(totals.refundable)} sent to Finance for approval.` : undefined);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={isWaitlist ? "Remove from waitlist?" : "Cancel this booking?"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <ul className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {occupiesSeat(booking) && <li>• The seat is released and offered to the next person on the waitlist.</li>}
          {totals.refundable > 0 && <li>• A refund request of {inr(totals.refundable)} is created for Finance to approve and pay out.</li>}
          {booking.status === "payment-pending" && <li>• The unpaid payment is cancelled.</li>}
          {isWaitlist && <li>• {booking.alias} leaves the waitlist.</li>}
          <li>• This can&apos;t be undone — a new booking would be needed.</li>
        </ul>
        <FormField label="Reason" htmlFor={`${id}-reason`} error={touched ? err : undefined}>
          <TextArea id={`${id}-reason`} value={reason} onChange={setReason} placeholder="e.g. Customer called to cancel — travelling that day" invalid={Boolean(touched && err)} />
        </FormField>
        {!isWaitlist && (
          <label className="flex items-start gap-2.5 text-sm text-ink-sec">
            <input type="checkbox" checked={byCompany} onChange={(e) => setByCompany(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-edge-strong accent-brand" />
            <span>
              Cancelled by us (venue, weather or operations issue)
              <span className="block text-xs text-ink-mut">Leave unticked when the customer asked to cancel.</span>
            </span>
          </label>
        )}
        <ServerError message={serverError} />
        <Actions>
          <Button variant="secondary" onClick={onClose}>
            Keep booking
          </Button>
          <Button type="submit" variant="danger">
            {isWaitlist ? "Remove from waitlist" : "Cancel booking"}
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}

/* --------------------------- request a refund --------------------------- */

export function RefundRequestDialog({ booking, open, onClose }: { booking?: Booking; open: boolean; onClose: () => void }) {
  const { state, initiateRefund } = useStore();
  const toast = useToast();
  const id = useId();
  const totals = useMemo(() => (booking ? bookingRefundTotals(state, booking.id) : undefined), [state, booking]);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string>();
  useOnOpen(open, () => {
    setAmount(totals ? String(totals.refundable) : "");
    setReason("");
    setTouched(false);
    setServerError(undefined);
  });
  if (!booking || !totals) return null;
  const n = Number(amount);
  const amountErr =
    !amount.trim() || !Number.isFinite(n) || n <= 0 ? "Enter an amount greater than zero."
    : !Number.isInteger(n) ? "Use whole rupees."
    : n > totals.refundable ? `At most ${inr(totals.refundable)} can still be refunded.`
    : undefined;
  const reasonErr = reason.trim().length < 5 ? "Give a reason of at least 5 characters." : undefined;

  const submit = () => {
    setTouched(true);
    if (amountErr || reasonErr) return;
    const out = initiateRefund({ bookingId: booking.id, amount: n, reason: reason.trim() });
    if (out.error) {
      setServerError(out.error);
      toast.error("Refund not requested", out.error);
      return;
    }
    toast.success("Refund requested", `${inr(n)} for ${booking.alias} is waiting for Finance approval.`);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Request a refund">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <dl className="grid grid-cols-3 gap-2 rounded-xl bg-bg-sunken p-3 text-center text-xs">
          <div>
            <dt className="text-ink-mut">Paid</dt>
            <dd className="font-display text-base font-bold tabular text-ink-lum">{inr(totals.paid)}</dd>
          </div>
          <div>
            <dt className="text-ink-mut">Refunded or in progress</dt>
            <dd className="font-display text-base font-bold tabular text-ink-lum">{inr(totals.committed)}</dd>
          </div>
          <div>
            <dt className="text-ink-mut">Can still refund</dt>
            <dd className="font-display text-base font-bold tabular text-emerald-700">{inr(totals.refundable)}</dd>
          </div>
        </dl>
        <FormField label="Amount (₹)" htmlFor={`${id}-amt`} error={touched ? amountErr : undefined} hint="The booking stays active. To give up the seat, cancel the booking instead.">
          <Input id={`${id}-amt`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} aria-invalid={Boolean(touched && amountErr) || undefined} />
        </FormField>
        <FormField label="Reason" htmlFor={`${id}-reason`} error={touched ? reasonErr : undefined}>
          <TextArea id={`${id}-reason`} value={reason} onChange={setReason} placeholder="e.g. Session started 40 minutes late — partial goodwill refund" invalid={Boolean(touched && reasonErr)} />
        </FormField>
        <ServerError message={serverError} />
        <Actions>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Request refund</Button>
        </Actions>
      </form>
    </Dialog>
  );
}

/* --------------------------- approve / pay out --------------------------- */

export function ApproveRefundDialog({ refund, open, onClose }: { refund?: Refund; open: boolean; onClose: () => void }) {
  const { state, approveRefund } = useStore();
  const toast = useToast();
  const [serverError, setServerError] = useState<string>();
  useOnOpen(open, () => setServerError(undefined));
  if (!refund) return null;
  const booking = state.bookings.find((b) => b.id === refund.bookingId);
  const totals = bookingRefundTotals(state, refund.bookingId, refund.id);
  const submit = () => {
    const out = approveRefund(refund.id);
    if (out.error) {
      setServerError(out.error);
      toast.error("Refund not approved", out.error);
      return;
    }
    toast.success("Refund approved", `Pay ${inr(refund.amount)} out to ${booking?.alias ?? "the customer"}, then record the payout reference.`);
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Approve refund?">
      <div className="space-y-4">
        <p className="text-sm text-ink-sec">
          Approve <span className="font-semibold text-ink-lum">{inr(refund.amount)}</span> ({refundTypeLabel(refund.type).toLowerCase()}) for{" "}
          <span className="font-semibold text-ink-lum">{booking?.alias ?? refund.bookingId}</span> — {sessionTitle(state, refund.sessionId)}.
        </p>
        <p className="rounded-xl bg-bg-sunken px-3 py-2 text-xs text-ink-mut">
          {inr(totals.paid)} was paid; {inr(totals.committed)} is already refunded or in progress on other requests. Approval does not move money — record the payout once it has been sent.
        </p>
        <p className="text-sm text-ink-sec">
          <span className="font-medium text-ink-lum">Reason given:</span> {refund.reason}
        </p>
        <ServerError message={serverError} />
        <Actions>
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button variant="success" onClick={submit}>
            Approve {inr(refund.amount)}
          </Button>
        </Actions>
      </div>
    </Dialog>
  );
}

export function PayoutDialog({ refund, open, onClose }: { refund?: Refund; open: boolean; onClose: () => void }) {
  const { state, completeRefund } = useStore();
  const toast = useToast();
  const id = useId();
  const [method, setMethod] = useState<PaymentMethodId>("upi");
  const [reference, setReference] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string>();
  useOnOpen(open, () => {
    const paidWith = (state.payments ?? []).find((p) => p.id === refund?.paymentId)?.paymentMethod;
    setMethod((PAYMENT_METHODS.some((m) => m.id === paidWith) ? paidWith : "upi") as PaymentMethodId);
    setReference("");
    setTouched(false);
    setServerError(undefined);
  });
  if (!refund) return null;
  const booking = state.bookings.find((b) => b.id === refund.bookingId);
  const refErr = referenceError(reference);
  const submit = () => {
    setTouched(true);
    if (refErr) return;
    const out = completeRefund(refund.id, { method, reference: reference.trim() });
    if (out.error) {
      setServerError(out.error);
      toast.error("Payout not recorded", out.error);
      return;
    }
    toast.success("Refund paid out", `${inr(refund.amount)} to ${booking?.alias ?? "the customer"} · reference ${reference.trim()}`);
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Record refund payout">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-sm text-ink-sec">
          Send <span className="font-semibold text-ink-lum">{inr(refund.amount)}</span> to <span className="font-semibold text-ink-lum">{booking?.alias ?? refund.bookingId}</span> from your bank or UPI
          app, then record it here. This marks the refund as paid out and can only be done once.
        </p>
        <FormField label="Paid out via" htmlFor={`${id}-m`}>
          <MethodSelect id={`${id}-m`} value={method} onChange={setMethod} />
        </FormField>
        <FormField label="Payout reference" htmlFor={`${id}-r`} error={touched ? refErr : undefined} hint="UTR, bank transfer reference or cash receipt number.">
          <Input id={`${id}-r`} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UTR 8841 2057 3311" autoFocus aria-invalid={Boolean(touched && refErr) || undefined} />
        </FormField>
        <ServerError message={serverError} />
        <Actions>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="success">
            Mark as paid out
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}

/* --------------------------- exception approval --------------------------- */

export function ApproveExceptionDialog({ exception, open, onClose }: { exception?: RefundException; open: boolean; onClose: () => void }) {
  const { state, approveRefundException } = useStore();
  const toast = useToast();
  const id = useId();
  const [bookingId, setBookingId] = useState("");
  const [serverError, setServerError] = useState<string>();
  useOnOpen(open, () => {
    setBookingId(exception?.bookingId ?? "");
    setServerError(undefined);
  });
  const candidates = useMemo(() => {
    if (!exception || exception.bookingId) return [];
    return state.bookings
      .filter((b) => !exception.sessionId || b.sessionId === exception.sessionId)
      .map((b) => ({ b, totals: bookingRefundTotals(state, b.id) }))
      .filter((x) => x.totals.paid > 0);
  }, [state, exception]);
  if (!exception) return null;
  const linked = state.bookings.find((b) => b.id === (exception.bookingId ?? bookingId));
  const totals = linked ? bookingRefundTotals(state, linked.id) : undefined;
  const tooMuch = totals ? exception.amount > totals.refundable : false;

  const submit = () => {
    const out = approveRefundException(exception.id, exception.bookingId ? undefined : bookingId || undefined);
    if (out.error) {
      setServerError(out.error);
      toast.error("Exception not approved", out.error);
      return;
    }
    toast.success("Exception approved", `Refund of ${inr(exception.amount)} is ready to be paid out.`);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Approve exception refund?">
      <div className="space-y-4">
        <p className="text-sm text-ink-sec">
          Approving creates an approved refund of <span className="font-semibold text-ink-lum">{inr(exception.amount)}</span>. It is checked against everything already refunded on the booking, and
          is paid out separately.
        </p>
        {!exception.bookingId && (
          <FormField label="Booking to refund" htmlFor={`${id}-b`} hint={candidates.length ? "This exception was raised without a booking. Choose the paid booking it is for." : undefined}>
            {candidates.length ? (
              <Select id={`${id}-b`} value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
                <option value="">Choose a booking…</option>
                {candidates.map(({ b, totals: t }) => (
                  <option key={b.id} value={b.id}>
                    {b.alias} · {b.bookingCode ?? b.id} · {inr(t.refundable)} refundable
                  </option>
                ))}
              </Select>
            ) : (
              <p className="rounded-xl bg-bg-sunken px-3 py-2 text-sm text-ink-mut">No paid bookings found for this session.</p>
            )}
          </FormField>
        )}
        {linked && totals && (
          <p className={cn("rounded-xl px-3 py-2 text-xs", tooMuch ? "bg-red-50 text-red-700" : "bg-bg-sunken text-ink-mut")}>
            {linked.alias}: {inr(totals.paid)} paid · {inr(totals.committed)} refunded or in progress · {inr(totals.refundable)} can still be refunded.
            {tooMuch && " This exception is larger than what can still be refunded and will be refused."}
          </p>
        )}
        <ServerError message={serverError} />
        <Actions>
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button variant="success" onClick={submit} disabled={!exception.bookingId && !bookingId}>
            Approve {inr(exception.amount)}
          </Button>
        </Actions>
      </div>
    </Dialog>
  );
}

/* --------------------------- simple confirmation --------------------------- */

export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  variant = "danger",
  onConfirm,
  successTitle,
  successDetail,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  variant?: "danger" | "warning" | "primary" | "success";
  onConfirm: () => { error?: string } | undefined;
  successTitle: string;
  successDetail?: string;
}) {
  const toast = useToast();
  const [serverError, setServerError] = useState<string>();
  useOnOpen(open, () => setServerError(undefined));
  const submit = () => {
    const out = onConfirm();
    if (out?.error) {
      setServerError(out.error);
      toast.error("Action not completed", out.error);
      return;
    }
    toast.success(successTitle, successDetail);
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="text-sm leading-6 text-ink-sec">{children}</div>
        <ServerError message={serverError} />
        <Actions>
          <Button variant="secondary" onClick={onClose}>
            Keep as is
          </Button>
          <Button variant={variant} onClick={submit}>
            {confirmLabel}
          </Button>
        </Actions>
      </div>
    </Dialog>
  );
}
