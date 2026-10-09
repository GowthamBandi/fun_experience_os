"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useDialog } from "./use-dialog";

export type DrawerProps = { open: boolean; title: ReactNode; onClose: () => void; width?: number; children: ReactNode };

const EASE = [0.2, 0.8, 0.2, 1] as const;

export function Drawer(props: DrawerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<AnimatePresence>{props.open ? <DrawerPanel key="drawer" {...props} /> : null}</AnimatePresence>, document.body);
}

function DrawerPanel({ title, onClose, width = 560, children }: DrawerProps) {
  const reduced = useReducedMotion();
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useDialog(true, panel, onClose, closeButton);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[rgba(7,6,12,0.55)] backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        onClick={onClose}
      />
      <motion.aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        style={{ width, maxWidth: "100vw" }}
        className="relative flex h-full flex-col border-l border-line-soft bg-[rgba(18,16,28,0.96)] shadow-[-40px_0_120px_-40px_rgba(142,114,255,0.35)] outline-none backdrop-blur-[18px]"
        initial={reduced ? { opacity: 0 } : { x: "100%" }}
        animate={reduced ? { opacity: 1 } : { x: 0 }}
        exit={reduced ? { opacity: 0 } : { x: "100%" }}
        transition={{ duration: 0.25, ease: EASE }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_0%_0%,rgba(142,114,255,0.18),transparent_70%)]" />
        <header className="relative flex items-center gap-3 border-b border-line-soft px-6 py-5">
          <h2 id={`${id}-title`} className="min-w-0 flex-1 truncate font-display text-[20px] font-bold tracking-[-0.02em] text-text">
            {title}
          </h2>
          <button
            ref={closeButton}
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="focus-ring -mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-text-3 transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)] hover:text-text"
          >
            <X aria-hidden className="h-[18px] w-[18px]" />
          </button>
        </header>
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
      </motion.aside>
    </div>
  );
}
