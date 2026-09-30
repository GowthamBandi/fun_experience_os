"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { GovernanceModulePage } from "./GovernanceModulePage";
import { Drawer, FieldList, InfoNote } from "./controls";
import { fetchOlderAuditEvents, QUERY_LIMIT, type LiveGovernanceRecord, type PageCursor } from "@/lib/governance-api";
import { useGovernanceCollection } from "@/lib/use-governance";
import { describeReadError } from "@/lib/console/errors";
import { EMPTY_AUDIT_FILTER, auditFacets, filterAudit, mergeAuditPages, type AuditFilter } from "@/lib/console/audit";
import { auditActorRole, formatDateTime, text } from "@/lib/console/records";

const select = "h-10 rounded-xl border border-white/8 bg-[#0b121c] px-3 text-sm text-slate-300 outline-none focus:border-indigo-400/60";

/**
 * Audit trail: live newest page (QUERY_LIMIT) + "Load older" pages via
 * startAfter on `at` (single-field index only). Filters apply to everything loaded.
 */
export function AuditWorkspace() {
  const live = useGovernanceCollection("auditEvents");
  const [retained, setRetained] = useState<LiveGovernanceRecord[]>([]);
  const [olderCursor, setOlderCursor] = useState<PageCursor | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [paging, setPaging] = useState(false);
  const [filter, setFilter] = useState<AuditFilter>(EMPTY_AUDIT_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all = useMemo(() => mergeAuditPages(live.records, retained), [live.records, retained]);
  const facets = useMemo(() => auditFacets(all), [all]);
  const visible = useMemo(() => filterAudit(all, filter), [all, filter]);
  const selected = selectedId ? all.find((record) => record.id === selectedId) ?? null : null;
  const pagedOnce = retained.length > 0 || exhausted;
  const canLoadOlder = !exhausted && (pagedOnce ? !!olderCursor : live.truncated && !!live.cursor);
  const filtering = filter.action !== "" || filter.resourceType !== "" || filter.subject.trim() !== "";

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

  return <>
    <GovernanceModulePage
      eyebrow="Control"
      title="Audit trail"
      description="Immutable decision history with actor, reason, policy version and evidence context for every privileged action."
      metricLabel={filtering ? "Matching (loaded)" : "Audit records loaded"}
      metricValue={live.loading ? "…" : String(filtering ? visible.length : all.length)}
      records={visible}
      loading={live.loading}
      error={live.error}
      truncated={live.truncated || pagedOnce}
      truncatedMessage={exhausted ? <>Showing all {all.length} audit records.</> : <>Showing the newest {all.length} records. Filters apply to loaded records only — load older pages to search further back.</>}
      onRetry={live.refresh}
      primaryAction="Inspect record"
      onAction={(record) => setSelectedId(record.id)}
      emptyMessage={filtering ? "No loaded audit records match these filters." : "No audit records yet."}
      footer={(canLoadOlder || pageError) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/8 px-5 py-3">
          {canLoadOlder && <button onClick={() => void loadOlder()} disabled={paging} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"><History className="h-3.5 w-3.5" />{paging ? "Loading…" : `Load ${QUERY_LIMIT} older`}</button>}
          {pageError && <span role="alert" className="text-xs text-red-200">{pageError}</span>}
        </div>
      )}
    >
      <div className="mt-5 grid gap-3 rounded-2xl border border-white/8 bg-[#101823] p-4 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end" aria-label="Audit filters">
        <label className="block text-xs text-slate-400">Action
          <select value={filter.action} onChange={(event) => setFilter((prev) => ({ ...prev, action: event.target.value }))} className={`${select} mt-1 w-full`}>
            <option value="">All actions</option>
            {facets.actions.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        </label>
        <label className="block text-xs text-slate-400">Resource type
          <select value={filter.resourceType} onChange={(event) => setFilter((prev) => ({ ...prev, resourceType: event.target.value }))} className={`${select} mt-1 w-full`}>
            <option value="">All resources</option>
            {facets.resourceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="block text-xs text-slate-400">Organizer / resource / actor ID
          <input value={filter.subject} onChange={(event) => setFilter((prev) => ({ ...prev, subject: event.target.value }))} placeholder="e.g. org_abc123" className={`${select} mt-1 w-full placeholder:text-slate-600`} />
        </label>
        <button onClick={() => setFilter(EMPTY_AUDIT_FILTER)} disabled={!filtering} className="h-10 rounded-xl border border-white/10 px-3 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40">Clear</button>
      </div>
    </GovernanceModulePage>
    {selectedId && <AuditDrawer record={selected} onClose={() => setSelectedId(null)} />}
  </>;
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <section>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-xl border border-white/8 bg-[#0a111a] p-3 text-[11px] leading-5 text-slate-300">{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

function AuditDrawer({ record, onClose }: { record: LiveGovernanceRecord | null; onClose: () => void }) {
  if (!record) return <Drawer label="Audit record unavailable" eyebrow="Audit" title="Record unavailable" onClose={onClose}><InfoNote tone="warn">This record is no longer loaded. Close and refresh.</InfoNote></Drawer>;
  const raw = record.raw;
  return (
    <Drawer label={`Audit record ${record.id}`} eyebrow={`Audit · ${record.id}`} title={text(raw, "action")} subtitle={formatDateTime(raw.at)} onClose={onClose}>
      <FieldList fields={[
        { label: "Action", value: text(raw, "action") },
        { label: "At", value: formatDateTime(raw.at) },
        { label: "Actor", value: text(raw, "actorUid") },
        { label: "Actor role", value: auditActorRole(raw) },
        { label: "Resource", value: `${text(raw, "resourceType")} / ${text(raw, "resourceId")}` },
        { label: "Organizer", value: text(raw, "orgId") },
        { label: "Reason", value: text(raw, "reason") },
        { label: "Request ID", value: text(raw, "requestId") },
        { label: "Source", value: text(raw, "source") },
      ]} />
      <Json label="Before" value={raw.before} />
      <Json label="After" value={raw.after} />
      <InfoNote>Audit records are append-only. Firestore rules deny every client write; nobody can edit or delete them from the console.</InfoNote>
    </Drawer>
  );
}
