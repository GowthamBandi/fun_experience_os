"use client";

import { AlertTriangle, Bell, CheckCircle2, ChevronRight, Compass, Info, MapPin, Search, ShieldAlert, Sparkles, Ticket, User, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { PhoneFrame } from "@/components/pulse";
import { cn } from "@/lib/format";
import type { PreviewModel, ToneMeta } from "@/lib/notifications";

const TONE_ICON = { info: Info, check: CheckCircle2, alert: AlertTriangle, shield: ShieldAlert, sparkles: Sparkles } as const;

function ToneIcon({ tone, size = 18 }: { tone: ToneMeta; size?: number }) {
  const Icon = TONE_ICON[tone.icon];
  return (
    <span className="grid shrink-0 place-items-center rounded-[14px]" style={{ width: size + 18, height: size + 18, background: tone.soft, color: tone.accent }}>
      <Icon style={{ width: size, height: size }} />
    </span>
  );
}

/** A non-interactive look-alike of the PULSE app with the announcement drawn on top. */
export function PhonePreview({ model, label = "Live preview on a phone" }: { model: PreviewModel; label?: string }) {
  return (
    <PhoneFrame label={label}>
      <div aria-hidden className="relative h-full min-h-full select-none overflow-hidden font-sans">
        {model.placement === "inbox" ? <InboxScreen model={model} /> : <ExploreScreen banner={model.placement === "top" ? <Banner model={model} /> : null} />}
        {model.placement === "center" ? (
          <Backdrop>
            <div className="absolute inset-x-5 top-1/2 -translate-y-1/2">
              <PopupCard model={model} />
            </div>
          </Backdrop>
        ) : null}
        {model.placement === "bottom" ? (
          <Backdrop>
            <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] border-t border-[rgba(255,255,255,0.1)] bg-[#1A1726] px-5 pb-8 pt-3 shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.8)]">
              <span className="mx-auto mb-4 block h-1.5 w-10 rounded-full bg-[rgba(255,255,255,0.2)]" />
              <PopupBody model={model} />
            </div>
          </Backdrop>
        ) : null}
        {model.placement === "full" ? <FullScreen model={model} /> : null}
      </div>
    </PhoneFrame>
  );
}

function StatusBar({ light = false }: { light?: boolean }) {
  return (
    <div className={cn("flex h-11 items-end justify-between px-7 pb-1 text-[12px] font-semibold", light ? "text-white" : "text-text")}>
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-4 rounded-[3px] border border-current opacity-80" />
      </span>
    </div>
  );
}

function ExploreScreen({ banner }: { banner: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-[#0B0A12]">
      <StatusBar />
      <div className="flex items-center justify-between px-5 pb-2 pt-3">
        <div>
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-3">
            <MapPin className="h-3 w-3" /> Hyderabad
          </p>
          <p className="font-display text-[24px] font-bold tracking-[-0.03em] text-text">Explore</p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(255,255,255,0.06)] text-text-2">
          <Bell className="h-4 w-4" />
        </span>
      </div>
      {banner}
      <div className="mx-5 mt-2 flex h-10 items-center gap-2 rounded-[14px] bg-[rgba(255,255,255,0.06)] px-3 text-[12px] text-text-3">
        <Search className="h-3.5 w-3.5" /> Search experiences
      </div>
      <div className="mt-4 flex gap-2 px-5">
        {["All", "Sports", "Music", "Trips"].map((c, i) => (
          <span key={c} className={cn("rounded-pill px-3 py-1 text-[11px] font-semibold", i === 0 ? "bg-text text-ink" : "bg-[rgba(255,255,255,0.06)] text-text-2")}>
            {c}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 px-5">
        {[
          ["#8E72FF", "#3A2C82"],
          ["#3FDD9A", "#13563D"],
          ["#FFB84D", "#6B4310"],
        ].map(([a, b], i) => (
          <div key={i} className="overflow-hidden rounded-[18px] bg-[rgba(255,255,255,0.04)]">
            <div className="h-24" style={{ background: `linear-gradient(135deg, ${a}, ${b})`, opacity: 0.55 }} />
            <div className="flex flex-col gap-1.5 p-3">
              <span className="h-2.5 w-3/5 rounded-full bg-[rgba(255,255,255,0.18)]" />
              <span className="h-2 w-2/5 rounded-full bg-[rgba(255,255,255,0.1)]" />
            </div>
          </div>
        ))}
      </div>
      <TabBar />
    </div>
  );
}

function TabBar({ active = "explore" }: { active?: "explore" | "you" }) {
  const items = [
    { id: "explore", icon: Compass, label: "Explore" },
    { id: "plans", icon: Ticket, label: "Plans" },
    { id: "you", icon: User, label: "You" },
  ];
  return (
    <div className="absolute inset-x-0 bottom-0 flex h-16 items-start justify-around border-t border-[rgba(255,255,255,0.06)] bg-[rgba(11,10,18,0.92)] pt-2">
      {items.map((t) => {
        const Icon = t.icon;
        const on = t.id === active;
        return (
          <span key={t.id} className={cn("flex flex-col items-center gap-0.5 text-[10px] font-semibold", on ? "text-[#C2B4FF]" : "text-text-3")}>
            <Icon className="h-5 w-5" />
            {t.label}
          </span>
        );
      })}
    </div>
  );
}

function Backdrop({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 z-10 bg-[rgba(5,4,10,0.62)] backdrop-blur-[2px]">{children}</div>;
}

function Cta({ label, tone, variant }: { label: string; tone: ToneMeta; variant: "primary" | "secondary" | "ack" }) {
  const style: CSSProperties =
    variant === "primary"
      ? { background: tone.accent, color: tone.onAccent }
      : variant === "ack"
        ? { background: "rgba(255,255,255,0.1)", color: "#F4F2FF" }
        : { background: "transparent", color: "#C9C4DA", border: "1px solid rgba(255,255,255,0.14)" };
  return (
    <span className="flex h-11 w-full items-center justify-center rounded-[14px] px-4 text-[13.5px] font-bold" style={style}>
      <span className="truncate">{label}</span>
    </span>
  );
}

function Actions({ model }: { model: PreviewModel }) {
  if (!model.primary && !model.secondary && !model.showAck) return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      {model.primary ? <Cta label={model.primary} tone={model.tone} variant="primary" /> : null}
      {model.secondary ? <Cta label={model.secondary} tone={model.tone} variant="secondary" /> : null}
      {model.showAck ? <Cta label="I understand" tone={model.tone} variant="ack" /> : null}
    </div>
  );
}

function CloseButton({ light = false }: { light?: boolean }) {
  return (
    <span className={cn("grid h-8 w-8 place-items-center rounded-full", light ? "bg-[rgba(0,0,0,0.35)] text-white" : "bg-[rgba(255,255,255,0.08)] text-text-2")}>
      <X className="h-4 w-4" />
    </span>
  );
}

function PopupBody({ model }: { model: PreviewModel }) {
  return (
    <div>
      {model.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={model.imageUrl} alt="" className="mb-4 h-36 w-full rounded-[16px] object-cover" />
      ) : null}
      <div className="flex items-start gap-3">
        <ToneIcon tone={model.tone} />
        <div className="min-w-0 flex-1">
          <p className="break-words font-display text-[18px] font-bold leading-tight tracking-[-0.02em] text-text">{model.title}</p>
          {model.body ? <p className="mt-1.5 whitespace-pre-line break-words text-[13px] leading-[1.5] text-text-2">{model.body}</p> : null}
        </div>
      </div>
      <Actions model={model} />
    </div>
  );
}

function PopupCard({ model }: { model: PreviewModel }) {
  return (
    <div className="relative max-h-[560px] overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.1)] bg-[#1A1726] p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: model.tone.accent }} />
      {model.showClose ? (
        <span className="absolute right-3 top-3 z-10">
          <CloseButton />
        </span>
      ) : null}
      <PopupBody model={model} />
    </div>
  );
}

function FullScreen({ model }: { model: PreviewModel }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-[#0B0A12]">
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 70% at 50% 0%, ${model.tone.soft}, transparent 70%)` }} />
      <div className="relative">
        <StatusBar light={!!model.imageUrl} />
      </div>
      {model.showClose ? (
        <span className="absolute right-4 top-12 z-10">
          <CloseButton light={!!model.imageUrl} />
        </span>
      ) : null}
      {model.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={model.imageUrl} alt="" className="absolute inset-x-0 top-0 h-[46%] w-full object-cover" />
      ) : null}
      <div className={cn("relative mt-auto flex flex-col px-6 pb-10", model.imageUrl ? "bg-[linear-gradient(180deg,transparent,#0B0A12_18%)] pt-12" : "pt-6")}>
        <ToneIcon tone={model.tone} size={24} />
        <p className="mt-4 break-words font-display text-[28px] font-bold leading-[1.08] tracking-[-0.03em] text-text">{model.title}</p>
        {model.body ? <p className="mt-3 whitespace-pre-line break-words text-[14px] leading-[1.55] text-text-2">{model.body}</p> : null}
        <Actions model={model} />
      </div>
    </div>
  );
}

function Banner({ model }: { model: PreviewModel }) {
  return (
    <div className="relative mx-5 mb-1 mt-1 flex items-start gap-3 overflow-hidden rounded-[16px] border p-3" style={{ background: model.tone.soft, borderColor: `${model.tone.accent}55` }}>
      <ToneIcon tone={model.tone} size={14} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-text">{model.title}</p>
        {model.body ? <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1.4] text-text-2">{model.body}</p> : null}
        {model.primary || model.showAck ? (
          <p className="mt-1.5 flex items-center gap-0.5 text-[12px] font-bold" style={{ color: model.tone.accent }}>
            {model.primary ?? "I understand"}
            <ChevronRight className="h-3.5 w-3.5" />
          </p>
        ) : null}
      </div>
      {model.showClose ? <X className="h-4 w-4 shrink-0 text-text-3" /> : null}
    </div>
  );
}

function InboxScreen({ model }: { model: PreviewModel }) {
  return (
    <div className="flex h-full flex-col bg-[#0B0A12]">
      <StatusBar />
      <p className="px-5 pb-3 pt-3 font-display text-[24px] font-bold tracking-[-0.03em] text-text">Notifications</p>
      <div className="flex flex-col gap-2 px-4">
        <div className="relative flex gap-3 rounded-[18px] border p-3" style={{ background: model.tone.soft, borderColor: `${model.tone.accent}44` }}>
          <span className="absolute right-3 top-3 h-2 w-2 rounded-full" style={{ background: model.tone.accent }} />
          <ToneIcon tone={model.tone} size={15} />
          <div className="min-w-0 flex-1 pr-3">
            <p className="text-[13px] font-bold text-text">{model.title}</p>
            {model.body ? <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[12px] leading-[1.45] text-text-2">{model.body}</p> : null}
            {model.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={model.imageUrl} alt="" className="mt-2 h-24 w-full rounded-[12px] object-cover" />
            ) : null}
            {model.primary ? (
              <p className="mt-1.5 text-[12px] font-bold" style={{ color: model.tone.accent }}>
                {model.primary} →
              </p>
            ) : null}
            <p className="mt-1 text-[10.5px] text-text-3">Just now · PULSE</p>
          </div>
        </div>
        {["Booking confirmed", "Your event starts in 2 hours"].map((t) => (
          <div key={t} className="flex gap-3 rounded-[18px] bg-[rgba(255,255,255,0.03)] p-3 opacity-70">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[12px] bg-[rgba(255,255,255,0.06)] text-text-3">
              <Ticket className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-text-2">{t}</p>
              <span className="mt-1.5 block h-2 w-32 rounded-full bg-[rgba(255,255,255,0.08)]" />
            </div>
          </div>
        ))}
      </div>
      <TabBar active="you" />
    </div>
  );
}
