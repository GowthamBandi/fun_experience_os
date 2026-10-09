"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { Badge, Button, Card, Chip, CopyIdPill, Drawer, Empty, ErrorState, PageHeader, Skeleton, SkeletonRows, Timeline, Truncated, type TimelineItem } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { SearchField } from "@/components/trust/TrustBits";
import { Field, Fields, Gone, useOrgNames } from "@/components/money/MoneyBits";
import { describeReadError } from "@/lib/console/errors";
import { mergeAuditPages } from "@/lib/console/audit";
import { formatDateTime, text, toDate, type DisplayRecord } from "@/lib/console/records";
import {
  EMPTY_AUDIT_VIEW,
  applyAuditView,
  auditFieldFacets,
  auditRoleFacets,
  auditRoleLabel,
  auditRoleOrgIds,
  auditTone,
  groupAuditByDay,
  humanize,
  isAuditFiltering,
  type AuditView,
} from "@/lib/control";
import { cn, countFull } from "@/lib/format";
import { fetchOlderAuditEvents, QUERY_LIMIT, type PageCursor } from "@/lib/governance-api";
import { useNow } from "@/lib/hooks";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useSearchParamSetter } from "@/lib/use-search-param";
import { useSearchParams } from "next/navigation";
import { ControlSuspense, JsonBlock, SummaryPill } from "./ControlBits";


export function AuditTimeline() {
  return (
    <ControlSuspense>
      <Audit />
    </ControlSuspense>
  );
}

/**
 * Audit trail: live newest page (QUERY_LIMIT) + "Load older" pages via startAfter on `at`
 * (single-field index only). Filters apply to everything loaded.
 */
function Audit() {
  const live = useGovernanceCollection("auditEvents");
  const [retained, setRetained] = useState<DisplayRecord[]>([]);
  const [olderCursor, setOlderCursor] = useState<PageCursor | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [paging, setPaging] = useState(false);
  const [view, setView] = useState<AuditView>(EMPTY_AUDIT_VIEW);
  const now = useNow();
  const params = useSearchParams();
  const setParam = useSearchParamSetter();

  const all = useMemo(() => mergeAuditPages(live.records, retained), [live.records, retained]);
  const orgIds = useMemo(() => auditRoleOrgIds(all), [all]);
  const names = useOrgNames(orgIds, "audit");
  const roles = useMemo(() => auditRoleFacets(all, names), [all, names]);
  const entities = useMemo(() => auditFieldFacets(all, "resourceType"), [all]);
  const actions = useMemo(() => auditFieldFacets(all, "action"), [all]);
  const visible = useMemo(() => applyAuditView(all, view), [all, view]);
  const groups = useMemo(() => groupAuditByDay(visible, now ?? new Date()), [visible, now]);
  const filtering = isAuditFiltering(view);
  const pagedOnce = retained.length > 0 || exhausted;
  const canLoadOlder = !exhausted && (pagedOnce ? !!olderCursor : live.truncated && !!live.cursor);
  const ready = !live.loading && !live.error;
  const selectedId = params.get("event");
  const selected = selectedId ? all.find((r) => r.id === selectedId) ?? null : null;
  const today = groups.find((g) => g.label === "Today")?.records.length ?? 0;

  async function loadOlder() {
    const cursor = pagedOnce ? olderCursor : live.cursor;
    if (!cursor || paging) return;
    setPaging(true);
    setPageError(null);
    try {
      const page = await fetchOlderAuditEvents(cursor);
      // Keep the live page as it was when paging started, so events pushed out of the live window by new ones stay visible.
      setRetained((prev) => mergeAuditPages(page.records, pagedOnce ? prev : [...live.records, ...prev]));
      setOlderCursor(page.cursor);
      setExhausted(!page.hasMore);
    } catch (cause) {
      setPageError(describeReadError(cause instanceof Error ? cause.message : String(cause)));
    } finally {
      setPaging(false);
    }
  }

  const set = (patch: Partial<AuditView>) => setView((prev) => ({ ...prev, ...patch }));

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Control"
        title={
          <>
            Audit <em className="hl">trail</em>
          </>
        }
        subtitle="Immutable decision history with actor, reason, policy version and evidence context for every privileged action. Nobody can edit or delete these records."
      />

      {!ready && !live.error ? (
        <div aria-hidden className="flex gap-2">
          <Skeleton className="h-[33px] w-24 rounded-pill" />
          <Skeleton className="h-[33px] w-24 rounded-pill" />
        </div>
      ) : null}
      {ready ? (
        <ul aria-label="Audit summary" className="flex flex-wrap gap-2 text-[12px]">
          <SummaryPill label={filtering ? "Matching (loaded)" : "Loaded"} value={countFull(filtering ? visible.length : all.length)} />
          {!filtering ? <SummaryPill label="Today" value={countFull(today)} /> : null}
          {pagedOnce ? <SummaryPill label="Paged back" value={`${countFull(retained.length)} older`} /> : null}
        </ul>
      ) : null}

      <Card className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Audit filters" role="search">
        <div className="flex flex-wrap items-center gap-3">
          <SearchField value={view.query} onChange={(query) => set({ query })} label="Search the audit trail" placeholder="Search action, ID, actor or reason" />
          {filtering ? (
            <Button variant="quiet" size="sm" onClick={() => setView(EMPTY_AUDIT_VIEW)}>
              Clear filters
            </Button>
          ) : null}
        </div>
        <FilterRow label="Actor role" all="All roles" value={view.role} onChange={(role) => set({ role })} loading={live.loading} scroll options={roles.map((r) => ({ value: r.value, label: r.label, count: r.count }))} />
        <FilterRow label="Entity" all="All entities" value={view.entity} onChange={(entity) => set({ entity })} loading={live.loading} scroll options={entities.map((e) => ({ value: e.value, label: humanize(e.value), count: e.count }))} />
        <FilterRow label="Action" all="All actions" value={view.action} onChange={(action) => set({ action })} loading={live.loading} scroll options={actions.map((a) => ({ value: a.value, label: humanize(a.value), title: a.value, count: a.count }))} />
      </Card>

      {live.error ? (
        <Card>
          <ErrorState message={live.error} onRetry={live.refresh} />
        </Card>
      ) : live.loading ? (
        <SkeletonRows rows={6} />
      ) : groups.length === 0 ? (
        <Card>
          {filtering ? (
            <Empty
              emoji="🔎"
              title="No loaded events match"
              body={canLoadOlder ? "Filters apply to what's loaded. Load older events to search further back." : "Try a different search or clear the filters."}
              action={
                <Button variant="ghost" size="sm" onClick={() => setView(EMPTY_AUDIT_VIEW)}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <Empty emoji="📜" title="No audit records yet" body="Every privileged action (decisions, status changes, access changes) will be recorded here." />
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-5" data-testid="audit-timeline">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label} className="flex flex-col gap-2.5">
              <h2 className="flex items-baseline gap-2.5 px-1">
                <span className="font-display text-[18px] font-bold tracking-[-0.02em] text-text">{group.label}</span>
                {group.label === "Today" || group.label === "Yesterday" ? <span className="text-[12px] text-text-3">{istShort(group.key)}</span> : null}
                <span className="num rounded-pill bg-[rgba(255,255,255,0.07)] px-2 py-0.5 text-[11px] font-bold text-text-2">{group.records.length}</span>
              </h2>
              <Card className="px-5 py-5">
                <Timeline items={group.records.map((r) => toItem(r, names))} stamp="time" onSelect={(id) => setParam("event", id)} />
              </Card>
            </section>
          ))}
        </div>
      )}

      {ready && (canLoadOlder || pageError || exhausted) ? (
        <div className="flex flex-wrap items-center gap-3">
          {canLoadOlder ? (
            <Button variant="ghost" icon={<History />} loading={paging} onClick={() => void loadOlder()}>
              {paging ? "Loading…" : `Load ${QUERY_LIMIT} older`}
            </Button>
          ) : null}
          {exhausted ? <p className="text-[12px] text-text-3">Showing all {countFull(all.length)} audit records.</p> : null}
          {pageError ? (
            <span role="alert" className="text-[12px] text-err">
              {pageError}
            </span>
          ) : null}
        </div>
      ) : null}
      {ready && live.truncated && !exhausted ? <Truncated shown={all.length} newest={live.newest} noun="events" /> : null}

      <AuditDrawer open={!!selectedId} loading={live.loading} record={selected} names={names} onClose={() => setParam("event", null)} />
    </PageContainer>
  );
}

function istShort(key: string): string {
  if (key === "undated") return "";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));
}

function toItem(record: DisplayRecord, names: Record<string, string | null>): TimelineItem {
  const raw = record.raw;
  const resource = [text(raw, "resourceType"), text(raw, "resourceId")].filter((p) => p !== "—").join("/");
  const org = text(raw, "orgId");
  const reason = text(raw, "reason");
  const body = [[resource, org !== "—" ? names[org] ?? `org ${org}` : null].filter(Boolean).join(" · "), reason !== "—" ? `“${reason}”` : null].filter(Boolean).join(" — ");
  const actorUid = text(raw, "actorUid");
  const role = auditRoleLabel(raw, names);
  return {
    id: record.id,
    at: toDate(raw.at),
    title: humanize(text(raw, "action")),
    body: body || undefined,
    tone: auditTone(text(raw, "action")),
    actor: [actorUid, role !== "—" ? role : null].filter((p) => p && p !== "—").join(" · ") || undefined,
  };
}

function FilterRow({
  label,
  all,
  value,
  onChange,
  options,
  scroll = false,
  loading = false,
}: {
  label: string;
  all: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; count: number; title?: string }>;
  /** Caps the row at two chip lines (it scrolls), so a long facet list can't push the trail down. */
  scroll?: boolean;
  /** Reserves the two-line height while the facets load (no layout shift). */
  loading?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <span className="w-24 shrink-0 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">{label}</span>
      <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-2", scroll && "max-h-[84px] overflow-y-auto pr-1", loading && "min-h-[84px] content-start")}>
        <Chip selected={value === ""} onClick={() => onChange("")}>
          {all}
        </Chip>
        {loading ? (
          <>
            <Skeleton className="h-9 w-28 rounded-pill" />
            <Skeleton className="h-9 w-24 rounded-pill" />
            <Skeleton className="h-9 w-32 rounded-pill" />
          </>
        ) : null}
        {options.map((o) => (
          <Chip key={o.value} selected={value === o.value} title={o.title} onClick={() => onChange(value === o.value ? "" : o.value)}>
            {o.label}
            <span className={cn("inline-grid h-[18px] min-w-[18px] place-items-center rounded-pill px-1.5 font-display text-[11px] font-bold leading-none", value === o.value ? "bg-ink text-text" : "bg-[rgba(255,255,255,0.08)] text-text-2")}>{o.count}</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}

function AuditDrawer({ open, loading, record, names, onClose }: { open: boolean; loading: boolean; record: DisplayRecord | null; names: Record<string, string | null>; onClose: () => void }) {
  const raw = record?.raw ?? {};
  const action = text(raw, "action");
  const requestId = text(raw, "requestId");
  return (
    <Drawer open={open} title={record ? humanize(action) : loading ? "Loading event…" : "Audit record unavailable"} onClose={onClose}>
      {!record && loading ? (
        <SkeletonRows rows={4} />
      ) : !record ? (
        <Gone noun="audit record" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={auditTone(action)}>{action}</Badge>
            <CopyIdPill id={record.id} noun="audit event" />
          </div>
          <p className="num font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-text">{formatDateTime(raw.at)}</p>
          <Fields label="Audit record">
            <Field label="Actor" mono>{text(raw, "actorUid")}</Field>
            <Field label="Actor role">{auditRoleLabel(raw, names)}</Field>
            <Field label="Resource">{[text(raw, "resourceType"), text(raw, "resourceId")].filter((p) => p !== "—").join(" / ") || "—"}</Field>
            {typeof raw.orgId === "string" && names[raw.orgId] ? <Field label="Organizer">{names[raw.orgId]}</Field> : null}
            <Field label="Organizer ID" mono>{text(raw, "orgId")}</Field>
            <Field label="Reason">{text(raw, "reason")}</Field>
            <Field label="Request ID" mono>{requestId !== "—" ? <CopyIdPill id={requestId} noun="request" /> : "—"}</Field>
            <Field label="Source">{text(raw, "source")}</Field>
          </Fields>
          <JsonBlock label="Before" value={raw.before} />
          <JsonBlock label="After" value={raw.after} />
          <p className="rounded-control border border-dashed border-line px-3.5 py-3 text-[12px] leading-5 text-text-3">Audit records are append-only. Firestore rules deny every client write; nobody can edit or delete them from the console.</p>
        </div>
      )}
    </Drawer>
  );
}
