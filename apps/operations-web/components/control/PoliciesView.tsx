"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ScrollText } from "lucide-react";
import { Badge, Card, Empty, ErrorState, Glyph, PageHeader, Skeleton, Truncated } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { CopyIdPill } from "@/components/pulse";
import { sortPolicies, toPolicyCard, type PolicyCard } from "@/lib/control";
import { cn } from "@/lib/format";
import { useGovernanceCollection } from "@/lib/use-governance";
import { JsonBlock, SummaryPill } from "./ControlBits";

/** Versioned rules used by automated checks and human approvals. Read-only: policies are shipped with a release. */
export function PoliciesView() {
  const { records, loading, error, truncated, refresh, order } = useGovernanceCollection("policyVersions");
  const cards = useMemo(() => sortPolicies(records.map(toPolicyCard)), [records]);
  const ready = !loading && !error;
  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Control"
        title={
          <>
            Policies <em className="hl">in force</em>
          </>
        }
        subtitle="The versioned rules behind automated checks and human approval decisions across the marketplace. They are read-only here; a change ships with a release and is recorded as a new version."
      />

      {ready && cards.length > 0 ? (
        <ul aria-label="Policy summary" className="flex flex-wrap gap-2 text-[12px]">
          <SummaryPill label="Policy versions" value={cards.length} />
          <SummaryPill label="Active" value={cards.filter((c) => c.tone === "ok").length} tone="ok" />
        </ul>
      ) : null}

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      ) : loading ? (
        <div role="status" aria-busy="true" className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="flex flex-col gap-3" style={{ opacity: 1 - i * 0.15 }}>
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-[13px]" />
                <Skeleton className="h-4 w-1/2 rounded-pill" />
              </div>
              <Skeleton className="h-3 w-4/5 rounded-pill" />
              <Skeleton className="h-3 w-3/5 rounded-pill" />
              <span className="sr-only">Loading…</span>
            </Card>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <Card>
          <Empty emoji="📘" title="No policy versions yet" body="Policy versions appear here once a release publishes them." />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Policy versions">
          {cards.map((card) => (
            <li key={card.id} className="flex">
              <PolicyCardView card={card} />
            </li>
          ))}
        </ul>
      )}
      {ready && truncated ? <Truncated shown={records.length} order={order} /> : null}
    </PageContainer>
  );
}

function PolicyCardView({ card }: { card: PolicyCard }) {
  const [open, setOpen] = useState(false);
  const hasRules = card.rules !== null;
  return (
    <Card as="article" className="flex w-full flex-col gap-4" aria-label={card.title}>
      <div className="flex items-start gap-3">
        <Glyph emoji="📘" tone={card.tone === "muted" ? "muted" : card.tone} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-[18px] font-bold leading-tight tracking-[-0.02em] text-text">{card.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {card.version ? <Badge tone="violet">v{card.version.replace(/^v/i, "")}</Badge> : null}
            {card.status ? <Badge tone={card.tone}>{card.status}</Badge> : null}
            {card.effectiveFrom ? <span className="text-[12px] text-text-3">Effective {card.effectiveFrom}</span> : null}
          </div>
        </div>
        <ScrollText aria-hidden className="mt-1 h-4 w-4 shrink-0 text-text-3" />
      </div>

      {card.summary ? <p className="text-[14px] leading-[1.55] text-text-2">{card.summary}</p> : null}

      {card.facts.length > 0 ? (
        <dl className="divide-y divide-line-soft rounded-control border border-line-soft px-4">
          {card.facts.map((fact) => (
            <div key={fact.label} className="grid grid-cols-[8rem_1fr] gap-3 py-2.5 text-[13px]">
              <dt className="text-text-3">{fact.label}</dt>
              <dd className="min-w-0 break-words text-text">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : !card.summary && !hasRules ? (
        <p className="text-[13px] text-text-3">This version has no readable details recorded.</p>
      ) : null}

      {hasRules ? (
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-pill border border-line px-3.5 text-[13px] font-semibold text-text-2 hover:border-[rgba(255,255,255,0.22)] hover:text-text"
          >
            {open ? "Hide rules" : "View rules"}
            <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform duration-200 ease-pulse motion-reduce:transition-none", open && "rotate-180")} />
          </button>
          {open ? (
            <div className="mt-3">
              <JsonBlock label="Rules" value={card.rules} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto pt-1">
        <CopyIdPill id={card.id} noun="policy" />
      </div>
    </Card>
  );
}
