"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { templateById, templateVersions, operatorName } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { cn, inr } from "@/lib/format";
import { Breadcrumbs, PageFrame, PrototypeRoleNote } from "@/components/geo/layout";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Badge, Button, StatusChip } from "@/components/ui/primitives";
import { Tide } from "@/components/motion/Motion";
import { ArrowLeft, Copy } from "lucide-react";

export default function TemplateVersionsPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { state, role, canAccess, hydrated, duplicateTemplateVersion } = useStore();

  const t = useMemo(() => templateById(state, id), [state, id]);
  const versions = useMemo(() => templateVersions(state, id), [state, id]);

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/catalog")) return <PageFrame><PermissionDenied module="Catalog" /></PageFrame>;

  if (!t) {
    return (
      <PageFrame>
        <div className="solid rounded-panel p-10 text-center">
          <p className="text-sm font-medium text-ink-lum">Template not found</p>
          <Button variant="secondary" className="mt-5" onClick={() => router.push("/catalog/experiences")}>
            <ArrowLeft className="h-4 w-4" /> Back to experiences
          </Button>
        </div>
      </PageFrame>
    );
  }

  const canVersions = geoCan(role.id, "catalog-versions");
  const canManage = geoCan(role.id, "manage-catalog");

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: "Catalog", href: "/catalog" },
          { label: "Experiences", href: "/catalog/experiences" },
          { label: t.name, href: `/catalog/experiences/${t.id}` },
          { label: "Versions" },
        ]}
      />

      <PageHeader
        overline="Catalog · Versions"
        title="Version history"
        sub="Every change snapshots the template. Drafts can be recreated from any version."
        right={
          <Button variant="secondary" onClick={() => router.push(`/catalog/experiences/${t.id}`)}>
            <ArrowLeft className="h-4 w-4" /> Back to template
          </Button>
        }
      />

      {!canVersions ? (
        <Card glass={false} className="mt-6">
          <PanelHeader title="Version history is a review lane" sub="Ops and analytics can inspect change history." />
          <p className="mt-3 text-sm text-ink-mut">
            Your position cannot open version history. Switch position with the role simulator to try it.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <PrototypeRoleNote />
          </div>
        </Card>
      ) : (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-mut">
              <span className="font-medium text-ink-lum">{t.name}</span> · {versions.length} version{versions.length === 1 ? "" : "s"}
            </p>
            <Badge className="border border-white/8 bg-white/4 text-ink-sec">
              current: <StatusChip value={t.status} />
            </Badge>
          </div>

          {versions.length === 0 && (
            <Card>
              <p className="text-sm text-ink-mut">No version history recorded for this template.</p>
            </Card>
          )}

          {versions.map((v) => {
            const snap = v.snapshot;
            return (
              <Card key={v.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border border-[#4c6fff]/25 bg-[#4c6fff]/10 text-[#9db4ff]">v{v.version}</Badge>
                      {v.previousStatus && v.newStatus && v.previousStatus !== v.newStatus && (
                        <span className="flex items-center gap-1.5 text-[11px] text-ink-mut">
                          <StatusChip value={v.previousStatus} dot={false} /> → <StatusChip value={v.newStatus} dot={false} />
                        </span>
                      )}
                      {!v.previousStatus && v.newStatus && (
                        <span className="text-[11px] text-ink-mut">created as <StatusChip value={v.newStatus} dot={false} /></span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-medium text-ink-lum">{v.reason}</p>
                    <p className="mt-1 text-[11px] text-ink-mut">
                      {operatorName(state, v.changedBy)} · {v.timestamp}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {snap.basePrice != null && (
                      <Badge className="border border-white/8 bg-white/4 text-ink-sec">{inr(snap.basePrice)}</Badge>
                    )}
                    {snap.maxParticipants != null && (
                      <Badge className="border border-white/8 bg-white/4 text-ink-sec">max {snap.maxParticipants}</Badge>
                    )}
                    {canManage && (
                      <Button
                        variant="lamp"
                        onClick={() => {
                          duplicateTemplateVersion(v.id);
                          router.push("/catalog/experiences");
                        }}
                      >
                        <Copy className="h-4 w-4" /> Draft from v{v.version}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={cn("text-[10px] uppercase tracking-wide text-ink-mut")}>changed:</span>
                  {v.changedFields.map((f) => (
                    <Badge key={f} className="border border-white/8 bg-white/4 text-ink-mut">{f}</Badge>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageFrame>
  );
}
