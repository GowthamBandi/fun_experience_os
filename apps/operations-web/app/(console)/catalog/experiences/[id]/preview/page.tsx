"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { customerPreview, templateById } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { Breadcrumbs, PageFrame, PrototypeRoleNote } from "@/components/geo/layout";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Badge, Button } from "@/components/ui/primitives";
import { Tide } from "@/components/motion/Motion";
import { ArrowLeft, EyeOff, Lock, LockOpen } from "lucide-react";

export default function TemplatePreviewPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { state, role, canAccess, hydrated } = useStore();

  const t = useMemo(() => templateById(state, id), [state, id]);
  const preview = useMemo(() => customerPreview(state, id), [state, id]);

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

  const canPreview = geoCan(role.id, "catalog-preview");

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: "Catalog", href: "/catalog" },
          { label: "Experiences", href: "/catalog/experiences" },
          { label: t.name, href: `/catalog/experiences/${t.id}` },
          { label: "Customer preview" },
        ]}
      />

      <PageHeader
        overline="Catalog · Customer preview"
        title="Customer preview"
        sub="What a participant sees before committing, and after reveal."
        right={
          <Button variant="secondary" onClick={() => router.push(`/catalog/experiences/${t.id}`)}>
            <ArrowLeft className="h-4 w-4" /> Back to template
          </Button>
        }
      />

      {!canPreview ? (
        <Card glass={false} className="mt-6">
          <PanelHeader
            title="Promise & preview are for the marketing lane"
            sub="Your position cannot open the customer-facing preview."
          />
          <p className="mt-3 text-sm text-ink-mut">
            The marketing lane owns the promise and preview copy. Switch position with the role simulator to try it.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <PrototypeRoleNote />
          </div>
        </Card>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Phone card */}
          <div>
            <p className="overline mb-3">Mobile listing</p>
            <div className="mx-auto max-w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f14] shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
              <div className="h-28 bg-gradient-to-br from-[#4c6fff]/30 to-[#12b76a]/20" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink-lum">{preview.name}</p>
                    <p className="text-[11px] text-ink-mut">{t.format} · {preview.entryType} · {preview.competitiveLevel}</p>
                  </div>
                  <span className="shrink-0 text-base font-semibold text-ink-lum">{inr(preview.basePrice)}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-sec">{preview.shortDesc}</p>
                <div className="mt-3 rounded-lg bg-white/4 px-3 py-2 text-[11px] text-ink-sec">
                  <span className="font-medium text-ink-lum">{preview.duration} min</span> · {preview.minParticipants}–{preview.maxParticipants} seats
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge className="border border-[#12b76a]/25 bg-[#12b76a]/12 text-[#5fd7a3]">{preview.promise}</Badge>
                  {preview.promoEligible && <Badge className="border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]">promo eligible</Badge>}
                </div>
              </div>
            </div>
          </div>

          {/* Reveal states */}
          <div className="space-y-4">
            <Card>
              <PanelHeader
                title="Before reveal"
                sub="Locked until booking closes"
                right={<Lock className="h-4 w-4 text-ink-mut" />}
              />
              <div className="mt-3 space-y-2">
                <div className="solid rounded-xl px-3 py-2 text-xs text-ink-sec">
                  <p className="overline">Preview</p>
                  <p>{preview.preRevealPreview}</p>
                </div>
                <div className="solid rounded-xl px-3 py-2 text-xs text-ink-sec">
                  <p className="overline">Joined count</p>
                  <p>
                    {preview.anonymousJoinedCount
                      ? "Shown anonymously" + (preview.showJoinedCountBeforeReveal ? " before reveal" : " only after reveal")
                      : preview.showJoinedCountBeforeReveal
                        ? "Visible before reveal"
                        : "Hidden until reveal"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {preview.infoRevealed.map((k) => (
                    <Badge key={k} className="border border-white/8 bg-white/4 text-ink-sec">{k}</Badge>
                  ))}
                  <Badge className="border border-white/8 bg-white/4 text-ink-mut">
                    <EyeOff className="h-3 w-3" /> details hidden
                  </Badge>
                </div>
              </div>
            </Card>

            <Card>
              <PanelHeader
                title="After reveal"
                sub={preview.privacyLockedUntil}
                right={<LockOpen className="h-4 w-4 text-[#5fd7a3]" />}
              />
              <div className="mt-3 space-y-2">
                <div className="solid rounded-xl px-3 py-2 text-xs text-ink-sec">
                  <p className="overline">Preview</p>
                  <p>{preview.postRevealPreview}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {preview.infoRevealed.map((k) => (
                    <Badge key={k} className="border border-[#12b76a]/25 bg-[#12b76a]/12 text-[#5fd7a3]">{k}</Badge>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="border border-warning/15 bg-warning/5">
              <PanelHeader title="Never revealed" sub="Identity and contact stay masked" />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {preview.infoNeverRevealed.map((k) => (
                  <Badge key={k} className="border border-[#f04438]/25 bg-[#f04438]/12 text-[#ff8f86]">
                    <EyeOff className="h-3 w-3" /> {k}
                  </Badge>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-ink-mut">
                Participant identity uses {preview.tempIdFormat} temp IDs and {preview.aliasStyle} aliases.
              </p>
            </Card>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
