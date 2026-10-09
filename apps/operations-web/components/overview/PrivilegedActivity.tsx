"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Card, Empty, ErrorState, SkeletonRows, Timeline, type TimelineItem } from "@/components/pulse";
import { isPrivilegedAudit } from "@/lib/console/attention";
import { toDate } from "@/lib/console/records";
import { auditRoleLabel, humanize } from "@/lib/control";
import { auditTitle, auditTone } from "@/lib/overview";
import { useGovernanceCollection } from "@/lib/use-governance";
import { TileHeader } from "./Tile";

const SHOWN = 6;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function PrivilegedActivity() {
  const audit = useGovernanceCollection("auditEvents");
  const router = useRouter();
  const items: TimelineItem[] = audit.records
    .filter((r) => isPrivilegedAudit(r.raw))
    .slice(0, SHOWN)
    .map(({ id, raw }) => {
      // The record's kind, not its raw id: the full audit record (ids included) is one click away.
      const type = str(raw.resourceType);
      const resource = type ? humanize(type) : null;
      const role = auditRoleLabel(raw);
      const reason = str(raw.reason);
      return {
        id,
        at: toDate(raw.at),
        title: auditTitle(raw.action),
        body: [resource || null, reason ? `“${reason}”` : null].filter(Boolean).join(" · ") || undefined,
        tone: auditTone(raw.action),
        actor: role === "—" ? undefined : role,
      };
    });
  const half = Math.ceil(items.length / 2);
  const open = (id: string) => router.push(`/audit?event=${encodeURIComponent(id)}`);

  return (
    <Card as="section" aria-labelledby="privileged" aria-busy={audit.loading || undefined}>
      <TileHeader id="privileged" title="Privileged activity 🛡️">
        <Link href="/audit" className="focus-ring inline-flex items-center gap-1 rounded-pill text-[13px] font-semibold text-[#C2B4FF] hover:text-text">
          Full audit
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </TileHeader>
      <p className="-mt-1 mb-4 text-[13px] text-text-3">The latest console decisions, money controls and access changes, from the server-written audit trail.</p>

      {audit.loading ? (
        <SkeletonRows rows={3} />
      ) : audit.error && items.length === 0 ? (
        <ErrorState message={audit.error} onRetry={audit.refresh} />
      ) : items.length === 0 ? (
        <Empty emoji="🛡️" title="No privileged actions yet" body="Approvals, refunds, payouts and access changes will appear here as they happen." className="py-6" />
      ) : (
        <div className="grid gap-x-10 gap-y-5 xl:grid-cols-2">
          <Timeline items={items.slice(0, half)} onSelect={open} />
          {items.length > half ? <Timeline items={items.slice(half)} onSelect={open} /> : null}
        </div>
      )}
    </Card>
  );
}
