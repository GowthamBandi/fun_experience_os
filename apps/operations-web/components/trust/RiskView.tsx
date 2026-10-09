"use client";

import { Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Ban, CheckCircle2, Eye, PauseCircle, RotateCcw } from "lucide-react";
import { Badge, Button, Card, CopyIdPill, Drawer, Empty, ErrorState, Glyph, PageHeader, Skeleton, SkeletonRows, Truncated } from "@/components/pulse";
import { SummaryPill } from "@/components/events/EventTabs";
import { StatusSheet, type SheetStatusAction } from "@/components/governance/StatusSheet";
import { PageContainer } from "@/components/shell/PageContainer";
import { useAdminSession } from "@/lib/firebase/auth";
import { can } from "@/lib/console/capabilities";
import { formatDateTime } from "@/lib/console/records";
import { relTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { orgStatusBadge, statusActions } from "@/lib/organizers";
import {
  RISK_FILTERS,
  alertActions,
  blockTarget,
  filterRisks,
  riskCounts,
  riskDetailRows,
  riskEntityLinks,
  riskGlyph,
  riskStatusBadge,
  severityBadge,
  sortRisks,
  toRiskAlert,
  type AlertAction,
  type RiskAlert,
  type RiskFilter,
} from "@/lib/trust";
import { useGovernanceCollection, useLiveDocument } from "@/lib/use-governance";
import { useSearchParamSetter } from "@/lib/use-search-param";
import { CountChips, ReadOnly, SearchField } from "./TrustBits";

const FILTER_EMPTY: Record<RiskFilter, { emoji: string; title: string; body: string }> = {
  open: { emoji: "🛡️", title: "All clear", body: "No open risk alerts. Payment, refund and retention anomalies appear here the moment the server raises them." },
  closed: { emoji: "🗂️", title: "Nothing closed yet", body: "Resolved alerts move here." },
  all: { emoji: "🛡️", title: "No risk alerts yet", body: "The server raises alerts for payment mismatches, failed refunds and retention conflicts." },
};

const ICON: Record<AlertAction["status"], ReactNode> = { resolved: <CheckCircle2 />, "under-review": <Eye />, paused: <PauseCircle /> };

export function RiskView() {
  return (
    <Suspense
      fallback={
        <PageContainer className="flex flex-col gap-6">
          <Skeleton className="h-10 w-64 rounded-pill" />
          <SkeletonRows rows={5} />
        </PageContainer>
      }
    >
      <Risk />
    </Suspense>
  );
}

function Risk() {
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("riskAlerts");
  const params = useSearchParams();
  const setParam = useSearchParamSetter();
  const now = useNow();
  const [filter, setFilter] = useState<RiskFilter>("open");
  const [search, setSearch] = useState("");

  const alerts = useMemo(() => sortRisks(records.map((r) => toRiskAlert(r.id, r.raw))), [records]);
  const counts = useMemo(() => riskCounts(alerts), [alerts]);
  const shown = useMemo(() => filterRisks(alerts, filter, search), [alerts, filter, search]);
  const open = alerts.filter((a) => a.open);
  const bySeverity = {
    high: open.filter((a) => a.severity === "critical" || a.severity === "high").length,
    medium: open.filter((a) => a.severity === "medium").length,
    low: open.filter((a) => a.severity === "low" || a.severity === null).length,
  };
  const ready = !loading && !error;
  const selectedId = params.get("alert");
  // The live record behind the open drawer: versions move under us.
  const selected = selectedId ? records.find((r) => r.id === selectedId) ?? null : null;

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Trust"
        title={
          <>
            Risk & fraud
            {ready && counts.open > 0 ? (
              <>
                {" "}
                <em className="hl">{counts.open} open</em>
              </>
            ) : null}
          </>
        }
        subtitle="Payment mismatches, failed refunds and retention conflicts the server flagged. Investigate, then resolve, keep open or block the organizer behind it."
      />

      {ready && alerts.length > 0 ? (
        <ul aria-label="Open alerts by severity" className="flex flex-wrap gap-2 text-[12px]">
          <SummaryPill tone="err" label="High" value={bySeverity.high} />
          <SummaryPill tone="warn" label="Medium" value={bySeverity.medium} />
          <SummaryPill tone="violet" label="Low" value={bySeverity.low} />
          <SummaryPill tone="ok" label="Closed" value={counts.closed} />
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <CountChips label="Filter by status" filters={RISK_FILTERS} value={filter} counts={counts} ready={ready} onChange={setFilter} />
        <SearchField value={search} onChange={setSearch} label="Search alerts" placeholder="Search kind, organizer, booking…" />
      </div>

      {loading ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="glass flex items-center gap-4 rounded-card p-5" style={{ opacity: 1 - i * 0.12 }}>
              <Skeleton className="h-10 w-10 rounded-[13px]" />
              <div className="flex-1">
                <Skeleton className="h-4 w-1/3 rounded-pill" />
                <Skeleton className="mt-2.5 h-3 w-2/3 rounded-pill" />
              </div>
            </div>
          ))}
          <span className="sr-only" role="status">
            Loading risk alerts…
          </span>
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          {search.trim() ? <Empty emoji="🔎" title={`No match for “${search.trim()}”`} body="Try a kind, organizer or booking ID, or clear the search." /> : <Empty {...FILTER_EMPTY[filter]} />}
        </Card>
      ) : (
        <>
          <p className="sr-only" role="status">
            {shown.length} {shown.length === 1 ? "alert" : "alerts"} shown
          </p>
          <ul className="flex flex-col gap-3">
            {shown.map((a) => (
              <li key={a.id}>
                <AlertRow alert={a} now={now} onOpen={() => setParam("alert", a.id)} />
              </li>
            ))}
          </ul>
        </>
      )}
      {ready && truncated ? <Truncated shown={records.length} /> : null}

      <AlertDrawer open={!!selectedId} loading={loading} alert={selected ? toRiskAlert(selected.id, selected.raw) : null} raw={selected?.raw ?? null} now={now} onChanged={refresh} onClose={() => setParam("alert", null)} />
    </PageContainer>
  );
}

function AlertRow({ alert, now, onOpen }: { alert: RiskAlert; now: Date | null; onOpen: () => void }) {
  const glyph = riskGlyph(alert.severity);
  const sev = severityBadge(alert.severity);
  const status = riskStatusBadge(alert.status);
  const entity = riskEntityLinks(alert)[0] ?? null;
  return (
    <div className="glass flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card p-4 transition-[border-color] duration-200 ease-pulse hover:border-[rgba(142,114,255,0.4)] sm:flex-nowrap sm:p-5">
      <button type="button" onClick={onOpen} aria-label={`Open ${alert.title}`} className="focus-ring flex min-w-0 flex-1 items-center gap-4 rounded-[16px] text-left">
        <Glyph emoji={glyph.emoji} tone={glyph.tone} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[16px] font-bold tracking-[-0.01em] text-text">{alert.title}</span>
            <Badge tone={sev.tone}>{sev.label}</Badge>
          </span>
          <span className="mt-1 line-clamp-2 block text-[13px] leading-5 text-text-2">{alert.summary ?? "—"}</span>
        </span>
      </button>
      <div className="flex w-full shrink-0 items-center gap-3 text-[12px] sm:w-auto">
        {entity ? (
          <Link href={entity.href} className="focus-ring inline-flex max-w-[180px] items-center gap-1 truncate rounded-[8px] font-semibold text-text-2 underline-offset-2 hover:text-text hover:underline">
            {entity.label}
            <ArrowUpRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
          </Link>
        ) : (
          <span className="text-text-3">No linked record</span>
        )}
        <span className="num whitespace-nowrap text-text-3" title={formatDateTime(alert.lastSeenAt ?? alert.createdAt)}>
          {now ? relTime(alert.lastSeenAt ?? alert.createdAt, now) : "—"}
        </span>
        <Badge tone={status.tone} className="ml-auto sm:ml-0">
          {status.label}
        </Badge>
      </div>
    </div>
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

function When({ at, now }: { at: Date | null; now: Date | null }) {
  if (!at) return <>—</>;
  return (
    <>
      {formatDateTime(at)}
      {now ? <span className="text-text-3"> · {relTime(at, now)}</span> : null}
    </>
  );
}

function AlertDrawer({ open, loading, alert, raw, now, onChanged, onClose }: { open: boolean; loading: boolean; alert: RiskAlert | null; raw: Record<string, unknown> | null; now: Date | null; onChanged: () => void; onClose: () => void }) {
  const { consoleRole: role } = useAdminSession();
  const permitted = can(role, "governance.decide");
  const [action, setAction] = useState<SheetStatusAction | null>(null);
  const [blockAction, setBlockAction] = useState<SheetStatusAction | null>(null);
  const live = useRef(raw);
  live.current = raw;
  const target = alert ? blockTarget(alert) : null;
  const org = useLiveDocument(target ? "organizers" : null, target?.id ?? null);
  const orgLive = useRef(org.data);
  orgLive.current = org.data;

  const glyph = riskGlyph(alert?.severity ?? null);
  const sev = severityBadge(alert?.severity ?? null);
  const status = riskStatusBadge(alert?.status ?? null);
  const orgName = org.data ? String(org.data.name ?? org.data.subject ?? "") || target?.id || "" : target?.id ?? "";
  const block = org.data ? statusActions(org.data.status).find((a) => a.status === "blocked") ?? null : null;

  return (
    <>
      <Drawer open={open} title={alert?.title ?? (loading ? "Loading alert…" : "Alert unavailable")} onClose={onClose}>
        {!alert && loading ? (
          <SkeletonRows rows={4} />
        ) : !alert ? (
          <p role="status" className="rounded-control border border-dashed border-[rgba(255,184,77,0.35)] px-3.5 py-3 text-[13px] text-warn">
            This alert is no longer in the live list (it may have been removed, or you lost access). Close the panel and refresh the list.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-start gap-3">
              <Glyph emoji={glyph.emoji} tone={glyph.tone} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={sev.tone}>{sev.label}</Badge>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <CopyIdPill id={alert.id} noun="alert" />
                </div>
                <p className="mt-3 text-[14px] leading-[1.55] text-text-2">{alert.summary ?? "—"}</p>
              </div>
            </div>

            {riskEntityLinks(alert).length ? (
              <section aria-label="Linked records" className="flex flex-wrap gap-2">
                {riskEntityLinks(alert).map((l) => (
                  <Link key={l.label} href={l.href} className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-pill border border-line bg-surface-high px-3.5 text-[13px] font-semibold text-text hover:bg-surface-top">
                    {l.label}
                    <span className="max-w-[120px] truncate font-mono text-[11px] font-normal text-text-3">{l.id}</span>
                    <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                ))}
              </section>
            ) : null}

            <dl className="divide-y divide-line-soft rounded-control border border-line-soft px-4">
              <Field label="Kind">{alert.kind ?? "—"}</Field>
              <Field label="Opened"><When at={alert.createdAt} now={now} /></Field>
              <Field label="Last seen"><When at={alert.lastSeenAt} now={now} /></Field>
              <Field label="Status note">{alert.statusReason ?? "—"}</Field>
              <Field label="Updated"><When at={alert.updatedAt} now={now} /></Field>
              <Field label="Version">{alert.version}</Field>
            </dl>

            {Object.keys(alert.detail).length ? (
              <section aria-label="Alert detail">
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-3">Detail</h3>
                <dl className="divide-y divide-line-soft rounded-control border border-line-soft px-4">
                  {riskDetailRows(alert.detail).map((r) => (
                    <Field key={r.label} label={r.label}>
                      <span className="font-mono text-[12px]">{r.value}</span>
                    </Field>
                  ))}
                </dl>
              </section>
            ) : null}

            <section aria-label="Alert actions" className="flex flex-col gap-3">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-3">Decision</h3>
              {permitted ? (
                <div className="flex flex-wrap items-center gap-2" data-testid="alert-actions">
                  {alertActions(alert.status).map((a) => (
                    <Button key={a.status} variant={a.status === "resolved" ? "volt" : a.status === "paused" ? "danger" : "ghost"} icon={a.label === "Reopen" ? <RotateCcw /> : ICON[a.status]} onClick={() => setAction(a)}>
                      {a.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <ReadOnly role={role} what="risk alerts" />
              )}
            </section>

            <section aria-label="Block entity" className="flex flex-col gap-3 rounded-control border border-[rgba(255,97,120,0.25)] bg-[rgba(255,97,120,0.05)] p-4">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-err">Block entity</h3>
              {!target ? (
                <p className="text-[13px] text-text-2">This alert names no organizer, so there is nothing to block from here.</p>
              ) : org.loading ? (
                <Skeleton className="h-10 w-48 rounded-pill" />
              ) : org.error ? (
                <p role="alert" className="text-[13px] text-err">{org.error}</p>
              ) : !org.data ? (
                <p className="text-[13px] text-warn">Organizer {target.id} was not found.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-semibold text-text">{orgName}</span>
                    <Badge tone={orgStatusBadge(org.data.status).tone}>{orgStatusBadge(org.data.status).label}</Badge>
                  </div>
                  {!permitted ? (
                    <ReadOnly role={role} what="organizers" />
                  ) : block ? (
                    <Button variant="danger" icon={<Ban />} className="w-fit" onClick={() => setBlockAction({ ...block, label: "Block", confirm: "Block organizer" })}>
                      Block organizer
                    </Button>
                  ) : (
                    <p className="text-[13px] text-text-3">This organizer is already blocked.</p>
                  )}
                </>
              )}
              <p className="text-[12px] text-text-3">Only the organizer can be blocked from an alert. Events are never blocked here: cancel an event from its page so bookings are refunded.</p>
            </section>
          </div>
        )}
      </Drawer>
      {alert ? (
        <StatusSheet action={action} entityType="risk-alert" entityId={alert.id} noun="alert" name={alert.title} getVersion={() => live.current?.version} onChanged={onChanged} onClose={() => setAction(null)} />
      ) : null}
      {target ? (
        <StatusSheet action={blockAction} entityType="organizer" entityId={target.id} noun="organizer" name={orgName} getVersion={() => orgLive.current?.version} onChanged={() => undefined} onClose={() => setBlockAction(null)} />
      ) : null}
    </>
  );
}
