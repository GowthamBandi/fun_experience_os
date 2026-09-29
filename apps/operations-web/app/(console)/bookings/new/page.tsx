"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Gift, ListPlus, Ticket } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { PermissionDenied } from "@/components/ui/panels";
import { Input, Select } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { sessionTitle, venueName } from "@/lib/prototype/selectors/lookups";
import { PAYMENT_METHODS, type PaymentMethodId } from "@/lib/prototype/selectors/money";
import { bookableSessionStatus } from "@/lib/prototype/selectors/status";
import { Breadcrumbs, CapacityPanel, PageFrame, ProviderNotice, Section } from "@/components/bookings/shared";
import { FormField } from "@/components/bookings/dialogs";

type Kind = "paid" | "comp";

export default function NewBookingPage() {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const { state, territory, canAccess, createBookingReservation, confirmBookingPayment, joinWaitlist } = useStore();

  const [sessionId, setSessionId] = useState("");
  const [alias, setAlias] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<Kind>("paid");
  const [paidNow, setPaidNow] = useState(false);
  const [method, setMethod] = useState<PaymentMethodId>("upi");
  const [reference, setReference] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string>();

  // Pre-select a session passed as ?session=… (read after mount to keep the page static-renderable).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("session");
    if (wanted) setSessionId(wanted);
  }, []);

  const sessions = useMemo(
    () => state.sessions.filter((s) => bookableSessionStatus(s.status) && (s.territoryId === territory.id || s.id === sessionId)),
    [state.sessions, territory.id, sessionId]
  );
  const session = sessions.find((s) => s.id === sessionId);
  const ledger = useMemo(() => (session ? sessionCapacityLedger(state, session.id) : undefined), [state, session]);

  if (!canAccess("/bookings")) return <PermissionDenied module="Bookings" />;

  const full = ledger ? ledger.remainingSellableCapacity <= 0 : false;
  const compLeft = ledger ? Math.max(0, ledger.compSlots - ledger.confirmedComplimentaryBookings) : 0;
  const compBlocked = kind === "comp" && ledger ? compLeft === 0 && ledger.remainingSellableCapacity <= 0 : false;
  const waitlistMode = kind === "paid" && full;
  const price = session ? session.finalPrice || session.basePrice : 0;

  const errors = {
    session: !session ? "Choose a session." : undefined,
    alias: alias.trim().length < 2 ? "Enter a name or alias (at least 2 characters)." : alias.trim().length > 40 ? "Keep it under 40 characters." : undefined,
    phone: phone && !/^\d{4}$/.test(phone) ? "Enter exactly the last 4 digits, or leave it empty." : undefined,
    reference: kind === "paid" && !waitlistMode && paidNow && reference.trim().length < 3 ? "Enter the payment reference (at least 3 characters)." : undefined,
  };
  const invalid = Object.values(errors).some(Boolean) || compBlocked || (waitlistMode && session?.waitlistEnabled === false);

  const submit = () => {
    setTouched(true);
    setServerError(undefined);
    if (invalid || !session) return;
    const phoneMask = phone ? `•••• ${phone}` : undefined;

    if (waitlistMode) {
      const out = joinWaitlist({ sessionId: session.id, alias: alias.trim(), phoneMask });
      if (out.error || !out.booking) {
        setServerError(out.error);
        toast.error("Not added to the waitlist", out.error);
        return;
      }
      toast.success("Added to the waitlist", `${out.booking.alias} will be offered the next free seat.`);
      router.push(`/bookings/${out.booking.id}`);
      return;
    }

    const out = createBookingReservation({ sessionId: session.id, alias: alias.trim(), phoneMask, bookingType: kind === "comp" ? "complimentary" : "individual", source: kind === "comp" ? "complimentary" : "admin" });
    if (out.error || !out.booking) {
      setServerError(out.error);
      toast.error("Booking not created", out.error);
      return;
    }
    if (kind === "paid" && paidNow) {
      const paid = confirmBookingPayment(out.booking.id, { method, reference: reference.trim() });
      if (paid.error) toast.warning("Booking created, payment not recorded", `${paid.error} The seat is held for 15 minutes — record the payment from the booking.`);
      else toast.success("Booking confirmed", `${out.booking.alias} paid ${inr(price)} · reference ${reference.trim()}`);
    } else if (kind === "comp") {
      toast.success("Free pass issued", `${out.booking.alias} has a confirmed seat.`);
    } else {
      toast.success("Seat held for 15 minutes", `Record ${out.booking.alias}'s payment before the hold runs out.`);
    }
    router.push(`/bookings/${out.booking.id}`);
  };

  const kindCard = ({ value, icon, title, line }: { value: Kind; icon: ReactNode; title: string; line: string }) => (
    <label key={value} className={cn("flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors", kind === value ? "border-brand bg-brand-subtle/50 ring-2 ring-brand/15" : "border-edge hover:bg-bg-sunken")}>
      <input type="radio" name={`${id}-kind`} value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-1 h-4 w-4 accent-brand" />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-lum">
          {icon} {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-ink-mut">{line}</span>
      </span>
    </label>
  );

  return (
    <PageFrame narrow>
      <Breadcrumbs items={[{ label: "Bookings", href: "/bookings" }, { label: "New booking" }]} />
      <PageHeader overline="Bookings" title="New booking" sub="Add someone to a session. A paid booking holds its seat for 15 minutes until the payment is recorded; if the session is full they join the waitlist." />

      <form
        className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <div className="space-y-6">
          <Section title="1. Session">
            <FormField label="Session" htmlFor={`${id}-session`} error={touched ? errors.session : undefined} hint={sessions.length ? `Sessions in ${territory.name} that are taking bookings.` : undefined}>
              {sessions.length ? (
                <Select id={`${id}-session`} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                  <option value="">Choose a session…</option>
                  {sessions.map((s) => {
                    const l = sessionCapacityLedger(state, s.id);
                    return (
                      <option key={s.id} value={s.id}>
                        {sessionTitle(state, s.id)} · {s.date} {s.startTime} · {l.remainingSellableCapacity > 0 ? `${l.remainingSellableCapacity} free` : "full — waitlist"}
                      </option>
                    );
                  })}
                </Select>
              ) : (
                <p className="rounded-xl bg-bg-sunken px-3 py-2.5 text-sm text-ink-mut">No session in {territory.name} is taking bookings. Publish a session or switch territory.</p>
              )}
            </FormField>
            {session && ledger && (
              <div className="mt-4 rounded-2xl border border-edge p-4">
                <p className="mb-3 text-sm text-ink-sec">
                  {venueName(state, session.venueId)} · {inr(price)} per seat
                </p>
                <CapacityPanel ledger={ledger} compact />
              </div>
            )}
          </Section>

          <Section title="2. Participant">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <FormField label="Name or alias" htmlFor={`${id}-alias`} error={touched ? errors.alias : undefined}>
                <Input id={`${id}-alias`} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. Priya S or CourtQueen" autoComplete="off" aria-invalid={Boolean(touched && errors.alias) || undefined} />
              </FormField>
              <FormField label="Phone — last 4 digits" htmlFor={`${id}-phone`} error={touched ? errors.phone : undefined} hint="Optional">
                <Input id={`${id}-phone`} inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4821" aria-invalid={Boolean(touched && errors.phone) || undefined} />
              </FormField>
            </div>
          </Section>

          <Section title="3. Booking type">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {kindCard({ value: "paid", icon: <Ticket className="h-4 w-4 text-brand" />, title: "Paid booking", line: `${session ? inr(price) : "Session price"}. Holds the seat for 15 minutes until payment is recorded.` })}
              {kindCard({ value: "comp", icon: <Gift className="h-4 w-4 text-sky-600" />, title: "Free pass", line: ledger ? `Confirmed immediately. ${compLeft} reserved free-pass slot${compLeft === 1 ? "" : "s"} left.` : "Confirmed immediately, no payment." })}
            </div>
            {compBlocked && <p className="mt-3 text-sm font-medium text-red-600">No free-pass slot or free seat is left in this session.</p>}

            {kind === "paid" && !waitlistMode && (
              <div className="mt-5 space-y-4 rounded-2xl bg-bg-sunken p-4">
                <label className="flex items-start gap-2.5 text-sm text-ink-sec">
                  <input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-brand" />
                  <span>
                    <span className="font-medium text-ink-lum">Payment already received</span>
                    <span className="block text-xs text-ink-mut">Record it now and the booking is confirmed straight away.</span>
                  </span>
                </label>
                {paidNow && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Payment method" htmlFor={`${id}-method`}>
                      <Select id={`${id}-method`} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethodId)}>
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Reference" htmlFor={`${id}-ref`} error={touched ? errors.reference : undefined} hint="Receipt number, UTR or POS slip">
                      <Input id={`${id}-ref`} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UTR 4018 8231 0977" aria-invalid={Boolean(touched && errors.reference) || undefined} />
                    </FormField>
                  </div>
                )}
              </div>
            )}
            {waitlistMode && (
              <p className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                {session?.waitlistEnabled === false
                  ? "This session is full and does not use a waitlist."
                  : "This session is full. The person joins the waitlist and is offered the next seat that frees up, in queue order."}
              </p>
            )}
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Section title="Summary">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-mut">Session</dt>
                <dd className="text-right font-medium text-ink-lum">{session ? `${sessionTitle(state, session.id)} · ${session.date} ${session.startTime}` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-mut">Participant</dt>
                <dd className="text-right font-medium text-ink-lum">{alias.trim() || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-mut">Outcome</dt>
                <dd className="text-right font-medium text-ink-lum">
                  {waitlistMode ? "Joins the waitlist" : kind === "comp" ? "Confirmed free pass" : paidNow ? "Confirmed and paid" : "Seat held 15 minutes"}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-edge pt-2.5">
                <dt className="text-ink-mut">Amount</dt>
                <dd className="font-display text-lg font-bold tabular text-ink-lum">{kind === "comp" ? "Free" : inr(price)}</dd>
              </div>
            </dl>
            {serverError && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {serverError}
              </p>
            )}
            <Button type="submit" size="lg" className="mt-5 w-full" variant={waitlistMode ? "lamp" : "primary"}>
              {waitlistMode ? (
                <>
                  <ListPlus className="h-4 w-4" /> Add to waitlist
                </>
              ) : kind === "comp" ? (
                "Issue free pass"
              ) : paidNow ? (
                "Create and confirm booking"
              ) : (
                "Hold seat for 15 minutes"
              )}
            </Button>
            <Button variant="ghost" className="mt-2 w-full" onClick={() => router.push("/bookings")}>
              Cancel
            </Button>
          </Section>
          <ProviderNotice />
        </aside>
      </form>
    </PageFrame>
  );
}
