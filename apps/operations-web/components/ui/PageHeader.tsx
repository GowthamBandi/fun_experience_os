"use client";

import type { ReactNode } from "react";
import { Fade } from "@/components/motion/Motion";

export function PageHeader({ overline, title, sub, right }: { overline: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <Fade className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow text-brand">{overline}</p>
        <h1 className="mt-1.5 font-display text-[28px] font-bold leading-tight tracking-tight text-ink-lum">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-mut">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </Fade>
  );
}
