"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ClipboardCheck, Plus, Radio, Swords, Trophy } from "lucide-react";
import { useStore } from "@/lib/store";
import { tournamentRows, tournamentCommandMetrics, verificationQueue, matchTitle, type TournamentRow } from "@/lib/prototype/selectors/tournament";
import { entrantName } from "@/lib/prototype/services/tournament";
import { operatorName } from "@/lib/prototype/selectors/lookups";
import { formatAgo, formatWhen } from "@/lib/safety/time";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, MetricTile, PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { useCommandFeedback } from "@/components/ui/toast";
import { cn } from "@/lib/format";
import { GatedButton, useTournamentGate } from "@/components/safety/shared";

type Filter = "all" | "running" | "upcoming" | "completed";
const RUNNING = ["live", "paused", "awaiting-verification"];
const UPCOMING = ["draft", "registration-open", "registration-closed", "teams-ready", "bracket-ready", "published"];

export default function TournamentsPage() {
  const { state, territory, canAccess, verifyTournamentMatchResult, operator } = useStore();
  const gate = useTournamentGate();
  const feedback = useCommandFeedback();
  const [filter, setFilter] = useState<Filter>("all");
  const [scope, setScope] = useState<"territory" | "all">("territory");
  const territoryId = scope === "territory" ? territory.id : undefined;
  const rows = useMemo(() => tournamentRows(state, territoryId), [state, territoryId]);
  const metrics = useMemo(() => tournamentCommandMetrics(state, territoryId), [state, territoryId]);
  const queue = useMemo(() => verificationQueue(state, territoryId), [state, territoryId]);

  if (!canAccess("/tournaments")) return <PermissionDenied module="Tournaments" />;

  const filtered = rows.filter(
    (r) =>
      filter === "all" || (filter === "running" ? RUNNING.includes(r.status) : filter === "upcoming" ? UPCOMING.includes(r.status) : r.status === "completed"),
  );
  const createGate = gate("tournament.create", territory.id);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-5 py-7 lg:px-8">
      <PageHeader
        overline="Operations"
        title="Tournaments"
        sub="Single-elimination knockouts: enter teams, draw the bracket, run match day and verify every result before winners advance."
        right={
          createGate.allowed ? (
            <Link
              href="/tournaments/new"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-brand hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" /> New tournament
            </Link>
          ) : (
            <GatedButton gate={createGate}>
              <Plus className="h-4 w-4" /> New tournament
            </GatedButton>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Running"
          value={metrics.activeTournaments}
          detail={`${metrics.totalTournaments} tournaments in view`}
          icon={<Swords className="h-4 w-4" />}
          tone="violet"
          onClick={() => setFilter("running")}
        />
        <MetricTile label="Matches live" value={metrics.liveMatches} detail="being played right now" icon={<Radio className="h-4 w-4" />} tone="sky" />
        <MetricTile
          label="Awaiting verification"
          value={metrics.verificationBacklog}
          detail={metrics.verificationBacklog ? "winners can't advance until verified" : "all results verified"}
          icon={<ClipboardCheck className="h-4 w-4" />}
          tone={metrics.verificationBacklog ? "amber" : "emerald"}
        />
        <MetricTile
          label="Upcoming"
          value={metrics.upcomingCount}
          detail="draft, drawn or published"
          icon={<CalendarClock className="h-4 w-4" />}
          tone="pink"
          onClick={() => setFilter("upcoming")}
        />
      </div>

      {queue.length > 0 && (
        <section className="rounded-panel border border-amber-200 bg-white shadow-panel">
          <div className="flex items-center justify-between gap-3 border-b border-amber-100 bg-amber-50/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-amber-800">Verification queue</h2>
            <span className="text-xs text-amber-700">
              {queue.length} result{queue.length === 1 ? "" : "s"} waiting
            </span>
          </div>
          <ul className="divide-y divide-slate-100">
            {queue.map(({ match: m, tournament: t }) => {
              const last = m.resultRevisions?.at(-1);
              const self = t.verificationRequirement === "dual" && last?.recordedBy === operator?.id;
              const g = self ? { allowed: false, reason: "A second person must verify: you recorded this result." } : gate("match.verify", t.territoryId);
              return (
                <li key={m.id} className="flex flex-col gap-2 px-5 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-lum">
                      {entrantName(t, m.teamAId)}{" "}
                      <span className="font-display tabular">
                        {m.scoreA}–{m.scoreB}
                      </span>{" "}
                      {entrantName(t, m.teamBId)}
                    </p>
                    <p className="text-xs text-ink-mut">
                      <Link href={`/tournaments/${t.id}`} className="font-medium text-brand-ink hover:underline">
                        {t.name}
                      </Link>{" "}
                      · {matchTitle(m)} · recorded {formatAgo(last?.recordedAt)} by {operatorName(state, last?.recordedBy)}
                    </p>
                  </div>
                  <GatedButton
                    gate={g}
                    size="sm"
                    variant="success"
                    onClick={() => feedback(verifyTournamentMatchResult(t.id, m.id), "Result verified", `${entrantName(t, m.winnerTeamId)} advance.`)}
                  >
                    Verify
                  </GatedButton>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="inline-flex flex-wrap rounded-xl border border-edge bg-bg-sunken p-1" role="group" aria-label="Filter tournaments">
          {(["all", "running", "upcoming", "completed"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize",
                filter === f ? "bg-white text-brand-ink shadow-lift ring-1 ring-edge" : "text-ink-mut hover:text-ink-lum",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="inline-flex self-start rounded-xl border border-edge bg-bg-sunken p-1" role="group" aria-label="Territory scope">
          {(["territory", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold",
                scope === s ? "bg-white text-brand-ink shadow-lift ring-1 ring-edge" : "text-ink-mut hover:text-ink-lum",
              )}
            >
              {s === "territory" ? territory.name : "All territories"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={rows.length ? "No tournaments match this filter" : "No tournaments yet"}
          line={rows.length ? "Choose another filter to see more." : "Create a knockout tournament to enter teams and draw a bracket."}
          action={
            createGate.allowed && !rows.length ? (
              <Link href="/tournaments/new" className="text-sm font-semibold text-brand-ink hover:underline">
                Create a tournament →
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <TournamentCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function TournamentCard({ row: r }: { row: TournamentRow }) {
  return (
    <Link
      href={`/tournaments/${r.id}`}
      className="group flex min-w-0 flex-col rounded-panel border border-edge bg-white p-5 shadow-panel transition-all hover:-translate-y-0.5 hover:border-brand/30 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-ink-mut">{r.code}</p>
          <h2 className="mt-0.5 truncate font-display text-lg font-bold text-ink-lum group-hover:text-brand-ink">{r.name}</h2>
          <p className="mt-0.5 truncate text-sm text-ink-mut">{r.venueName}</p>
        </div>
        <StatusChip value={r.status} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Teams" value={r.teamsCount} />
        <Stat label="Played" value={r.totalMatches ? `${r.playedMatches}/${r.totalMatches}` : "—"} />
        <Stat
          label={r.liveMatches ? "Live" : "To verify"}
          value={r.liveMatches || r.awaitingVerification}
          highlight={!!(r.liveMatches || r.awaitingVerification)}
        />
      </div>
      <div className="mt-4">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={r.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Matches decided"
        >
          <div
            className={cn("h-full rounded-full", r.progressPercent >= 100 ? "bg-emerald-500" : "bg-gradient-to-r from-violet-500 to-indigo-500")}
            style={{ width: `${r.progressPercent}%` }}
          />
        </div>
        <p className="mt-2 flex items-center justify-between text-xs text-ink-mut">
          <span>
            {r.championName ? (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                <Trophy className="h-3.5 w-3.5" /> {r.championName}
              </span>
            ) : r.currentRound ? (
              `Now: ${r.currentRound}`
            ) : r.totalMatches ? (
              ""
            ) : (
              "Bracket not drawn"
            )}
          </span>
          <span>{r.scheduledStart ? formatWhen(r.scheduledStart) : ""}</span>
        </p>
      </div>
    </Link>
  );
}

function Stat({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-bg-sunken px-2 py-2">
      <p className={cn("font-display text-lg font-bold tabular", highlight ? "text-violet-700" : "text-ink-lum")}>{value}</p>
      <p className="text-[11px] text-ink-mut">{label}</p>
    </div>
  );
}
