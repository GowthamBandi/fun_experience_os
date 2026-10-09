"use client";

import { useRef, useState } from "react";
import { Badge, Button, Card, Empty, ErrorState, PageHeader, SkeletonRows, Sheet, Tooltip, Truncated, useToast } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { LiveEventRow } from "@/components/live/LiveEventRow";
import { can } from "@/lib/console/capabilities";
import { newRequestId } from "@/lib/console/actions";
import { mapConsoleError } from "@/lib/console/errors";
import { useAdminSession } from "@/lib/firebase/auth";
import { cn } from "@/lib/format";
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
  const requestId = useRef<string | null>(null);

  const open = (ev: Ev) => {
    requestId.current = newRequestId("cancel");
    setTarget(ev);
  };

  const confirm = async (reason: string) => {
    if (!target) return;
    try {
      const result = await adminCancelEvent({ requestId: requestId.current ?? newRequestId("cancel"), eventId: target.id, reason });
      const status = typeof result.status === "string" ? result.status : null;
      toast.show({ tone: "ok", title: "Event cancelled", body: `${target.title}${status ? ` · ${status}` : ""}. Refunds are being issued and attendees notified.` });
      requestId.current = null;
    } catch (e) {
      const err = mapConsoleError(e);
      throw new Error(err.nextStep ? `${err.message} ${err.nextStep}` : err.message);
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
            {live.some((e) => e.endsAssumed) ? <p className="text-[11px] text-text-3">* End time not recorded; assumed 3 h after start.</p> : null}
          </>
        )}
        {truncated && !error ? <Truncated shown={LIVE_LIMIT} /> : null}
      </Card>
      <Sheet
        open={target !== null}
        title="Cancel this event?"
        description={target ? `${target.title} will be cancelled, every ticket voided and a 100% refund issued to each confirmed booking. Attendees are notified. This cannot be undone.` : undefined}
        confirmLabel="Cancel event"
        tone="danger"
        requireReason
        minReason={10}
        onConfirm={confirm}
        onClose={() => setTarget(null)}
      />
    </PageContainer>
  );
}
