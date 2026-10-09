"use client";

import { useId, useState, type MouseEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/format";
import { chartPath, chartPoints } from "./chart-math";

export { chartPath } from "./chart-math";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const W = 600;
const useSvgId = () => `pc${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

export function Sparkline({ values, height = 48, className }: { values: number[]; height?: number; className?: string }) {
  const id = useSvgId();
  const pad = 3;
  const { line, area } = chartPath(values, W, height - pad * 2);
  if (!line) return <div aria-hidden className={className} style={{ height }} />;
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className={cn("block w-full overflow-visible", className)} style={{ height }}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--volt)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--volt)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g transform={`translate(0 ${pad})`}>
        <path d={area} fill={`url(#${id}-fill)`} />
        <path d={line} fill="none" stroke="var(--volt)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

export function AreaChart({
  points,
  format,
  height = 220,
  className,
}: {
  points: Array<{ label: string; value: number }>;
  format: (n: number) => string;
  height?: number;
  className?: string;
}) {
  const id = useSvgId();
  const [hover, setHover] = useState<number | null>(null);
  const clean = points.filter((p) => Number.isFinite(p.value));
  const top = 12;
  const plot = height - top - 4;

  if (clean.length === 0) {
    return (
      <div role="img" aria-label="No data for this range" className={cn("grid place-items-center rounded-[16px] border border-dashed border-line text-[13px] text-text-3", className)} style={{ height }}>
        No data for this range
      </div>
    );
  }

  const values = clean.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const latest = values[values.length - 1];
  const { line, area } = chartPath(values, W, plot);
  const pts = chartPoints(values, W, plot);
  const single = clean.length === 1;

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / Math.max(rect.width, 1), 0), 1);
    setHover(single ? 0 : Math.round(ratio * (clean.length - 1)));
  };

  const h = hover !== null ? clean[hover] : null;
  const hx = hover !== null ? (single ? 50 : (pts[hover].x / W) * 100) : 0;
  const hy = hover !== null ? top + pts[single ? 0 : hover].y : 0;

  return (
    <div className={cn("w-full", className)}>
      <div
        role="img"
        aria-label={`Min ${format(min)}, max ${format(max)}, latest ${format(latest)}`}
        className="relative w-full"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg aria-hidden viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--primary)" stopOpacity="0.42" />
              <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${id}-stroke`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="var(--primary)" />
              <stop offset="1" stopColor="#B4A3FF" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1={0} x2={W} y1={top + plot * f} y2={top + plot * f} stroke="var(--line-soft)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
          ))}
          <g transform={`translate(0 ${top})`}>
            <path d={area} fill={`url(#${id}-fill)`} />
            <path d={line} fill="none" stroke={`url(#${id}-stroke)`} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
          {h ? <line x1={(hx / 100) * W} x2={(hx / 100) * W} y1={0} y2={height} stroke="rgba(255,255,255,0.18)" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {h ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-[#B4A3FF] shadow-[0_0_0_5px_rgba(142,114,255,0.3)]"
              style={{ left: `${hx}%`, top: hy }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute z-10 whitespace-nowrap rounded-[12px] border border-line bg-surface-top px-3 py-2 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)]"
              style={{ left: `${hx}%`, top: Math.max(hy - 12, 0), transform: `translate(${hx > 70 ? "-100%" : hx < 30 ? "0" : "-50%"}, -100%)` }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">{h.label}</div>
              <div className="num text-[15px] font-bold text-text">{format(h.value)}</div>
            </div>
          </>
        ) : null}
      </div>
      <div aria-hidden className="mt-2 flex justify-between text-[11px] text-text-3">
        <span>{clean[0].label}</span>
        {clean.length > 2 ? <span>{clean[Math.floor((clean.length - 1) / 2)].label}</span> : null}
        {clean.length > 1 ? <span>{clean[clean.length - 1].label}</span> : null}
      </div>
    </div>
  );
}

export function BarList({ items, className }: { items: Array<{ label: string; value: number; display: string }>; className?: string }) {
  const reduced = useReducedMotion();
  const max = Math.max(0, ...items.map((i) => (Number.isFinite(i.value) ? i.value : 0)));
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {items.map((item, i) => {
        const pct = max > 0 && Number.isFinite(item.value) ? Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0) : 0;
        return (
          <li key={`${item.label}-${i}`} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3">
            <span className="truncate text-[13px] text-text-2" title={item.label}>
              {item.label}
            </span>
            <span aria-hidden className="h-2 overflow-hidden rounded-pill bg-surface-high">
              <motion.span
                className="block h-full rounded-pill bg-[linear-gradient(90deg,var(--primary),var(--volt))]"
                initial={reduced ? false : { width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: reduced ? 0 : 0.5, ease: EASE, delay: reduced ? 0 : i * 0.04 }}
              />
            </span>
            <span className="num min-w-[3.5rem] text-right text-[13px] font-bold text-text">{item.display}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ProgressBar({ value, max, label, className }: { value: number; max: number; label?: string; className?: string }) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(value, safeMax)) : 0;
  const pct = safeMax > 0 ? (safeValue / safeMax) * 100 : 0;
  return (
    <div className={cn("w-full", className)}>
      {label ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12px]">
          <span className="truncate text-text-2">{label}</span>
          <span className="num font-bold text-text">
            {Number.isFinite(value) ? value : "—"}/{Number.isFinite(max) ? max : "—"}
          </span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
        className="h-2 overflow-hidden rounded-pill bg-surface-high"
      >
        <div className="h-full rounded-pill bg-[linear-gradient(90deg,var(--primary),var(--volt))] transition-[width] duration-200 ease-pulse" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
