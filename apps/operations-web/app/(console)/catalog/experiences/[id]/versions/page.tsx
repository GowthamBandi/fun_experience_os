"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, CopyPlus } from "lucide-react";
import { useStore } from "@/lib/store";
import { operatorName, templateVersions } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { useCommandFeedback } from "@/components/ui/toast";
import { ConfirmDialog, Crumbs, EmptyPanel, NotFoundCard, PageShell } from "@/components/setup/kit";

const when = (ts: string) => {
  const d = new Date(ts.includes("/") ? ts.replace(/\//g, "-") : ts);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: ts.length > 10 ? "short" : undefined }) : ts;
};

export default function ExperienceVersionsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { state, canAccess, role, duplicateTemplateVersion } = useStore();
  const feedback = useCommandFeedback();
  const t = state.templates.find((x) => x.id === id);
  const versions = useMemo(() => templateVersions(state, id), [state, id]);
  const [restore, setRestore] = useState<string | null>(null);

  if (!canAccess("/catalog")) return <PermissionDenied module="Catalog" />;
  if (!t) return <PageShell><NotFoundCard what="experience" backHref="/catalog/experiences" backLabel="All experiences" /></PageShell>;
  if (!geoCan(role.id, "catalog-versions")) return <PermissionDenied module="version history" />;
  const canManage = geoCan(role.id, "manage-catalog");
  const target = versions.find((v) => v.id === restore);

  return (
    <PageShell>
      <Crumbs items={[{ label: "Catalog", href: "/catalog" }, { label: "Experiences", href: "/catalog/experiences" }, { label: t.name, href: `/catalog/experiences/${t.id}` }, { label: "Version history" }]} />
      <PageHeader overline="Catalog · Version history" title={t.name} sub="Every change to this experience is saved as a version with who made it and why. Start a new draft from any version." right={<StatusChip value={t.status} />} />
      {versions.length === 0 ? (
        <EmptyPanel title="No versions recorded" line="Versions are recorded from the next change onwards." />
      ) : (
        <ol className="relative space-y-3 border-l-2 border-edge pl-5">
          {versions.map((v, i) => (
            <li key={v.id} className="relative">
              <span className={`absolute -left-[27px] top-5 h-3 w-3 rounded-full ring-4 ring-bg-deep ${i === 0 ? "bg-brand" : "bg-slate-300"}`} />
              <div className="rounded-panel border border-edge bg-white p-4 shadow-panel sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-brand-subtle px-2.5 py-0.5 text-xs font-bold text-brand-ink">Version {v.version}</span>
                      {i === 0 && <span className="text-xs font-semibold text-emerald-700">Current</span>}
                      {v.previousStatus && v.newStatus && v.previousStatus !== v.newStatus && (
                        <span className="flex items-center gap-1 text-xs text-ink-mut"><StatusChip value={v.previousStatus} dot={false} /> <ArrowRight className="h-3 w-3" /> <StatusChip value={v.newStatus} dot={false} /></span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-ink-lum">{v.reason}</p>
                    <p className="mt-0.5 text-xs text-ink-mut">{operatorName(state, v.changedBy)} · {when(v.timestamp)}</p>
                    {v.changedFields.length > 0 && v.changedFields.length < 12 && <p className="mt-2 text-xs text-ink-sec">Changed: {v.changedFields.join(", ")}</p>}
                    {v.changedFields.length >= 12 && <p className="mt-2 text-xs text-ink-sec">Full definition recorded ({v.changedFields.length} fields)</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-ink-sec">
                    {v.snapshot.basePrice != null && <span className="rounded-lg bg-bg-sunken px-2 py-1">{inr(v.snapshot.basePrice)}</span>}
                    {v.snapshot.maxParticipants != null && <span className="rounded-lg bg-bg-sunken px-2 py-1">{v.snapshot.minParticipants}–{v.snapshot.maxParticipants} people</span>}
                    {v.snapshot.duration != null && <span className="rounded-lg bg-bg-sunken px-2 py-1">{v.snapshot.duration} min</span>}
                    {canManage && <Button size="sm" variant="secondary" onClick={() => setRestore(v.id)}><CopyPlus className="h-3.5 w-3.5" /> New draft from this</Button>}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <ConfirmDialog
        open={!!target}
        onClose={() => setRestore(null)}
        title={`New draft from version ${target?.version ?? ""}`}
        body={<>A new draft experience is created with the settings saved in version {target?.version}. <strong>{t.name}</strong> itself is not changed.</>}
        confirmLabel="Create draft"
        onConfirm={() => {
          const out = duplicateTemplateVersion(restore!);
          if (feedback(out, "Draft created from version", "Review it, then activate when ready.") && out.id) router.push(`/catalog/experiences/${out.id}`);
          return out;
        }}
      />
    </PageShell>
  );
}
