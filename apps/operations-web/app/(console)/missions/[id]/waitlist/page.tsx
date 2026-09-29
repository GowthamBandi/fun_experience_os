"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ListPlus, Send } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/primitives";
import { MetricTile } from "@/components/ui/panels";
import { Input } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";
import type { Booking } from "@/lib/prototype/entities";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { selectSessionWaitlistQueue } from "@/lib/prototype/selectors/bookings";
import { bookableSessionStatus, seatClass } from "@/lib/prototype/selectors/status";
import { BookingStatusChip, Countdown, Section, formatWhen } from "@/components/bookings/shared";
import { CancelBookingDialog, ConfirmDialog, FormField } from "@/components/bookings/dialogs";
import { SessionFrame } from "@/components/bookings/SessionFrame";

export default function SessionWaitlistPage() {
  const params = useParams();
  const sessionId = String(params.id ?? "");
  const id = useId();
  const toast = useToast();
  const { state, canAccess, offerWaitlistSlot, acceptWaitlistOffer, expireWaitlistOffer, joinWaitlist } = useStore();
  const [alias, setAlias] = useState("");
  const [touched, setTouched] = useState(false);
  const [removing, setRemoving] = useState<Booking>();
  const [withdrawing, setWithdrawing] = useState<Booking>();

  const session = state.sessions.find((s) => s.id === sessionId);
  const ledger = useMemo(() => sessionCapacityLedger(state, sessionId), [state, sessionId]);
  const queue = useMemo(() => selectSessionWaitlistQueue(state, sessionId), [state, sessionId]);
  const history = useMemo(
    () => state.bookings.filter((b) => b.sessionId === sessionId && b.waitlistOrder !== undefined && seatClass(b) !== "waitlist" && seatClass(b) !== "offer"),
    [state.bookings, sessionId]
  );

  const canManage = canAccess("/bookings");
  const open = session ? bookableSessionStatus(session.status) : false;
  const waiting = queue.filter((b) => seatClass(b) === "waitlist");
  const offers = queue.filter((b) => seatClass(b) === "offer");
  const offerMins = session?.waitlistOfferExpiryMins && session.waitlistOfferExpiryMins > 0 ? session.waitlistOfferExpiryMins : 10;

  const offerNext = () => {
    const out = offerWaitlistSlot(sessionId);
    if (out.error) toast.error("No seat offered", out.error);
    else toast.success("Seat offered", `${out.booking?.alias ?? "The next person"} has ${offerMins} minutes to accept.`);
  };
  const accept = (b: Booking) => {
    const out = acceptWaitlistOffer(b.id);
    if (out.error) toast.error("Offer not accepted", out.error);
    else toast.success("Offer accepted", `${b.alias}'s seat is held for 15 minutes while the payment is recorded.`);
  };
  const aliasErr = alias.trim().length < 2 ? "Enter a name or alias (at least 2 characters)." : undefined;
  const add = () => {
    setTouched(true);
    if (aliasErr) return;
    const out = joinWaitlist({ sessionId, alias: alias.trim() });
    if (out.error) {
      toast.error("Not added to the waitlist", out.error);
      return;
    }
    toast.success("Added to the waitlist", `${out.booking?.alias} is number ${queue.length + 1} in the queue.`);
    setAlias("");
    setTouched(false);
  };

  return (
    <SessionFrame
      sessionId={sessionId}
      current="waitlist"
      sub={`When a seat frees up it is offered automatically to the first person waiting. They have ${offerMins} minutes to accept, then 15 minutes to pay; otherwise the seat passes to the next person.`}
      right={
        canManage ? (
          <Button onClick={offerNext} disabled={!open || ledger.remainingSellableCapacity <= 0 || waiting.length === 0} title={ledger.remainingSellableCapacity <= 0 ? "No free seat to offer" : undefined}>
            <Send className="h-4 w-4" /> Offer next seat
          </Button>
        ) : undefined
      }
    >
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricTile label="Waiting" value={waiting.length} detail="Hold no seat" tone="violet" />
        <MetricTile label="Seat offers open" value={offers.length} detail={`Expire after ${offerMins} minutes`} tone="amber" />
        <MetricTile label="Free seats" value={ledger.remainingSellableCapacity} detail={ledger.remainingSellableCapacity ? "Can be offered now" : "Session is full"} tone={ledger.remainingSellableCapacity ? "emerald" : "rose"} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Section title="Queue" sub="In order of joining">
          {queue.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-mut">Nobody is waiting for this session.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {queue.map((b, i) => {
                const offered = seatClass(b) === "offer";
                return (
                  <li key={b.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular", offered ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-ink-sec")}>{i + 1}</span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-lum">
                          <Link href={`/bookings/${b.id}`} className="hover:text-brand">
                            {b.alias}
                          </Link>
                          <BookingStatusChip status={b.status} />
                        </p>
                        <p className="text-xs text-ink-mut">Joined {formatWhen(b.createdAt)}</p>
                        {offered && <Countdown expiresAt={b.waitlistOfferExpiresAt} label="Offer ends in" className="mt-1" />}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {offered ? (
                          <>
                            <Button size="sm" onClick={() => accept(b)}>
                              Accept offer
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setWithdrawing(b)}>
                              Withdraw
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setRemoving(b)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Section>

        <div className="space-y-6">
          {canManage && (
            <Section title="Add to waitlist" sub={ledger.remainingSellableCapacity > 0 ? "Seats are still free — make a booking instead." : "The session is full."}>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  add();
                }}
              >
                <FormField label="Name or alias" htmlFor={`${id}-alias`} error={touched ? aliasErr : undefined}>
                  <Input id={`${id}-alias`} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. ShuttleSam" disabled={!open || ledger.remainingSellableCapacity > 0} />
                </FormField>
                {ledger.remainingSellableCapacity > 0 ? (
                  <Link href={`/bookings/new?session=${sessionId}`} className="block">
                    <Button variant="secondary" className="w-full">
                      Make a booking
                    </Button>
                  </Link>
                ) : (
                  <Button type="submit" variant="lamp" className="w-full" disabled={!open}>
                    <ListPlus className="h-4 w-4" /> Add to waitlist
                  </Button>
                )}
                {!open && <p className="text-xs text-ink-mut">This session is no longer taking bookings.</p>}
              </form>
            </Section>
          )}
          <Section title="Earlier entries" sub="Offers that expired, were withdrawn or turned into bookings">
            {history.length === 0 ? (
              <p className="text-sm text-ink-mut">None yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/bookings/${b.id}`} className="truncate font-medium text-ink-lum hover:text-brand">
                      {b.alias}
                    </Link>
                    <BookingStatusChip status={b.status} checkedIn={b.checkedIn} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <CancelBookingDialog booking={removing} open={Boolean(removing)} onClose={() => setRemoving(undefined)} />
      <ConfirmDialog
        open={Boolean(withdrawing)}
        onClose={() => setWithdrawing(undefined)}
        title="Withdraw this seat offer?"
        confirmLabel="Withdraw offer"
        onConfirm={() => (withdrawing ? expireWaitlistOffer(withdrawing.id) : undefined)}
        successTitle="Offer withdrawn"
        successDetail="The seat was offered to the next person in the queue."
      >
        {withdrawing?.alias} loses the offered seat and it passes to the next person on the waitlist.
      </ConfirmDialog>
    </SessionFrame>
  );
}
