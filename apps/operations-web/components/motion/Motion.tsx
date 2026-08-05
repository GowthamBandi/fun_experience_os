"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

export function Stagger({ children, className, once = true }: { children: ReactNode; className?: string; once?: boolean }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      exit="hidden"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
      viewport={once ? { once: true } : undefined}
    >
      {children}
    </motion.div>
  );
}

export function Item({ children, className, variants }: { children: ReactNode; className?: string; variants?: Variants }) {
  return (
    <motion.div className={className} variants={variants ?? { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.19, 1, 0.22, 1] } } }}>
      {children}
    </motion.div>
  );
}

export function Fade({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: [0.19, 1, 0.22, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** The tide-line — progress is patience. Never a spinner. */
export function Tide({ value, className }: { value?: number; className?: string }) {
  const width = typeof value === "number" ? `${Math.max(6, Math.min(100, value))}%` : "46%";
  return (
    <div className={`tide ${className ?? ""}`} role="progressbar" aria-label="Progress" aria-valuenow={typeof value === "number" ? value : undefined}>
      <span style={{ width }} />
    </div>
  );
}
