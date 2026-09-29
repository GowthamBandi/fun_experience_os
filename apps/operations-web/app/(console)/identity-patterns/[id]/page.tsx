"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Archive, RotateCcw } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatIdentityCode, selectIdentityPatternUsage } from "@/lib/prototype/selectors/identity";
import { patternCapacity } from "@/lib/prototype/validators/identityValidation";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, StatusChip } from "@/components/ui/primitives";
import { PermissionDenied } from "@/components/ui/panels";
import { Select } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog, NotFoundCard, WorkspaceCard, formatWhen } from "@/components/missions/shared";

export default function IdentityPatternDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const { state, canAccess, setIdentityPatternStatus } = useStore();
  const toast = useToast();
  const [sampleCount, setSampleCount] = useState(10);
  const [confirm, setConfirm] = useState(false);

  const pattern = (state.identityPatterns ?? []).find((p) => p.id === id);
  const usage = useMemo(() => selectIdentityPatternUsage(state, id), [state, id]);

  if (!canAccess("/identity-patterns")) return <PermissionDenied module="Identity patterns" />;
  if (!pattern) return <NotFoundCard title="Pattern not found" line={`There is no identity pattern “${id}”.`} backHref="/identity-patterns" backLabel="Identity patterns" />;

  const retired = pattern.status === "deprecated";
  const samples = Array.from({ length: sampleCount }, (_, i) => formatIdentityCode(pattern, i + 1));

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-6 px-5 py-7 lg:px-8">
      <Link href="/identity-patterns" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-mut hover:text-ink-lum">
        <ArrowLeft className="h-4 w-4" /> Identity patterns
      </Link>
      <PageHeader
        overline="Identity pattern"
        title={pattern.name}
        sub={`Codes look like ${pattern.example}.`}
        right={
          <>
            <StatusChip value={retired ? "retired" : pattern.status} tone={retired ? "neutral" : "ok"} />
            <Button variant="secondary" onClick={() => setConfirm(true)}>
              {retired ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {retired ? "Reinstate" : "Retire"}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WorkspaceCard title="Format">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Item label="Prefix" value={<span className="font-mono">{pattern.prefix}</span>} />
            <Item label="Separator" value={pattern.separator ? <span className="font-mono">{pattern.separator}</span> : "None"} />
            <Item label="Digits" value={String(pattern.numberLength)} />
            <Item label="Room for" value={`${patternCapacity(pattern.numberLength).toLocaleString("en-IN")} participants`} />
            <Item label="Created" value={formatWhen(pattern.createdAt)} />
            <Item label="Last changed" value={formatWhen(pattern.updatedAt)} />
          </dl>
        </WorkspaceCard>

        <WorkspaceCard
          title="Sample codes"
          sub="Numbers are issued in booking order within each session."
          right={
            <div className="w-28">
              <Select aria-label="Number of samples" value={sampleCount} onChange={(e) => setSampleCount(Number(e.target.value))}>
                {[10, 20, 40].map((n) => (
                  <option key={n} value={n}>
                    {n} codes
                  </option>
                ))}
              </Select>
            </div>
          }
        >
          <div className="flex flex-wrap gap-2">
            {samples.map((c) => (
              <span key={c} className="rounded-lg border border-edge bg-bg-sunken px-2.5 py-1 font-mono text-sm font-semibold text-ink-lum">
                {c}
              </span>
            ))}
          </div>
        </WorkspaceCard>
      </div>

      <WorkspaceCard title="Where it is used" sub={`${usage.identityCount} code(s) issued in ${usage.sessions.length} session(s).`} bodyClassName="p-0">
        {usage.sessions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-mut">No codes have been issued with this pattern yet.</p>
        ) : (
          <ul className="divide-y divide-edge">
            {usage.sessions.map((u) => (
              <li key={u.sessionId}>
                <Link href={`/missions/${u.sessionId}/participants`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                  <span>
                    <span className="block text-sm font-medium text-ink-lum">{sessionTitle(state, u.sessionId)}</span>
                    <span className="text-xs text-ink-mut">
                      {state.sessions.find((s) => s.id === u.sessionId)?.date ?? ""} · {u.count} codes
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-ink-mut" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </WorkspaceCard>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={retired ? "Reinstate this pattern?" : "Retire this pattern?"}
        tone={retired ? "primary" : "warning"}
        confirmLabel={retired ? "Reinstate" : "Retire pattern"}
        onConfirm={() => {
          const res = setIdentityPatternStatus(pattern.id, retired ? "active" : "deprecated");
          if (res.error) return res;
          toast.success(retired ? "Pattern reinstated" : "Pattern retired");
          return true;
        }}
      >
        {retired
          ? "The pattern becomes available again for new codes."
          : "It can no longer be used for new codes. Codes already issued with it stay valid."}
      </ConfirmDialog>
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-mut">{label}</dt>
      <dd className="mt-0.5 text-ink-lum">{value}</dd>
    </div>
  );
}
