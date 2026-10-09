"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Plus, Unlock } from "lucide-react";
import { Badge, Button, Card, CopyIdPill, DataTable, Drawer, Empty, ErrorState, PageHeader, SkeletonRows, Tabs, Truncated, type Column } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { Age, DecisionSheet, Field, Fields, Gone, Note, SectionTitle, When, type DecisionSpec } from "@/components/money/MoneyBits";
import { ReadOnly } from "@/components/trust/TrustBits";
import { useAdminSession } from "@/lib/firebase/auth";
import { RequestIdBook, decisionKey } from "@/lib/console/actions";
import { CALLABLE_CAPABILITY, can } from "@/lib/console/capabilities";
import { HOLD_TABS, filterHolds, holdCounts, sortHolds, toHoldRow, type HoldRow, type HoldTab } from "@/lib/control";
import { cn } from "@/lib/format";
import { setLegalHold } from "@/lib/governance-api";
import { useNow } from "@/lib/hooks";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useSearchParamSetter, useTabParam } from "@/lib/use-search-param";
import { ControlSuspense, SummaryPill } from "./ControlBits";

const TAB_IDS = HOLD_TABS.map((t) => t.id);

const EMPTY: Record<HoldTab, { emoji: string; title: string; body: string }> = {
  active: { emoji: "🕊️", title: "No active holds", body: "Retention runs normally for everyone. Place a hold before anything is due for deletion." },
  released: { emoji: "🗂️", title: "No released holds", body: "Holds that have been lifted are kept here for the record." },
  all: { emoji: "⚖️", title: "No legal holds", body: "Retention runs normally for everyone." },
};

const LABEL = "text-[12px] font-semibold text-text-3";
const INPUT = "field mt-1.5 h-11 w-full rounded-control px-3.5 text-[14px] text-text";

export function LegalHoldsView() {
  return (
    <ControlSuspense>
      <Holds />
    </ControlSuspense>
  );
}

/**
 * Legal holds (docs/runbooks/DATA_RETENTION.md). While a user's hold is active, scheduled retention
 * never deletes their KYC documents. Admins place and release holds; auditors see them read-only.
 * Every change is audited server-side.
 */
function Holds() {
  const { consoleRole: role } = useAdminSession();
  const canAct = can(role, CALLABLE_CAPABILITY.setLegalHold);
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("legalHolds");
  const params = useSearchParams();
  const setParam = useSearchParamSetter();
  const [tab, setTab] = useTabParam(TAB_IDS, "active");
  const now = useNow();
  const rows = useMemo(() => sortHolds(records.map(toHoldRow)), [records]);
  const counts = useMemo(() => holdCounts(rows), [rows]);
  const shown = useMemo(() => filterHolds(rows, tab), [rows, tab]);
  const ready = !loading && !error;
  const selectedId = params.get("hold");
  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  const book = useRef(new RequestIdBook("hold"));
  const [placing, setPlacing] = useState(false);
  const [subject, setSubject] = useState("");
  const [reference, setReference] = useState("");
  const closePlace = () => {
    setPlacing(false);
    setSubject("");
    setReference("");
  };

  const placeSpec: DecisionSpec | null = placing
    ? {
        idKey: decisionKey("legal-hold", "place", subject, reference),
        title: "Place a legal hold",
        consequence: "While the hold is active, scheduled retention will not delete this user's documents. Nothing else about the account changes.",
        confirmLabel: "Place hold",
        tone: "volt",
        reasonMin: 10,
        reasonLabel: "Why (case, request or matter)",
        validate: () => (subject.trim() ? null : "Enter the user's uid."),
        fields: (
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className={LABEL}>User uid</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Firebase Auth uid" autoComplete="off" spellCheck={false} className={cn(INPUT, "font-mono")} />
            </label>
            <label className="block">
              <span className={LABEL}>Reference (optional)</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. ticket or case number" autoComplete="off" className={INPUT} />
            </label>
          </div>
        ),
        execute: async (requestId, reason) => {
          const result = await setLegalHold({ requestId, subjectId: subject, action: "place", reason, reference });
          refresh();
          return { tone: "ok", title: "Hold placed", body: `Hold ${result.holdId} is active.` };
        },
      }
    : null;

  const columns: Array<Column<HoldRow>> = [
    {
      key: "subject",
      header: "User",
      cell: (r) => (
        <div className="max-w-[300px]">
          <div className="truncate font-mono text-[12.5px] font-semibold text-text">{r.subjectId ?? "—"}</div>
          <div className="mt-0.5 truncate text-[12px] text-text-3">{r.reference ? `Ref ${r.reference}` : "No reference"}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <Badge tone={r.active ? "warn" : "muted"}>
          {r.active ? <Lock aria-hidden className="h-3 w-3" /> : <Unlock aria-hidden className="h-3 w-3" />}
          {r.active ? "Deletion blocked" : "Released"}
        </Badge>
      ),
    },
    { key: "reason", header: "Why", cell: (r) => <span className="line-clamp-1 max-w-[320px] text-[13px] text-text-2">{r.reason ?? "—"}</span> },
    { key: "placed", header: "Placed", sort: (a, b) => (a.placedAt?.getTime() ?? 0) - (b.placedAt?.getTime() ?? 0), cell: (r) => <Age at={r.placedAt} now={now} /> },
  ];

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Compliance"
        title={
          <>
            Legal <em className="hl">holds</em>
          </>
        }
        subtitle="A hold stops scheduled retention from deleting a user's documents (for example during a dispute, investigation or legal request). Place it before anything is due for deletion; release it when the matter is closed."
        actions={
          canAct ? (
            <Button variant="volt" size="lg" icon={<Plus />} onClick={() => setPlacing(true)}>
              Place hold
            </Button>
          ) : undefined
        }
      />

      {ready ? (
        <ul aria-label="Hold summary" className="flex flex-wrap gap-2 text-[12px]">
          <SummaryPill label="Active holds" value={counts.active} tone={counts.active > 0 ? "warn" : "default"} />
          <SummaryPill label="Released" value={counts.released} />
        </ul>
      ) : null}

      <Tabs label="Hold status" tabs={HOLD_TABS.map((t) => ({ ...t, count: ready ? counts[t.id] : undefined }))} value={tab} onChange={setTab} />

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      ) : (
        <DataTable rows={shown} columns={columns} rowKey={(r) => r.id} loading={loading} onRowClick={(r) => setParam("hold", r.id)} caption="Legal holds, active first" className="max-h-[70vh]" empty={<Empty {...EMPTY[tab]} />} />
      )}
      {ready && truncated ? <Truncated shown={records.length} /> : null}

      <HoldDrawer open={!!selectedId} loading={loading} row={selected} canAct={canAct} role={role} now={now} book={book.current} refresh={refresh} onClose={() => setParam("hold", null)} />
      <DecisionSheet spec={placeSpec} book={book.current} onClose={closePlace} />
    </PageContainer>
  );
}

function HoldDrawer({
  open,
  loading,
  row,
  canAct,
  role,
  now,
  book,
  refresh,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  row: HoldRow | null;
  canAct: boolean;
  role: ReturnType<typeof useAdminSession>["consoleRole"];
  now: Date | null;
  book: RequestIdBook;
  refresh: () => void;
  onClose: () => void;
}) {
  const [releasing, setReleasing] = useState(false);
  const subjectId = row?.subjectId ?? null;
  const spec: DecisionSpec | null =
    row && subjectId && releasing && row.active
      ? {
          // The hold's version is part of the command: releasing again after it moved is a new command.
          idKey: decisionKey("legal-hold", "release", subjectId, row.status, row.version),
          title: `Release the hold on ${subjectId}?`,
          consequence: "Retention resumes for this user. Anything already past its retention period may be deleted on the next daily run.",
          confirmLabel: "Release hold",
          tone: "danger",
          reasonMin: 10,
          execute: async (requestId, reason) => {
            await setLegalHold({ requestId, subjectId, action: "release", reason });
            refresh();
            return { tone: "ok", title: "Hold released", body: `Retention resumes for ${subjectId}.` };
          },
        }
      : null;

  return (
    <>
      <Drawer open={open} title={row ? `Hold · ${row.subjectId ?? "—"}` : loading ? "Loading hold…" : "Hold unavailable"} onClose={onClose}>
        {!row && loading ? (
          <SkeletonRows rows={4} />
        ) : !row ? (
          <Gone noun="hold" />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={row.active ? "warn" : "muted"}>{row.active ? "Active · deletion blocked" : "Released"}</Badge>
              {row.subjectId ? <CopyIdPill id={row.subjectId} noun="user" /> : null}
            </div>
            {row.active ? (
              <Note tone="warn">Scheduled retention will not delete this user&rsquo;s documents until the hold is released.</Note>
            ) : (
              <Note>This hold is released. Place a new hold if the matter reopens.</Note>
            )}
            <Fields label="Hold details">
              <Field label="Subject" mono>{[row.subjectType, row.subjectId].filter(Boolean).join(" ") || "—"}</Field>
              <Field label="Why">{row.reason ?? "—"}</Field>
              <Field label="Reference">{row.reference ?? "—"}</Field>
              <Field label="Placed by" mono>{row.placedBy ?? "—"}</Field>
              <Field label="Placed"><When at={row.placedAt} now={now} /></Field>
              <Field label="Released by" mono>{row.releasedBy ?? "—"}</Field>
              <Field label="Released"><When at={row.releasedAt} now={now} /></Field>
              <Field label="Release reason">{row.releaseReason ?? "—"}</Field>
            </Fields>
            <section aria-label="Hold decision" className="flex flex-col gap-3">
              <SectionTitle>Decision</SectionTitle>
              {!canAct ? (
                <ReadOnly role={role} what="legal holds" />
              ) : row.active ? (
                <div>
                  <Button variant="danger" icon={<Unlock />} disabled={!row.subjectId} onClick={() => setReleasing(true)}>
                    Release hold
                  </Button>
                  {!row.subjectId ? <p className="mt-2 text-[12px] text-warn">This hold has no user recorded, so it can&rsquo;t be released from the console.</p> : null}
                </div>
              ) : (
                <p className="text-[13px] text-text-3">Nothing to decide: this hold is already released.</p>
              )}
            </section>
          </div>
        )}
      </Drawer>
      <DecisionSheet spec={spec} book={book} onClose={() => setReleasing(false)} />
    </>
  );
}
