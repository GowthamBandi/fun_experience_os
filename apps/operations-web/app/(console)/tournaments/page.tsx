"use client";

import { useStore } from "@/lib/store";
import { repos } from "@/lib/data/mock";
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
  const { territory, canAccess } = useStore();

  if (!canAccess("/tournaments")) return <PageFrame><PermissionDenied module="Tournaments" /></PageFrame>;

  const tournaments = repos.tournaments().filter((t) => t.territoryId === territory.id);

  return (
    <PageFrame>
      <PageHeader
        overline={`Tournaments · ${territory.name}`}
        title="The knockout"
        sub="Ladders, brackets and titles playing out across the territory tonight."
      />

      <Stagger className="mt-6 space-y-6">
        {tournaments.map((t) => (
          <Item key={t.id}>
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
                  <Badge className="border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]">{t.prizePool}</Badge>
                  <Badge className="border border-white/8 bg-white/4 text-ink-sec">{t.phase}</Badge>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                {t.pods.map((p) => (
                  <div key={p.id} className="solid rounded-xl p-3">
                    <p className="overline">{p.label}</p>
                    <div className="mt-2 space-y-1.5">
                      {p.standings.map((entry, idx) => (
                        <div key={entry.id} className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={`w-4 shrink-0 text-[10px] tabular ${idx === 0 ? "text-[#ffd28a]" : "text-ink-mut"}`}>{idx + 1}</span>
                            <span
                              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
                                idx === 0 ? "bg-[#f7b955]/20 text-[#ffd28a]" : "bg-white/8 text-ink-mut"
                              }`}
                            >
                              {initials(entry.name)}
                            </span>
                            <span className="truncate text-xs text-ink-sec">{entry.name}</span>
                          </span>
                          <span className="text-[10px] tabular text-ink-mut">{entry.wins}W {entry.losses}L</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Item>
        ))}
      </Stagger>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
