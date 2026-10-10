"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Clock, Handshake, Landmark, ReceiptText, ScrollText, ShieldCheck, Star } from "lucide-react";
import { Avatar, Badge, Card, DataTable, Empty, ErrorState, Skeleton, SkeletonRows, TONE_DOT, Timeline, Truncated, type Column } from "@/components/pulse";
import { artFor, artGradient } from "@/lib/approvals";
import { formatDate, formatDateTime, toDate } from "@/lib/console/records";
import { cn, inrMinor, maskPhone, relTime } from "@/lib/format";
import {
  agreementBadge,
  agreementSummary,
  commissionLabel,
  experienceBadge,
  memberBadge,
  settlementBadge,
  type MemberRow,
  type OrgEventRow,
  type OrgExperienceRow,
  type OrgTimelineItem,
} from "@/lib/organizers";
import { categoryEmoji } from "@/lib/overview";
import { EventStatusBadge, EventTitleCell, FillCell, priceLabel } from "@/components/events/cells";
import type { BoundedQuery, OneShot } from "@/lib/use-query";

type Raw = Record<string, unknown>;
export type DocRow = { id: string; raw: Raw };
export const docRow = (id: string, raw: Raw): DocRow => ({ id, raw });

/** Skeleton, error-with-retry, empty and truncated states around one bounded read. */
export function Loaded<T>({ q, empty, skeleton, children }: { q: BoundedQuery<T>; empty: ReactNode; skeleton?: ReactNode; children: (rows: T[]) => ReactNode }) {
  if (q.loading) return <>{skeleton ?? <SkeletonRows rows={4} />}</>;
  if (q.error) return <ErrorState message={q.error} onRetry={q.retry} />;
  if (q.rows.length === 0) return <>{empty}</>;
  return (
    <>
      {children(q.rows)}
      {q.truncated ? <Truncated shown={q.rows.length} className="mt-4" /> : null}
    </>
  );
}

export function SectionTitle({ id, icon, title, aside }: { id?: string; icon: ReactNode; title: string; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 id={id} className="flex items-center gap-2 font-display text-[17px] font-bold tracking-[-0.02em] text-text">
        <span aria-hidden className="text-primary [&>svg]:h-[18px] [&>svg]:w-[18px]">
          {icon}
        </span>
        {title}
      </h3>
      {aside}
    </div>
  );
}

/* ------------------------------------------------------------------ events */

export function EventsTab({ q }: { q: BoundedQuery<OrgEventRow> }) {
  const router = useRouter();
  const columns: Array<Column<OrgEventRow>> = [
    {
      key: "title",
      header: "Event",
      sort: (a, b) => a.title.localeCompare(b.title),
      cell: (e) => <EventTitleCell e={e} />,
    },
    {
      key: "starts",
      header: "Starts",
      sort: (a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0),
      cell: (e) => <span className="whitespace-nowrap text-[13px] text-text-2">{formatDateTime(e.startsAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (e) => <EventStatusBadge status={e.status} />,
    },
    {
      key: "sold",
      header: "Sold",
      width: "150px",
      sort: (a, b) => (a.sold ?? -1) - (b.sold ?? -1),
      cell: (e) => <FillCell e={e} />,
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      sort: (a, b) => (a.priceMinor ?? -1) - (b.priceMinor ?? -1),
      cell: (e) => priceLabel(e.priceMinor),
    },
  ];
  return (
    <Loaded q={q} skeleton={<DataTable rows={[]} columns={columns} rowKey={(e) => e.id} loading />} empty={<Card><Empty emoji="🗓️" title="No events yet" body="Events this organizer schedules show up here, newest first." /></Card>}>
      {(rows) => <DataTable rows={rows} columns={columns} rowKey={(e) => e.id} onRowClick={(e) => router.push(`/events/${e.id}`)} caption="Events by this organizer" className="max-h-[70vh]" />}
    </Loaded>
  );
}

/* ------------------------------------------------------------- experiences */

export function ExperiencesTab({ q, now }: { q: BoundedQuery<OrgExperienceRow>; now: Date | null }) {
  return (
    <Loaded
      q={q}
      skeleton={
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[230px] rounded-card" />
          ))}
        </div>
      }
      empty={<Card><Empty emoji="🧪" title="No experiences yet" body="Experiences are the templates events are scheduled from." /></Card>}
    >
      {(rows) => (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((x) => {
            const b = experienceBadge(x.status);
            return (
              <li key={x.id} className="glass relative flex min-w-0 flex-col overflow-hidden rounded-card">
                <div className="relative h-24 overflow-hidden" style={{ backgroundImage: artGradient(x.category, x.seed) }}>
                  <span aria-hidden className="absolute -bottom-3 right-3 select-none text-[64px] leading-none opacity-30">
                    {categoryEmoji(x.category)}
                  </span>
                  <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(11,10,18,0.55))]" />
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-pill bg-[rgba(11,10,18,0.78)] px-2.5 py-1 font-display text-[11px] font-bold leading-none text-text backdrop-blur-[6px]">
                    <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[b.tone])} />
                    {b.label}
                  </span>
                  {x.revision !== null && x.revision > 1 ? (
                    <span className="absolute right-3 top-3 rounded-pill bg-[rgba(11,10,18,0.78)] px-2.5 py-1 font-display text-[11px] font-bold leading-none text-text-2 backdrop-blur-[6px]">
                      Rev {x.revision}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h4 className="truncate font-display text-[16px] font-bold tracking-[-0.01em] text-text">{x.title}</h4>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-text-2">{x.tagline ?? "—"}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[12px] text-text-3">
                    <span className="truncate">
                      {artFor(x.category).label === "Experience" ? x.category ?? "—" : artFor(x.category).label}
                      {x.activity ? ` · ${x.activity}` : ""}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <Star aria-hidden className={cn("h-3.5 w-3.5", x.rating !== null && "fill-warn text-warn")} />
                      {x.rating !== null ? (
                        <>
                          <b className="num text-text">{x.rating.toFixed(1)}</b> ({x.ratingCount})
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-text-3">Updated {relTime(x.updatedAt, now ?? new Date())}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Loaded>
  );
}

/* ------------------------------------------------------------------- money */

export function MoneyTab({
  agreements,
  commercials,
  settlements,
  eventTitles,
}: {
  agreements: BoundedQuery<DocRow>;
  commercials: BoundedQuery<DocRow>;
  settlements: BoundedQuery<DocRow>;
  eventTitles: Map<string, string>;
}) {
  const summary = agreementSummary(agreements.rows);
  const current = summary.current?.raw ?? null;

  const settlementColumns: Array<Column<DocRow>> = [
    { key: "period", header: "Period ends", sort: (a, b) => (toDate(a.raw.periodEnd)?.getTime() ?? 0) - (toDate(b.raw.periodEnd)?.getTime() ?? 0), cell: (s) => <span className="whitespace-nowrap text-text-2">{formatDate(s.raw.periodEnd)}</span> },
    { key: "gross", header: "Gross", align: "right", cell: (s) => inrMinor(s.raw.grossMinor as number) },
    { key: "commission", header: "Commission", align: "right", cell: (s) => inrMinor(s.raw.commissionMinor as number) },
    { key: "refunds", header: "Refunds", align: "right", cell: (s) => inrMinor(s.raw.refundsMinor as number) },
    { key: "net", header: "Net payout", align: "right", sort: (a, b) => Number(a.raw.netMinor ?? 0) - Number(b.raw.netMinor ?? 0), cell: (s) => <b className="font-bold text-text">{inrMinor(s.raw.netMinor as number)}</b> },
    {
      key: "status",
      header: "Status",
      cell: (s) => {
        const b = settlementBadge(s.raw.status);
        return <Badge tone={b.tone}>{b.label}</Badge>;
      },
    },
  ];

  const commercialColumns: Array<Column<DocRow>> = [
    {
      key: "event",
      header: "Event",
      cell: (c) => {
        const id = typeof c.raw.eventId === "string" ? c.raw.eventId : c.id;
        return (
          <div className="min-w-0">
            <div className="truncate font-semibold text-text">{eventTitles.get(id) ?? "—"}</div>
            <div className="truncate font-mono text-[11px] text-text-3">{id}</div>
          </div>
        );
      },
    },
    { key: "bps", header: "Commission", align: "right", sort: (a, b) => Number(a.raw.commissionBps ?? 0) - Number(b.raw.commissionBps ?? 0), cell: (c) => commissionLabel(c.raw.commissionBps) },
    { key: "agreement", header: "Agreement", cell: (c) => <span className="font-mono text-[12px] text-text-2">{typeof c.raw.commercialAgreementId === "string" ? c.raw.commercialAgreementId : "—"}</span> },
    { key: "published", header: "Published", cell: (c) => <span className="whitespace-nowrap text-[13px] text-text-2">{formatDateTime(c.raw.publishedAt)}</span> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card as="section" aria-labelledby="terms-title" className="overflow-hidden">
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(60%_100%_at_0%_0%,rgba(142,114,255,0.22),transparent_70%)]" />
          <div className="relative">
            <SectionTitle id="terms-title" icon={<Handshake />} title="Terms in force" />
            {agreements.loading ? (
              <Skeleton className="h-24 rounded-[16px]" />
            ) : agreements.error ? (
              <ErrorState message={agreements.error} onRetry={agreements.retry} className="py-4" />
            ) : current ? (
              <div>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                  <div>
                    <div className="num text-[56px] font-bold leading-none text-text">{commissionLabel(current.commissionBps)}</div>
                    <div className="mt-2 text-[13px] text-text-3">platform commission</div>
                  </div>
                  <div className="pb-1">
                    <div className="font-display text-[22px] font-bold capitalize text-text">{typeof current.payoutCadence === "string" ? current.payoutCadence : "—"}</div>
                    <div className="mt-1 text-[13px] text-text-3">payouts</div>
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                  <dt className="text-text-3">Approved</dt>
                  <dd className="text-text-2">{formatDateTime(current.decidedAt)}</dd>
                  <dt className="text-text-3">Agreement</dt>
                  <dd className="break-all font-mono text-[12px] text-text-2">{summary.current?.id}</dd>
                  {typeof current.note === "string" && current.note ? (
                    <>
                      <dt className="text-text-3">Note</dt>
                      <dd className="text-text-2">“{current.note}”</dd>
                    </>
                  ) : null}
                </dl>
              </div>
            ) : (
              <Empty emoji="🤝" title="No terms in force" body="Events can't be published until an agreement is approved. Propose terms above." className="py-6" />
            )}
          </div>
        </Card>

        <Card as="section" className="flex flex-col">
          <SectionTitle icon={<Clock />} title="Agreement history" aside={summary.pending.length ? <Badge tone="volt">{summary.pending.length} pending</Badge> : null} />
          {agreements.loading ? (
            <SkeletonRows rows={2} />
          ) : agreements.error ? null : summary.history.length === 0 ? (
            <p className="text-[13px] text-text-3">Nothing proposed yet.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {summary.history.slice(0, 6).map((a) => {
                const b = agreementBadge(a.raw.status);
                return (
                  <li key={a.id} className="flex items-center gap-3 rounded-control border border-line-soft bg-[rgba(255,255,255,0.025)] px-3.5 py-2.5">
                    <span className="num w-14 shrink-0 text-[18px] font-bold text-text">{commissionLabel(a.raw.commissionBps)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] capitalize text-text-2">{typeof a.raw.payoutCadence === "string" ? a.raw.payoutCadence : "—"} payouts</span>
                      <span className="block truncate text-[12px] text-text-3">Proposed {formatDate(a.raw.proposedAt ?? a.raw.createdAt)}</span>
                    </span>
                    <Badge tone={b.tone}>{b.label}</Badge>
                  </li>
                );
              })}
            </ol>
          )}
          {agreements.truncated ? <Truncated shown={agreements.rows.length} order="newest" noun="agreements" className="mt-3" /> : null}
        </Card>
      </div>

      <section aria-labelledby="settlements-title">
        <SectionTitle id="settlements-title" icon={<Landmark />} title="Settlements" />
        <Loaded
          q={settlements}
          skeleton={<DataTable rows={[]} columns={settlementColumns} rowKey={(s) => s.id} loading />}
          empty={<Card><Empty emoji="🏦" title="No settlements yet" body="Payout batches built for this organizer appear here." className="py-8" /></Card>}
        >
          {(rows) => <DataTable rows={rows} columns={settlementColumns} rowKey={(s) => s.id} caption="Settlements" />}
        </Loaded>
      </section>

      <section aria-labelledby="commercials-title">
        <SectionTitle id="commercials-title" icon={<ReceiptText />} title="Commission per published event" />
        <Loaded
          q={commercials}
          skeleton={<DataTable rows={[]} columns={commercialColumns} rowKey={(c) => c.id} loading />}
          empty={<Card><Empty emoji="🧾" title="No published events" body="Each event snapshots its commission when it's published." className="py-8" /></Card>}
        >
          {(rows) => <DataTable rows={rows} columns={commercialColumns} rowKey={(c) => c.id} caption="Commission snapshot per event" />}
        </Loaded>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------- team */

const PERMISSION_LABEL = (p: string) => p.replace(".", " · ");

export function TeamTab({ q, names }: { q: BoundedQuery<MemberRow>; names: OneShot<Record<string, { name: string | null; phone: string | null }>> }) {
  return (
    <Loaded
      q={q}
      skeleton={<SkeletonRows rows={3} />}
      empty={<Card><Empty emoji="👥" title="No team yet" body="The owner joins when they redeem their Organizer Code; staff are invited from the PULSE app." /></Card>}
    >
      {(rows) => (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((m) => {
            const person = names.value?.[m.uid] ?? null;
            const name = person?.name ?? null;
            const owner = m.role === "owner";
            return (
              <li key={m.id} className="glass rounded-card p-5">
                <div className="flex items-start gap-3">
                  <Avatar name={name ?? m.uid} size={46} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[16px] font-bold text-text">
                      {names.loading ? <Skeleton className="h-4 w-32 rounded-pill" /> : name ?? "—"}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-text-2">{names.loading ? "…" : maskPhone(person?.phone)}</div>
                    <div className="truncate font-mono text-[11px] text-text-3">{m.uid}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={owner ? "violet" : "info"}>{owner ? "Owner" : "Staff"}</Badge>
                    <Badge tone={memberBadge(m.status).tone}>{memberBadge(m.status).label}</Badge>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
                  <div className="rounded-[14px] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                    <dt className="text-text-3">Title</dt>
                    <dd className="truncate font-semibold text-text">{m.title ?? "—"}</dd>
                  </div>
                  <div className="rounded-[14px] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                    <dt className="text-text-3">Scope</dt>
                    <dd className="truncate font-semibold text-text">{m.scope}</dd>
                  </div>
                  <div className="rounded-[14px] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                    <dt className="text-text-3">Since</dt>
                    <dd className="truncate font-semibold text-text">{formatDate(m.since)}</dd>
                  </div>
                </dl>
                <details className="group mt-3">
                  <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1.5 rounded-[10px] text-[12px] font-semibold text-text-2 hover:text-text">
                    <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-primary" />
                    {m.permissions.length} permissions
                    <span aria-hidden className="transition-transform duration-150 group-open:rotate-90">›</span>
                  </summary>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {m.permissions.map((p) => (
                      <li key={p} className="rounded-pill bg-[rgba(142,114,255,0.12)] px-2 py-0.5 text-[11px] font-medium text-[#C2B4FF]">
                        {PERMISSION_LABEL(p)}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </Loaded>
  );
}

/* ---------------------------------------------------------------- timeline */

export function TimelineTab({
  items,
  loading,
  error,
  truncated,
  onRetry,
  emptyBody = "Every action on or by this organizer is recorded here.",
}: {
  items: OrgTimelineItem[];
  loading: boolean;
  error: string | null;
  truncated: boolean;
  onRetry: () => void;
  emptyBody?: string;
}) {
  return (
    <Card>
      <SectionTitle icon={<ScrollText />} title="Audit trail" aside={!loading && !error ? <span className="text-[12px] text-text-3">{items.length} events · newest first</span> : null} />
      {loading ? (
        <SkeletonRows rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <Empty emoji="📜" title="No audit events yet" body={emptyBody} />
      ) : (
        <>
          <Timeline items={items} />
          {truncated ? <Truncated shown={items.length} order="newest" noun="entries" className="mt-5" /> : null}
        </>
      )}
    </Card>
  );
}
