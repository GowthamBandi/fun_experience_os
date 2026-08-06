"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { sessionViews, venueName, type SessionView } from "@/lib/prototype/repositories";
import { fillRate, inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { StatusChip, FillMeter, Button } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/overlays";
import { Stagger, Item } from "@/components/motion/Motion";
import { getOperationalStatusLabel } from "@/components/missions/shared";
import { selectLiveSessionState } from "@/lib/prototype/selectors/liveSession";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { selectCheckInSummary } from "@/lib/prototype/selectors/checkIn";
import { selectCompletionChecklist } from "@/lib/prototype/selectors/completion";
import { selectSessionSegmentResults } from "@/lib/prototype/selectors/results";
import { selectSessionFinancialSummary } from "@/lib/prototype/selectors/money";
import { ArrowRight, Landmark, Calendar, MapPin, Users, Coins } from "lucide-react";

const STATUSES = ["live", "check-in-open", "booking-open", "full", "scheduled", "draft", "cancelled"] as const;

export default function MissionsPage() {
  const { territory, canAccess, state, role } = useStore();
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "all">("all");
  const [query, setQuery] = useState("");
  const [openSession, setOpenSession] = useState<any | null>(null);

  const rawSessions = useMemo(() => {
    return sessionViews(state, territory.id)
      .filter((s) => (status === "all" ? true : s.status === status))
      .filter((s) => !query || s.title.toLowerCase().includes(query.toLowerCase()));
  }, [state, territory.id, status, query]);

  // Derive extra reactive fields dynamically for each row
  const rows = useMemo(() => {
    return rawSessions.map((s) => {
      const sessionId = s.id;
      const lss = selectLiveSessionState(state, sessionId);
      const ledger = sessionCapacityLedger(state, sessionId);
      const checkIn = selectCheckInSummary(state, sessionId);
      const segments = (state.activitySegments ?? []).filter((seg) => seg.sessionId === sessionId);
      const results = selectSessionSegmentResults(state, sessionId);
      const confirmedCount = results.filter((r) => r.status === "Confirmed" || r.status === "Corrected").length;

      let nextAction = "Run Event";
      let actionRoute = `/missions/${sessionId}/live`;

      if (s.status === "draft") {
        nextAction = "Review and Publish";
        actionRoute = `/missions/${sessionId}/overview`;
      } else if (s.status === "booking-open") {
        nextAction = "Monitor Bookings";
        actionRoute = `/missions/${sessionId}/overview`;
      } else if (s.status === "check-in-open") {
        nextAction = "Open Check-In";
        actionRoute = `/missions/${sessionId}/overview`;
      } else if (lss.status === "Ready") {
        nextAction = "Run Event";
        actionRoute = `/missions/${sessionId}/live`;
      } else if (lss.status === "Live" || lss.status === "Paused" || lss.status === "Emergency") {
        nextAction = "Run Event";
        actionRoute = `/missions/${sessionId}/live`;
      } else if (lss.status === "Ended") {
        if (confirmedCount < segments.length) {
          nextAction = "Record Results";
          actionRoute = `/missions/${sessionId}/results`;
        } else {
          nextAction = "Finish Event";
          actionRoute = `/missions/${sessionId}/completion`;
        }
      } else if (s.status === "completed" || lss.status === "Completed") {
        nextAction = "View Summary";
        actionRoute = `/missions/${sessionId}/summary`;
      }

      // Money details
      const finance = selectSessionFinancialSummary(state, sessionId);
      const pendingRefundAmt = (state.refundExceptions ?? [])
        .filter((re) => re.sessionId === sessionId && re.status === "recommended")
        .reduce((sum, r) => sum + r.amount, 0);

      const totalRefunded = finance.totalRefunded || 0;
      const grossCollected = finance.grossCollected;
      const netRevenue = grossCollected - totalRefunded - pendingRefundAmt;

      const totalJoined = ledger.confirmedPaidBookings + ledger.confirmedComplimentaryBookings;

      return {
        ...s,
        lssStatus: lss.status,
        nextAction,
        actionRoute,
        sellableCapacity: ledger.sellableCapacity,
        joinedCount: totalJoined,
        remainingSlots: ledger.remainingSellableCapacity,
        waitlistCount: ledger.waitlistCount,
        grossCollected,
        totalRefunded: totalRefunded + pendingRefundAmt,
        netRevenue,
        checkedIn: checkIn.checkedInCount + checkIn.lateCount,
        venueName: venueName(state, s.venueId),
      };
    });
  }, [rawSessions, state]);

  if (!canAccess("/missions")) return <PageFrame><PermissionDenied module="Missions" /></PageFrame>;

  return (
    <PageFrame>
      <PageHeader
        overline={`Missions Center · ${territory.name}`}
        title="Event Operations Command"
        sub="Scheduled active sessions, booking fill status, live event timers, and outcome recording desks."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <FilterRail options={STATUSES} value={status} onChange={setStatus} />
            <div className="w-52"><SearchInput value={query} onChange={setQuery} placeholder="Find an event…" /></div>
          </div>
        }
      />

      <Stagger className="mt-6">
        <Item>
          {/* Desktop Table View (hidden on mobile) */}
          <div className="hidden md:block overflow-hidden rounded-panel border border-white/5 bg-slate-950/20">
            <table className="w-full border-collapse text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-white/5 bg-white/2 text-ink-mut select-none uppercase tracking-wider text-[10px]">
                  <th className="p-4 font-semibold">Event</th>
                  <th className="p-4 font-semibold">Time & Venue</th>
                  <th className="p-4 font-semibold">Capacity Fill</th>
                  <th className="p-4 font-semibold text-right">Net Revenue</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => {
                  const fill = fillRate(r.joinedCount, r.sellableCapacity);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setOpenSession(r)}
                      className="hover:bg-white/3 transition-colors cursor-pointer group"
                    >
                      <td className="p-4">
                        <p className="font-semibold text-sm text-ink-lum group-hover:text-brand transition-colors">
                          {r.title}
                        </p>
                        <p className="text-[10px] text-ink-mut mt-0.5">{r.activity} · {r.format}</p>
                      </td>
                      <td className="p-4 text-ink-sec space-y-0.5">
                        <p className="font-semibold flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-ink-mut" />
                          {r.time}
                        </p>
                        <p className="text-[10px] text-ink-mut flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {r.venueName}
                        </p>
                      </td>
                      <td className="p-4 w-[200px]">
                        <div className="space-y-1">
                          <FillMeter value={fill} />
                          <p className="text-[10px] text-ink-mut flex items-center justify-between">
                            <span>{r.joinedCount} / {r.sellableCapacity} Joined</span>
                            <span>{r.remainingSlots} left {r.waitlistCount > 0 && `· ${r.waitlistCount} waiting`}</span>
                          </p>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <p className="font-semibold text-ink-lum">{inr(r.netRevenue)}</p>
                        {r.totalRefunded > 0 && (
                          <p className="text-[10px] text-danger">-{inr(r.totalRefunded)} refunded</p>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          r.lssStatus === "Live"
                            ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                            : r.lssStatus === "Paused"
                            ? "bg-amber-950/60 border-amber-800 text-amber-300"
                            : "bg-white/5 border-white/10 text-ink-sec"
                        }`}>
                          {getOperationalStatusLabel(r.lssStatus || r.status)}
                        </span>
                      </td>
                      <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <Link href={r.actionRoute}>
                          <Button variant="lamp" className="h-7 px-3 text-[11px] font-bold">
                            {r.nextAction}
                            <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-ink-mut">
                      <p className="text-sm font-semibold">No active events tonight.</p>
                      <p className="text-[11px] mt-1">Adjust filters or search queries to look up other sessions.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (hidden on desktop) */}
          <div className="block md:hidden space-y-4">
            {rows.map((r) => {
              const fill = fillRate(r.joinedCount, r.sellableCapacity);
              return (
                <div
                  key={r.id}
                  onClick={() => setOpenSession(r)}
                  className="glass rounded-panel border border-white/5 p-4 space-y-3 cursor-pointer hover:border-brand/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-ink-lum">{r.title}</h3>
                      <p className="text-[10px] text-ink-mut">{r.activity} · {r.format}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      r.lssStatus === "Live"
                        ? "bg-emerald-950 border-emerald-800 text-emerald-300"
                        : "bg-white/5 border-white/10 text-ink-sec"
                    }`}>
                      {getOperationalStatusLabel(r.lssStatus || r.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div className="space-y-1">
                      <span className="text-[10px] text-ink-mut flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Time & Venue
                      </span>
                      <p className="font-semibold text-ink-lum">{r.time}</p>
                      <p className="text-[10px] text-ink-mut truncate">{r.venueName}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <span className="text-[10px] text-ink-mut flex items-center gap-1 justify-end">
                        <Coins className="h-3 w-3" /> Collected Take
                      </span>
                      <p className="font-semibold text-[#5fd7a3]">{inr(r.netRevenue)}</p>
                      {r.totalRefunded > 0 && (
                        <p className="text-[9px] text-danger">-{inr(r.totalRefunded)} refunds</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 border-t border-white/5 pt-3">
                    <div className="flex justify-between text-[10px] text-ink-mut">
                      <span>Joined Capacity</span>
                      <span>{r.joinedCount} / {r.sellableCapacity} slots occupied</span>
                    </div>
                    <FillMeter value={fill} />
                  </div>

                  <div className="flex items-center justify-between border-t border-white/5 pt-3" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-ink-mut">
                      {r.remainingSlots} slots remaining · {r.waitlistCount} waiting
                    </span>
                    <Link href={r.actionRoute}>
                      <Button variant="lamp" className="h-8 px-3 text-xs font-bold">
                        {r.nextAction}
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="p-8 text-center text-ink-mut border border-white/5 rounded-panel glass">
                <p className="text-sm font-semibold">No active events tonight.</p>
              </div>
            )}
          </div>
        </Item>
      </Stagger>

      <Drawer
        open={!!openSession}
        onClose={() => setOpenSession(null)}
        title={openSession?.title ?? ""}
        sub={openSession ? `${openSession.time} · ${openSession.joinedCount}/${openSession.sellableCapacity} reserved` : undefined}
      >
        {openSession && <SessionDetail session={openSession} />}
      </Drawer>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}

function SessionDetail({ session }: { session: any }) {
  const { state, strikeBooking } = useStore();
  const bookings = useMemo(() => state.bookings.filter((b) => b.sessionId === session.id), [state, session.id]);
  const fill = fillRate(session.joinedCount, session.sellableCapacity);

  return (
    <div className="space-y-5 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-3 gap-3">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 border border-white/10 text-ink-sec">
            {getOperationalStatusLabel(session.lssStatus || session.status)}
          </span>
          <span className="text-xs text-ink-mut">{session.venueName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={`/missions/${session.id}/overview`}>
            <Button variant="lamp" className="h-7 px-3 text-[11px] font-bold">
              ⚡ Open Event Desk
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="solid rounded-xl p-3">
          <p className="overline">Seating Fill</p>
          <p className="mt-1 text-lg font-semibold tabular text-ink-lum">{fill}%</p>
        </div>
        <div className="solid rounded-xl p-3">
          <p className="overline">Waitlist</p>
          <p className="mt-1 text-lg font-semibold tabular text-ink-lum">{session.waitlistCount}</p>
        </div>
        <div className="solid rounded-xl p-3">
          <p className="overline">Net Take</p>
          <p className="mt-1 text-lg font-semibold tabular text-ink-lum">{inr(session.netRevenue)}</p>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="overline">The Door · Participant Check-In</p>
          <span className="text-[10px] text-ink-mut">({session.checkedIn} Checked In)</span>
        </div>
        <div className="space-y-1.5">
          {bookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-white/3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink-lum">
                  {b.alias} <span className="text-ink-mut">· {b.tempId}</span>
                </p>
                <p className="text-[11px] text-ink-mut">{b.phoneMask}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip value={b.status} />
                {b.status === "payment-confirmed" && (
                  <Button
                    variant="lamp"
                    className="h-8 px-3 text-xs"
                    onClick={() => strikeBooking(b.id)}
                  >
                    Strike Check-In
                  </Button>
                )}
              </div>
            </div>
          ))}
          {bookings.length === 0 && <p className="text-sm text-ink-mut">No bookings yet on this event.</p>}
        </div>
      </div>
    </div>
  );
}
