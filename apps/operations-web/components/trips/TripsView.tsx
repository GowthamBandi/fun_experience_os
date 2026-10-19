"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, MessageSquareWarning, X } from "lucide-react";
import { Badge, Button, Card, DataTable, Drawer, Empty, ErrorState, PageHeader, Skeleton, SkeletonRows, Tabs, Truncated, type Column } from "@/components/pulse";
import { DecisionSheet, Gone, SectionTitle, type DecisionSpec } from "@/components/money/MoneyBits";
import { ReadOnly } from "@/components/trust/TrustBits";
import { PageContainer } from "@/components/shell/PageContainer";
import { CommandValidationError, RequestIdBook, type TripOutcome } from "@/lib/console/actions";
import { CALLABLE_CAPABILITY, can } from "@/lib/console/capabilities";
import { formatDateTime } from "@/lib/console/records";
import { useAdminSession } from "@/lib/firebase/auth";
import { cn } from "@/lib/format";
import { reviewTrip } from "@/lib/governance-api";
import { useNow } from "@/lib/hooks";
import {
  OUTCOME_COPY,
  TRIP_REVIEW_SLA_HOURS,
  TRIP_TABS,
  TRIP_TAB_IDS,
  daysLabel,
  isDecidable,
  isRevision,
  noteMin,
  rupees,
  toTripRow,
  tripBadge,
  tripDecisionKey,
  tripMeta,
  tripOutcomeMessage,
  tripQueue,
  tripStyle,
  validateTripDecision,
  waitingHours,
  waitingLabel,
  type TripRow,
  type TripTab,
} from "@/lib/trips";
import { useLiveDocument } from "@/lib/use-governance";
import { useSearchParamSetter, useTabParam } from "@/lib/use-search-param";
import { useTripDrafts } from "@/lib/use-trips";
import { TripDetail } from "./TripDetail";

const EMPTY: Record<TripTab, { emoji: string; title: string; body: string }> = {
  "in-review": { emoji: "🧳", title: "No trips waiting 🎉", body: "Trips organizers submit from PULSE land here for review." },
  "changes-requested": { emoji: "✍️", title: "Nothing sent back", body: "Trips you return to organizers wait here until they resubmit." },
  live: { emoji: "🗺️", title: "No live trips yet", body: "Approved trips appear here." },
  rejected: { emoji: "🗂️", title: "Nothing rejected", body: "Rejected submissions appear here." },
};

const CAPTION: Record<TripTab, string> = {
  "in-review": "Trips waiting for review, longest-waiting first",
  "changes-requested": "Trips sent back to organizers, longest-waiting first",
  live: "Live trips, most recently approved first",
  rejected: "Rejected trips, most recently decided first",
};

export function TripsView() {
  return (
    <Suspense
      fallback={
        <PageContainer className="flex flex-col gap-6">
          <Skeleton className="h-10 w-64 rounded-pill" />
          <SkeletonRows rows={5} />
        </PageContainer>
      }
    >
      <Trips />
    </Suspense>
  );
}

function Trips() {
  const params = useSearchParams();
  const setParam = useSearchParamSetter();
  const [tab, setTab] = useTabParam(TRIP_TAB_IDS, "in-review");
  const now = useNow();
  // The review queue is always read (header count); another tab is read only while it is open.
  const inReview = useTripDrafts("in-review");
  const other = useTripDrafts(tab === "in-review" ? null : tab);
  const source = tab === "in-review" ? inReview : other;
  const rows = useMemo(() => tripQueue(source.rows, tab), [source.rows, tab]);
  const waiting = inReview.rows.length;
  const ready = !source.loading && !source.error;

  const selectedId = params.get("trip");
  const listed = selectedId ? inReview.rows.find((r) => r.id === selectedId) ?? other.rows.find((r) => r.id === selectedId) ?? null : null;
  // A deep-linked trip outside the loaded lists (another status, or past the cap) is read on its own.
  const linkedId = selectedId && !listed && !source.loading ? selectedId : null;
  const linked = useLiveDocument(linkedId ? "tripDrafts" : null, linkedId);
  const selected = listed ?? (linkedId && linked.data ? toTripRow(linkedId, linked.data) : null);

  const columns: Array<Column<TripRow>> = [
    {
      key: "trip",
      header: "Trip",
      cell: (r) => (
        <div className="flex max-w-[340px] items-center gap-3">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[rgba(63,216,198,0.14)] text-[18px]">{tripStyle(r.style).emoji}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-display text-[14.5px] font-bold tracking-[-0.01em] text-text">{r.title}</span>
              {isRevision(r) ? <Badge tone="info">Revision</Badge> : null}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-text-3">{r.organizerName ? `by ${r.organizerName}` : tripMeta(r)}</div>
          </div>
        </div>
      ),
      sort: (a, b) => a.title.localeCompare(b.title),
    },
    { key: "destination", header: "Destination", cell: (r) => <span className="text-[13px] text-text-2">{r.destination ?? "—"}</span> },
    { key: "style", header: "Style", cell: (r) => <span className="whitespace-nowrap text-[13px] text-text-2">{tripStyle(r.style).label}</span> },
    { key: "days", header: "Days", align: "right", sort: (a, b) => (a.durationDays ?? -1) - (b.durationDays ?? -1), cell: (r) => <span className="text-[13px]">{daysLabel(r.durationDays)}</span> },
    { key: "price", header: "From", align: "right", sort: (a, b) => (a.priceFrom ?? -1) - (b.priceFrom ?? -1), cell: (r) => <span className="font-semibold">{rupees(r.priceFrom)}</span> },
    { key: "departures", header: "Departures", align: "right", sort: (a, b) => a.departuresCount - b.departuresCount, cell: (r) => <span className="text-[13px]">{r.departuresCount}</span> },
    {
      key: "waiting",
      header: tab === "live" || tab === "rejected" ? "Decided" : "Waiting",
      cell: (r) => {
        const hours = now && (tab === "in-review" || tab === "changes-requested") ? waitingHours(r, now) : null;
        const late = hours !== null && hours >= TRIP_REVIEW_SLA_HOURS && tab === "in-review";
        return (
          <span className={cn("num whitespace-nowrap text-[13px]", late ? "font-semibold text-warn" : "text-text-2")} title={formatDateTime(r.submittedAt)}>
            {waitingLabel(r, now)}
          </span>
        );
      },
    },
  ];

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Marketplace"
        title={
          <>
            Trips
            {!inReview.loading && !inReview.error && waiting > 0 ? (
              <>
                {" "}
                <em className="hl">{waiting} waiting</em>
              </>
            ) : null}
          </>
        }
        subtitle="Multi-day group trips organizers submit from PULSE. Review the full itinerary, rooms and prices, then approve, request changes or reject. Nothing goes live without a decision here."
      />

      <Tabs
        label="Trip status"
        tabs={TRIP_TABS.map((t) => ({
          ...t,
          count: t.id === "in-review" ? (inReview.loading || inReview.error ? undefined : waiting) : t.id === tab && ready ? rows.length : undefined,
        }))}
        value={tab}
        onChange={setTab}
      />

      {source.error ? (
        <Card>
          <ErrorState message={source.error} onRetry={source.refresh} />
        </Card>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          loading={source.loading}
          onRowClick={(r) => setParam("trip", r.id)}
          caption={CAPTION[tab]}
          className="max-h-[70vh]"
          empty={<Empty {...EMPTY[tab]} />}
        />
      )}
      {ready && source.truncated ? <Truncated shown={source.rows.length} order={null} noun="trips" /> : null}

      <TripDrawer
        open={!!selectedId}
        loading={source.loading || (!!linkedId && linked.loading)}
        error={linkedId ? linked.error : null}
        row={selected}
        now={now}
        onClose={() => setParam("trip", null)}
      />
    </PageContainer>
  );
}

function TripDrawer({ open, loading, error, row, now, onClose }: { open: boolean; loading: boolean; error: string | null; row: TripRow | null; now: Date | null; onClose: () => void }) {
  const { consoleRole: role } = useAdminSession();
  const permitted = can(role, CALLABLE_CAPABILITY.reviewTrip);
  const book = useRef(new RequestIdBook("trip"));
  const [decision, setDecision] = useState<{ outcome: TripOutcome; pinned: TripRow } | null>(null);
  const decide = (outcome: TripOutcome) => row && setDecision({ outcome, pinned: row });
  const outcome = decision?.outcome ?? null;
  // The live version while it is still in review; once the decision lands (the listener moves the trip
  // out of the queue before reviewTrip resolves) the pinned copy keeps the sheet and its error visible.
  const live = row && decision && row.id === decision.pinned.id ? row : null;
  const target = live && isDecidable(live) ? live : decision?.pinned ?? null;

  const spec: DecisionSpec | null =
    target && outcome
      ? {
          idKey: tripDecisionKey(target, outcome),
          title: OUTCOME_COPY[outcome].title(target.title),
          consequence: OUTCOME_COPY[outcome].consequence,
          confirmLabel: OUTCOME_COPY[outcome].confirm,
          tone: outcome === "approved" ? "volt" : "danger",
          reasonMin: noteMin(outcome),
          reasonLabel: OUTCOME_COPY[outcome].reasonLabel,
          validate: () => (live && !isDecidable(live) ? `This trip is now ${tripBadge(live.status).label.toLowerCase()}. Close this and review the latest version.` : null),
          execute: async (requestId, note) => {
            const invalid = validateTripDecision(target, outcome, note);
            if (invalid) throw new CommandValidationError(invalid);
            const result = await reviewTrip({ requestId, hostTripId: target.id, expectedVersion: target.version, outcome, note });
            // The live listener moves the trip to its new tab; close the panel on the decided trip.
            onClose();
            return { tone: "ok", title: `${OUTCOME_COPY[outcome].toast} · ${target.title}`, body: tripOutcomeMessage(outcome, result, isRevision(target)) };
          },
        }
      : null;

  return (
    <>
      <Drawer open={open} width={760} title={row ? row.title : loading ? "Loading trip…" : "Trip unavailable"} onClose={onClose}>
        {!row && loading ? (
          <SkeletonRows rows={6} />
        ) : !row ? (
          error ? <p role="alert" className="text-[13px] text-err">{error}</p> : <Gone noun="trip" />
        ) : (
          <div className="flex flex-col gap-6 pb-2">
            <TripDetail row={row} now={now} />
            <section aria-label="Trip decision" className="sticky bottom-0 -mx-1 flex flex-col gap-3 rounded-[22px] border border-line-soft bg-[rgba(18,16,28,0.92)] p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] backdrop-blur-[18px]">
              <SectionTitle>Decision</SectionTitle>
              {!permitted ? (
                <ReadOnly role={role} what="trips" />
              ) : !isDecidable(row) ? (
                <p className="text-[13px] text-text-3">
                  {tripBadge(row.status).label}. Only trips in review can be decided{row.status === "changes-requested" ? "; this one is back with the organizer" : ""}.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2" data-testid="trip-actions">
                  <Button variant="volt" icon={<Check />} onClick={() => decide("approved")}>
                    Approve
                  </Button>
                  <Button variant="ghost" icon={<MessageSquareWarning />} onClick={() => decide("changes-requested")}>
                    Request changes
                  </Button>
                  <Button variant="danger" icon={<X />} onClick={() => decide("rejected")}>
                    Reject
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}
      </Drawer>
      <DecisionSheet spec={spec} book={book.current} onClose={() => setDecision(null)} />
    </>
  );
}
