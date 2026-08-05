"use client";

import { useId } from "react";

/** Pure-SVG charts — the OS draws with light, not a chart library. */

function points(data: number[], w: number, h: number, pad = 4): string {
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / Math.max(data.length - 1, 1);
  return data
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function Spark({ data, color = "#f7b955", width = 120, height = 36 }: { data: number[]; color?: string; width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <polyline
        points={points(data, width, height)}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
    </svg>
  );
}

export function LineChart({ labels, series, color = "#f7b955" }: { labels: string[]; series: number[]; color?: string }) {
  const id = useId();
  const w = 640;
  const h = 220;
  const pad = 28;
  const max = Math.max(...series) * 1.12;
  const pts = points(series, w, h, pad);
  const stepX = (w - pad * 2) / Math.max(labels.length - 1, 1);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Revenue trend">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={pad} x2={w - pad} y1={h - pad - (h - pad * 2) * f} y2={h - pad - (h - pad * 2) * f} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
      ))}
      <polygon points={`${pad},${h - pad} ${pts} ${w - pad},${h - pad}`} fill={`url(#${id}-fill)`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {series.map((v, i) => (
        <circle key={i} cx={pad + i * stepX} cy={pad + (1 - v / max) * (h - pad * 2)} r={3} fill={color} />
      ))}
      <g fill="#82889a" fontSize="11" textAnchor="middle">
        {labels.map((l, i) => (
          <text key={l} x={pad + i * stepX} y={h - 8}>
            {l}
          </text>
        ))}
      </g>
    </svg>
  );
}

export function Bars({ labels, values, color = "#5a67f5" }: { labels: string[]; values: number[]; color?: string }) {
  const w = 640;
  const h = 200;
  const pad = 8;
  const max = Math.max(...values, 1);
  const bw = (w - pad * 2) / labels.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Bookings per day">
      {values.map((v, i) => {
        const bh = (v / max) * (h - 24);
        const x = pad + i * bw + bw * 0.18;
        const y = h - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw * 0.64} height={bh} rx={5} fill={color} opacity={0.85} />
            <text x={x + bw * 0.32} y={h - 8} fontSize="11" fill="#82889a" textAnchor="middle">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({ value, label, sub, size = 132 }: { value: number; label: string; sub?: string; size?: number }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const filled = (value / 100) * c;
  const id = useId();
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${value}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={10} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id}-grad)`}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <defs>
          <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5a67f5" />
            <stop offset="100%" stopColor="#f7b955" />
          </linearGradient>
        </defs>
      </svg>
      <div>
        <div className="text-2xl font-semibold tabular text-ink-lum">{label}</div>
        {sub && <div className="mt-1 text-sm text-ink-mut">{sub}</div>}
      </div>
    </div>
  );
}
