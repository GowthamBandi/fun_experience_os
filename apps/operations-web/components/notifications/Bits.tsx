"use client";

import { AppWindow, Inbox, Maximize2, PanelBottom, PanelTop } from "lucide-react";
import { Badge } from "@/components/pulse";
import { cn } from "@/lib/format";
import { FORMAT_META, STATUS_META, TONE_META, type AnnouncementFormat, type AnnouncementStatus, type Tone } from "@/lib/notifications";

export const FORMAT_ICON: Record<AnnouncementFormat, typeof Inbox> = { modal: AppWindow, fullscreen: Maximize2, sheet: PanelBottom, banner: PanelTop, inbox: Inbox };

export function StatusBadge({ status, className }: { status: AnnouncementStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone} className={className}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full bg-current", status === "live" && "animate-pulse motion-reduce:animate-none")} />
      {m.label}
    </Badge>
  );
}

export function FormatPill({ format }: { format: AnnouncementFormat }) {
  const Icon = FORMAT_ICON[format];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-text-2">
      <Icon aria-hidden className="h-3.5 w-3.5 text-text-3" />
      {FORMAT_META[format].label}
    </span>
  );
}

export function ToneDot({ tone }: { tone: Tone }) {
  const m = TONE_META[tone];
  return <span aria-label={`${m.label} tone`} role="img" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.accent, boxShadow: `0 0 0 4px ${m.soft}` }} />;
}

/** A compact labelled number. */
export function MiniStat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "warn" | "err" | "violet" }) {
  return (
    <div className="min-w-0 rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] px-4 py-3">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">{label}</dt>
      <dd className={cn("num mt-1 truncate text-[22px] font-bold leading-tight", tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "err" ? "text-err" : tone === "violet" ? "text-[#C2B4FF]" : "text-text")}>{value}</dd>
      {hint ? <dd className="mt-0.5 truncate text-[11.5px] text-text-3">{hint}</dd> : null}
    </div>
  );
}
