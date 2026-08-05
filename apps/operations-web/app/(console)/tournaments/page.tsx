"use client";

import { useStore } from "@/lib/store";
import { tournamentViews, type TournamentView } from "@/lib/prototype/repositories";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { StatusChip, Badge } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function TournamentsPage() {
  const { territory, canAccess, state } = useStore();

  if (!canAccess("/tournaments")) return <PageFrame><PermissionDenied module="Tournaments" /></PageFrame>;

  const tournaments = tournamentViews(state, territory.id);

  return (
    <PageFrame>
      <PageHeader
        overline={`Tournaments · ${territory.name}`}
        title="The knockout"
        sub="Ladders, brackets and titles playing out across the territory tonight."
      />

      {tournaments.length === 0 ? (
        <div className="solid rounded-panel p-10 text-center mt-6">
          <p className="text-sm font-semibold text-ink-lum">No active brackets tonight</p>
          <p className="mt-1.5 text-xs text-ink-mut">The bracket is quiet. Switch to Hyderabad Central or Bengaluru South to view active knockout ladders.</p>
        </div>
      ) : (
        <Stagger className="mt-6 space-y-6">
          {tournaments.map((t) => (
            <Item key={t.id}>
              <BracketCard t={t} />
            </Item>
          ))}
        </Stagger>
      )}
    </PageFrame>
  );
}

function BracketCard({ t }: { t: TournamentView }) {
  const rounds = [...new Set(t.brackets.map((m) => m.round))];
  return (
    <div className="glass rounded-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-ink-lum">{t.title}</h2>
            <StatusChip value={t.status} />
          </div>
          <p className="mt-0.5 text-sm text-ink-mut">{t.format} · {t.teams} entrants · {t.round}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]">{t.venueName}</Badge>
          <Badge className="border border-white/8 bg-white/4 text-ink-sec">{t.phase}</Badge>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {rounds.map((round) => (
          <div key={round}>
            <p className="overline">{round}</p>
            <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
              {t.brackets
                .filter((m) => m.round === round)
                .map((m) => (
                  <div key={m.id} className="solid rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
                            m.winner && m.winner === m.teamA ? "bg-[#f7b955]/20 text-[#ffd28a]" : "bg-white/8 text-ink-mut"
                          }`}
                        >
                          {initials(m.teamA)}
                        </span>
                        <span className="truncate text-xs text-ink-sec">{m.teamA}</span>
                      </span>
                      <span className="text-[10px] tabular text-ink-mut">{m.scoreA ?? "—"}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
                            m.winner && m.winner === m.teamB ? "bg-[#f7b955]/20 text-[#ffd28a]" : "bg-white/8 text-ink-mut"
                          }`}
                        >
                          {initials(m.teamB)}
                        </span>
                        <span className="truncate text-xs text-ink-sec">{m.teamB}</span>
                      </span>
                      <span className="text-[10px] tabular text-ink-mut">{m.scoreB ?? "—"}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <StatusChip value={m.status} />
                      {m.winner && <span className="text-[10px] text-[#ffd28a]">Winner · {m.winner}</span>}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
