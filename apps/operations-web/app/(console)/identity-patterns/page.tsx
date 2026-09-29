"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fingerprint, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectIdentityPatternList } from "@/lib/prototype/selectors/identity";
import { patternCapacity } from "@/lib/prototype/validators/identityValidation";
import type { IdentityPattern } from "@/lib/prototype/entities";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, StatusChip } from "@/components/ui/primitives";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";

const STATUS_LABEL: Record<IdentityPattern["status"], string> = { active: "active", draft: "draft", deprecated: "retired" };

export default function IdentityPatternsPage() {
  const { state, canAccess } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"active" | "retired" | "all">("all");

  const patterns = useMemo(() => selectIdentityPatternList(state), [state]);
  const usage = useMemo(() => {
    const m = new Map<string, { codes: number; sessions: Set<string> }>();
    for (const t of state.temporaryIdentities ?? []) {
      const u = m.get(t.patternId) ?? { codes: 0, sessions: new Set<string>() };
      u.codes++;
      u.sessions.add(t.sessionId);
      m.set(t.patternId, u);
    }
    return m;
  }, [state.temporaryIdentities]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return patterns.filter(
      (p) =>
        (status === "all" || (status === "retired" ? p.status === "deprecated" : p.status === "active")) &&
        (!needle || `${p.name} ${p.prefix} ${p.example}`.toLowerCase().includes(needle)),
    );
  }, [patterns, q, status]);

  if (!canAccess("/identity-patterns")) return <PermissionDenied module="Identity patterns" />;

  const columns: Column<IdentityPattern>[] = [
    {
      key: "name",
      header: "Pattern",
      render: (p) => (
        <Link href={`/identity-patterns/${p.id}`} className="font-medium text-ink-lum hover:text-brand" onClick={(e) => e.stopPropagation()}>
          {p.name}
        </Link>
      ),
    },
    { key: "example", header: "Example code", render: (p) => <span className="rounded-lg border border-edge bg-bg-sunken px-2 py-1 font-mono text-xs font-semibold text-ink-lum">{p.example}</span> },
    { key: "format", header: "Format", render: (p) => <span className="text-ink-sec">{p.prefix} · {p.separator ? `“${p.separator}”` : "no separator"} · {p.numberLength} digits</span> },
    { key: "capacity", header: "Room for", align: "right", render: (p) => <span className="tabular">{patternCapacity(p.numberLength).toLocaleString("en-IN")}</span> },
    { key: "usage", header: "Used", align: "right", render: (p) => { const u = usage.get(p.id); return <span className="tabular text-ink-sec">{u ? `${u.codes} codes · ${u.sessions.size} sessions` : "Not used"}</span>; } },
    { key: "status", header: "Status", render: (p) => <StatusChip value={STATUS_LABEL[p.status]} tone={p.status === "active" ? "ok" : "neutral"} /> },
  ];

  const active = patterns.filter((p) => p.status === "active").length;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-5 py-7 lg:px-8">
      <PageHeader
        overline="Sessions"
        title="Identity patterns"
        sub="Formats for the temporary codes participants use instead of their names (for example CR-07). Codes never contain personal data."
        right={
          <Link href="/identity-patterns/new">
            <Button>
              <Plus className="h-4 w-4" /> New pattern
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <MetricTile label="Active patterns" value={active} detail="available for new codes" icon={<Fingerprint className="h-4 w-4" />} tone="violet" />
        <MetricTile label="Retired" value={patterns.length - active} detail="kept for existing codes" icon={<Fingerprint className="h-4 w-4" />} tone="sky" />
        <MetricTile label="Codes issued" value={(state.temporaryIdentities ?? []).length} detail="across all sessions" icon={<Fingerprint className="h-4 w-4" />} tone="emerald" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:w-72">
          <SearchInput value={q} onChange={setQ} placeholder="Search patterns…" />
        </div>
        <FilterRail options={["active", "retired"] as const} value={status} onChange={setStatus} />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        onRowClick={(p) => router.push(`/identity-patterns/${p.id}`)}
        emptyTitle={patterns.length ? "No patterns match" : "No identity patterns yet"}
        emptyLine={patterns.length ? "Try a different search or filter." : "Create a pattern before generating participant codes."}
      />
    </div>
  );
}
