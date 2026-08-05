"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/format";
import { IconButton } from "@/components/ui/primitives";

export function useDisclosure() {
  const [open, setOpen] = useState(false);
  const openFn = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, setOpen, openFn, close };
}

const LIGHT = [0.19, 1, 0.22, 1] as const;

/** The room dims; the panel settles in. Never a black scrim. */
export function Dialog({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="absolute inset-0 bg-[#0c0e12]/70 backdrop-blur-[8px]" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.28, ease: LIGHT }}
            className={cn("glass relative w-full rounded-panel p-6", wide ? "max-w-2xl" : "max-w-md")}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-base font-semibold text-ink-lum">{title}</h2>
              <IconButton label="Close" onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="mt-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A sheet rising from below to meet the light. */
export function Drawer({ open, onClose, title, sub, children, width = "max-w-md" }: { open: boolean; onClose: () => void; title: string; sub?: string; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <div className="absolute inset-0 bg-[#0c0e12]/70 backdrop-blur-[8px]" onClick={onClose} />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.32, ease: LIGHT }}
            className={cn("glass absolute right-0 top-0 flex h-full w-full flex-col", width)}
            aria-label={title}
          >
            <header className="glass-surface flex items-start justify-between gap-4 border-b border-white/5 p-5">
              <div>
                <h2 className="text-base font-semibold text-ink-lum">{title}</h2>
                {sub && <p className="mt-0.5 text-sm text-ink-mut">{sub}</p>}
              </div>
              <IconButton label="Close" onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            </header>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
