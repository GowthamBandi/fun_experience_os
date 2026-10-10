"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Ban, Lock, MapPin, Pause, Play, Search, Users, X } from "lucide-react";
import { Badge, Button, Card, Chip, CopyIdPill, Drawer, Empty, ErrorState, PageHeader, Skeleton, Tooltip, Truncated } from "@/components/pulse";
import { StatusSheet } from "@/components/governance/StatusSheet";
import { PageContainer } from "@/components/shell/PageContainer";
import { useAdminSession } from "@/lib/firebase/auth";
import { ARENA_FILTERS, arenaCounts, arenaStatusActions, arenaStatusBadge, filterArenas, sortArenas, toArena, type ArenaCard, type ArenaFilter } from "@/lib/arenas";
import { ROLE_LABEL, can } from "@/lib/console/capabilities";
import { formatDateTime } from "@/lib/console/records";
import { cn, countFull } from "@/lib/format";
import { useGovernanceCollection } from "@/lib/use-governance";
import type { StatusAction } from "@/lib/organizers";

const FILTER_EMPTY: Record<ArenaFilter, { emoji: string; title: string; body: string }> = {
  all: { emoji: "🪧", title: "No arenas yet 🏟", body: "Approved venues appear here once they are verified." },
  active: { emoji: "😴", title: "No active arenas", body: "No venue is open for events right now." },
  approved: { emoji: "✅", title: "No approved-only arenas", body: "Arenas approved but not yet set active show here." },
  review: { emoji: "🔍", title: "Nothing under review", body: "No arena is waiting for verification." },
  paused: { emoji: "⏸️", title: "Nothing is paused", body: "Paused arenas can't be picked for new events." },
  blocked: { emoji: "🛡️", title: "Nothing is blocked", body: "All clear: no arena is blocked." },
};

const ICON = { active: <Play />, paused: <Pause />, blocked: <Ban /> } as const;

export function ArenasView() {
  const { records, loading, error, truncated, refresh, order } = useGovernanceCollection("arenas");
  const [filter, setFilter] = useState<ArenaFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cards = useMemo(() => sortArenas(records.map((r) => toArena(r.id, r.raw))), [records]);
  const counts = useMemo(() => arenaCounts(cards), [cards]);
  const shown = useMemo(() => filterArenas(cards, filter, search), [cards, filter, search]);
  const ready = !loading && !error;
  // The live record behind the open drawer: versions move under us.
  const selected = selectedId ? records.find((r) => r.id === selectedId) ?? null : null;

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Marketplace"
        title={
          <>
            Arenas
            {ready && counts.active + counts.approved > 0 ? (
              <>
                {" "}
                <em className="hl">{counts.active + counts.approved} open</em>
              </>
            ) : null}
          </>
        }
        subtitle="Venues organizers can host at. Pause or block an arena based on ownership, safety, capacity and inspection evidence."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-2">
          {ARENA_FILTERS.map((f) => (
            <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
              <span
                className={cn(
                  "inline-grid h-[18px] min-w-[18px] place-items-center rounded-pill px-1.5 font-display text-[11px] font-bold leading-none",
                  filter === f.id ? "bg-ink text-text" : "bg-[rgba(255,255,255,0.08)] text-text-2",
                )}
              >
                {ready ? counts[f.id] : "·"}
              </span>
            </Chip>
          ))}
        </div>
        <label className="field ml-auto flex h-10 w-full items-center gap-2 rounded-control px-3.5 sm:w-[320px]">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-text-3" />
          <span className="sr-only">Search arenas</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, city, sport…"
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-text-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="focus-ring grid h-6 w-6 place-items-center rounded-[8px] text-text-3 hover:text-text">
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
      </div>

      {loading ? (
        <div aria-busy="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="glass rounded-card p-5" style={{ opacity: 1 - i * 0.1 }}>
              <Skeleton className="h-5 w-2/3 rounded-pill" />
              <Skeleton className="mt-3 h-3 w-1/3 rounded-pill" />
              <Skeleton className="mt-6 h-3 w-full rounded-pill" />
            </div>
          ))}
          <span className="sr-only" role="status">
            Loading arenas…
          </span>
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          {search.trim() ? (
            <Empty emoji="🔎" title={`No match for “${search.trim()}”`} body="Try a name, city or sport, or clear the search." />
          ) : (
            <Empty {...FILTER_EMPTY[filter]} />
          )}
        </Card>
      ) : (
        <>
          <p className="sr-only" role="status">
            {shown.length} {shown.length === 1 ? "arena" : "arenas"} shown
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((card) => (
              <li key={card.id} className="min-w-0">
                <ArenaTile card={card} onOpen={() => setSelectedId(card.id)} />
              </li>
            ))}
          </ul>
        </>
      )}
      {ready && truncated ? <Truncated shown={records.length} order={order} /> : null}

      <ArenaDrawer open={!!selectedId} arena={selected ? toArena(selected.id, selected.raw) : null} raw={selected?.raw ?? null} onChanged={refresh} onClose={() => setSelectedId(null)} />
    </PageContainer>
  );
}

const capacityLabel = (a: ArenaCard) => (a.capacity !== null ? countFull(a.capacity) : a.capacityText ?? "—");

function ArenaTile({ card, onOpen }: { card: ArenaCard; onOpen: () => void }) {
  const badge = arenaStatusBadge(card.status);
  return (
    <Card interactive onClick={onOpen} aria-label={`Open ${card.name}`} className="flex h-full flex-col">
      <div className="flex items-start gap-3">
        <h2 className="line-clamp-2 min-w-0 flex-1 break-words font-display text-[18px] font-bold leading-6 tracking-[-0.02em] text-text">{card.name}</h2>
        <Badge tone={badge.tone} className="shrink-0">
          {badge.label}
        </Badge>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[13px] text-text-2">
        <MapPin aria-hidden className="h-3.5 w-3.5 text-text-3" />
        {card.city ?? "—"}
      </p>
      {card.summary ? <p className="mt-2 line-clamp-2 text-[13px] text-text-3">{card.summary}</p> : null}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line-soft pt-3.5 text-[12px] text-text-3">
        <span className="inline-flex items-center gap-1.5">
          <Users aria-hidden className="h-3.5 w-3.5" />
          Capacity{" "}
          <b className="num text-[13px] font-bold text-text">{capacityLabel(card)}</b>
        </span>
        <span className="num">v{card.version}</span>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-3 text-[13px]">
      <dt className="text-text-3">{label}</dt>
      <dd className="min-w-0 break-words text-text">{children}</dd>
    </div>
  );
}

function ArenaDrawer({ open, arena, raw, onChanged, onClose }: { open: boolean; arena: ArenaCard | null; raw: Record<string, unknown> | null; onChanged: () => void; onClose: () => void }) {
  const { consoleRole: role } = useAdminSession();
  const permitted = can(role, "governance.decide");
  const [action, setAction] = useState<StatusAction | null>(null);
  const live = useRef(raw);
  live.current = raw;
  const badge = arenaStatusBadge(arena?.status);

  return (
    <>
      <Drawer open={open} title={arena?.name ?? "Arena unavailable"} onClose={onClose}>
        {!arena ? (
          <p role="status" className="rounded-control border border-dashed border-[rgba(255,184,77,0.35)] px-3.5 py-3 text-[13px] text-warn">
            This arena is no longer in the live list (it may have been removed, or you lost access). Close the panel and refresh the list.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={badge.tone}>{badge.label}</Badge>
              <CopyIdPill id={arena.id} noun="arena" />
            </div>

            <dl className="divide-y divide-line-soft rounded-control border border-line-soft px-4">
              <Field label="City">{arena.city ?? "—"}</Field>
              <Field label="Address">{arena.address ?? "—"}</Field>
              <Field label="Capacity">{capacityLabel(arena)}</Field>
              <Field label="Summary">{arena.summary ?? "—"}</Field>
              <Field label="Sports">{arena.sports.length ? arena.sports.join(", ") : "—"}</Field>
              <Field label="Owner">{arena.ownerId ?? "—"}</Field>
              <Field label="Status reason">{arena.statusReason ?? "—"}</Field>
              <Field label="Version">{arena.version}</Field>
              <Field label="Updated">{arena.updatedAt ? formatDateTime(arena.updatedAt) : "—"}</Field>
            </dl>

            <section aria-label="Status actions" className="flex flex-col gap-3">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-3">Status</h3>
              {permitted ? (
                <div className="flex flex-wrap items-center gap-2" data-testid="arena-actions">
                  {arenaStatusActions(arena.status).map((a) => (
                    <Button key={a.status} variant={a.status === "active" ? "volt" : a.status === "blocked" ? "danger" : "ghost"} icon={ICON[a.status]} onClick={() => setAction(a)}>
                      {a.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <Tooltip label={`${role ? ROLE_LABEL[role] : "Your role"} can view arenas but not change them.`}>
                  <span tabIndex={0} className="focus-ring inline-flex h-10 w-fit items-center gap-2 rounded-pill border border-line px-4 text-[13px] font-semibold text-text-3" data-testid="actions-read-only">
                    <Lock aria-hidden className="h-4 w-4" />
                    Read-only
                  </span>
                </Tooltip>
              )}
              <p className="text-[12px] text-text-3">Paused and blocked arenas can&apos;t be picked for new or edited events. Events already scheduled there are not changed.</p>
            </section>
          </div>
        )}
      </Drawer>
      {arena ? (
        <StatusSheet action={action} entityType="arena" entityId={arena.id} noun="arena" name={arena.name} getVersion={() => live.current?.version} onChanged={onChanged} onClose={() => setAction(null)} />
      ) : null}
    </>
  );
}
