"use client";

import type { ReactNode } from "react";
import { Fade } from "@/components/motion/Motion";

export function PageHeader({ overline, title, sub, right }: { overline: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <Fade className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="overline">{overline}</p>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-ink-lum">{title}</h1>
        {sub && <p className="mt-1 max-w-xl text-sm text-ink-mut">{sub}</p>}
      </div>
      {right}
    </Fade>
  );
}
