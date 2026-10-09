"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge, Drawer, Empty, ErrorState, Glyph, SkeletonRows, type BadgeTone } from "@/components/pulse";
import { SEVERITY_LABEL, SEVERITY_ORDER, formatCount, type Severity } from "@/lib/console/attention";
import { canViewRoute } from "@/lib/console/capabilities";
import { useAdminSession } from "@/lib/firebase/auth";
import type { Attention } from "@/lib/use-attention";

const SEVERITY_LOOK: Record<Severity, { emoji: string; tone: BadgeTone }> = {
  critical: { emoji: "🚨", tone: "err" },
  high: { emoji: "⚡", tone: "warn" },
  normal: { emoji: "📋", tone: "violet" },
};

export function NotificationsDrawer({ open, onClose, attention }: { open: boolean; onClose: () => void; attention: Attention }) {
  const { consoleRole } = useAdminSession();
  const pending = attention.items.filter((i) => i.count > 0);
  const anyTruncated = pending.some((i) => i.truncated);

  return (
    <Drawer open={open} onClose={onClose} width={440} title="Notifications">
      {!canViewRoute(consoleRole, "/approvals") ? (
        <Empty emoji="🔕" title="Nothing routed to you" body="Decision queues are for Super Admins and the Platform Owner. Your role reads the audit trail." />
      ) : attention.loading && pending.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : attention.error && pending.length === 0 ? (
        <ErrorState message={attention.error} onRetry={attention.refresh} />
      ) : pending.length === 0 ? (
        <Empty emoji="🎉" title="All clear" body="Nothing needs a decision right now. New approvals, refunds and risk alerts land here live." />
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-[14px] text-text-2">
            <span className="num text-[28px] font-bold text-text">{formatCount(attention.total, anyTruncated)}</span>{" "}
            {attention.total === 1 ? "thing needs" : "things need"} <em className="hl font-display font-bold">you</em> · live from Firestore
          </p>
          {attention.error ? (
            <p role="alert" className="rounded-control border border-[rgba(255,97,120,0.3)] bg-[rgba(255,97,120,0.08)] px-3.5 py-2.5 text-[12px] text-err">
              Some sources failed to load, so these counts may be low. {attention.error}{" "}
              <button type="button" onClick={attention.refresh} className="focus-ring font-semibold underline underline-offset-2">
                Retry
              </button>
            </p>
          ) : null}
          {SEVERITY_ORDER.map((severity) => {
            const rows = pending.filter((i) => i.severity === severity);
            if (rows.length === 0) return null;
            const look = SEVERITY_LOOK[severity];
            return (
              <section key={severity} aria-label={SEVERITY_LABEL[severity]}>
                <h3 className="overline mb-2 font-semibold">{SEVERITY_LABEL[severity]}</h3>
                <ul className="flex flex-col gap-2">
                  {rows.map((item) => (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className="focus-ring group flex items-center gap-3 rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] p-3 transition-[background-color,border-color,transform] duration-150 ease-pulse hover:-translate-y-px hover:border-[rgba(142,114,255,0.35)] hover:bg-[rgba(142,114,255,0.08)] motion-reduce:hover:translate-y-0"
                      >
                        <Glyph emoji={look.emoji} tone={look.tone} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-bold text-text">{item.label}</span>
                          <span className="mt-0.5 block text-[12px] leading-[1.4] text-text-3">{item.detail}</span>
                        </span>
                        <Badge tone={look.tone} className="num">{formatCount(item.count, item.truncated)}</Badge>
                        <ArrowUpRight aria-hidden className="h-4 w-4 shrink-0 text-text-3 transition-colors group-hover:text-text" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {anyTruncated ? <p className="text-[12px] text-text-3">“+” means a source hit its read limit; the real number is higher.</p> : null}
          {canViewRoute(consoleRole, "/") ? (
            <Link href="/" onClick={onClose} className="focus-ring self-start rounded-[10px] text-[13px] font-semibold text-[#C2B4FF] hover:text-text">
              Open the Command Center →
            </Link>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
