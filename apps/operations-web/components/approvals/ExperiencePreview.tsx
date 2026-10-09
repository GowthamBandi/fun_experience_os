"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Cake,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Eye,
  IdCard,
  LifeBuoy,
  MapPin,
  Receipt,
  Share,
  Shield,
  Sparkles,
  Stethoscope,
  Ticket,
  Users,
  UsersRound,
} from "lucide-react";
import { Badge, PhoneFrame, Tabs } from "@/components/pulse";
import { artFor, artGradient, toPreview, type ArtPattern, type PreviewModel } from "@/lib/approvals";
import { cn } from "@/lib/format";
import { categoryEmoji } from "@/lib/overview";

/** Deterministic 0..1 sequence so the art is stable for a cover seed. */
function rng(seed: number) {
  let s = (seed * 9301 + 49297) >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function Pattern({ pattern, seed }: { pattern: ArtPattern; seed: number }) {
  const r = rng(seed);
  const W = 340;
  const H = 320;
  const stroke = { fill: "none", stroke: "rgba(255,255,255,.18)", strokeWidth: 1.4 };
  const fill = "rgba(255,255,255,.10)";
  let body: ReactNode = null;
  switch (pattern) {
    case "court": {
      const x = W * 0.08, y = H * 0.12, w = W * 0.84, h = H * 0.76;
      body = (
        <g {...stroke}>
          <rect x={x} y={y} width={w} height={h} />
          <line x1={W / 2} y1={y} x2={W / 2} y2={y + h} />
          <circle cx={W / 2} cy={H / 2} r={Math.min(W, H) * 0.12} />
          <rect x={x} y={H / 2 - h * 0.2} width={w * 0.14} height={h * 0.4} />
          <rect x={x + w - w * 0.14} y={H / 2 - h * 0.2} width={w * 0.14} height={h * 0.4} />
        </g>
      );
      break;
    }
    case "rings": {
      const cx = W * (0.2 + r() * 0.2), cy = H * 0.75;
      body = Array.from({ length: 9 }, (_, i) => (
        <circle key={i} cx={cx} cy={cy} r={(i + 1) * Math.max(W, H) * 0.09} fill="none" stroke={`rgba(255,255,255,${0.22 - (i + 1) * 0.018})`} strokeWidth={1.4} />
      ));
      break;
    }
    case "contours":
      body = Array.from({ length: 9 }, (_, i) => {
        const base = H * (0.15 + i * 0.1);
        const amp = 6 + r() * 10;
        const phase = r() * Math.PI * 2;
        const pts = Array.from({ length: 25 }, (_, k) => `${(W / 24) * k},${base + Math.sin(k / 3 + phase) * amp}`).join(" ");
        return <polyline key={i} points={pts} {...stroke} />;
      });
      break;
    case "film":
      body = (
        <g>
          {[H * 0.06, H * 0.9].flatMap((y) =>
            Array.from({ length: 11 }, (_, k) => <rect key={`${y}-${k}`} x={W * 0.02 + (W / 11) * k} y={y} width={W / 22} height={H * 0.05} rx={3} fill="rgba(255,255,255,.14)" />),
          )}
          <rect x={W * 0.12} y={H * 0.22} width={W * 0.76} height={H * 0.56} rx={10} {...stroke} />
        </g>
      );
      break;
    case "orbits":
      body = Array.from({ length: 7 }, (_, i) => {
        const radius = (0.08 + r() * 0.16) * Math.max(W, H);
        return <circle key={i} cx={r() * W} cy={r() * H} r={radius} {...(i % 2 === 0 ? { fill } : stroke)} />;
      });
      break;
    case "waves":
      body = Array.from({ length: 6 }, (_, i) => {
        const b = H * (0.35 + i * 0.11);
        return <path key={i} d={`M0 ${b} Q ${W * 0.25} ${b - H * 0.08} ${W * 0.5} ${b} T ${W} ${b}`} {...stroke} />;
      });
      break;
    case "dots": {
      const dots: ReactNode[] = [];
      for (let y = H * 0.08, j = 0; y < H; y += H / 10, j++) for (let x = W * 0.06, k = 0; x < W; x += W / 12, k++) dots.push(<circle key={`${j}-${k}`} cx={x} cy={y} r={1.5 + r() * 3} fill={fill} />);
      body = dots;
      break;
    }
    case "grid": {
      const step = Math.max(W, H) / 12;
      body = (
        <g stroke="rgba(255,255,255,.18)" strokeWidth={0.8}>
          {Array.from({ length: 13 }, (_, i) => <line key={`v${i}`} x1={i * step} y1={0} x2={i * step} y2={H} />)}
          {Array.from({ length: 13 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * step} x2={W} y2={i * step} />)}
        </g>
      );
      break;
    }
  }
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      {body}
    </svg>
  );
}

/** The app's ExperienceArt: generated gradient + pattern + faint category glyph + bottom scrim. */
function Art({ p, className, children }: { p: PreviewModel; className?: string; children?: ReactNode }) {
  const art = artFor(p.category);
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ background: artGradient(p.category, p.seed) }}>
      <Pattern pattern={art.pattern} seed={p.seed} />
      <span aria-hidden className="absolute right-[6%] top-[14%] select-none text-[120px] leading-none opacity-[.16] [filter:grayscale(1)_brightness(4)]">
        {categoryEmoji(p.category)}
      </span>
      <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,10,18,0)_35%,rgba(11,10,18,.9)_100%)]" />
      {children}
    </div>
  );
}

function StatusBar() {
  return (
    <div aria-hidden className="absolute inset-x-0 top-0 z-10 flex h-[48px] items-center justify-between px-7 pt-1 font-display text-[13px] font-bold text-white">
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <span className="flex items-end gap-[2px]">
          {[4, 6, 8, 10].map((h) => <span key={h} className="w-[3px] rounded-[1px] bg-white" style={{ height: h }} />)}
        </span>
        <span className="ml-1 h-[10px] w-[20px] rounded-[3px] border border-white/80 p-[1px]"><span className="block h-full w-3/4 rounded-[1px] bg-white" /></span>
      </span>
    </div>
  );
}

const roundIcon = "grid h-9 w-9 place-items-center rounded-full bg-[rgba(11,10,18,.6)] text-white backdrop-blur-sm";

function Section({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h4 className="flex-1 font-display text-[17px] font-bold tracking-[-0.02em] text-text">{title}</h4>
        {trailing}
      </div>
      {children}
    </section>
  );
}

function Bullet({ icon, children, tone = "text-text-3" }: { icon: ReactNode; children: ReactNode; tone?: string }) {
  return (
    <li className="flex items-start gap-2.5 pb-2.5 text-[13.5px] leading-[1.45] text-text">
      <span aria-hidden className={cn("mt-[2px] shrink-0 [&>svg]:h-[15px] [&>svg]:w-[15px]", tone)}>{icon}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function FactRow({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 pb-3.5">
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-surface text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <div className="min-w-0">
        <p className="font-display text-[14.5px] font-bold text-text">{title}</p>
        {body ? <p className="mt-0.5 text-[12.5px] leading-[1.4] text-text-2">{body}</p> : null}
      </div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-text-3">{children}</p>;
}

function FactChip({ icon, children, muted }: { icon: ReactNode; children: ReactNode; muted?: boolean }) {
  return (
    <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-pill border border-line-soft bg-surface px-3 text-[12px] font-semibold [&>svg]:h-3.5 [&>svg]:w-3.5", muted ? "text-text-3" : "text-text")}>
      {icon}
      {children}
    </span>
  );
}

function DetailScreen({ p, city }: { p: PreviewModel; city: string | null }) {
  const initials = (p.host ?? "?").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <div className="relative flex min-h-full flex-col bg-ink">
      <Art p={p} className="h-[300px]">
        <StatusBar />
        <div aria-hidden className="absolute inset-x-0 top-[52px] z-10 flex items-center justify-between px-4">
          <span className={roundIcon}><ArrowLeft className="h-[18px] w-[18px]" /></span>
          <span className="flex gap-2">
            <span className={roundIcon}><Share className="h-4 w-4" /></span>
            <span className={roundIcon}><Bookmark className="h-4 w-4" /></span>
          </span>
        </div>
      </Art>

      <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-[14px] border border-[rgba(142,114,255,.4)] bg-[rgba(142,114,255,.16)] p-3">
        <Eye aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-[12px] leading-[1.45] text-text">Customer preview: this is how it will look once it’s approved and published.</p>
      </div>

      <div className="flex flex-col gap-7 px-4 pb-8 pt-5">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="violet">
              <span aria-hidden>{categoryEmoji(p.category)}</span>
              {p.activity ?? p.categoryLabel}
            </Badge>
            <Badge tone="muted">{p.categoryLabel}</Badge>
          </div>
          <h3 className="mt-3 font-display text-[27px] font-bold leading-[1.08] tracking-[-0.03em] text-text">{p.title}</h3>
          <p className="mt-2 text-[14px] leading-[1.45] text-text-2">{p.tagline ?? "—"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <FactChip icon={<CalendarDays />} muted>Dates set per event</FactChip>
            <FactChip icon={<MapPin />} muted={!city}>{city ?? "—"}</FactChip>
            <FactChip icon={<Ticket />} muted>Price set per event</FactChip>
          </div>
          {p.host ? (
            <div className="mt-4 flex items-center gap-2.5">
              <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-[linear-gradient(135deg,#8E72FF,#3FDD9A)] font-display text-[13px] font-bold text-ink">{initials}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-text-3">Hosted by</p>
                <p className="truncate font-display text-[14.5px] font-bold text-text">{p.host}</p>
              </div>
              <Badge tone="ok"><BadgeCheck aria-hidden className="h-3 w-3" />Verified</Badge>
            </div>
          ) : null}
        </div>

        <Section title="What you’ll experience">
          <p className="mb-3.5 text-[13.5px] leading-[1.5] text-text-2">{p.description ?? "—"}</p>
          {p.highlights.length ? (
            <ul>{p.highlights.map((h, i) => <Bullet key={i} icon={<Sparkles />} tone="text-volt">{h}</Bullet>)}</ul>
          ) : <Empty>No highlights listed.</Empty>}
        </Section>

        <Section title="Who it’s for">
          <FactRow icon={<Cake />} title={`Age ${p.age.label}`} body={p.age.body} />
          <FactRow icon={<Users />} title={p.gender.label} body={p.gender.body} />
          <FactRow icon={<UsersRound />} title={p.format.label} body={p.format.body} />
          {p.idRequired ? <FactRow icon={<IdCard />} title="ID required" body="Bring a government ID. It’s checked at entry and never shared with other participants." /> : null}
        </Section>

        <Section title="House rules" trailing={<ChevronDown aria-hidden className="h-5 w-5 rotate-180 text-text-2" />}>
          {p.rules.length ? <ul>{p.rules.map((r, i) => <Bullet key={i} icon={<CheckCircle2 />}>{r}</Bullet>)}</ul> : <Empty>No house rules listed.</Empty>}
        </Section>

        <Section title="What to bring">
          {p.bring.length ? (
            <div className="flex flex-wrap gap-2">
              {p.bring.map((b, i) => <span key={i} className="rounded-pill border border-line-soft bg-surface px-3 py-2 text-[12.5px] text-text">{b}</span>)}
            </div>
          ) : <Empty>Nothing listed.</Empty>}
        </Section>

        <Section title="Safety" trailing={<Badge tone="info"><Shield aria-hidden className="h-3 w-3" />{p.safety.label}</Badge>}>
          <ul>
            {p.safety.measures.map((m, i) => <Bullet key={i} icon={<Shield />} tone="text-info">{m}</Bullet>)}
            <Bullet icon={<Stethoscope />} tone="text-info">First aid available on site</Bullet>
            <Bullet icon={<LifeBuoy />} tone="text-info">Report a problem any time from your pass — it goes to the host and PULSE trust &amp; safety.</Bullet>
          </ul>
        </Section>

        <Section title="Cancellation & refunds" trailing={<Badge tone="muted">{p.cancellation.label}</Badge>}>
          <ul>{p.cancellation.rules.map((r, i) => <Bullet key={i} icon={<Receipt />}>{r}</Bullet>)}</ul>
          <p className="text-[12.5px] text-text-3">If the host cancels, you get a full refund.</p>
        </Section>
      </div>

      <div className="sticky bottom-0 mt-auto flex items-center gap-3 border-t border-line-soft bg-night px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="num text-[20px] font-bold text-text">—</p>
          <p className="text-[11.5px] text-text-3">Preview only</p>
        </div>
        <span aria-hidden className="inline-flex h-11 items-center rounded-pill bg-surface-high px-6 font-display text-[14px] font-bold text-text-3">Join</span>
      </div>
    </div>
  );
}

function CardScreen({ p, city }: { p: PreviewModel; city: string | null }) {
  return (
    <div className="min-h-full bg-ink px-4 pb-6 pt-[56px]">
      <StatusBar />
      <p className="text-[12px] text-text-3">Explore</p>
      <h4 className="font-display text-[24px] font-bold tracking-[-0.03em] text-text">For you</h4>
      <div className="mt-4 overflow-hidden rounded-[28px] shadow-[0_24px_60px_-24px_rgba(0,0,0,.8)]">
        <Art p={p} className="h-[440px]">
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-pill bg-[rgba(11,10,18,.6)] px-2.5 py-1 font-display text-[10.5px] font-bold uppercase tracking-[0.06em] text-text">
            <span aria-hidden style={{ color: artFor(p.category).color }}>●</span>
            {p.activity ?? p.categoryLabel}
          </span>
          <span aria-hidden className={cn(roundIcon, "absolute right-3 top-3")}><Bookmark className="h-4 w-4" /></span>
          <div className="absolute inset-x-[18px] bottom-[18px]">
            <p className="font-display text-[10.5px] font-bold uppercase tracking-[0.08em] text-volt">Dates set per event</p>
            <p className="mt-1.5 line-clamp-2 font-display text-[25px] font-bold leading-[1.08] tracking-[-0.03em] text-text">{p.title}</p>
            <p className="mt-1 truncate text-[13px] text-[rgba(246,244,255,.82)]">{p.tagline ?? "—"}</p>
            <div className="mt-3.5 flex items-center gap-2.5">
              <span className="rounded-pill bg-text px-2.5 py-1 font-display text-[12px] font-bold text-ink">₹ —</span>
              <span className="flex-1 truncate text-[12px] text-text-2">Spots set per event</span>
              <span className="text-[12px] text-text-2">{city ?? "—"}</span>
            </div>
          </div>
        </Art>
      </div>
    </div>
  );
}

export function ExperiencePreview({ experience, city }: { experience: Record<string, unknown>; city: string | null }) {
  const [mode, setMode] = useState<"detail" | "card">("detail");
  const p = useMemo(() => toPreview(experience), [experience]);
  return (
    <div className="flex flex-col items-center gap-4">
      <Tabs
        label="Preview mode"
        value={mode}
        onChange={(id) => setMode(id as "detail" | "card")}
        tabs={[
          { id: "detail", label: "Detail" },
          { id: "card", label: "Explore card" },
        ]}
      />
      <PhoneFrame label={`PULSE preview of ${p.title}`}>{mode === "detail" ? <DetailScreen p={p} city={city} /> : <CardScreen p={p} city={city} />}</PhoneFrame>
      <p className="max-w-[340px] text-center text-[12px] leading-[1.45] text-text-3">Date, venue, price and spots belong to each event the host schedules, so they aren’t part of this review.</p>
    </div>
  );
}
