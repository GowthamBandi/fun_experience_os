"use client";

import { Check, Clock, Radio } from "lucide-react";
import type { Tournament, TournamentMatch } from "@/lib/prototype/entities";
import type { BracketRound } from "@/lib/prototype/selectors/tournament";
import { entrantName } from "@/lib/prototype/services/tournament";
import { formatWhen } from "@/lib/safety/time";
import { cn } from "@/lib/format";

const SLOT = 128; // px of column height per first-round match

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "text-ink-mut" },
  ready: { label: "Ready", className: "text-sky-700" },
  live: { label: "Live", className: "text-violet-700" },
  paused: { label: "Paused", className: "text-amber-700" },
  "awaiting-verification": { label: "Verify result", className: "text-amber-700" },
  verified: { label: "Verified", className: "text-emerald-700" },
  completed: { label: "Completed", className: "text-emerald-700" },
  walkover: { label: "Walkover", className: "text-ink-sec" },
  disqualified: { label: "Disqualification", className: "text-red-700" },
  abandoned: { label: "Abandoned", className: "text-red-700" },
  cancelled: { label: "Cancelled", className: "text-ink-mut" },
};

/** Visual single-elimination bracket: one column per round, connectors between pairs. */
export function Bracket({ tournament, rounds, onSelect, selectedId }: { tournament: Tournament; rounds: BracketRound[]; onSelect?: (m: TournamentMatch) => void; selectedId?: string }) {
  if (!rounds.length) return null;
  const height = Math.max(1, rounds[0].matches.length) * SLOT;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-12 px-1 py-2">
        {rounds.map((round, ri) => {
          const pairs: TournamentMatch[][] = [];
          for (let i = 0; i < round.matches.length; i += 2) pairs.push(round.matches.slice(i, i + 2));
          const last = ri === rounds.length - 1;
          return (
            <div key={round.roundNumber} className="w-[236px] shrink-0">
              <p className="overline mb-2 text-center">{round.label}</p>
              <div className="flex flex-col" style={{ height }}>
                {pairs.map((pair, pi) => (
                  <div key={pi} className="relative flex flex-1 flex-col">
                    {pair.map((m) => (
                      <div key={m.id} className="relative flex flex-1 items-center">
                        {ri > 0 && <span className="absolute -left-6 top-1/2 w-6 border-t-2 border-edge-strong" aria-hidden />}
                        <BracketMatch tournament={tournament} match={m} onSelect={onSelect} selected={selectedId === m.id} />
                      </div>
                    ))}
                    {!last && pair.length === 2 && <span className="absolute -right-6 bottom-1/4 top-1/4 w-6 rounded-r-xl border-y-2 border-r-2 border-edge-strong" aria-hidden />}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BracketMatch({ tournament, match: m, onSelect, selected }: { tournament: Tournament; match: TournamentMatch; onSelect?: (m: TournamentMatch) => void; selected?: boolean }) {
  const decided = !!m.winnerTeamId && ["verified", "completed", "walkover", "disqualified"].includes(m.status);
  const style = STATUS_STYLE[m.status] ?? STATUS_STYLE.scheduled;
  if (m.isBye) {
    return (
      <div className="w-full rounded-2xl border border-dashed border-edge-strong bg-bg-sunken/60 px-3 py-2.5 text-xs text-ink-mut">
        <span className="font-semibold text-ink-sec">{entrantName(tournament, m.winnerTeamId)}</span> advances with a bye
      </div>
    );
  }
  const live = m.status === "live" || m.status === "paused";
  return (
    <button
      type="button"
      onClick={() => onSelect?.(m)}
      className={cn(
        "w-full rounded-2xl border bg-white text-left shadow-lift transition-all hover:-translate-y-0.5 hover:shadow-panel focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20",
        selected ? "border-brand ring-2 ring-brand/20" : live ? "border-violet-300" : m.status === "awaiting-verification" ? "border-amber-300" : "border-edge",
      )}
      aria-label={`${m.roundLabel} match ${m.matchNumber}: ${entrantName(tournament, m.teamAId)} versus ${entrantName(tournament, m.teamBId)}, ${style.label}`}
    >
      <TeamLine tournament={tournament} teamId={m.teamAId} score={m.scoreA} winner={decided && m.winnerTeamId === m.teamAId} loser={decided && !!m.teamAId && m.winnerTeamId !== m.teamAId} />
      <div className="mx-3 border-t border-slate-100" />
      <TeamLine tournament={tournament} teamId={m.teamBId} score={m.scoreB} winner={decided && m.winnerTeamId === m.teamBId} loser={decided && !!m.teamBId && m.winnerTeamId !== m.teamBId} />
      <div className={cn("flex items-center justify-between gap-2 rounded-b-2xl border-t border-slate-100 bg-bg-sunken/70 px-3 py-1.5 text-[11px] font-semibold", style.className)}>
        <span className="inline-flex items-center gap-1">
          {live ? <Radio className={cn("h-3 w-3", m.status === "live" && "animate-pulse")} /> : m.status === "awaiting-verification" ? <Clock className="h-3 w-3" /> : null}
          {style.label}
        </span>
        <span className="font-medium text-ink-mut">{m.scheduledAt && !decided && !live ? formatWhen(m.scheduledAt) : `Match ${m.matchNumber}`}</span>
      </div>
    </button>
  );
}

function TeamLine({ tournament, teamId, score, winner, loser }: { tournament: Tournament; teamId?: string; score?: number; winner: boolean; loser: boolean }) {
  const dq = tournament.entrants?.find((e) => e.id === teamId)?.status === "disqualified";
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      <span className={cn("flex min-w-0 items-center gap-1.5 text-sm", winner ? "font-semibold text-ink-lum" : loser ? "text-ink-mut" : teamId ? "text-ink-sec" : "italic text-ink-mut")}>
        {winner && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
        <span className={cn("truncate", dq && "line-through")}>{teamId ? entrantName(tournament, teamId) : "To be decided"}</span>
      </span>
      <span className={cn("font-display text-sm tabular", winner ? "font-bold text-ink-lum" : "text-ink-mut")}>{score ?? "–"}</span>
    </div>
  );
}
