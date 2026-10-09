"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/format";

const EASE = [0.2, 0.8, 0.2, 1] as const;

/** A bento grid cell that fades up once, staggered by `index`; static under reduced motion. */
export function Tile({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={cn("col-span-2 min-w-0 [&>*]:h-full", className)}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE, delay: reduced ? 0 : index * 0.05 }}
    >
      {children}
    </motion.div>
  );
}

export function TileHeader({ id, title, children }: { id?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="min-w-0 truncate font-display text-[18px] font-bold tracking-[-0.02em] text-text">
        {title}
      </h2>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}
