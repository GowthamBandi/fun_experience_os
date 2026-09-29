"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { EyeOff, Lock, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { customerPreview } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { Crumbs, NotFoundCard, Notice, PageShell, Panel } from "@/components/setup/kit";

export default function ExperiencePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { state, canAccess, role } = useStore();
  const t = state.templates.find((x) => x.id === id);
  const preview = useMemo(() => customerPreview(state, id), [state, id]);

  if (!canAccess("/catalog")) return <PermissionDenied module="Catalog" />;
  if (!t) return <PageShell><NotFoundCard what="experience" backHref="/catalog/experiences" backLabel="All experiences" /></PageShell>;
  if (!geoCan(role.id, "catalog-preview")) return <PermissionDenied module="the customer preview" />;

  return (
    <PageShell>
      <Crumbs items={[{ label: "Catalog", href: "/catalog" }, { label: "Experiences", href: "/catalog/experiences" }, { label: t.name, href: `/catalog/experiences/${t.id}` }, { label: "Customer preview" }]} />
      <PageHeader overline="Catalog · Customer preview" title={t.name} sub="How the session card and reveal look to customers, built from this experience's current settings." right={<StatusChip value={t.status} />} />
      {t.status !== "active" && <Notice tone="info">Customers do not see this experience until it is active and a session is scheduled.</Notice>}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div>
          <p className="overline mb-3">Session card (mobile)</p>
          <div className="mx-auto max-w-[340px] overflow-hidden rounded-[28px] border border-edge bg-white shadow-glass">
            <div className="relative h-32 bg-gradient-to-br from-[#5b4cf5] via-[#8b5cf6] to-[#ec4899]">
              <span className="absolute bottom-3 left-4 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-brand-ink">{preview.duration} min · {preview.minParticipants}–{preview.maxParticipants} people</span>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-base font-bold text-ink-lum">{preview.name}</p>
                  <p className="text-xs capitalize text-ink-mut">{preview.format} · {preview.entryType.replace("-", " ")} · {preview.competitiveLevel}</p>
                </div>
                <span className="font-display text-lg font-bold text-ink-lum">{inr(preview.basePrice)}</span>
              </div>
              <p className="text-sm leading-6 text-ink-sec">{preview.shortDesc}</p>
              {preview.promise && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{preview.promise}</p>}
              <div className="flex items-center gap-2 rounded-xl bg-bg-sunken px-3 py-2 text-xs text-ink-sec">
                <Users className="h-3.5 w-3.5" /> {preview.anonymousJoinedCount ? "Joined count hidden until reveal" : "Joined count visible"}
              </div>
              <div className="h-11 rounded-xl bg-brand text-center text-sm font-semibold leading-[44px] text-white">Book a place</div>
            </div>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Before reveal" sub={preview.privacyLockedUntil} icon={<Lock className="h-4 w-4" />}>
            <p className="text-sm leading-6 text-ink-sec">{preview.preRevealPreview}</p>
            <p className="mt-3 text-xs text-ink-mut">Participants appear as <span className="font-mono">{preview.tempIdFormat}</span> with {preview.aliasStyle.toLowerCase()} aliases.</p>
          </Panel>
          <Panel title="After reveal" icon={<Users className="h-4 w-4" />}>
            <p className="text-sm leading-6 text-ink-sec">{preview.postRevealPreview}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {preview.infoRevealed.length ? preview.infoRevealed.map((k) => <StatusChip key={k} value={k} tone="info" dot={false} />) : <span className="text-sm text-ink-mut">Nothing configured.</span>}
            </div>
          </Panel>
          <Panel title="Never shown to other participants" icon={<EyeOff className="h-4 w-4" />} className="md:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {preview.infoNeverRevealed.length ? preview.infoNeverRevealed.map((k) => <StatusChip key={k} value={k} tone="danger" dot={false} />) : <span className="text-sm text-ink-mut">Nothing configured.</span>}
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
