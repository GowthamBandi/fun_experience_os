"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Empty, ErrorState, PageHeader, SkeletonRows, Sheet, Tooltip, Truncated, useToast } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { LiveEventRow } from "@/components/live/LiveEventRow";
import { PhraseBox } from "@/components/governance/PhraseBox";
import { can } from "@/lib/console/capabilities";
import { CONFIRM_PHRASES, RequestIdBook, isConfirmed } from "@/lib/console/actions";
import { rethrowForSheet } from "@/lib/console/errors";
import { useAdminSession } from "@/lib/firebase/auth";
import { cn } from "@/lib/format";
import { cancelEventKey, cancelEventToast } from "@/lib/events";
import { adminCancelEvent } from "@/lib/governance-api";
import { useNow } from "@/lib/hooks";
import type { Ev } from "@/lib/overview";
import { LIVE_LIMIT, useSharedLiveEvents } from "@/lib/use-live-events";

export default function LivePage() {
  const { live, soon, loading, error, truncated, retry } = useSharedLiveEvents();
  const { consoleRole } = useAdminSession();
  const toast = useToast();
  const now = useNow(30_000);
  const canCancel = can(consoleRole, "governance.decide");
  const [target, setTarget] = useState<Ev | null>(null);
  const [typed, setTyped] = useState("");
  const book = useRef(new RequestIdBook("liveCancel"));

  useEffect(() => setTyped(""), [target?.id]);

  const open = (ev: Ev) => setTarget(ev);

  const confirm = async (reason: string) => {
    if (!target) return;
    if (!isConfirmed(typed, CONFIRM_PHRASES.cancelEvent)) throw new Error(`Type ${CONFIRM_PHRASES.cancelEvent} to confirm.`);
    try {
      const result = await adminCancelEvent({ requestId: book.current.idFor(cancelEventKey(target.id, target.status)), eventId: target.id, reason });
      book.current.reset();
      toast.show(cancelEventToast(result, target.title));
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };

  const cancelButton = (ev: Ev) => {
    const button = (
      <Button variant="danger" size="sm" aria-disabled={!canCancel || undefined} className={canCancel ? undefined : "cursor-not-allowed opacity-50"} onClick={() => canCancel && open(ev)}>
        Cancel event
      </Button>
    );
    return canCancel ? button : <Tooltip label="Only a Platform Owner or Super Admin can cancel events.">{button}</Tooltip>;
  };

  const section = (id: string, title: string, items: Ev[], phase: "live" | "soon", emptyText: string) => (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="flex items-center gap-2 font-display text-[18px] font-bold tracking-[-0.02em] text-text">
        {title}
        <Badge tone="volt">{items.length}</Badge>
      </h2>
      {items.length === 0 ? (
        <p className="rounded-control border border-dashed border-line px-4 py-5 text-[13px] text-text-3">{emptyText}</p>
      ) : now ? (
        <ul className="flex flex-col gap-3">
          {items.map((ev) => (
            <LiveEventRow key={ev.id} ev={ev} phase={phase} now={now} action={cancelButton(ev)} />
          ))}
        </ul>
      ) : null}
    </section>
  );

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Monitor"
        title={
          <span className="flex items-center gap-3">
            Live now
            {!loading && !error ? (
              <span className="flex items-center gap-2 text-[16px] font-semibold text-text-2">
                <span aria-hidden className="relative flex h-2.5 w-2.5">
                  {live.length > 0 ? <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-60 motion-safe:animate-ping" /> : null}
                  <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", live.length > 0 ? "bg-ok" : "bg-text-3")} />
                </span>
                <span className="num text-text">{live.length}</span>
              </span>
            ) : null}
          </span>
        }
        subtitle="Events running now and those starting in the next 12 hours."
      />
      <Card as="section" aria-busy={loading || undefined} className="flex flex-col gap-8">
        {loading ? (
          <SkeletonRows rows={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : live.length === 0 && soon.length === 0 ? (
          <Empty emoji="🌙" title="No events running right now" body="Events starting in the next 12 hours will show up here." />
        ) : (
          <>
            {section("live-happening", "Happening now", live, "live", "No events running right now 🌙")}
            {section("live-soon", "Starting in the next 12 h", soon, "soon", "Nothing starts in the next 12 hours.")}
          </>
        )}
        {truncated && !error ? <Truncated shown={LIVE_LIMIT} noun="events" /> : null}
      </Card>
      <Sheet
        open={target !== null}
        title={target ? `Cancel ${target.title}?` : "Cancel this event?"}
        confirmLabel="Cancel event"
        tone="danger"
        requireReason
        minReason={10}
        reasonLabel="Reason (kept on the event and in the audit trail)"
        extra={
          target ? (
            <PhraseBox
              phrase={CONFIRM_PHRASES.cancelEvent}
              consequence={`${target.title} will be cancelled, every ticket voided and a 100% refund issued to each confirmed booking. Attendees are notified. This cannot be undone.`}
              value={typed}
              onChange={setTyped}
            />
          ) : undefined
        }
        onConfirm={confirm}
        onClose={() => setTarget(null)}
      />
    </PageContainer>
  );
}
