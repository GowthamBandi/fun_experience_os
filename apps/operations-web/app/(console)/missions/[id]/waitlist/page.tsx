"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { selectSessionWaitlistQueue } from "@/lib/prototype/selectors/bookings";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import {
  BookingBackNavigation,
  BookingStatusBadge,
  BookingEmptyState,
} from "@/components/bookings/shared";

export default function WaitlistPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const {
    state,
    offerWaitlistSlot,
    acceptWaitlistOffer,
    expireWaitlistOffer,
    role,
  } = useStore();

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const ledger = useMemo(() => sessionCapacityLedger(state, sessionId), [state, sessionId]);
  const queue = useMemo(() => selectSessionWaitlistQueue(state, sessionId), [state, sessionId]);

  if (!session) {
    return <BookingEmptyState title="Session not found" message="This session does not exist." />;
  }

  const offersSent = queue.filter(b => b.status === "waitlist-offered").length;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 space-y-8">
      <BookingBackNavigation label="Back to Event" href={`/missions/${sessionId}/overview`} />
      
      <PageHeader
        overline="Waiting List"
        title="Waiting List"
        sub="Manage people waiting for a space in this event."
      />

      <div className="glass p-5 rounded-2xl flex flex-col md:flex-row gap-6 md:items-center justify-between">
        <div>
          <div className="text-lg font-bold text-ink-lum mb-1">Who gets the next available space?</div>
          <p className="text-sm text-ink-sec">
            If they do not accept in time, the space will be offered to the next person.
          </p>
        </div>
        <div className="flex gap-6 shrink-0">
          <div className="text-center">
            <div className="text-2xl font-bold text-ink-lum">{queue.length}</div>
            <div className="text-xs text-ink-mut">People Waiting</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-ink-lum">{ledger.remainingSellableCapacity}</div>
            <div className="text-xs text-ink-mut">Spaces Available</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-brand">{offersSent}</div>
            <div className="text-xs text-ink-mut">Offers Sent</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {queue.length === 0 ? (
          <BookingEmptyState 
            title="Empty Waiting List" 
            message="No one is waiting for a space in this event." 
          />
        ) : (
          queue.map((b, index) => (
            <div key={b.id} className="glass p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-ink-sec/10 flex items-center justify-center font-bold text-ink-sec">
                  {index + 1}
                </div>
                <div>
                  <div className="font-bold text-ink-lum flex items-center gap-2">
                    {b.alias}
                    <BookingStatusBadge status={b.status as string} />
                  </div>
                  {b.waitlistOfferExpiresAt && b.status === "waitlist-offered" && (
                    <div className="text-xs text-ink-sec mt-1">
                      Offer expires: {b.waitlistOfferExpiresAt}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {b.status === "waitlisted" && (
                  <Button
                    variant="primary"
                    onClick={() => offerWaitlistSlot(sessionId, role.id)}
                    title="Hold one available space for this person for 10 minutes?"
                    disabled={ledger.remainingSellableCapacity <= 0}
                  >
                    Offer Space
                  </Button>
                )}
                {b.status === "waitlist-offered" && (
                  <>
                    <Button
                      variant="primary"
                      onClick={() => acceptWaitlistOffer(b.id, role.id)}
                    >
                      Accept Offer
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                      onClick={() => expireWaitlistOffer(b.id, role.id)}
                    >
                      Expire Offer
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
