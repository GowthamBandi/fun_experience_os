"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BellRing, LayoutTemplate, Send, Trash2 } from "lucide-react";
import { Badge, Button, Card, Chip, Empty, ErrorState, Sheet, Skeleton, Truncated, useToast } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { RequestIdBook, decisionKey } from "@/lib/console/actions";
import { rethrowForSheet } from "@/lib/console/errors";
import { formatDateTime } from "@/lib/console/records";
import { relTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { deleteTemplate } from "@/lib/notifications-api";
import { FORMAT_META, announcementFormFromTemplate, audienceSummary, notificationFormFromTemplate, toAudience, type TemplateKind, type TemplateRow } from "@/lib/notifications";
import { useTemplates } from "@/lib/use-notifications";
import { NotificationsHeader } from "./NotificationsNav";
import { ToneDot } from "./Bits";

/** Saved announcement and notification templates: use one (opens the composer / send form prefilled) or delete it. */
export function TemplatesView() {
  const toast = useToast();
  const now = useNow();
  const { rows, loading, error, truncated, retry } = useTemplates();
  const [kind, setKind] = useState<TemplateKind | "all">("all");
  const [target, setTarget] = useState<TemplateRow | null>(null);
  const book = useRef(new RequestIdBook("tpld"));
  const shown = useMemo(() => rows.filter((r) => kind === "all" || r.kind === kind), [rows, kind]);

  const remove = async (reason: string) => {
    if (!target) return;
    try {
      await deleteTemplate({ requestId: book.current.idFor(decisionKey("delete", target.id, reason)), id: target.id, reason });
      book.current.reset();
      toast.show({ tone: "info", title: "Template deleted", body: target.name });
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };

  return (
    <PageContainer className="flex flex-col gap-6">
      <NotificationsHeader
        title={
          <>
            <em className="hl">Templates</em>
          </>
        }
        subtitle="Reusable announcements and notifications. Save one from the composer or the send form; use it to start a new one prefilled."
      />
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by kind">
        <Chip selected={kind === "all"} onClick={() => setKind("all")}>
          All <span className="num text-[11.5px] opacity-70">{rows.length}</span>
        </Chip>
        <Chip selected={kind === "announcement"} onClick={() => setKind("announcement")}>
          Announcements <span className="num text-[11.5px] opacity-70">{rows.filter((r) => r.kind === "announcement").length}</span>
        </Chip>
        <Chip selected={kind === "notification"} onClick={() => setKind("notification")}>
          Notifications <span className="num text-[11.5px] opacity-70">{rows.filter((r) => r.kind === "notification").length}</span>
        </Chip>
      </div>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={retry} />
        </Card>
      ) : loading ? (
        <div role="status" aria-busy="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[170px] rounded-card" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <Empty
            emoji="🧩"
            title={rows.length ? "No templates of this kind" : "No templates yet"}
            body="In the announcement composer or the send form, choose “Save as template”."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/notifications/announcements/new" className="focus-ring inline-flex h-10 items-center gap-2 rounded-[14px] border border-line bg-surface-high px-4 text-[13px] font-semibold text-text hover:bg-surface-top">
                  <BellRing aria-hidden className="h-4 w-4" /> New announcement
                </Link>
                <Link href="/notifications/send" className="focus-ring inline-flex h-10 items-center gap-2 rounded-[14px] border border-line bg-surface-high px-4 text-[13px] font-semibold text-text hover:bg-surface-top">
                  <Send aria-hidden className="h-4 w-4" /> Send notification
                </Link>
              </div>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Templates">
          {shown.map((t) => (
            <li key={t.id} className="flex">
              <TemplateCard row={t} now={now} onDelete={() => setTarget(t)} />
            </li>
          ))}
        </ul>
      )}
      {truncated ? <Truncated shown={rows.length} order="newest" noun="templates" /> : null}

      <Sheet
        open={!!target}
        title={target ? `Delete “${target.name}”?` : ""}
        description="Announcements and notifications already made from it are not affected."
        confirmLabel="Delete template"
        tone="danger"
        requireReason
        minReason={3}
        reasonLabel="Reason (kept in the audit trail)"
        onConfirm={remove}
        onClose={() => setTarget(null)}
      />
    </PageContainer>
  );
}

function TemplateCard({ row, now, onDelete }: { row: TemplateRow; now: Date | null; onDelete: () => void }) {
  const isAnn = row.kind === "announcement";
  const ann = isAnn ? announcementFormFromTemplate(row.payload) : null;
  const ntf = !isAnn ? notificationFormFromTemplate(row.payload) : null;
  const title = ann?.title || ntf?.title || "Untitled";
  const body = ann?.body || ntf?.body || "";
  const audience = toAudience((ann ?? ntf)!.audience);
  const href = isAnn ? `/notifications/announcements/new?template=${encodeURIComponent(row.id)}` : `/notifications/send?template=${encodeURIComponent(row.id)}`;
  return (
    <Card as="article" aria-label={row.name} className="flex w-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-0.02em] text-text">
            <LayoutTemplate aria-hidden className="h-4 w-4 shrink-0 text-text-3" />
            <span className="truncate">{row.name}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-text-3" title={formatDateTime(row.updatedAt)}>
            Updated {row.updatedAt && now ? relTime(row.updatedAt, now) : formatDateTime(row.updatedAt)}
          </p>
        </div>
        <Badge tone={isAnn ? "violet" : "info"}>{isAnn ? "Announcement" : "Notification"}</Badge>
      </div>
      <div className="rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] p-3">
        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-text">
          {ann ? <ToneDot tone={ann.tone} /> : null}
          <span className="truncate">{title}</span>
        </p>
        {body ? <p className="mt-1 line-clamp-2 text-[12.5px] text-text-2">{body}</p> : null}
        <p className="mt-2 text-[11.5px] text-text-3">
          {ann ? `${FORMAT_META[ann.format].label} · ` : ntf ? `${ntf.style === "rich" ? "Rich" : "Standard"} push · ` : ""}
          {audienceSummary(audience)}
        </p>
      </div>
      <div className="mt-auto flex items-center justify-end gap-2">
        <Button variant="quiet" size="sm" icon={<Trash2 />} onClick={onDelete}>
          Delete
        </Button>
        <Link href={href} className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-[12px] bg-volt px-3 font-display text-[12px] font-bold text-on-volt">
          Use template
        </Link>
      </div>
    </Card>
  );
}
